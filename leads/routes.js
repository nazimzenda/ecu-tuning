/**
 * Admin-only HTTP API for lead research.
 *
 * Mounted at /api/leads from server.js. Every route is protected by the same
 * session middleware as the order admin panel.
 */

const express = require('express');
const store = require('./store');
const agent = require('./agent');
const { applyScore, detectServices } = require('./score');
const { COUNTRIES, resolveCountry } = require('./catalog');

const MAX_IMPORT_ROWS = 1000;

function createLeadsRouter({ requireAdmin }) {
  const router = express.Router();
  router.use(requireAdmin);

  router.get('/config', (req, res) => {
    res.json({
      countries: COUNTRIES.map((country) => ({
        code: country.code,
        name: country.name,
        priority: country.priority,
        region: country.region,
        cities: country.cities.map((city) => city.name)
      })),
      sources: [
        { id: 'auto', label: 'Auto (Overpass → Nominatim fallback)' },
        { id: 'overpass', label: 'OpenStreetMap / Overpass' },
        { id: 'nominatim', label: 'OpenStreetMap / Nominatim' }
      ],
      limits: { min: 5, max: 500, default: 50, max_targets: 12, max_import_rows: MAX_IMPORT_ROWS },
      compliance: {
        lawful_scope: 'Lawful ECU calibration, diagnostics and emissions-system repair',
        blocked_scope: 'Emissions-control defeat, defeat devices and modifications that violate applicable road-emissions rules',
        data_policy: 'Public business contact data only. No private individuals, no login-protected pages, no automated outreach.'
      }
    });
  });

  router.get('/stats', async (req, res, next) => {
    try {
      const stats = await store.getStats();
      const jobs = await store.listJobs(10);
      res.json({
        ...stats,
        active_jobs: jobs.filter((job) => job.status === 'running' || job.status === 'queued').length,
        recent_jobs: jobs.slice(0, 4)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/map', async (req, res, next) => {
    try {
      const leads = await store.getMapLeads(parseFilters(req.query));
      res.json({ leads });
    } catch (error) {
      next(error);
    }
  });

  router.get('/jobs', async (req, res, next) => {
    try {
      res.json({ jobs: await store.listJobs(req.query.limit || 20) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/jobs/:id', async (req, res, next) => {
    try {
      const job = await store.getJob(parseId(req.params.id));
      if (!job) return res.status(404).json({ error: 'Research job not found' });
      res.json(job);
    } catch (error) {
      next(error);
    }
  });

  router.post('/research', async (req, res, next) => {
    try {
      const body = req.body || {};
      const countries = Array.isArray(body.countries)
        ? body.countries.map((code) => String(code).toUpperCase()).filter(Boolean)
        : [];
      const cities = Array.isArray(body.cities)
        ? body.cities.map((city) => String(city).trim()).filter(Boolean).slice(0, 12)
        : [];

      if (!countries.length && !cities.length) {
        return res.status(400).json({ error: 'Select at least one country or enter a city.' });
      }
      if (countries.length > 12) {
        return res.status(400).json({ error: 'Select at most 12 countries per run.' });
      }
      for (const code of countries) {
        if (!resolveCountry(code)) {
          return res.status(400).json({ error: `Unknown country code: ${code}` });
        }
      }

      const limit = Math.max(5, Math.min(500, Number(body.limit) || 50));
      const job = await agent.startResearchJob({
        countries,
        cities,
        limit,
        enrich: body.enrich !== false,
        includeGeneral: Boolean(body.includeGeneral),
        source: ['auto', 'overpass', 'nominatim'].includes(body.source) ? body.source : 'auto'
      });
      res.status(202).json(job);
    } catch (error) {
      next(error);
    }
  });

  router.post('/import', async (req, res, next) => {
    try {
      const rows = Array.isArray(req.body) ? req.body : req.body?.leads;
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: 'Expected an array of leads or { leads: [] }.' });
      }
      if (rows.length > MAX_IMPORT_ROWS) {
        return res.status(400).json({ error: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` });
      }
      if (!rows.length) return res.status(400).json({ error: 'No rows to import.' });

      const result = await store.importLeads(rows, req.body?.source || 'import');
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/export', async (req, res, next) => {
    try {
      const leads = await store.listLeadsForExport(parseFilters(req.query));
      const csv = leadsToCsv(leads);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="ecu-business-leads-${new Date().toISOString().slice(0, 10)}.csv"`
      );
      res.send(`\uFEFF${csv}`);
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      res.json(await store.listLeads(parseFilters(req.query)));
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const body = req.body || {};
      if (!body.name || !String(body.name).trim()) {
        return res.status(400).json({ error: 'Business name is required.' });
      }
      const lead = {
        ...body,
        source: body.source || 'manual',
        verification_status: body.verification_status || 'discovered'
      };
      lead.services = Array.from(new Set([...(lead.services || []), ...detectServices(`${lead.name} ${lead.description || ''}`)]));
      const scored = applyScore(lead);
      const result = await store.upsertLead(scored);
      res.status(201).json(await store.getLead(result.id));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/verify', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const existing = await store.getLead(id);
      if (!existing) return res.status(404).json({ error: 'Lead not found' });
      if (!existing.website) return res.status(400).json({ error: 'This lead has no website to verify.' });

      const { enrichLead } = require('./enrich');
      let enriched;
      try {
        enriched = await enrichLead(existing);
      } catch (error) {
        return res.status(400).json({ error: `Verification failed: ${error.message}` });
      }
      if (enriched.website_status && enriched.website_status !== 'ok') {
        const updated = await store.updateLead(id, {
          website_status: enriched.website_status,
          raw_data: enriched.raw_data,
          notes: [existing.notes, `Verification ${new Date().toISOString().slice(0, 10)}: ${enriched.website_status}.`]
            .filter(Boolean)
            .join('\n')
        });
        return res.json({
          lead: updated,
          website_status: enriched.website_status,
          message: 'The website could not be verified. The lead was kept.'
        });
      }

      const scored = applyScore(enriched);
      await store.upsertLead(scored);
      res.json({ lead: await store.getLead(id), website_status: 'ok' });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const lead = await store.getLead(parseId(req.params.id));
      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      res.json(lead);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const existing = await store.getLead(id);
      if (!existing) return res.status(404).json({ error: 'Lead not found' });

      const patch = req.body || {};
      const merged = { ...existing, ...patch };
      const contactChanged = [
        'email',
        'phone',
        'whatsapp',
        'website',
        'address',
        'city',
        'country_code',
        'country',
        'latitude',
        'longitude',
        'services'
      ].some((field) => patch[field] !== undefined);

      if (contactChanged && patch.verification_status === undefined) {
        Object.assign(merged, applyScore(merged));
      }

      const updated = await store.updateLead(id, merged);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const lead = await store.getLead(id);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      await store.deleteLead(id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Router-level error handler keeps the API JSON-shaped and avoids leaking
  // stack traces to the browser.
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error('Lead research API error:', error);
    const status = error.statusCode || (String(error.message).includes('required') ? 400 : 500);
    res.status(status).json({ error: status === 500 ? 'Lead research request failed.' : error.message });
  });

  return router;
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Invalid lead id');
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function parseFilters(query = {}) {
  const filters = {
    q: query.q ? String(query.q).slice(0, 200) : '',
    country: query.country ? String(query.country).slice(0, 2) : '',
    city: query.city ? String(query.city).slice(0, 120) : '',
    potential: ['high', 'medium', 'low'].includes(query.potential) ? query.potential : '',
    status: String(query.status || '').slice(0, 30),
    pipeline: String(query.pipeline || '').slice(0, 30),
    compliance: ['clear', 'review', 'blocked'].includes(query.compliance) ? query.compliance : '',
    category: String(query.category || '').slice(0, 60),
    source: String(query.source || '').slice(0, 60),
    has_email: query.has_email,
    has_whatsapp: query.has_whatsapp,
    verified: query.verified,
    include_rejected: query.include_rejected === '1' || query.include_rejected === true,
    bbox: query.bbox ? String(query.bbox).slice(0, 120) : '',
    limit: Math.max(1, Math.min(500, Number(query.limit) || 50)),
    offset: Math.max(0, Number(query.offset) || 0),
    sort: ['score', 'updated', 'created', 'name', 'city'].includes(query.sort) ? query.sort : 'score'
  };
  return filters;
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Prevent spreadsheet formula injection for text values, but leave plain
  // numbers (including negative coordinates) untouched.
  if (
    typeof value === 'string' &&
    /^[=+\-@]/.test(text) &&
    !/^[+-]?\d+(?:\.\d+)?$/.test(text)
  ) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function leadsToCsv(leads) {
  const headers = [
    'name',
    'category',
    'address',
    'city',
    'region',
    'postal_code',
    'country_code',
    'country',
    'latitude',
    'longitude',
    'geo_precision',
    'website',
    'website_status',
    'email',
    'phone',
    'whatsapp',
    'potential',
    'score',
    'confidence',
    'verification_status',
    'pipeline_status',
    'compliance_status',
    'services',
    'evidence_url',
    'source',
    'source_url',
    'last_verified_at',
    'notes'
  ];
  const rows = [headers.join(',')];
  for (const lead of leads) {
    rows.push(
      headers
        .map((header) => {
          if (header === 'services') return csvCell((lead.services || []).join('; '));
          return csvCell(lead[header]);
        })
        .join(',')
    );
  }
  return rows.join('\r\n');
}

module.exports = { createLeadsRouter, leadsToCsv, parseFilters };
