// ECU Tuning API — Cloudflare Workers port of server.js.
// No framework, no dependencies: Service Worker fetch API, D1 (SQLite), R2
// (files), Web Crypto, Resend HTTP API. Deployed as an ES module worker.

import {
  ALLOWED_SERVICES,
  MAX_FILE_SIZE,
  ORDER_STATUSES,
  TEXT_LIMITS,
  HttpError,
  json,
  readJson,
  applyCors,
  preflightResponse,
  sanitizeFileName,
  isAllowedExt,
  isValidEmail,
  getClientIp,
} from './util.js';
import {
  SESSION_TTL_SECONDS,
  UPLOAD_TICKET_TTL_SECONDS,
  DOWNLOAD_TICKET_TTL_SECONDS,
  EMAIL_TICKET_TTL_SECONDS,
  createSessionToken,
  timingSafeEqualDigest,
  signTicket,
  verifyTicket,
} from './crypto.js';
import { requireAdmin, checkLoginRateLimit } from './auth.js';
import { notifyAdminNewOrder, notifyCustomerFileReady } from './emails.js';

// ---------------------------------------------------------------------------
// Response + cookie helpers
// ---------------------------------------------------------------------------

function health() {
  return json({
    status: 'ok',
    service: 'ECU Tuning API',
    version: '1.0.0',
    docs: 'See README for client/admin hosts.',
  });
}

function sessionCookie(token, url, maxAge) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `admin_session=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

async function adminOr401(request, env) {
  if (!(await requireAdmin(request, env))) {
    throw new HttpError(401, 'Unauthorized. Please login first.');
  }
}

function fileTicketUrl(url, key, ticket, filename) {
  const params = new URLSearchParams({ exp: String(ticket.exp), sig: ticket.signature });
  if (filename) params.set('filename', filename);
  return `${url.origin}/api/files/${encodeURIComponent(key)}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Admin auth routes
// ---------------------------------------------------------------------------

async function handleLogin(request, env, url) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    throw new HttpError(500, 'Server misconfiguration: ADMIN_PASSWORD and SESSION_SECRET must be set');
  }
  const limit = await checkLoginRateLimit(env, getClientIp(request));
  if (!limit.allowed) {
    return json(
      { error: 'Too many login attempts. Please try again later.' },
      429,
      { 'Retry-After': String(limit.retryAfter) },
    );
  }
  const body = await readJson(request);
  const password = body && typeof body.password === 'string' ? body.password : '';
  if (!(await timingSafeEqualDigest(password, env.ADMIN_PASSWORD))) {
    return json({ error: 'Invalid password' }, 401);
  }
  const token = await createSessionToken(env);
  return json(
    { success: true, sessionId: token },
    200,
    { 'Set-Cookie': sessionCookie(token, url, SESSION_TTL_SECONDS) },
  );
}

function handleLogout(url) {
  return json({ success: true }, 200, { 'Set-Cookie': sessionCookie('', url, 0) });
}

// ---------------------------------------------------------------------------
// Upload flow: presigned PUT → R2 → finalize
// ---------------------------------------------------------------------------

