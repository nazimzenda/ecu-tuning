/**
 * SQLite store for the lead-research workspace.
 *
 * This deliberately uses its own connection to the application's SQLite file
 * (same DATA_DIR logic as database.js). That keeps the existing order schema
 * untouched and means lead research also works when the orders database is
 * configured to use Firestore.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
const dbPath = path.join(dataDir, 'database.sqlite');

let db = null;
let initPromise = null;

const LEAD_COLUMNS = [
  'external_id',
  'name',
  'name_key',
  'legal_name',
  'category',
  'description',
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
  'domain',
  'website_status',
  'email',
  'email_normalized',
  'phone',
  'phone_normalized',
  'whatsapp',
  'instagram',
  'facebook',
  'linkedin',
  'services',
  'tags',
  'potential',
  'score',
  'confidence',
  'verification_status',
  'pipeline_status',
  'compliance_status',
  'compliance_flags',
  'evidence_url',
  'source',
  'source_url',
  'source_id',
  'notes',
  'opt_out',
  'last_verified_at',
  'raw_data'
];

const JSON_FIELDS = ['services', 'tags', 'compliance_flags', 'raw_data'];

function ensureDb() {
  if (!db) {
    throw new Error('Lead store is not initialised. Call init() first.');
  }
  return db;
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    ensureDb().run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    ensureDb().get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    ensureDb().all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function normalizeText(value, max = 500) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function normalizeUrl(value) {
  if (!value) return null;
  let raw = String(value).trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function domainFromUrl(value) {
  const url = normalizeUrl(value);
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
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

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function makeExternalId(lead) {
  if (lead.external_id) return String(lead.external_id);
  if (lead.source && lead.source_id) return `${lead.source}:${lead.source_id}`;
  const basis = [
    lead.domain || '',
    lead.phone_normalized || digits(lead.phone) || '',
    lead.name_key || normalizeName(lead.name),
    lead.country_code || '',
    lead.city || ''
  ].join('|');
  return `derived:${crypto.createHash('sha1').update(basis).digest('hex').slice(0, 20)}`;
}

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value)
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
}

function jsonObject(value) {
  if (value && typeof value === 'object') return value;
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function serializeForDb(lead) {
  const row = {};
  const incoming = { ...lead };

  // Friendly aliases for connector/import authors.
  if (incoming.countryCode && !incoming.country_code) incoming.country_code = incoming.countryCode;
  if (incoming.postalCode && !incoming.postal_code) incoming.postal_code = incoming.postalCode;
  if (incoming.legalName && !incoming.legal_name) incoming.legal_name = incoming.legalName;
  if (incoming.geoPrecision && !incoming.geo_precision) incoming.geo_precision = incoming.geoPrecision;
  if (incoming.verificationStatus && !incoming.verification_status) incoming.verification_status = incoming.verificationStatus;
  if (incoming.pipelineStatus && !incoming.pipeline_status) incoming.pipeline_status = incoming.pipelineStatus;
  if (incoming.complianceStatus && !incoming.compliance_status) incoming.compliance_status = incoming.complianceStatus;
  if (incoming.complianceFlags && !incoming.compliance_flags) incoming.compliance_flags = incoming.complianceFlags;
  if (incoming.evidenceUrl && !incoming.evidence_url) incoming.evidence_url = incoming.evidenceUrl;
  if (incoming.sourceUrl && !incoming.source_url) incoming.source_url = incoming.sourceUrl;
  if (incoming.sourceId && !incoming.source_id) incoming.source_id = incoming.sourceId;
  if (incoming.rawData && !incoming.raw_data) incoming.raw_data = incoming.rawData;
  if (incoming.lastVerifiedAt && !incoming.last_verified_at) incoming.last_verified_at = incoming.lastVerifiedAt;

  const name = normalizeText(incoming.name, 240);
  if (!name) throw new Error('Lead name is required');

  const website = normalizeUrl(incoming.website);
  const domain = incoming.domain || domainFromUrl(website);
  const email = normalizeText(incoming.email, 240);
  const phone = normalizeText(incoming.phone, 80);
  const city = normalizeText(incoming.city, 120);
  const countryCode = normalizeText(incoming.country_code, 2);
  const country = normalizeText(incoming.country, 120);

  row.external_id = incoming.external_id ? String(incoming.external_id).slice(0, 300) : null;
  row.name = name;
  row.name_key = normalizeName(name).slice(0, 240);
  row.legal_name = normalizeText(incoming.legal_name, 240);
  row.category = normalizeText(incoming.category, 80) || 'tuning';
  row.description = normalizeText(incoming.description, 2000);
  row.address = normalizeText(incoming.address, 500);
  row.city = city;
  row.region = normalizeText(incoming.region, 140);
  row.postal_code = normalizeText(incoming.postal_code, 30);
  row.country_code = countryCode ? countryCode.toUpperCase() : null;
  row.country = country;
  row.latitude = Number.isFinite(Number(incoming.latitude)) ? Number(incoming.latitude) : null;
  row.longitude = Number.isFinite(Number(incoming.longitude)) ? Number(incoming.longitude) : null;
  row.geo_precision = normalizeText(incoming.geo_precision, 30) || 'none';
  row.website = website;
  row.domain = domain ? domain.toLowerCase() : null;
  row.website_status = normalizeText(incoming.website_status, 30) || (website ? 'unchecked' : 'missing');
  row.email = email ? email.toLowerCase() : null;
  row.email_normalized = email ? email.toLowerCase() : null;
  row.phone = phone;
  row.phone_normalized = digits(phone) || null;
  row.whatsapp = normalizeText(incoming.whatsapp, 80);
  row.instagram = normalizeUrl(incoming.instagram);
  row.facebook = normalizeUrl(incoming.facebook);
  row.linkedin = normalizeUrl(incoming.linkedin);
  row.services = JSON.stringify(jsonArray(incoming.services));
  row.tags = JSON.stringify(jsonArray(incoming.tags));
  row.potential = ['high', 'medium', 'low'].includes(incoming.potential) ? incoming.potential : 'low';
  row.score = Number.isFinite(Number(incoming.score)) ? Math.max(0, Math.min(100, Math.round(Number(incoming.score)))) : 0;
  row.confidence = Number.isFinite(Number(incoming.confidence)) ? Math.max(0, Math.min(100, Math.round(Number(incoming.confidence)))) : 0;
  row.verification_status = normalizeText(incoming.verification_status, 30) || 'discovered';
  row.pipeline_status = normalizeText(incoming.pipeline_status, 30) || 'new';
  row.compliance_status = normalizeText(incoming.compliance_status, 30) || 'clear';
  row.compliance_flags = JSON.stringify(jsonArray(incoming.compliance_flags));
  row.evidence_url = normalizeUrl(incoming.evidence_url);
  row.source = normalizeText(incoming.source, 80) || 'manual';
  row.source_url = normalizeUrl(incoming.source_url);
  row.source_id = normalizeText(incoming.source_id, 300);
  row.notes = normalizeText(incoming.notes, 4000);
  row.opt_out = incoming.opt_out ? 1 : 0;
  row.last_verified_at = incoming.last_verified_at || null;
  row.raw_data = JSON.stringify(jsonObject(incoming.raw_data));

  row.external_id = makeExternalId(row);
  return row;
}

function parseLead(row) {
  if (!row) return null;
  const lead = { ...row };
  for (const field of JSON_FIELDS) {
    if (field === 'raw_data') {
      try {
        lead[field] = row[field] ? JSON.parse(row[field]) : {};
      } catch {
        lead[field] = {};
      }
    } else {
      lead[field] = jsonArray(row[field]);
    }
  }
  lead.opt_out = Boolean(row.opt_out);
  lead.is_verified = row.verification_status === 'verified' && !row.opt_out;
  lead.has_email = Boolean(row.email);
  lead.has_phone = Boolean(row.phone);
  lead.has_whatsapp = Boolean(row.whatsapp);
  return lead;
}

async function init() {
  if (initPromise) return initPromise;
  initPromise = new Promise((resolve, reject) => {
    fs.ensureDirSync(dataDir);
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      db.configure('busyTimeout', 5000);
      db.run('PRAGMA journal_mode = WAL;', () => {
        db.run('PRAGMA foreign_keys = ON;', () => {
          createTables().then(resolve).catch(reject);
        });
      });
    });
  });
  return initPromise;
}

async function ensureColumn(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  if (columns.some((entry) => entry.name === column)) return;
  try {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    // A concurrent process may have added it first.
    if (!/duplicate column/i.test(error.message)) throw error;
  }
}

async function createTables() {
  await run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      name TEXT NOT NULL,
      name_key TEXT,
      legal_name TEXT,
      category TEXT DEFAULT 'tuning',
      description TEXT,
      address TEXT,
      city TEXT,
      region TEXT,
      postal_code TEXT,
      country_code TEXT,
      country TEXT,
      latitude REAL,
      longitude REAL,
      geo_precision TEXT DEFAULT 'none',
      website TEXT,
      domain TEXT,
      website_status TEXT DEFAULT 'unchecked',
      email TEXT,
      email_normalized TEXT,
      phone TEXT,
      phone_normalized TEXT,
      whatsapp TEXT,
      instagram TEXT,
      facebook TEXT,
      linkedin TEXT,
      services TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      potential TEXT DEFAULT 'low',
      score INTEGER DEFAULT 0,
      confidence INTEGER DEFAULT 0,
      verification_status TEXT DEFAULT 'discovered',
      pipeline_status TEXT DEFAULT 'new',
      compliance_status TEXT DEFAULT 'clear',
      compliance_flags TEXT DEFAULT '[]',
      evidence_url TEXT,
      source TEXT DEFAULT 'manual',
      source_url TEXT,
      source_id TEXT,
      notes TEXT,
      opt_out INTEGER DEFAULT 0,
      last_verified_at DATETIME,
      raw_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Lightweight migration for databases created by earlier versions.
  await ensureColumn('leads', 'pipeline_status', "TEXT DEFAULT 'new'");
  await ensureColumn('leads', 'website_status', "TEXT DEFAULT 'unchecked'");
  await ensureColumn('leads', 'raw_data', 'TEXT');

  await run(`
    CREATE TABLE IF NOT EXISTS research_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT,
      status TEXT DEFAULT 'queued',
      progress INTEGER DEFAULT 0,
      countries TEXT DEFAULT '[]',
      cities TEXT DEFAULT '[]',
      params TEXT DEFAULT '{}',
      found INTEGER DEFAULT 0,
      added INTEGER DEFAULT 0,
      updated INTEGER DEFAULT 0,
      enriched INTEGER DEFAULT 0,
      skipped INTEGER DEFAULT 0,
      error TEXT,
      log TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      finished_at DATETIME
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_leads_country ON leads(country_code)');
  await run('CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city)');
  await run('CREATE INDEX IF NOT EXISTS idx_leads_potential ON leads(potential)');
  await run('CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(verification_status)');
  await run('CREATE INDEX IF NOT EXISTS idx_leads_domain ON leads(domain)');
  await run('CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_normalized)');
  await run('CREATE INDEX IF NOT EXISTS idx_leads_name_key ON leads(name_key)');
  await run('CREATE INDEX IF NOT EXISTS idx_leads_updated ON leads(updated_at)');

  // A job cannot survive a process restart; don't leave it "running" forever.
  await run(
    `UPDATE research_jobs
     SET status = 'failed', error = 'Interrupted by server restart', finished_at = CURRENT_TIMESTAMP
     WHERE status IN ('queued', 'running')`
  );

  console.log(`🏁 Lead store ready: ${dbPath}`);
}

async function findByExternalId(externalId) {
  if (!externalId) return null;
  return get('SELECT * FROM leads WHERE external_id = ? LIMIT 1', [externalId]);
}

async function findByDomain(domain) {
  if (!domain) return null;
  return get('SELECT * FROM leads WHERE domain = ? LIMIT 1', [domain]);
}

async function findByPhone(phoneNormalized) {
  if (!phoneNormalized || phoneNormalized.length < 7) return null;
  return get('SELECT * FROM leads WHERE phone_normalized = ? LIMIT 1', [phoneNormalized]);
}

async function findByNameCity(nameKey, city, countryCode) {
  if (!nameKey) return null;
  if (city && countryCode) {
    return get(
      `SELECT * FROM leads
       WHERE name_key = ? AND LOWER(city) = LOWER(?) AND UPPER(country_code) = UPPER(?)
       LIMIT 1`,
      [nameKey, city, countryCode]
    );
  }
  if (city) {
    return get(
      'SELECT * FROM leads WHERE name_key = ? AND LOWER(city) = LOWER(?) LIMIT 1',
      [nameKey, city]
    );
  }
  return null;
}

async function findExisting(row) {
  const byExternal = await findByExternalId(row.external_id);
  if (byExternal) return byExternal;

  const byDomain = await findByDomain(row.domain);
  if (byDomain) return byDomain;

  const byPhone = await findByPhone(row.phone_normalized);
  if (byPhone) return byPhone;

  return findByNameCity(row.name_key, row.city, row.country_code);
}

function mergeRows(existing, incoming) {
  const merged = { ...existing };
  const fillFields = [
    'legal_name',
    'description',
    'address',
    'city',
    'region',
    'postal_code',
    'country_code',
    'country',
    'website',
    'domain',
    'website_status',
    'email',
    'email_normalized',
    'phone',
    'phone_normalized',
    'whatsapp',
    'instagram',
    'facebook',
    'linkedin',
    'evidence_url',
    'source',
    'source_url',
    'source_id',
    'notes',
    'last_verified_at'
  ];

  for (const field of fillFields) {
    if (!existing[field] && incoming[field]) merged[field] = incoming[field];
  }

  // Coordinates: prefer a more precise source.
  const precisionRank = { none: 0, city: 1, approximate: 2, website: 3, street: 4, rooftop: 5 };
  const existingRank = precisionRank[existing.geo_precision] || 0;
  const incomingRank = precisionRank[incoming.geo_precision] || 0;
  if (incoming.latitude != null && incoming.longitude != null) {
    if (existing.latitude == null || existing.longitude == null || incomingRank >= existingRank) {
      merged.latitude = incoming.latitude;
      merged.longitude = incoming.longitude;
      merged.geo_precision = incoming.geo_precision;
    }
  }

  // A successful website verification should replace an old blocks/unreachable
  // state; otherwise keep the best-known state.
  const websiteRank = {
    missing: 0,
    invalid: 1,
    unchecked: 2,
    blocked: 3,
    unreachable: 3,
    directory: 4,
    'social-only': 5,
    ok: 6
  };
  const existingWebsiteRank = websiteRank[existing.website_status] ?? 2;
  const incomingWebsiteRank = websiteRank[incoming.website_status] ?? 2;
  if (incomingWebsiteRank >= existingWebsiteRank) {
    merged.website_status = incoming.website_status;
  }

  // Keep the strongest classification, but always keep review flags.
  if ((incoming.confidence || 0) > (existing.confidence || 0)) {
    merged.confidence = incoming.confidence;
  }
  if ((incoming.score || 0) > (existing.score || 0)) {
    merged.score = incoming.score;
    merged.potential = incoming.potential;
  }

  if (incoming.verification_status === 'verified' && existing.verification_status !== 'rejected') {
    merged.verification_status = 'verified';
  } else if (
    incoming.verification_status === 'enriched' &&
    !['verified', 'rejected'].includes(existing.verification_status)
  ) {
    merged.verification_status = 'enriched';
  }

  if (incoming.compliance_status === 'review' || existing.compliance_status === 'review') {
    merged.compliance_status = 'review';
  }
  if (incoming.compliance_status === 'blocked') merged.compliance_status = 'blocked';

  // Preserve a human-managed pipeline state once it leaves "new".
  if (!existing.pipeline_status || existing.pipeline_status === 'new') {
    merged.pipeline_status = incoming.pipeline_status || 'new';
  }

  merged.services = JSON.stringify(
    Array.from(new Set([...jsonArray(existing.services), ...jsonArray(incoming.services)]))
  );
  merged.tags = JSON.stringify(
    Array.from(new Set([...jsonArray(existing.tags), ...jsonArray(incoming.tags)]))
  );
  merged.compliance_flags = JSON.stringify(
    Array.from(
      new Set([...jsonArray(existing.compliance_flags), ...jsonArray(incoming.compliance_flags)])
    )
  );

  // Keep the richer raw snapshot, while letting a re-verification replace it.
  if (incoming.raw_data && incoming.raw_data !== '{}') {
    merged.raw_data = incoming.raw_data;
  }

  if (existing.opt_out) {
    merged.opt_out = 1;
    merged.verification_status = 'rejected';
  }

  return merged;
}

function rowValues(row) {
  return LEAD_COLUMNS.map((column) => row[column]);
}

async function insertRow(row) {
  const placeholders = LEAD_COLUMNS.map(() => '?').join(', ');
  const result = await run(
    `INSERT INTO leads (${LEAD_COLUMNS.join(', ')}) VALUES (${placeholders})`,
    rowValues(row)
  );
  return result.lastID;
}

async function updateRow(id, row) {
  const updates = LEAD_COLUMNS.filter((column) => column !== 'external_id')
    .map((column) => `${column} = ?`)
    .join(', ');
  const values = LEAD_COLUMNS.filter((column) => column !== 'external_id').map((column) => row[column]);
  await run(`UPDATE leads SET ${updates}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id]);
}

/**
 * Inserts or merges a lead. Returns { id, action }.
 */
