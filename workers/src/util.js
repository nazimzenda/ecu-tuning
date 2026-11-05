// Shared constants and small helpers for the ECU Tuning Worker.
// No dependencies — Web platform APIs only.

export const ALLOWED_SERVICES = [
  'Stage 1', 'E85', 'FAP', 'EGR', 'FAPEGR', 'AdBlue',
  'Utilitaire', 'ImmoOff', 'Recherche', 'Diagnostic', 'DTCOff', 'Autres',
];

export const SERVICE_PRICES = {
  'Stage 1': '200€',
  'E85': '250€',
  'FAP': '100€',
  'EGR': '70€',
  'FAPEGR': '120€',
  'AdBlue': '100€',
  'Utilitaire': '150€',
  'ImmoOff': '100€',
  'Recherche': 'Dès 50€',
  'Diagnostic': '40€',
  'DTCOff': '40€',
  'Autres': 'On request',
};

export const ALLOWED_FILE_EXTENSIONS = ['.bin', '.hex', '.ori', '.winols', '.dam'];
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (matches server.js multer limit)
export const MAX_BODY_SIZE = 100 * 1024;       // JSON body cap for API endpoints
export const ORDER_STATUSES = ['pending', 'processing', 'completed', 'cancelled'];

export const TEXT_LIMITS = {
  vehicleInfo: 500,
  customerName: 200,
  customerPhone: 50,
  email: 254,
  ecuReference: 100,
  customServiceDescription: 2000,
  fileName: 255,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return typeof value === 'string' && value.length <= TEXT_LIMITS.email && EMAIL_RE.test(value);
}

// Thrown by route handlers for expected, client-visible errors.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

// Reads and parses a JSON request body. Returns null when the body is not JSON
// (callers decide whether that is acceptable). Throws HttpError on bad JSON.
export async function readJson(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  const raw = await request.text();
  if (raw.length > MAX_BODY_SIZE) throw new HttpError(413, 'Request body too large');
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Strips newlines so user input cannot inject extra headers/line-breaks into
// email subjects.
export function sanitizeSubject(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').slice(0, 200);
}

// Basename + whitelist: neutralizes path traversal from user-supplied names
// (fixes the multer `uuid-<originalname>` traversal in the legacy server).
export function sanitizeFileName(name) {
  const base = String(name || '').split(/[\\/]/).pop();
  const cleaned = base.replace(/[^\w.\-]/g, '_');
  return cleaned.slice(0, 100) || 'file';
}

export function fileExtension(name) {
  const idx = String(name).lastIndexOf('.');
  return idx === -1 ? '' : String(name).slice(idx).toLowerCase();
}

export function isAllowedExt(name) {
  return ALLOWED_FILE_EXTENSIONS.includes(fileExtension(name));
}

export function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) cookies[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return cookies;
}

export function getClientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

// CORS — allowlist only, credentials supported (exact origin match required).
export function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowlist = String(env.ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (allowlist.length === 0) return null;
  if (allowlist.includes('*')) return origin;
  return allowlist.includes(origin) ? origin : null;
}

export function applyCors(request, env, response) {
  const origin = allowedOrigin(request, env);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

export function preflightResponse(request, env) {
  const origin = allowedOrigin(request, env);
  if (!origin) return json({ error: 'Origin not allowed by CORS policy' }, 403);
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Session',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    },
  });
}