async function handleUploadUrl(request, env, url) {
  const body = await readJson(request);
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid request body');

  const kind = body.kind === 'modified' ? 'modified' : 'original';
  const fileName = sanitizeFileName(body.fileName);
  if (!body.fileName || !isAllowedExt(fileName)) {
    throw new HttpError(400, 'Invalid file type. Allowed: .bin, .hex, .ori, .winols, .dam');
  }
  const fileSize = Number(body.fileSize);
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
    throw new HttpError(400, `Invalid file size. Maximum allowed: ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }
  if (!env.R2_SIGNING_SECRET) {
    throw new HttpError(500, 'Server misconfiguration: R2_SIGNING_SECRET must be set');
  }

  let key;
  if (kind === 'original') {
    key = `orders/originals/${crypto.randomUUID()}-${fileName}`;
  } else {
    await adminOr401(request, env);
    const orderId = parseInt(String(body.orderId), 10);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new HttpError(400, 'orderId is required for modified file uploads');
    }
    const order = await env.DB.prepare('SELECT id FROM orders WHERE id = ?').bind(orderId).first();
    if (!order) throw new HttpError(404, 'Order not found');
    key = `orders/${orderId}/modified/${crypto.randomUUID()}-${fileName}`;
  }

  const ticket = await signTicket(env, 'upload', key, UPLOAD_TICKET_TTL_SECONDS);
  const uploadUrl = `${url.origin}/api/upload-file?key=${encodeURIComponent(key)}&exp=${ticket.exp}&sig=${ticket.signature}`;
  return json({ uploadUrl, key, exp: ticket.exp, sig: ticket.signature });
}

// Presigned PUT sink: verifies the ticket, then streams the body into R2.
async function handleUploadFile(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const exp = url.searchParams.get('exp');
  const sig = url.searchParams.get('sig');
  if (!(await verifyTicket(env, 'upload', key, exp, sig))) {
    throw new HttpError(403, 'Invalid or expired upload URL');
  }
  const contentLengthHeader = request.headers.get('content-length');
  if (!contentLengthHeader) throw new HttpError(411, 'Content-Length header is required');
  const contentLength = parseInt(contentLengthHeader, 10);
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw new HttpError(400, 'Invalid Content-Length');
  }
  if (contentLength > MAX_FILE_SIZE) {
    throw new HttpError(413, `File too large. Maximum allowed: ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }
  await env.FILES.put(key, request.body, {
    httpMetadata: { contentType: 'application/octet-stream' },
  });
  return json({ success: true, key });
}

