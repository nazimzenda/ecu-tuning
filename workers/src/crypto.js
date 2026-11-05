// Web Crypto helpers: HMAC-SHA256, constant-time comparison, signed session
// tokens and presigned file tickets. No dependencies.

const encoder = new TextEncoder();

export const SESSION_TTL_SECONDS = 12 * 60 * 60;        // admin session: 12h
export const UPLOAD_TICKET_TTL_SECONDS = 15 * 60;       // client must finish PUT within 15 min
export const DOWNLOAD_TICKET_TTL_SECONDS = 60 * 60;     // admin download links: 1h
export const EMAIL_TICKET_TTL_SECONDS = 24 * 60 * 60;   // customer email links: 24h

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time comparison of two same-length hex strings.
export function constantTimeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export async function hmacHex(secret, message) {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return bytesToHex(new Uint8Array(signature));
}

// Timing-safe password check: SHA-256 digests of both values are compared
// byte-by-byte in constant time (fixes the legacy plain `===` comparison).
export async function timingSafeEqualDigest(provided, expected) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(String(provided))),
    crypto.subtle.digest('SHA-256', encoder.encode(String(expected))),
  ]);
  const bytesA = new Uint8Array(a);
  const bytesB = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i += 1) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}

function base64UrlEncode(value) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value) {
  return atob(value.replace(/-/g, '+').replace(/_/g, '/'));
}

// Admin session token: `<base64url(payload)>.<hmac-hex>`. Stateless — no D1
// lookup needed to verify; HMAC + 12h expiry invalidate forged/stale tokens.
export async function createSessionToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now, exp: now + SESSION_TTL_SECONDS, nonce: crypto.randomUUID() };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacHex(env.SESSION_SECRET, payloadB64);
  return `${payloadB64}.${signature}`;
}

export async function verifySessionToken(token, env) {
  if (typeof token !== 'string' || token.length === 0 || !token.includes('.')) return false;
  const [payloadB64, signature] = token.split('.');
  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }
    const expected = await hmacHex(env.SESSION_SECRET, payloadB64);
    return constantTimeEqualHex(expected, signature);
  } catch {
    return false;
  }
}

// Presigned tickets for R2 access: signature = HMAC-SHA256(R2_SIGNING_SECRET,
// "<purpose>:<key>:<exp>"). Purpose prefixes ('upload'/'download') prevent
// using an upload ticket to read a file and vice-versa.
export async function signTicket(env, purpose, key, ttlSeconds) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = await hmacHex(env.R2_SIGNING_SECRET, `${purpose}:${key}:${exp}`);
  return { key, exp, signature };
}

export async function verifyTicket(env, purpose, key, exp, signature) {
  if (typeof key !== 'string' || key.length === 0) return false;
  if (typeof signature !== 'string' || signature.length === 0) return false;
  const expNumber = parseInt(String(exp), 10);
  if (!Number.isFinite(expNumber) || expNumber < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmacHex(env.R2_SIGNING_SECRET, `${purpose}:${key}:${expNumber}`);
  return constantTimeEqualHex(expected, signature);
}