async function upsertLead(input) {
  const row = serializeForDb(input);
  const existing = await findExisting(row);
  if (!existing) {
    const id = await insertRow(row);
    return { id, action: 'inserted' };
  }

  const merged = mergeRows(existing, row);
  await updateRow(existing.id, merged);
  return { id: existing.id, action: 'updated' };
}

async function getLead(id) {
  const row = await get('SELECT * FROM leads WHERE id = ?', [id]);
  return parseLead(row);
}

async function deleteLead(id) {
  return run('DELETE FROM leads WHERE id = ?', [id]);
}

const SORT_MAP = {
  score: 'score DESC, confidence DESC, updated_at DESC',
  updated: 'updated_at DESC',
  created: 'created_at DESC',
  name: 'name COLLATE NOCASE ASC',
  city: 'country COLLATE NOCASE ASC, city COLLATE NOCASE ASC'
};

function buildLeadWhere(filters = {}) {
  const where = [];
  const params = [];

  if (filters.q) {
    const needle = `%${String(filters.q).trim()}%`;
    where.push(
      '(name LIKE ? OR city LIKE ? OR country LIKE ? OR domain LIKE ? OR email LIKE ? OR services LIKE ? OR notes LIKE ?)'
    );
    params.push(needle, needle, needle, needle, needle, needle, needle);
  }
  if (filters.country) {
    where.push('UPPER(country_code) = UPPER(?)');
    params.push(filters.country);
  }
  if (filters.city) {
    where.push('LOWER(city) = LOWER(?)');
    params.push(filters.city);
  }
  if (filters.potential) {
    where.push('potential = ?');
    params.push(filters.potential);
  }
  if (filters.status) {
    where.push('verification_status = ?');
    params.push(filters.status);
  }
  if (filters.pipeline) {
    where.push('pipeline_status = ?');
    params.push(filters.pipeline);
  }
  if (filters.compliance) {
    where.push('compliance_status = ?');
    params.push(filters.compliance);
  }
  if (filters.category) {
    where.push('category = ?');
    params.push(filters.category);
  }
  if (filters.source) {
    where.push('source = ?');
    params.push(filters.source);
  }
  if (filters.has_email === '1' || filters.has_email === true) {
    where.push("(email IS NOT NULL AND email != '')");
  }
  if (filters.has_whatsapp === '1' || filters.has_whatsapp === true) {
    where.push("(whatsapp IS NOT NULL AND whatsapp != '')");
  }
  if (filters.verified === '1' || filters.verified === true) {
    where.push("verification_status = 'verified' AND opt_out = 0");
  }
  if (filters.bbox) {
    const parts = String(filters.bbox).split(',').map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      where.push('latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?');
      params.push(parts[0], parts[2], parts[1], parts[3]);
    }
  }
  if (!filters.include_rejected) {
    where.push("verification_status != 'rejected' AND opt_out = 0");
  }

  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function listLeads(filters = {}) {
  const { sql, params } = buildLeadWhere(filters);
  const limit = Math.max(1, Math.min(500, Number(filters.limit) || 50));
  const offset = Math.max(0, Number(filters.offset) || 0);
  const orderBy = SORT_MAP[filters.sort] || SORT_MAP.score;

  const rows = await all(
    `SELECT * FROM leads ${sql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const countRow = await get(`SELECT COUNT(*) AS total FROM leads ${sql}`, params);

  return {
    leads: rows.map(parseLead),
    total: countRow ? countRow.total : 0,
    limit,
    offset
  };
}

async function listLeadsForExport(filters = {}) {
  const { sql, params } = buildLeadWhere(filters);
  const orderBy = SORT_MAP[filters.sort] || SORT_MAP.score;
  const rows = await all(
    `SELECT * FROM leads ${sql} ORDER BY ${orderBy} LIMIT 10000`,
    params
  );
  return rows.map(parseLead);
}

async function getMapLeads(filters = {}) {
  const { sql, params } = buildLeadWhere({ ...filters, include_rejected: false });
  const rows = await all(
    `SELECT id, name, city, country, country_code, latitude, longitude, potential,
            score, confidence, verification_status, compliance_status, opt_out
     FROM leads
     ${sql ? `${sql} AND` : 'WHERE'} latitude IS NOT NULL AND longitude IS NOT NULL
     ORDER BY score DESC
     LIMIT 5000`,
    params
  );
  return rows.map(parseLead);
}

async function getStats() {
  const totals = await get(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN verification_status = 'verified' AND opt_out = 0 THEN 1 ELSE 0 END) AS verified,
      SUM(CASE WHEN potential = 'high' AND opt_out = 0 THEN 1 ELSE 0 END) AS high,
      SUM(CASE WHEN potential = 'medium' AND opt_out = 0 THEN 1 ELSE 0 END) AS medium,
      SUM(CASE WHEN potential = 'low' AND opt_out = 0 THEN 1 ELSE 0 END) AS low,
      SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN whatsapp IS NOT NULL AND whatsapp != '' THEN 1 ELSE 0 END) AS with_whatsapp,
      SUM(CASE WHEN compliance_status = 'review' THEN 1 ELSE 0 END) AS needs_review,
      COUNT(DISTINCT CASE WHEN country_code IS NOT NULL AND country_code != '' THEN country_code END) AS countries,
      MAX(updated_at) AS last_updated
    FROM leads
  `);

  const byCountry = await all(`
    SELECT country, country_code, COUNT(*) AS total,
           SUM(CASE WHEN verification_status = 'verified' AND opt_out = 0 THEN 1 ELSE 0 END) AS verified,
           SUM(CASE WHEN potential = 'high' AND opt_out = 0 THEN 1 ELSE 0 END) AS high
    FROM leads
    WHERE country_code IS NOT NULL AND country_code != ''
    GROUP BY country_code, country
    ORDER BY total DESC, country ASC
    LIMIT 30
  `);

  const byPotential = await all(`
    SELECT potential, COUNT(*) AS total
    FROM leads
    WHERE opt_out = 0
    GROUP BY potential
  `);

  const byStatus = await all(`
    SELECT verification_status AS status, COUNT(*) AS total
    FROM leads
    GROUP BY verification_status
  `);

  const byCategory = await all(`
    SELECT category, COUNT(*) AS total
    FROM leads
    GROUP BY category
    ORDER BY total DESC
    LIMIT 12
  `);

  const byPipeline = await all(`
    SELECT pipeline_status AS status, COUNT(*) AS total
    FROM leads
    GROUP BY pipeline_status
  `);

  return {
    totals: {
      total: totals?.total || 0,
      verified: totals?.verified || 0,
      high: totals?.high || 0,
      medium: totals?.medium || 0,
      low: totals?.low || 0,
      with_email: totals?.with_email || 0,
      with_whatsapp: totals?.with_whatsapp || 0,
      needs_review: totals?.needs_review || 0,
      countries: totals?.countries || 0,
      last_updated: totals?.last_updated || null
    },
    by_country: byCountry,
    by_potential: byPotential,
    by_status: byStatus,
    by_category: byCategory,
    by_pipeline: byPipeline
  };
}