// Presigned GET stream: verifies the ticket, then streams the object from R2.
async function handleFileDownload(request, env) {
  const url = new URL(request.url);
  let key;
  try {
    key = decodeURIComponent(url.pathname.slice('/api/files/'.length));
  } catch {
    throw new HttpError(400, 'Invalid file key');
  }
  const exp = url.searchParams.get('exp');
  const sig = url.searchParams.get('sig');
  if (!(await verifyTicket(env, 'download', key, exp, sig))) {
    throw new HttpError(403, 'Invalid or expired download URL');
  }
  const object = await env.FILES.get(key);
  if (!object) throw new HttpError(404, 'File not found');

  const filename = sanitizeFileName(url.searchParams.get('filename') || key.split('/').pop());
  const headers = new Headers();
  headers.set('Content-Type', 'application/octet-stream');
  headers.set(
    'Content-Disposition',
    `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  headers.set('Cache-Control', 'private, max-age=3600');
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}

// ---------------------------------------------------------------------------
// Order routes
// ---------------------------------------------------------------------------

function validateOrderFields(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid request body');

  const service = typeof body.service === 'string' ? body.service.trim() : '';
  const vehicleInfo = typeof body.vehicleInfo === 'string' ? body.vehicleInfo.trim() : '';
  if (!service || !vehicleInfo) {
    throw new HttpError(400, 'Service and vehicle info are required');
  }
  if (!ALLOWED_SERVICES.includes(service)) throw new HttpError(400, 'Invalid service selected');
  if (service === 'Autres'
    && !(typeof body.customServiceDescription === 'string' && body.customServiceDescription.trim())) {
    throw new HttpError(400, 'Autres service description is required for custom modifications');
  }
  if (vehicleInfo.length > TEXT_LIMITS.vehicleInfo) {
    throw new HttpError(400, `Vehicle info is too long (max ${TEXT_LIMITS.vehicleInfo} characters)`);
  }
  const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail.trim() : '';
  if (customerEmail && !isValidEmail(customerEmail)) {
    throw new HttpError(400, 'Invalid customer email address');
  }
  const customServiceDescription = typeof body.customServiceDescription === 'string'
    ? body.customServiceDescription.trim() : '';
  if (customServiceDescription.length > TEXT_LIMITS.customServiceDescription) {
    throw new HttpError(400, `Custom service description is too long (max ${TEXT_LIMITS.customServiceDescription} characters)`);
  }
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
  if (customerName.length > TEXT_LIMITS.customerName) {
    throw new HttpError(400, `Customer name is too long (max ${TEXT_LIMITS.customerName} characters)`);
  }
  const customerPhone = typeof body.customerPhone === 'string' ? body.customerPhone.trim() : '';
  if (customerPhone.length > TEXT_LIMITS.customerPhone) {
    throw new HttpError(400, `Customer phone is too long (max ${TEXT_LIMITS.customerPhone} characters)`);
  }

  return {
    service,
    vehicleInfo,
    ecuReference:
      (typeof body.ecuReference === 'string' ? body.ecuReference.trim().slice(0, TEXT_LIMITS.ecuReference) : '')
      || null,
    customerName: customerName || 'Anonymous',
    customerEmail,
    customerPhone: customerPhone || null,
    customServiceDescription: customServiceDescription || null,
  };
}

async function requireValidUploadTicket(env, body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid request body');
  const key = typeof body.fileKey === 'string' ? body.fileKey : '';
  if (!(await verifyTicket(env, 'upload', key, body.fileExp, body.fileSig))) {
    throw new HttpError(400, 'Invalid or expired upload token');
  }
  const head = await env.FILES.head(key);
  if (!head) throw new HttpError(400, 'Uploaded file not found in storage');
  return key;
}

async function handleCreateOrder(request, env, ctx, url) {
  const body = await readJson(request);
  const fields = validateOrderFields(body);
  const key = await requireValidUploadTicket(env, body);
  const fileName = sanitizeFileName(body.fileName || key.split('/').pop());

  const result = await env.DB.prepare(
    `INSERT INTO orders (
       original_file_name, stored_file_name, file_path, service, custom_service_description,
       vehicle_info, ecu_reference, customer_name, customer_email, customer_phone, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
  ).bind(
    fileName, key.split('/').pop(), key,
    fields.service, fields.customServiceDescription, fields.vehicleInfo, fields.ecuReference,
    fields.customerName, fields.customerEmail, fields.customerPhone,
  ).run();
  const orderId = result.meta.last_row_id;

  const order = { id: orderId, ...fields, original_file_name: fileName };
  const adminUrl = env.ADMIN_URL || url.origin;
  ctx.waitUntil(notifyAdminNewOrder(env, order, adminUrl));

  return json({ success: true, orderId, message: 'File uploaded successfully' });
}

async function handleListOrders(env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM orders ORDER BY created_at DESC, id DESC',
  ).all();
  return json(results);
}

async function handleGetOrder(env, orderId) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) throw new HttpError(404, 'Order not found');
  return json(order);
}

