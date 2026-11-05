/**
 * Website enrichment and verification.
 *
 * Only public business pages are fetched. The fetcher:
 *  - validates protocols and blocks private/link-local addresses (SSRF guard),
 *  - follows redirects manually and re-validates each hop,
 *  - respects robots.txt,
 *  - caps response size and timeout,
 *  - extracts contact channels, structured data and service signals.
 *
 * It never logs in, never bypasses a paywall, and never crawls social networks.
 */

const dns = require('dns').promises;
const net = require('net');
const { URL } = require('url');
const {
  USER_AGENT,
  isDirectoryHost,
  socialNetworkForHost
} = require('./catalog');
const {
  cleanText,
  normalizePhone,
  isProbablyBusinessEmail,
  isPersonalEmail,
  isRoleEmail,
  detectServices,
  detectCompliance,
  domainFromUrl
} = require('./score');

const FETCH_TIMEOUT_MS = Number(process.env.LEAD_FETCH_TIMEOUT_MS || 12000);
const MAX_PAGE_BYTES = Number(process.env.LEAD_MAX_PAGE_BYTES || 2_500_000);
const MAX_REDIRECTS = 4;
const PAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const pageCache = new Map();
const robotsCache = new Map();

function isPrivateIp(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('::ffff:')) return isPrivateIp(normalized.slice(7));
    return (
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff')
    );
  }
  return true;
}

async function assertPublicHttpUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP(S) URLs can be fetched');
  }
  if (url.username || url.password) {
    throw new Error('URL credentials are not allowed');
  }
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa')
  ) {
    throw new Error('Private host is not allowed');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Private address is not allowed');
    return url;
  }
  let addresses = [];
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error('Host could not be resolved');
  }
  if (!addresses.length) throw new Error('Host could not be resolved');
  if (addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error('Host resolves to a private address');
  }
  return url;
}

async function readLimited(response, maxBytes) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length && length > maxBytes) {
    throw new Error('Response exceeds size limit');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Response exceeds size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

async function safeFetch(rawUrl, { timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_PAGE_BYTES } = {}) {
  let current = rawUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const url = await assertPublicHttpUrl(current);
    const response = await fetch(url.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.1',
        'Accept-Language': 'en,fr;q=0.8,de;q=0.7,es;q=0.6,it;q=0.5,nl;q=0.5'
      }
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) return { ok: false, status: response.status, url: url.toString(), error: 'Redirect without Location' };
      current = new URL(location, url).toString();
      continue;
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        ok: false,
        status: response.status,
        url: url.toString(),
        error: `Unsupported content type: ${contentType || 'unknown'}`
      };
    }
    if (!response.ok) {
      return { ok: false, status: response.status, url: url.toString(), error: `HTTP ${response.status}` };
    }
    const body = await readLimited(response, maxBytes);
    return { ok: true, status: response.status, url: url.toString(), body, contentType };
  }
  return { ok: false, status: 0, url: String(rawUrl), error: 'Too many redirects' };
}

function parseRobots(robotsTxt) {
  const groups = [];
  let group = null;
  for (const rawLine of String(robotsTxt || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === 'user-agent') {
      if (!group || group.rules.length) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if ((field === 'allow' || field === 'disallow') && group) {
      if (value) group.rules.push({ allow: field === 'allow', path: value });
    }
  }
  return groups;
}

function robotsAllows(robotsTxt, path, userAgent = USER_AGENT) {
  const groups = parseRobots(robotsTxt);
  if (!groups.length) return true;
  const ua = userAgent.toLowerCase();
  const matched = groups.filter((group) =>
    group.agents.some((agent) => agent === '*' || ua.includes(agent) || agent.includes('ecutuningpro'))
  );
  if (!matched.length) return true;

  let decision = true;
  let bestLength = -1;
  for (const group of matched) {
    for (const rule of group.rules) {
      if (!rule.path) continue;
      const pattern = rule.path.replace(/\*/g, '.*').replace(/\$$/, '$');
      let regex;
      try {
        regex = new RegExp(`^${pattern}`);
      } catch {
        continue;
      }
      if (!regex.test(path)) continue;
      const length = rule.path.replace(/\*/g, '').length;
      if (length > bestLength || (length === bestLength && rule.allow)) {
        bestLength = length;
        decision = rule.allow;
      }
    }
  }
  return decision;
}

async function isAllowedByRobots(url) {
  const target = new URL(url);
  const origin = target.origin;
  let robots = robotsCache.get(origin);
  if (robots === undefined) {
    try {
      const response = await fetch(`${origin}/robots.txt`, {
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain' }
      });
      robots = response.ok ? (await readLimited(response, 500_000)).slice(0, 500_000) : '';
    } catch {
      // No reachable robots.txt means no stated restriction.
      robots = '';
    }
    robotsCache.set(origin, robots);
  }
  return robotsAllows(robots, `${target.pathname}${target.search}`);
}

function decodeEntities(value) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    euro: '€',
    pound: '£',
    copy: '©',
    reg: '®',
    hellip: '…'
  };
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function extractMeta(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]).trim();
  }
  return '';
}

function extractLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const regex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const href = decodeEntities(match[1]).trim();
    const text = cleanText(decodeEntities(match[2]), 200);
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    try {
      const absolute = new URL(href, baseUrl).toString();
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      links.push({ url: absolute, text });
    } catch {
      // Ignore malformed links.
    }
  }
  return links;
}

function extractEmails(html) {
  const prepared = String(html || '')
    .replace(/&#64;|&commat;/gi, '@')
    .replace(/&#46;|&period;/gi, '.')
    .replace(/\s*[\[(]\s*at\s*[\])]\s*/gi, '@')
    .replace(/\s*[\[(]\s*dot\s*[\])]\s*/gi, '.');
  const found = new Set();
  const regex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  let match;
  while ((match = regex.exec(prepared))) {
    const email = match[0].toLowerCase().replace(/[.,;:]+$/, '');
    if (isProbablyBusinessEmail(email)) found.add(email);
  }
  const mailtoRegex = /href\s*=\s*["']mailto:([^"'?]+)/gi;
  while ((match = mailtoRegex.exec(prepared))) {
    const email = decodeEntities(match[1]).trim().toLowerCase();
    if (isProbablyBusinessEmail(email)) found.add(email);
  }
  return Array.from(found);
}

function extractPhones(html) {
  const prepared = decodeEntities(String(html || ''));
  const telPhones = new Set();
  const telRegex = /href\s*=\s*["']tel:([^"']+)["']/gi;
  let match;
  while ((match = telRegex.exec(prepared))) {
    const phone = normalizePhone(match[1]);
    if (phone) telPhones.add(phone);
  }
  // Click-to-call links are the strongest signal; return them without letting
  // CSS/JS numeric fragments pollute the result.
  if (telPhones.size) return Array.from(telPhones).slice(0, 6);

  const found = new Set();
  const text = cleanText(prepared, 30000);
  const phoneRegex = /(?:\+?\d[\d\s().-]{6,}\d)/g;
  while ((match = phoneRegex.exec(text))) {
    const raw = match[0].trim();
    // Skip obvious dates and short/long numeric strings.
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 16) continue;
    if (/^(\d)\1+$/.test(digits)) continue;
    if (/^(?:0123456789|1234567890|0102030405|123456789)/.test(digits)) continue;
    if (/^01020304/.test(digits)) continue;
    if (/^(?:19|20)\d{2}[./-](?:0?[1-9]|1[0-2])[./-](?:0?[1-9]|[12]\d|3[01])$/.test(raw)) continue;
    const phone = normalizePhone(raw);
    if (phone) found.add(phone);
  }
  return Array.from(found).slice(0, 6);
}

function extractWhatsApp(html) {
  const prepared = decodeEntities(String(html || ''));
  const patterns = [
    /(?:https?:)?\/\/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\+?\d{6,16})[^"'\s<>]*/gi,
    /whatsapp:\/\/send\?phone=(\+?\d{6,16})/gi
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(prepared);
    if (match) {
      let phone = normalizePhone(match[1]);
      if (phone && !phone.startsWith('+') && phone.replace(/\D/g, '').length >= 10) {
        phone = `+${phone}`;
      }
      if (phone) return phone;
    }
  }
  return null;
}

function extractSocials(links) {
  const socials = { instagram: null, facebook: null, linkedin: null };
  for (const link of links) {
    try {
      const host = new URL(link.url).hostname.toLowerCase();
      const network = socialNetworkForHost(host);
      if (network && socials[network] === undefined) socials[network] = null;
      if (network && !socials[network]) socials[network] = link.url;
    } catch {
      // Ignore malformed links.
    }
  }
  return socials;
}

function addressToString(address) {
  if (!address) return null;
  if (typeof address === 'string') return address.trim() || null;
  const parts = [
    address.streetAddress,
    address.postalCode,
    address.addressLocality,
    address.addressRegion,
    address.addressCountry
  ]
    .filter(Boolean)
    .map((part) => String(part).trim());
  return parts.length ? parts.join(', ') : null;
}

function extractJsonLd(html) {
  const scripts = [];
  const regex = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html))) {
    scripts.push(match[1].trim());
  }

  const candidates = [];
  const businessTypes = new Set([
    'LocalBusiness',
    'AutoRepair',
    'AutomotiveBusiness',
    'AutoPartsStore',
    'Organization',
    'Store',
    'ProfessionalService',
    'Service'
  ]);

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']].filter(Boolean);
    if (types.some((type) => businessTypes.has(type))) {
      candidates.push(node);
    }
    if (node['@graph']) visit(node['@graph']);
  };

  for (const script of scripts) {
    try {
      visit(JSON.parse(script));
    } catch {
      // Invalid structured data is common; ignore it.
    }
  }

  const merged = {
    names: [],
    description: '',
    emails: [],
    phones: [],
    url: '',
    sameAs: [],
    address: '',
    geo: null
  };

  for (const entry of candidates) {
    if (entry.name) merged.names.push(String(entry.name));
    if (entry.description) merged.description += ` ${entry.description}`;
    if (entry.email) merged.emails.push(String(entry.email));
    if (entry.telephone) merged.phones.push(String(entry.telephone));
    if (entry.url) merged.url = merged.url || String(entry.url);
    if (Array.isArray(entry.sameAs)) merged.sameAs.push(...entry.sameAs.map(String));
    if (entry.address) merged.address = merged.address || addressToString(entry.address);
    if (entry.geo) {
      const lat = Number(entry.geo.latitude ?? entry.geo.lat);
      const lon = Number(entry.geo.longitude ?? entry.geo.lng ?? entry.geo.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) merged.geo = { lat, lon };
    }
  }

  merged.description = cleanText(merged.description, 1500);
  merged.emails = Array.from(new Set(merged.emails.map((email) => email.toLowerCase()))).filter(isProbablyBusinessEmail);
  merged.phones = Array.from(new Set(merged.phones.map(normalizePhone).filter(Boolean)));
  merged.sameAs = Array.from(new Set(merged.sameAs)).slice(0, 20);
  return merged;
}

