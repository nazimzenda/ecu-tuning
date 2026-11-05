/**
 * OpenStreetMap / Overpass discovery.
 *
 * Overpass is a shared public resource. Queries are deliberately bounded by a
 * city radius and the runner only issues one query per target. Endpoints are
 * tried in order with backoff, and the Swiss-only endpoint is skipped outside
 * Switzerland.
 */

const {
  OVERPASS_ENDPOINTS,
  DISCOVERY_NAME_PATTERN,
  bboxAround,
  USER_AGENT
} = require('../catalog');
const { detectServices } = require('../score');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildQuery(bbox, { includeGeneral = false, limit = 300 } = {}) {
  const [south, west, north, east] = bbox;
  const area = `${south},${west},${north},${east}`;
  const namePattern = DISCOVERY_NAME_PATTERN.replace(/"/g, '\\"');
  const general = includeGeneral
    ? `nwr["shop"~"car_repair|car_parts|car|motorcycle"](${area});`
    : '';

  return `[out:json][timeout:28];
(
  nwr["name"~"${namePattern}",i](${area});
  nwr["shop"~"car_repair|car_parts|car|motorcycle"]["name"~"${namePattern}",i](${area});
  nwr["craft"="electronics"]["name"~"${namePattern}",i](${area});
  ${general}
);
out center tags ${Math.max(20, Math.min(500, Number(limit) || 300))};`;
}

function endpointSupportsCountry(endpoint, countryCode) {
  if (endpoint.includes('overpass.osm.ch')) {
    return String(countryCode || '').toUpperCase() === 'CH';
  }
  return true;
}

let lastGoodEndpoint = null;

async function queryOverpass(query, { endpoints = OVERPASS_ENDPOINTS, countryCode = '', deadlineMs = 90_000 } = {}) {
  const startedAt = Date.now();
  const usable = endpoints.filter((endpoint) => endpointSupportsCountry(endpoint, countryCode));
  let candidates = usable.length ? usable : endpoints;
  // Put a previously successful mirror first, and prefer the Swiss extract for
  // Swiss targets (it is small and tends to answer quickly).
  candidates = [...candidates].sort((a, b) => {
    if (a === lastGoodEndpoint) return -1;
    if (b === lastGoodEndpoint) return 1;
    if (String(countryCode).toUpperCase() === 'CH') {
      if (a.includes('overpass.osm.ch')) return -1;
      if (b.includes('overpass.osm.ch')) return 1;
    }
    return 0;
  });

  let lastError = null;

  for (const endpoint of candidates) {
    const remaining = deadlineMs - (Date.now() - startedAt);
    if (remaining <= 1000) {
      lastError = lastError || new Error('Overpass discovery deadline reached');
      break;
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'follow',
        signal: AbortSignal.timeout(Math.min(35_000, remaining)),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
          // Some public deployments reject requests without a referer.
          Referer: 'https://overpass-turbo.eu/'
        },
        body: new URLSearchParams({ data: query }).toString()
      });

      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 240);
        lastError = new Error(`${endpoint} returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      } else {
        const payload = await response.json();
        lastGoodEndpoint = endpoint;
        return { elements: Array.isArray(payload.elements) ? payload.elements : [], endpoint };
      }
    } catch (error) {
      lastError = new Error(`${endpoint}: ${error.message}`);
    }

    // A short pause avoids hammering a mirror that just failed.
    await sleep(900);
  }

  throw lastError || new Error('All Overpass endpoints failed');
}

function inferCategory(tags, name) {
  const text = `${name} ${tags.shop || ''} ${tags.craft || ''} ${tags.description || ''}`.toLowerCase();
  if (/tuning|remap|chip|ecu|performance|motoroptimierung|reprogrammation|centralina/.test(text)) {
    return 'tuning';
  }
  if (/diagnos|obd|fault|fehlerspeicher/.test(text)) return 'diagnostics';
  if (/parts|accessor/.test(text)) return 'parts';
  if (/car_repair|garage|workshop|repair|service/.test(text)) return 'garage';
  return 'automotive';
}

function elementCoordinates(element) {
  if (Number.isFinite(Number(element.lat)) && Number.isFinite(Number(element.lon))) {
    return { lat: Number(element.lat), lon: Number(element.lon) };
  }
  if (element.center && Number.isFinite(Number(element.center.lat)) && Number.isFinite(Number(element.center.lon))) {
    return { lat: Number(element.center.lat), lon: Number(element.center.lon) };
  }
  if (element.bounds) {
    const lat = (Number(element.bounds.minlat) + Number(element.bounds.maxlat)) / 2;
    const lon = (Number(element.bounds.minlon) + Number(element.bounds.maxlon)) / 2;
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }
  return null;
}

function isAutomotiveElement(tags, name, description) {
  const shop = String(tags.shop || '').toLowerCase();
  const craft = String(tags.craft || '').toLowerCase();
  const automotiveShops = new Set([
    'car_repair',
    'car_parts',
    'car',
    'motorcycle',
    'motorcycle_repair',
    'tyres',
    'truck',
    'truck_repair',
    'bus',
    'caravan'
  ]);
  if (automotiveShops.has(shop)) return true;
  if (['electronics', 'car_repair', 'mechanic'].includes(craft)) return true;
  if (String(tags['service:vehicle:car_repair'] || '').toLowerCase() === 'yes') return true;

  // Names that unambiguously describe ECU/tuning work can still be useful when
  // the POI is mapped as an office or company without an automotive shop tag.
  const strongName = /\b(?:chip.?tuning|chiptuning|ecu|remap|re-?map|motoroptimierung|reprogrammation|reprogramaci[oó]n|centralina|elaborazione|tuning\s*file|file\s*service)\b/i;
  const weakName = /\b(?:performance|diagnos|diagn[oó]stic|diesel)\b/i;
  if (strongName.test(`${name} ${description}`)) return true;
  if (weakName.test(`${name} ${description}`) && (shop || craft)) {
    // A "performance"/"diagnostics" business with an automotive-adjacent tag.
    return ['car', 'vehicle', 'motor', 'automotive'].some((word) => `${shop} ${craft} ${tags.name || ''}`.toLowerCase().includes(word));
  }
  return false;
}

function inferWebsiteFromName(name) {
  const candidate = String(name || '').trim().toLowerCase();
  if (
    /^[a-z0-9][a-z0-9.-]*\.(?:com|net|org|de|fr|es|it|nl|be|co\.uk|uk|eu|ch|at|pl|se|no|dk|fi|us|ca|au|nz|jp|za|ae|br|mx|in)$/i.test(
      candidate
    )
  ) {
    return `https://${candidate}`;
  }
  return null;
}

