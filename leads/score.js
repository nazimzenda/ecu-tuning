/**
 * Deterministic scoring and classification for research leads.
 *
 * The goal is not to pretend a heuristic is a human researcher. It is to make
 * every lead explainable: each point in score/confidence has a reason that the
 * admin can inspect, and compliance flags always win over a high score.
 */

const {
  SERVICE_PATTERNS,
  DEFEAT_PATTERNS
} = require('./catalog');

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.fr',
  'yahoo.de',
  'yahoo.es',
  'yahoo.it',
  'hotmail.com',
  'hotmail.fr',
  'hotmail.de',
  'outlook.com',
  'outlook.fr',
  'live.com',
  'live.fr',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'gmx.com',
  'gmx.de',
  'web.de',
  'free.fr',
  'orange.fr',
  'wanadoo.fr',
  'laposte.net',
  'libero.it',
  'virgilio.it',
  'tiscali.it',
  'bol.com.br',
  'uol.com.br',
  'mail.ru',
  'yandex.com',
  'yandex.ru'
]);

const ROLE_EMAIL_PREFIXES = [
  'info',
  'contact',
  'sales',
  'office',
  'hello',
  'service',
  'support',
  'admin',
  'commercial',
  'vente',
  'ventas',
  'kontakt',
  'enquiries',
  'enquiry',
  'workshop',
  'team'
];

function cleanText(value, max = 10000) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(gmbh|ltd|limited|llc|inc|sarl|sas|srl|bv|nv|ag|kg|co|oy|ab|as|plc|corp|corporation)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function domainFromUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

function isPersonalEmail(email) {
  const domain = String(email || '').split('@')[1]?.toLowerCase();
  return Boolean(domain && PERSONAL_EMAIL_DOMAINS.has(domain));
}

function isRoleEmail(email) {
  const local = String(email || '').split('@')[0]?.toLowerCase() || '';
  return ROLE_EMAIL_PREFIXES.some((prefix) => local === prefix || local.startsWith(`${prefix}.`) || local.startsWith(`${prefix}-`));
}

function emailScore(email, websiteDomain) {
  if (!email) return 0;
  const emailDomain = String(email).split('@')[1]?.toLowerCase();
  if (!emailDomain) return 0;
  if (websiteDomain && emailDomain === websiteDomain) return 15;
  if (isPersonalEmail(email)) return 4;
  if (isRoleEmail(email)) return 8;
  return 6;
}

function normalizePhone(value) {
  if (!value) return null;
  let raw = String(value).replace(/\u00a0/g, ' ');
  // Drop common separators but keep a leading plus.
  raw = raw.replace(/[^\d+]/g, '');
  if (!raw) return null;
  if (raw.startsWith('00')) raw = `+${raw.slice(2)}`;
  if (raw.startsWith('+')) raw = `+${raw.slice(1).replace(/\D/g, '')}`;
  else raw = raw.replace(/\D/g, '');
  if (raw.replace(/\D/g, '').length < 6) return null;
  return raw;
}

function detectServices(text) {
  const haystack = String(text || '');
  const found = [];
  for (const [service, patterns] of Object.entries(SERVICE_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(haystack))) {
      found.push(service);
    }
  }
  return found;
}

function detectCompliance(text) {
  const haystack = String(text || '');
  const flags = [];
  for (const rule of DEFEAT_PATTERNS) {
    if (rule.pattern.test(haystack)) {
      flags.push({ id: rule.id, label: rule.label });
    }
  }
  return {
    status: flags.length ? 'review' : 'clear',
    flags
  };
}

function locationScore(lead) {
  const precision = String(lead.geo_precision || 'none');
  const hasCoords = Number.isFinite(Number(lead.latitude)) && Number.isFinite(Number(lead.longitude));
  if (!hasCoords) return 0;
  switch (precision) {
    case 'rooftop':
      return 35;
    case 'street':
      return 30;
    case 'website':
      return 22;
    case 'approximate':
      return 15;
    case 'city':
      return 8;
    default:
      return 20;
  }
}

function hasAddress(lead) {
  return Boolean(lead.address && (lead.city || lead.postal_code));
}

function hasCityCountry(lead) {
  return Boolean(lead.city && lead.country_code);
}

function serviceSummary(services) {
  const map = {
    ecuSpecialist: 'ECU specialist',
    remapping: 'ECU remapping / calibration',
    diagnostics: 'Diagnostics',
    repair: 'Repair / workshop',
    emissionsRepair: 'Emissions-system repair',
    b2bFileService: 'File service / B2B partner signals'
  };
  return services.map((service) => map[service] || service);
}

/**
 * Produces an explainable score, confidence, potential and verification state.
 * The returned `reasons` array is safe to show in the admin UI.
 */
