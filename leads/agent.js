/**
 * Research agent: plan targets, discover businesses, enrich official websites,
 * verify/score every record, and merge the result into the lead database.
 *
 * The agent is intentionally bounded and polite:
 *  - one Overpass query per target, with mirror fallback,
 *  - Nominatim only as a fallback and never faster than 1 request/second,
 *  - website enrichment limited to a few concurrent requests,
 *  - robots.txt respected and response sizes capped,
 *  - no automated outreach, no login-protected pages, no social scraping.
 */

const {
  COUNTRIES,
  resolveCountry,
  resolveCity,
  bboxAround
} = require('./catalog');
const store = require('./store');
const { enrichLead } = require('./enrich');
const { applyScore, detectServices } = require('./score');
const overpass = require('./sources/overpass');
const nominatim = require('./sources/nominatim');

const MAX_ACTIVE_JOBS = 2;
const activeJobs = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

/**
 * Resolves UI/CLI input into a bounded list of city targets.
 */
async function resolveTargets(params = {}) {
  const countryInputs = asArray(params.countries || params.countryCodes);
  const countryObjects = countryInputs
    .map((value) => resolveCountry(value))
    .filter(Boolean);
  const selectedCountries = countryObjects.length ? countryObjects : COUNTRIES.filter((country) => country.priority <= 2);

  const requestedCities = asArray(params.cities);
  const targets = [];
  const seen = new Set();

  const addTarget = (city) => {
    if (!city || !city.name || !Number.isFinite(Number(city.lat)) || !Number.isFinite(Number(city.lon))) return;
    const key = `${city.name.toLowerCase()}|${city.countryCode || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({
      name: city.name,
      lat: Number(city.lat),
      lon: Number(city.lon),
      radiusKm: Number(city.radiusKm) || 30,
      countryCode: city.countryCode,
      countryName: city.countryName
    });
  };

  if (requestedCities.length) {
    for (const rawCity of requestedCities) {
      let matched = false;
      // Try "City, CC" / "City (CC)" / "City CC" forms first.
      const tokens = String(rawCity)
        .replace(/[()]/g, ',')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      if (tokens.length >= 2) {
        const country = resolveCountry(tokens[tokens.length - 1]);
        if (country) {
          const city = resolveCity(tokens[0], country.code);
          if (city) {
            addTarget(city);
            matched = true;
          }
        }
      }

      if (!matched) {
        for (const country of selectedCountries) {
          const city = resolveCity(rawCity, country.code);
          if (city) {
            addTarget(city);
            matched = true;
          }
        }
      }

      if (!matched) {
        // Last resort: geocode the typed city with one Nominatim request.
        try {
          const results = await nominatim.nominatimSearch(rawCity, { limit: 3 });
          const result = results.find((entry) => entry.lat && entry.lon);
          if (result) {
            const address = result.address || {};
            addTarget({
              name: result.name || rawCity,
              lat: Number(result.lat),
              lon: Number(result.lon),
              radiusKm: 30,
              countryCode: address.country_code ? address.country_code.toUpperCase() : null,
              countryName: address.country || null
            });
          }
        } catch {
          // Ignore; the caller will see a clear "no targets" message.
        }
      }
    }
  }

  if (!targets.length) {
    for (const country of selectedCountries) {
      for (const city of country.cities.slice(0, 4)) {
        addTarget({ ...city, countryCode: country.code, countryName: country.name });
      }
    }
  }

  // Keep a single interactive run bounded. A production queue can raise this.
  return targets.slice(0, 12);
}

function ensureScored(lead) {
  const text = [lead.name, lead.description, lead.website, ...(lead.services || [])]
    .filter(Boolean)
    .join(' ');
  const detected = detectServices(text);
  const services = Array.from(new Set([...(lead.services || []), ...detected]));
  return applyScore({ ...lead, services });
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Main agent entry point. Can run from the API job runner or the CLI.
 */
async function runResearch(params = {}, hooks = {}) {
  const onProgress = typeof hooks.onProgress === 'function' ? hooks.onProgress : () => {};
  const onLog = typeof hooks.onLog === 'function' ? hooks.onLog : () => {};
  const sourcePreference = params.source || 'auto';
  const enrich = params.enrich !== false;
  const includeGeneral = Boolean(params.includeGeneral);
  const totalLimit = clamp(params.limit, 5, 500);
  const targets = await resolveTargets(params);

  if (!targets.length) {
    throw new Error('No research targets could be resolved. Select a country or enter a known city.');
  }

  const perTargetLimit = Math.max(5, Math.ceil(totalLimit / targets.length));
  const summary = {
    targets: targets.length,
    found: 0,
    added: 0,
    updated: 0,
    enriched: 0,
    skipped: 0,
    errors: [],
    leads: []
  };

  onLog({ level: 'info', message: `Research plan: ${targets.map((target) => `${target.name}${target.countryCode ? ` (${target.countryCode})` : ''}`).join(', ')}` });

  for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
    const target = targets[targetIndex];
    const progressBase = Math.round((targetIndex / targets.length) * 100);
    onProgress({ stage: 'discovering', target, progress: progressBase });

    let discovery = null;
    let discoveryError = null;

    const tryOverpass = async () => {
      return overpass.discoverCity(target, {
        includeGeneral,
        limit: Math.min(300, Math.max(40, perTargetLimit * 4)),
        // In auto mode, don't spend the whole budget on a struggling public
        // mirror; fall back to Nominatim after one minute.
        deadlineMs: sourcePreference === 'auto' ? 60_000 : 120_000
      });
    };

    const tryNominatim = async () => {
      return nominatim.discoverCity(target, { limit: perTargetLimit });
    };

    try {
      if (sourcePreference === 'nominatim') {
        discovery = await tryNominatim();
      } else if (sourcePreference === 'overpass') {
        discovery = await tryOverpass();
      } else {
        try {
          discovery = await tryOverpass();
        } catch (error) {
          discoveryError = error;
          onLog({ level: 'warn', message: `Overpass failed for ${target.name}; falling back to Nominatim: ${error.message}` });
          discovery = await tryNominatim();
        }
      }
    } catch (error) {
      discoveryError = error;
      summary.errors.push(`${target.name}: ${error.message}`);
      onLog({ level: 'error', message: `Discovery failed for ${target.name}: ${error.message}` });
      continue;
    }

    const candidates = (discovery.leads || []).slice(0, perTargetLimit);
    summary.found += candidates.length;
    onLog({
      level: 'info',
      message: `${target.name}: ${candidates.length} candidate(s) from ${discovery.meta?.source || sourcePreference}`
    });
    onProgress({
      stage: 'enriching',
      target,
      progress: Math.min(95, progressBase + Math.round(((targetIndex + 0.2) / targets.length) * 100)),
      found: summary.found
    });

    let processedSinceUpdate = 0;
    await mapWithConcurrency(candidates, 3, async (candidate, candidateIndex) => {
      try {
        let lead = ensureScored(candidate);

        if (enrich && lead.website) {
          try {
            lead = await enrichLead(lead);
            summary.enriched += 1;
          } catch (error) {
            summary.errors.push(`${lead.name}: enrichment failed (${error.message})`);
            onLog({ level: 'warn', message: `Enrichment failed for ${lead.name}: ${error.message}` });
          }
        }

        lead = ensureScored(lead);
        const result = await store.upsertLead(lead);
        if (result.action === 'inserted') summary.added += 1;
        else summary.updated += 1;

        if (lead.website_status && lead.website_status !== 'ok') {
          summary.skipped += 0;
        }

        summary.leads.push({ id: result.id, name: lead.name, action: result.action });
      } catch (error) {
        summary.skipped += 1;
        summary.errors.push(`${candidate.name}: ${error.message}`);
      }

      processedSinceUpdate += 1;
      if (processedSinceUpdate >= 3 || candidateIndex === candidates.length - 1) {
        processedSinceUpdate = 0;
        const stageProgress = Math.min(
          99,
          progressBase + Math.round(((targetIndex + (candidateIndex + 1) / Math.max(1, candidates.length)) / targets.length) * 100)
        );
        onProgress({
          stage: 'saving',
          target,
          progress: stageProgress,
          found: summary.found,
          added: summary.added,
          updated: summary.updated,
          enriched: summary.enriched,
          skipped: summary.skipped
        });
      }
    });

    // Politeness pause between cities.
    if (targetIndex < targets.length - 1) await sleep(1000);
  }

  onProgress({
    stage: 'complete',
    progress: 100,
    found: summary.found,
    added: summary.added,
    updated: summary.updated,
    enriched: summary.enriched,
    skipped: summary.skipped
  });
  onLog({
    level: 'info',
    message: `Finished: ${summary.added} added, ${summary.updated} merged, ${summary.enriched} enriched from ${summary.found} candidates.`
  });
  return summary;
}

/* ------------------------------------------------------------------ */
/* Background job runner                                              */
/* ------------------------------------------------------------------ */

function toIso() {
  return new Date().toISOString();
}

async function startJob(jobId) {
  const job = await store.getJob(jobId);
  if (!job) throw new Error('Research job not found');
  if (job.status === 'running' || activeJobs.has(jobId)) {
    return job;
  }
  if (activeJobs.size >= MAX_ACTIVE_JOBS) {
    const error = new Error('Two research runs are already active. Wait for one to finish.');
    error.statusCode = 409;
    throw error;
  }

  activeJobs.add(jobId);
  await store.updateJob(jobId, {
    status: 'running',
    started_at: toIso(),
    progress: 0,
    log: []
  });

  // Fire and forget: the HTTP request returns immediately and the UI polls.
  (async () => {
    try {
      const params = job.params || {};
      const summary = await runResearch(params, {
        onProgress: async (progress) => {
          await store.updateJob(jobId, {
            progress: clamp(progress.progress, 0, 100),
            found: progress.found ?? job.found,
            added: progress.added ?? job.added,
            updated: progress.updated ?? job.updated,
            enriched: progress.enriched ?? job.enriched,
            skipped: progress.skipped ?? job.skipped
          });
          if (progress.stage === 'discovering') {
            await store.appendJobLog(jobId, {
              level: 'info',
              message: `Discovering ${progress.target.name}${progress.target.countryCode ? ` (${progress.target.countryCode})` : ''}`
            });
          }
        },
        onLog: async (entry) => {
          await store.appendJobLog(jobId, entry);
        }
      });

      await store.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        found: summary.found,
        added: summary.added,
        updated: summary.updated,
        enriched: summary.enriched,
        skipped: summary.skipped,
        error: summary.errors.length ? summary.errors.slice(0, 5).join(' | ') : null,
        finished_at: toIso()
      });
    } catch (error) {
      await store.updateJob(jobId, {
        status: 'failed',
        error: error.message,
        finished_at: toIso()
      });
      await store.appendJobLog(jobId, { level: 'error', message: error.message });
    } finally {
      activeJobs.delete(jobId);
    }
  })();

  return store.getJob(jobId);
}

async function startResearchJob(params = {}) {
  const countryCodes = asArray(params.countries || params.countryCodes).map((code) => String(code).toUpperCase());
  const cities = asArray(params.cities);
  const label =
    params.label ||
    (cities.length
      ? `Cities: ${cities.join(', ')}`
      : `Countries: ${countryCodes.length ? countryCodes.join(', ') : 'priority markets'}`);

  const job = await store.createJob({
    label,
    countries: countryCodes,
    cities,
    params: {
      countries: countryCodes,
      cities,
      limit: clamp(params.limit, 5, 500),
      enrich: params.enrich !== false,
      includeGeneral: Boolean(params.includeGeneral),
      source: ['auto', 'overpass', 'nominatim'].includes(params.source) ? params.source : 'auto'
    }
  });

  return startJob(job.id);
}

module.exports = {
  runResearch,
  resolveTargets,
  startJob,
  startResearchJob,
  activeJobs,
  ensureScored
};