async function updateLead(id, patch) {
  const existing = await getLead(id);
  if (!existing) return null;

  const allowed = {
    potential: 'potential',
    verification_status: 'verification_status',
    pipeline_status: 'pipeline_status',
    compliance_status: 'compliance_status',
    notes: 'notes',
    email: 'email',
    phone: 'phone',
    whatsapp: 'whatsapp',
    website: 'website',
    website_status: 'website_status',
    address: 'address',
    city: 'city',
    region: 'region',
    postal_code: 'postal_code',
    country_code: 'country_code',
    country: 'country',
    latitude: 'latitude',
    longitude: 'longitude',
    geo_precision: 'geo_precision',
    score: 'score',
    confidence: 'confidence',
    opt_out: 'opt_out',
    services: 'services',
    tags: 'tags',
    raw_data: 'raw_data'
  };

  const values = {};
  for (const [key, column] of Object.entries(allowed)) {
    if (patch[key] === undefined) continue;
    values[column] = patch[key];
  }
  if (patch.verificationStatus !== undefined) values.verification_status = patch.verificationStatus;
  if (patch.pipelineStatus !== undefined) values.pipeline_status = patch.pipelineStatus;
  if (patch.complianceStatus !== undefined) values.compliance_status = patch.complianceStatus;
  if (patch.optOut !== undefined) values.opt_out = patch.optOut ? 1 : 0;
  if (patch.postalCode !== undefined) values.postal_code = patch.postalCode;
  if (patch.countryCode !== undefined) values.country_code = patch.countryCode;

  if (!Object.keys(values).length) return existing;

  const merged = {
    ...existing,
    ...values,
    services: values.services !== undefined ? values.services : existing.services,
    tags: values.tags !== undefined ? values.tags : existing.tags
  };

  const row = serializeForDb(merged);
  // Manual edits should not be overwritten by a stale external id.
  row.external_id = existing.external_id;
  if (existing.opt_out) row.opt_out = 1;
  await updateRow(id, row);
  return getLead(id);
}

