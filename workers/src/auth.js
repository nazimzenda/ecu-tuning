// Admin authentication: session resolution + login rate limiting (D1-backed,
// since Worker isolates do not share memory).

import { parseCookies } from './util.js';
import { verifySessionToken } from './crypto.js';

const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;

// Resolves the admin token from the `x-admin-session` header (legacy admin
// panel transport) or the `admin_session` HttpOnly cookie.
export async function requireAdmin(request, env) {
  const headerToken = request.headers.get('x-admin-session');
  const cookieToken = parseCookies(request.headers.get('Cookie') || '')['admin_session'];
  const token = headerToken ? headerToken.trim() : (cookieToken || '');
  if (!token) return false;
  return verifySessionToken(token, env);
}

// Fixed-window per-IP counter stored in D1 `rate_limits` (survives isolate
// eviction, unlike in-memory stores). Upsert keeps one row per key.
export async function checkLoginRateLimit(env, ip) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart =
    Math.floor(now / LOGIN_RATE_LIMIT_WINDOW_SECONDS) * LOGIN_RATE_LIMIT_WINDOW_SECONDS;
  const key = `login:${ip}`;
  const row = await env.DB.prepare(
    'SELECT window_start, count FROM rate_limits WHERE key = ?',
  ).bind(key).first();

  if (row && row.window_start === windowStart && row.count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: LOGIN_RATE_LIMIT_WINDOW_SECONDS - (now - windowStart) };
  }

  const nextCount = row && row.window_start === windowStart ? row.count + 1 : 1;
  await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = excluded.count`,
  ).bind(key, windowStart, nextCount).run();

  return { allowed: true, retryAfter: 0 };
}