function chooseEmail(emails, domain) {
  if (!emails.length) return null;
  const scored = emails.map((email) => {
    const emailDomain = email.split('@')[1] || '';
    let score = 0;
    if (domain && emailDomain === domain) score += 20;
    if (isRoleEmail(email)) score += 10;
    if (!isPersonalEmail(email)) score += 6;
    if (/^(info|contact|sales|office|hello|service|support|admin|workshop|team)@/.test(email)) score += 8;
    return { email, score };
  });
  scored.sort((a, b) => b.score - a.score || a.email.length - b.email.length);
  return scored[0].email;
}

function findContactUrl(links, baseUrl) {
  const base = new URL(baseUrl);
  const rules = [
    /contact(?:-us)?/i,
    /kontakt/i,
    /contacto/i,
    /contatti/i,
    /impressum/i,
    /about/i,
    /chi-siamo/i,
    /quienes/i,
    /over-ons/i,
    /neem-contact/i
  ];
  const sameOrigin = links.filter((link) => {
    try {
      return new URL(link.url).origin === base.origin;
    } catch {
      return false;
    }
  });
  for (const rule of rules) {
    const found = sameOrigin.find((link) => rule.test(link.text) || rule.test(link.url));
    if (found) return found.url;
  }
  return null;
}

function extractPage(html, url) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? cleanText(decodeEntities(titleMatch[1]), 300) : '';
  const metaDescription =
    extractMeta(html, 'description') || extractMeta(html, 'og:description');
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Match ? cleanText(decodeEntities(h1Match[1]), 300) : '';
  const text = cleanText(decodeEntities(html), 20000);
  const links = extractLinks(html, url);
  const emails = extractEmails(html);
  const phones = extractPhones(html);
  const whatsapp = extractWhatsApp(html);
  const socials = extractSocials(links);
  const jsonLd = extractJsonLd(html);
  const domain = domainFromUrl(url);
  const chosenEmail = chooseEmail(
    Array.from(new Set([...emails, ...jsonLd.emails])),
    domain
  );
  const chosenPhone = phones[0] || jsonLd.phones[0] || null;
  const services = detectServices([title, metaDescription, h1, text, ...jsonLd.names].join(' '));
  const compliance = detectCompliance([title, metaDescription, text, jsonLd.description].join(' '));

  return {
    title,
    h1,
    description: metaDescription || jsonLd.description || h1 || '',
    text,
    links,
    emails,
    phones,
    email: chosenEmail,
    phone: chosenPhone,
    whatsapp,
    socials,
    jsonLd,
    services,
    compliance,
    domain
  };
}