async function reindexLead(id, computed) {
  return updateLead(id, computed);
}

/* ------------------------------------------------------------------ */
/* Research jobs                                                       */
/* ------------------------------------------------------------------ */

function parseJob(row) {
  if (!row) return null;
  return {
    ...row,
    countries: jsonArray(row.countries),
    cities: jsonArray(row.cities),
    params: jsonObject(row.params),
    log: jsonArray(row.log)
  };
}

async function createJob({ label, countries, cities, params }) {
  const result = await run(
    `INSERT INTO research_jobs (label, countries, cities, params, status)
     VALUES (?, ?, ?, ?, 'queued')`,
    [
      normalizeText(label, 240) || 'Research run',
      JSON.stringify(countries || []),
      JSON.stringify(cities || []),
      JSON.stringify(params || {})
    ]
  );
  return getJob(result.lastID);
}

async function getJob(id) {
  const row = await get('SELECT * FROM research_jobs WHERE id = ?', [id]);
  return parseJob(row);
}

async function listJobs(limit = 20) {
  const rows = await all(
    'SELECT * FROM research_jobs ORDER BY created_at DESC LIMIT ?',
    [Math.max(1, Math.min(100, Number(limit) || 20))]
  );
  return rows.map(parseJob);
}

async function updateJob(id, patch) {
  const allowed = [
    'status',
    'progress',
    'found',
    'added',
    'updated',
    'enriched',
    'skipped',
    'error',
    'started_at',
    'finished_at'
  ];
  const values = [];
  const assignments = [];
  for (const field of allowed) {
    if (patch[field] === undefined) continue;
    assignments.push(`${field} = ?`);
    values.push(patch[field]);
  }
  if (patch.log !== undefined) {
    assignments.push('log = ?');
    values.push(JSON.stringify(jsonArray(patch.log).slice(-100)));
  }
  if (!assignments.length) return getJob(id);
  values.push(id);
  await run(`UPDATE research_jobs SET ${assignments.join(', ')} WHERE id = ?`, values);
  return getJob(id);
}

async function appendJobLog(id, entry) {
  const job = await getJob(id);
  if (!job) return null;
  const log = [...job.log, { at: new Date().toISOString(), ...entry }].slice(-100);
  return updateJob(id, { log });
}

async function importLeads(rows, source = 'import') {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const row of rows) {
    try {
      const result = await upsertLead({ ...row, source: row.source || source });
      if (result.action === 'inserted') inserted += 1;
      else updated += 1;
    } catch (error) {
      skipped += 1;
      if (errors.length < 10) errors.push(error.message);
    }
  }

  return { inserted, updated, skipped, errors };
}

async function countLeads() {
  const row = await get('SELECT COUNT(*) AS total FROM leads');
  return row ? row.total : 0;
}

module.exports = {
  init,
  dbPath,
  upsertLead,
  getLead,
  listLeads,
  listLeadsForExport,
  getMapLeads,
  getStats,
  updateLead,
  reindexLead,
  deleteLead,
  createJob,
  getJob,
  listJobs,
  updateJob,
  appendJobLog,
  importLeads,
  countLeads,
  normalizeName,
  normalizeUrl,
  domainFromUrl,
  digits
};