function elementToLead(element, city) {
  const tags = element.tags || {};
  const name = tags.name || tags.operator || tags.brand;
  if (!name) return null;

  const coords = elementCoordinates(element);
  if (!coords) return null;

  const description = tags.description || tags.note || tags['service:vehicle'] || null;
  if (!isAutomotiveElement(tags, name, description)) return null;

  const website =
    tags.website ||
    tags['contact:website'] ||
    tags.url ||
    inferWebsiteFromName(name) ||
    null;
  const rawPhone = tags.phone || tags['contact:phone'] || tags['contact:mobile'] || null;
  const phone = rawPhone ? String(rawPhone).split(/[;,]/)[0].trim() : null;
  const email = tags.email || tags['contact:email'] || null;
  const addressParts = [
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    [tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(' ')
  ].filter(Boolean);

  const cityName = tags['addr:city'] || city.name;
  const countryCode = tags['addr:country'] || city.countryCode;
  const serviceText = [name, description, tags.shop, tags.craft, tags['service:vehicle:car_repair']]
    .filter(Boolean)
    .join(' ');

  return {
    external_id: `osm:${element.type}:${element.id}`,
    name,
    category: inferCategory(tags, name),
    description,
    address: addressParts.length ? addressParts.join(', ') : null,
    city: cityName,
    region: tags['addr:state'] || null,
    postal_code: tags['addr:postcode'] || null,
    country_code: countryCode,
    country: city.countryName,
    latitude: coords.lat,
    longitude: coords.lon,
    geo_precision: element.type === 'node' ? 'rooftop' : 'street',
    website,
    email,
    phone,
    services: detectServices(serviceText),
    tags: [
      tags.shop ? `shop:${tags.shop}` : null,
      tags.craft ? `craft:${tags.craft}` : null,
      tags.brand ? `brand:${tags.brand}` : null
    ].filter(Boolean),
    source: 'osm-overpass',
    source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    source_id: `${element.type}/${element.id}`,
    evidence_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    raw_data: {
      osm_type: element.type,
      osm_id: element.id,
      osm_tags: tags
    }
  };
}

/**
 * Discovers likely ECU/tuning/diagnostics businesses around a catalog city.
 */
async function discoverCity(city, options = {}) {
  const bbox = options.bbox || bboxAround(city.lat, city.lon, city.radiusKm || 30);
  const query = buildQuery(bbox, {
    includeGeneral: Boolean(options.includeGeneral),
    limit: options.limit || 300
  });

  const { elements, endpoint } = await queryOverpass(query, {
    endpoints: options.endpoints,
    countryCode: city.countryCode,
    deadlineMs: options.deadlineMs || 90_000
  });

  const leads = [];
  const seen = new Set();
  for (const element of elements) {
    const lead = elementToLead(element, city);
    if (!lead) continue;
    const key = lead.external_id;
    if (seen.has(key)) continue;
    seen.add(key);
    leads.push(lead);
  }

  return {
    leads,
    meta: {
      source: 'osm-overpass',
      endpoint,
      query_bbox: bbox,
      returned_elements: elements.length,
      usable_leads: leads.length
    }
  };
}

module.exports = {
  buildQuery,
  queryOverpass,
  discoverCity,
  elementToLead,
  inferCategory
};