function scoreLead(input = {}) {
  const lead = { ...input };
  const services = Array.isArray(lead.services) ? lead.services : [];
  const text = [
    lead.name,
    lead.description,
    lead.website,
    ...(lead.tags || []),
    ...(lead.services || [])
  ]
    .filter(Boolean)
    .join(' ');

  const detected = detectServices(text);
  const allServices = Array.from(new Set([...services, ...detected]));
  const compliance = detectCompliance(text);

  let score = 25;
  let confidence = 0;
  const reasons = [];
  const confidenceParts = {
    location: 0,
    contact: 0,
    website: 0,
    relevance: 0
  };

  const addScore = (points, reason) => {
    if (!points) return;
    score += points;
    reasons.push({ points, reason });
  };

  if (allServices.includes('ecuSpecialist')) addScore(10, 'ECU specialist signals');
  if (allServices.includes('remapping')) addScore(20, 'ECU remapping / chip-tuning signals');
  if (allServices.includes('diagnostics')) addScore(10, 'Diagnostics services mentioned');
  if (allServices.includes('emissionsRepair')) addScore(6, 'Emissions-system repair (lawful service)');
  if (allServices.includes('b2bFileService')) addScore(10, 'File-service / workshop-partner signals');
  if (allServices.includes('repair') && !allServices.includes('remapping') && !allServices.includes('diagnostics')) {
    addScore(-8, 'General repair only; lower fit for file-service partnership');
  }

  const websiteStatus = String(
    lead.website_status || (lead.website ? 'unchecked' : 'missing')
  );
  const websiteScore =
    websiteStatus === 'ok' ? 12 : websiteStatus === 'social-only' ? 4 : 0;
  confidenceParts.website = websiteScore;
  if (websiteStatus === 'ok') addScore(4, 'Official website verified');
  else if (websiteStatus === 'social-only') addScore(1, 'Social profile only');
  else if (lead.website) addScore(1, 'Website recorded but not verified');

  const locScore = locationScore(lead);
  confidenceParts.location = locScore;
  if (locScore >= 30) addScore(8, 'Street-level coordinates');
  else if (locScore >= 20) addScore(4, 'Website-level coordinates');
  else if (locScore > 0) addScore(2, 'Approximate coordinates (city-level)');

  const contactPoints = emailScore(lead.email, lead.domain) + (lead.phone ? 10 : 0) + (lead.whatsapp ? 5 : 0);
  confidenceParts.contact = Math.min(25, contactPoints);
  if (lead.email) {
    addScore(emailScore(lead.email, lead.domain) >= 15 ? 8 : 4, 'Public business email');
  }
  if (lead.phone) addScore(6, 'Public business phone');
  if (lead.whatsapp) addScore(4, 'Public WhatsApp channel');
  if (hasAddress(lead)) addScore(5, 'Postal address recorded');
  if (hasCityCountry(lead)) addScore(4, 'City and country recorded');

  const relevance = Math.min(10, allServices.length * 2);
  confidenceParts.relevance = relevance;
  score += relevance;

  if (compliance.status === 'review') {
    score -= 18;
    reasons.push({ points: -18, reason: `Compliance review: ${compliance.flags.map((flag) => flag.label).join(', ')}` });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  confidence = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        confidenceParts.location +
          confidenceParts.contact +
          confidenceParts.website +
          confidenceParts.relevance
      )
    )
  );

  const potential = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';

  let verificationStatus = 'discovered';
  if (lead.opt_out || lead.verification_status === 'rejected') {
    verificationStatus = 'rejected';
  } else if (compliance.status === 'review') {
    verificationStatus = 'needs_review';
  } else if (
    confidenceParts.location >= 30 &&
    confidenceParts.website >= 12 &&
    confidenceParts.contact >= 8 &&
    websiteScore > 0
  ) {
    verificationStatus = 'verified';
  } else if (confidenceParts.website > 0 || confidenceParts.contact > 0) {
    verificationStatus = 'enriched';
  }

  return {
    score,
    confidence,
    potential,
    services: allServices,
    service_labels: serviceSummary(allServices),
    compliance_status: compliance.status,
    compliance_flags: compliance.flags,
    verification_status: verificationStatus,
    confidence_parts: confidenceParts,
    reasons
  };
}

/**
 * Scores a lead and records the explanation inside raw_data so the admin can
 * inspect it later, without adding another table.
 */
function applyScore(lead = {}) {
  const scored = scoreLead(lead);
  const rawData = lead.raw_data && typeof lead.raw_data === 'object' ? lead.raw_data : {};
  return {
    ...lead,
    ...scored,
    raw_data: {
      ...rawData,
      scoring: {
        parts: scored.confidence_parts,
        reasons: scored.reasons,
        service_labels: scored.service_labels,
        scored_at: new Date().toISOString()
      }
    }
  };
}

function isProbablyBusinessEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return false;
  if (/\.(?:png|jpe?g|gif|webp|svg|css|js|woff2?|ttf)$/i.test(value)) return false;
  if (/(?:example|test|domain)\.(?:com|org|net)$/i.test(value)) return false;
  if (/^(?:noreply|no-reply|donotreply|postmaster|abuse|webmaster)@/i.test(value)) return false;
  return true;
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

module.exports = {
  cleanText,
  normalizeName,
  domainFromUrl,
  isPersonalEmail,
  isRoleEmail,
  emailScore,
  normalizePhone,
  detectServices,
  detectCompliance,
  scoreLead,
  applyScore,
  isProbablyBusinessEmail,
  formatDate,
  locationScore
};
