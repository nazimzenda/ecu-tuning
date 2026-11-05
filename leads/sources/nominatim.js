/**
 * Nominatim discovery fallback.
 *
 * Nominatim is useful for finding named POIs that Overpass may not return, but
 * its usage policy is strict: one request per second, cache results, and no
 * bulk geocoding. This module is therefore used as a bounded fallback, not as
 * a primary crawler.
 */

const {
  NOMINATIM_ENDPOINT,
  NOMINATIM_TERMS,
  bboxAround,
  USER_AGENT
} = require('../catalog');
const { detectServices } = require('../score');

const RATE_LIMIT_MS = 1100;
let lastRequestAt = 0;
const cache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSlot() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

async function nominatimSearch(query, { limit = 20, viewbox = null, bounded = false } = {}) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    limit: String(Math.max(1, Math.min(50, limit)))
  });
  if (viewbox) {
    params.set('viewbox', viewbox.join(','));
    if (bounded) params.set('bounded', '1');
  }

  const url = `${NOMINATIM_ENDPOINT}/search?${params.toString()}`;
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.value;

  await waitForSlot();
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      'Accept-Language': 'en,fr;q=0.8,de;q=0.7,es;q=0.6,it;q=0.5,nl;q=0.5'
    }
  });
  if (!response.ok) {
    throw new Error(`Nominatim returned HTTP ${response.status}`);
  }
  const payload = await response.json();
  const results = Array.isArray(payload) ? payload : [];
  cache.set(url, { at: Date.now(), value: results });
  if (cache.size > 300) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  return results;
}

function addressParts(result) {
  const address = result.address || {};
  const street = [address.house_number, address.road].filter(Boolean).join(' ');
  const locality =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.suburb ||
    null;
  return {
    street: street || null,
    city: locality,
    region: address.state || address.county || null,
    postalCode: address.postcode || null,
    countryCode: address.country_code ? address.country_code.toUpperCase() : null,
    country: address.country || null
  };
}

function resultCategory(result) {
  const address = result.address || {};
  const text = `${result.name || ''} ${result.type || ''} ${address.shop || ''} ${address.craft || ''}`.toLowerCase();
  if (/tuning|remap|chip|ecu|performance/.test(text)) return 'tuning';
  if (/diagnos|obd/.test(text)) return 'diagnostics';
  if (/parts|accessor/.test(text)) return 'parts';
  if (/car_repair|garage|workshop|repair|service/.test(text)) return 'garage';
  return 'automotive';
}

function resultToLead(result, city) {
  if (!result || !result.name) return null;
  const lat = Number(result.lat);
  const lon = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const parts = addressParts(result);
  const extratags = result.extratags || {};
  const website =
    extratags.website ||
    extratags['contact:website'] ||
    extratags.url ||
    null;
  const rawPhone =
    extratags.phone ||
    extratags['contact:phone'] ||
    extratags['contact:mobile'] ||
    null;
  const phone = rawPhone ? String(rawPhone).split(/[;,]/)[0].trim() : null;
  const email = extratags.email || extratags['contact:email'] || null;
  const countryCode = parts.countryCode || city.countryCode;
  const name = result.name;

  return {
    external_id: `nominatim:${result.place_id}`,
    name,
    category: resultCategory(result),
    description: extratags.description || null,
    address: [parts.street, [parts.postalCode, parts.city].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', ') || null,
    city: parts.city || city.name,
    region: parts.region,
    postal_code: parts.postalCode,
    country_code: countryCode,
    country: parts.country || city.countryName,
    latitude: lat,
    longitude: lon,
    geo_precision: result.osm_type === 'node' ? 'rooftop' : 'street',
    website,
    email,
    phone,
    services: detectServices(`${name} ${result.type || ''} ${JSON.stringify(extratags)}`),
    tags: [
      result.category ? `category:${result.category}` : null,
      result.type ? `type:${result.type}` : null,
      extratags.shop ? `shop:${extratags.shop}` : null,
      extratags.craft ? `craft:${extratags.craft}` : null
    ].filter(Boolean),
    source: 'osm-nominatim',
    source_url: `https://www.openstreetmap.org/${result.osm_type}/${result.osm_id}`,
    source_id: String(result.place_id),
    evidence_url: `https://www.openstreetmap.org/${result.osm_type}/${result.osm_id}`,
    raw_data: {
      nominatim: {
        place_id: result.place_id,
        osm_type: result.osm_type,
        osm_id: result.osm_id,
        display_name: result.display_name,
        category: result.category,
        type: result.type,
        importance: result.importance,
        extratags
      }
    }
  };
}