function nameMatchesPage(businessName, page) {
  const normalizedName = String(businessName || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  const tokens = normalizedName
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token.length >= 3);
  if (!tokens.length) return false;
  const haystack = `${page.title} ${page.h1} ${page.description} ${page.text.slice(0, 5000)}`.toLowerCase();
  const matches = tokens.filter((token) => haystack.includes(token)).length;
  return matches / tokens.length >= 0.6;
}

function mergeEnrichmentIntoLead(lead, page, finalUrl) {
  const patch = { ...lead };
  const websiteDomain = domainFromUrl(finalUrl) || lead.domain;
  const jsonLd = page.jsonLd || {};

  patch.website = patch.website || finalUrl;
  patch.domain = patch.domain || websiteDomain;
  patch.email = patch.email || page.email || jsonLd.emails?.[0] || null;
  patch.phone = patch.phone || page.phone || jsonLd.phones?.[0] || null;
  patch.whatsapp = patch.whatsapp || page.whatsapp || null;
  patch.instagram = patch.instagram || page.socials.instagram || null;
  patch.facebook = patch.facebook || page.socials.facebook || null;
  patch.linkedin = patch.linkedin || page.socials.linkedin || null;
  patch.description = patch.description || page.description || null;
  patch.evidence_url = patch.evidence_url || finalUrl;
  patch.last_verified_at = new Date().toISOString();

  if (!patch.address && jsonLd.address) patch.address = jsonLd.address;
  if (!patch.city && jsonLd.address) {
    const parts = String(jsonLd.address).split(',').map((part) => part.trim());
    if (parts.length >= 3) patch.city = parts[parts.length - 2] || null;
  }

  if (
    (!Number.isFinite(Number(patch.latitude)) || !Number.isFinite(Number(patch.longitude))) &&
    jsonLd.geo
  ) {
    patch.latitude = jsonLd.geo.lat;
    patch.longitude = jsonLd.geo.lon;
    patch.geo_precision = 'website';
  }

  patch.services = Array.from(new Set([...(patch.services || []), ...page.services]));
  patch.tags = Array.from(new Set([...(patch.tags || []), ...jsonLd.names.map((name) => `brand:${name}`)].filter(Boolean)));
  patch.compliance_status = page.compliance.status === 'review' ? 'review' : patch.compliance_status || 'clear';
  patch.compliance_flags = Array.from(
    new Map(
      [...(patch.compliance_flags || []), ...(page.compliance.flags || [])].map((flag) => [flag.id, flag])
    ).values()
  );

  patch.raw_data = {
    ...(patch.raw_data || {}),
    enrichment: {
      title: page.title,
      description: page.description,
      emails: page.emails,
      phones: page.phones,
      services: page.services,
      compliance: page.compliance,
      json_ld: {
        names: jsonLd.names,
        address: jsonLd.address,
        geo: jsonLd.geo,
        same_as: jsonLd.sameAs
      },
      name_match: nameMatchesPage(patch.name, page),
      fetched_at: new Date().toISOString()
    }
  };

  return patch;
}

async function fetchAndExtract(url) {
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < PAGE_CACHE_TTL_MS) {
    return cached.value;
  }

  const allowed = await isAllowedByRobots(url);
  if (!allowed) {
    const blocked = { ok: false, blocked: true, error: 'Blocked by robots.txt', url };
    pageCache.set(url, { at: Date.now(), value: blocked });
    return blocked;
  }

  const response = await safeFetch(url);
  if (!response.ok) {
    const failed = {
      ok: false,
      blocked: false,
      status: response.status,
      error: response.error,
      url: response.url
    };
    pageCache.set(url, { at: Date.now(), value: failed });
    return failed;
  }

  const page = extractPage(response.body, response.url);
  const result = { ok: true, page, url: response.url };
  pageCache.set(url, { at: Date.now(), value: result });
  if (pageCache.size > 100) {
    const oldest = pageCache.keys().next().value;
    pageCache.delete(oldest);
  }
  return result;
}