async function handleUpdateStatus(request, env, orderId) {
  const body = await readJson(request);
  const status = body && typeof body.status === 'string' ? body.status : '';
  if (!ORDER_STATUSES.includes(status)) {
    throw new HttpError(400, `Invalid status. Allowed: ${ORDER_STATUSES.join(', ')}`);
  }
  const order = await env.DB.prepare('SELECT id FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) throw new HttpError(404, 'Order not found');
  await env.DB.prepare(
    'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  ).bind(status, orderId).run();
  return json({ success: true });
}

async function handleModifiedUpload(request, env, ctx, url, orderId) {
  const body = await readJson(request);
  const key = await requireValidUploadTicket(env, body);
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) throw new HttpError(404, 'Order not found');

  const fileName = sanitizeFileName(body.fileName || key.split('/').pop());
  await env.DB.prepare(
    `UPDATE orders SET
       modified_file_name = ?, modified_stored_file_name = ?, modified_file_path = ?,
       status = 'completed', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).bind(fileName, key.split('/').pop(), key, orderId).run();

  const ticket = await signTicket(env, 'download', key, EMAIL_TICKET_TTL_SECONDS);
  const downloadUrl = fileTicketUrl(url, key, ticket, fileName);
  const updated = { ...order, modified_file_name: fileName, modified_file_path: key };
  ctx.waitUntil(notifyCustomerFileReady(env, updated, downloadUrl));

  return json({ success: true, message: 'Modified file uploaded successfully' });
}

async function handleOrderDownload(env, url, orderId, kind) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) throw new HttpError(404, 'Order not found');

  const key = kind === 'modified' ? order.modified_file_path : order.file_path;
  if (!key) {
    if (kind === 'modified') throw new HttpError(404, 'Modified file not available yet');
    throw new HttpError(404, 'File not found');
  }
  const filename = kind === 'modified'
    ? (order.modified_file_name || `modified_${order.original_file_name}`)
    : order.original_file_name;

  const ticket = await signTicket(env, 'download', key, DOWNLOAD_TICKET_TTL_SECONDS);
  return new Response(null, {
    status: 302,
    headers: { Location: fileTicketUrl(url, key, ticket, filename) },
  });
}

async function handleDeleteOrder(env, orderId) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) throw new HttpError(404, 'Order not found');
  for (const key of [order.file_path, order.modified_file_path]) {
    if (key) {
      try {
        await env.FILES.delete(key);
      } catch (error) {
        console.error('R2 delete failed:', key, error.message);
      }
    }
  }
  await env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(orderId).run();
  return json({ success: true });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function orderPath(path) {
  const match = path.match(/^\/api\/orders\/(\d+)(?:\/([a-z-]+))?$/);
  if (!match) return null;
  return { id: parseInt(match[1], 10), action: match[2] || null };
}

async function route(request, env, ctx, url) {
  const method = request.method;
  const path = url.pathname;

  if (method === 'GET' && path === '/') return health();
  if (method === 'POST' && path === '/api/admin/login') return handleLogin(request, env, url);
  if (method === 'POST' && path === '/api/admin/logout') return handleLogout(url);
  if (method === 'POST' && path === '/api/upload-url') return handleUploadUrl(request, env, url);
  if (method === 'PUT' && path === '/api/upload-file') return handleUploadFile(request, env);
  if (method === 'GET' && path.startsWith('/api/files/')) return handleFileDownload(request, env);

  if (method === 'POST' && path === '/api/orders') return handleCreateOrder(request, env, ctx, url);
  if (path === '/api/orders' || path.startsWith('/api/orders/')) {
    if (method === 'GET' && path === '/api/orders') {
      await adminOr401(request, env);
      return handleListOrders(env);
    }
    const op = orderPath(path);
    if (op) {
      if (method === 'GET' && op.action === null) {
        await adminOr401(request, env);
        return handleGetOrder(env, op.id);
      }
      if (method === 'POST' && op.action === 'status') {
        await adminOr401(request, env);
        return handleUpdateStatus(request, env, op.id);
      }
      if (method === 'POST' && op.action === 'modified-upload') {
        await adminOr401(request, env);
        return handleModifiedUpload(request, env, ctx, url, op.id);
      }
      if (method === 'GET' && op.action === 'download') {
        await adminOr401(request, env);
        return handleOrderDownload(env, url, op.id, 'original');
      }
      if (method === 'GET' && op.action === 'download-modified') {
        await adminOr401(request, env);
        return handleOrderDownload(env, url, op.id, 'modified');
      }
      if (method === 'DELETE' && op.action === null) {
        await adminOr401(request, env);
        return handleDeleteOrder(env, op.id);
      }
    }
    throw new HttpError(404, 'Not found');
  }

  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return preflightResponse(request, env);

    let response;
    try {
      response = await route(request, env, ctx, url);
    } catch (error) {
      if (error instanceof HttpError) {
        response = json({ error: error.message }, error.status);
      } else {
        console.error('Unhandled error:', error);
        response = json({ error: 'Internal server error' }, 500);
      }
    }
    return applyCors(request, env, response);
  },
};