function sameCountry(result, countryCode) {
  const resultCountry = result.address?.country_code?.toUpperCase();
  return !countryCode || !resultCountry || resultCountry === countryCode.toUpperCase();
}

const NON_AUTOMOTIVE_TYPES = new Set([
  'artwork',
  'piano_tuner',
  'pharmacy',
  'estate_agent',
  'bus_stop',
  'tram_stop',
  'parking',
  'highway',
  'secondary',
  'pedestrian',
  'cycleway',
  'building',
  'detached',
  'apartments',
  'house',
  'school',
  'university',
  'hospital',
  'clinic'
]);

/**
 * Nominatim returns every kind of named place. Keep only businesses whose
 * public category or name is plausibly automotive/ECU-related.
 */
function isLikelyAutomotive(result) {
  const address = result.address || {};
  const type = String(result.type || '').toLowerCase();
  const category = String(result.category || '').toLowerCase();
  const shop = String(address.shop || '').toLowerCase();
  const craft = String(address.craft || '').toLowerCase();
  const name = String(result.name || '');
  const automotiveShop = ['car_repair', 'car_parts', 'car', 'motorcycle', 'tyres', 'caravan', 'truck'].includes(shop);

  if (NON_AUTOMOTIVE_TYPES.has(type) && !automotiveShop) return false;
  if (
    ['highway', 'railway', 'amenity', 'tourism', 'leisure', 'healthcare', 'landuse', 'building'].includes(category) &&
    !automotiveShop
  ) {
    return false;
  }
  if (/piano|artwork|tuning fork/i.test(name)) return false;
  if (/sound|audio|hi-?fi/i.test(name) && !/ecu|remap|chip|engine/i.test(name)) return false;
  if (type === 'office' && /^ecu$/i.test(name.trim())) return false;

  if (automotiveShop) return true;
  if (['electronics', 'car_repair', 'mechanic'].includes(craft)) return true;
  if (category === 'shop' && ['car_repair', 'car_parts', 'car', 'motorcycle', 'tyres'].includes(type)) return true;

  return /(?:tuning|remap|chip.?tuning|ecu\s+(?:tuning|remap|specialist)|engine\s+tuning|performance\s+tuning|diesel\s+tuning|diagnos)/i.test(
    name
  );
}

/**
 * Runs a small set of text searches plus one bounded "tuning" search around a
 * city. The result is deduplicated by Nominatim place_id.
 */
async function discoverCity(city, options = {}) {
  const terms = options.terms || NOMINATIM_TERMS;
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 40));
  const bbox = options.bbox || bboxAround(city.lat, city.lon, city.radiusKm || 30);
  // Nominatim viewbox order: left,top,right,bottom (lon,lat,lon,lat).
  const viewbox = [bbox[1], bbox[2], bbox[3], bbox[0]];

  const leads = [];
  const seen = new Set();
  const errors = [];

  const addResults = (results) => {
    for (const result of results) {
      if (!result || !result.name || !result.place_id) continue;
      if (!sameCountry(result, city.countryCode)) continue;
      if (!isLikelyAutomotive(result)) continue;
      const placeRank = Number(result.place_rank || 0);
      if (placeRank && placeRank < 20) continue;
      const lead = resultToLead(result, city);
      if (!lead || seen.has(lead.external_id)) continue;
      seen.add(lead.external_id);
      leads.push(lead);
      if (leads.length >= limit) return;
    }
  };

  // A bounded "tuning" search tends to surface local businesses that the
  // exact term searches miss. It is one request, so keep it first.
  try {
    const broad = await nominatimSearch('tuning', { limit: 30, viewbox, bounded: true });
    addResults(broad);
  } catch (error) {
    errors.push(error.message);
  }

  for (const term of terms) {
    if (leads.length >= limit) break;
    try {
      const results = await nominatimSearch(`${term} ${city.name}`, { limit: 20 });
      addResults(results);
    } catch (error) {
      errors.push(error.message);
      if (errors.length >= 3) break;
    }
  }

  return {
    leads: leads.slice(0, limit),
    meta: {
      source: 'osm-nominatim',
      queries: terms.length + 1,
      errors
    }
  };
}

function clearCache() {
  cache.clear();
}

module.exports = {
  discoverCity,
  nominatimSearch,
  resultToLead,
  clearCache
};