/**
 * Enriches one lead from its official website. Returns a patch that the caller
 * can merge, score and upsert. Never throws for a bad/unreachable website.
 */
async function enrichLead(lead) {
  const website = lead.website;
  if (!website) {
    return { ...lead, website_status: 'missing' };
  }

  let parsed;
  try {
    parsed = new URL(website);
  } catch {
    return { ...lead, website_status: 'invalid' };
  }

  const socialNetwork = socialNetworkForHost(parsed.hostname);
  if (socialNetwork) {
    return {
      ...lead,
      [socialNetwork]: lead[socialNetwork] || website,
      website_status: 'social-only'
    };
  }

  if (isDirectoryHost(parsed.hostname)) {
    return { ...lead, website_status: 'directory' };
  }

  let homepage;
  try {
    homepage = await fetchAndExtract(website);
  } catch (error) {
    return {
      ...lead,
      website_status: 'unreachable',
      raw_data: {
        ...(lead.raw_data || {}),
        enrichment_error: error.message,
        enrichment_attempted_at: new Date().toISOString()
      }
    };
  }

  if (!homepage.ok) {
    return {
      ...lead,
      website_status: homepage.blocked ? 'blocked' : 'unreachable',
      raw_data: {
        ...(lead.raw_data || {}),
        enrichment_error: homepage.error,
        enrichment_attempted_at: new Date().toISOString()
      }
    };
  }

  let page = homepage.page;
  let evidenceUrl = homepage.url;
  let contactPage = null;

  // If the homepage has no usable contact channel, try one same-origin contact
  // or imprint page. This is deliberately capped at one extra request.
  if (!page.email && !page.phone && !page.whatsapp) {
    const contactUrl = findContactUrl(page.links, homepage.url);
    if (contactUrl) {
      try {
        const contact = await fetchAndExtract(contactUrl);
        if (contact.ok) {
          contactPage = contact;
          page = {
            ...page,
            title: page.title || contact.page.title,
            description: page.description || contact.page.description,
            email: contact.page.email,
            phone: contact.page.phone || page.phone,
            whatsapp: contact.page.whatsapp,
            emails: Array.from(new Set([...page.emails, ...contact.page.emails])),
            phones: Array.from(new Set([...page.phones, ...contact.page.phones])),
            socials: {
              instagram: page.socials.instagram || contact.page.socials.instagram,
              facebook: page.socials.facebook || contact.page.socials.facebook,
              linkedin: page.socials.linkedin || contact.page.socials.linkedin
            },
            jsonLd: {
              ...page.jsonLd,
              address: page.jsonLd.address || contact.page.jsonLd.address,
              geo: page.jsonLd.geo || contact.page.jsonLd.geo,
              emails: Array.from(new Set([...(page.jsonLd.emails || []), ...(contact.page.jsonLd.emails || [])])),
              phones: Array.from(new Set([...(page.jsonLd.phones || []), ...(contact.page.jsonLd.phones || [])]))
            },
            services: Array.from(new Set([...page.services, ...contact.page.services])),
            compliance: {
              status:
                page.compliance.status === 'review' || contact.page.compliance.status === 'review'
                  ? 'review'
                  : 'clear',
              flags: Array.from(
                new Map(
                  [...page.compliance.flags, ...contact.page.compliance.flags].map((flag) => [flag.id, flag])
                ).values()
              )
            }
          };
          evidenceUrl = contact.url;
        }
      } catch {
        // A failed contact page should not lose the homepage findings.
      }
    }
  }

  const enriched = mergeEnrichmentIntoLead(lead, page, evidenceUrl);
  enriched.website_status = 'ok';
  enriched.website_title = page.title;
  enriched.contact_page_url = contactPage ? contactPage.url : null;
  enriched.page_name_match = nameMatchesPage(lead.name, page);
  return enriched;
}

function clearCaches() {
  pageCache.clear();
  robotsCache.clear();
}

module.exports = {
  enrichLead,
  fetchAndExtract,
  extractPage,
  extractEmails,
  extractPhones,
  extractWhatsApp,
  extractJsonLd,
  robotsAllows,
  isPrivateIp,
  assertPublicHttpUrl,
  clearCaches,
  nameMatchesPage
};
