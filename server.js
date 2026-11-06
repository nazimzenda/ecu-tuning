require('./load-env');

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const { Resend } = require('resend');
const db = require('./db');
const leadStore = require('./leads/store');
const { createLeadsRouter } = require('./leads/routes');
const securityHeaders = require('./security');

const app = express();

// Do not advertise the framework version
app.disable('x-powered-by');

// Enable gzip compression for all responses
app.use(compression());

// Baseline security headers (HSTS only in production)
app.use(securityHeaders);

// Trust X-Forwarded-For only from local proxies (nginx), so rate limiting sees real client IPs
app.set('trust proxy', 'loopback');

// Use API_PORT (4000) - DO NOT use PORT env var as that's for nginx (8080) on Railway
const PORT = process.env.API_PORT || 4000;

// CORS configuration
// ALLOWED_ORIGINS set -> only those origins may make requests ('*' reflects any origin).
// ALLOWED_ORIGINS unset -> development allows the local client/admin origins; production
// stays same-origin only (never reflect an arbitrary Origin without an explicit allowlist).
// Requests without an Origin header (curl, server-to-server) are unaffected.
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  : null;

// In development, any localhost/loopback port is a valid UI origin. This
// covers the standard 3000/3001 ports as well as custom ports used by tests.
const isLocalOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (allowedOrigins) {
    return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
  }
  return !isProduction && isLocalOrigin(origin);
};

const corsOrigin = (allowedOrigins || !isProduction)
  ? (origin, callback) => {
      if (isOriginAllowed(origin)) return callback(null, true);

      console.warn(`🚫 Blocked CORS request from origin: ${origin}`);
      const error = new Error('Origin not allowed by CORS policy');
      error.status = 403;
      return callback(error);
    }
  : false;

const corsOptions = {
  origin: corsOrigin,
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Limit public order submissions per IP. Admin login has its own stricter
// brute-force limiter below.
const orderSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many order submissions from this IP. Please try again later.' },
  skip: () => process.env.NODE_ENV === 'test'
});

// Middleware
// 2 MB accommodates lead-research CSV/JSON imports (the normal form payloads
// are tiny, so this does not change the order-upload limits).
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Data directory - use DATA_DIR env var for Railway Volume, otherwise use local directory
// Railway Volume: DATA_DIR=/app/data (persists across deploys)
// Local/Ephemeral: defaults to current directory
const dataDir = process.env.DATA_DIR || __dirname;
const uploadsDir = path.join(dataDir, 'uploads');
const modifiedDir = path.join(dataDir, 'uploads', 'modified');
const databasePath = path.join(dataDir, 'database.sqlite');

// Log storage configuration
console.log('📁 Storage configuration:');
console.log('   - Data directory:', dataDir);
console.log('   - Uploads directory:', uploadsDir);
console.log('   - Modified files:', modifiedDir);
console.log('   - Database:', databasePath);
console.log('   - Persistent:', process.env.DATA_DIR ? '✅ Railway Volume' : '⚠️ Ephemeral (will reset on deploy)');

// Ensure uploads directory exists
fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(modifiedDir);

// Firebase adapter helpers (optional) - only if Firebase is properly configured
let firebaseUploadFn = null;
let firebaseDownloadFn = null;
let firebaseDeleteFn = null;
const useFirebaseEnv = process.env.USE_FIREBASE === 'true' || process.env.USE_FIREBASE === '1';
const hasFirebaseCredentials = !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.FIREBASE_STORAGE_BUCKET);

if (useFirebaseEnv && hasFirebaseCredentials) {
  try {
    const firestoreAdapter = require('./db/firestore-adapter');
    if (firestoreAdapter && firestoreAdapter.uploadLocalFileToStorage) {
      firebaseUploadFn = firestoreAdapter.uploadLocalFileToStorage;
      firebaseDownloadFn = firestoreAdapter.downloadFileFromStorage || null;
      firebaseDeleteFn = firestoreAdapter.deleteFileFromStorage || null;
      console.log('☁️ Firebase Storage: ✅ Enabled');
    }
  } catch (e) {
    console.warn('⚠️ Firebase upload helper not available:', e.message);
  }
} else {
  console.log('☁️ Firebase Storage: ❌ Disabled (using local storage)');
  if (useFirebaseEnv && !hasFirebaseCredentials) {
    console.warn('   ⚠️ USE_FIREBASE is set but credentials are missing');
  }
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Never write the original filename to disk (path traversal / injection risk).
    // Keep only the validated extension; the original name is preserved in the DB.
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.bin', '.hex', '.ori', '.winols', '.dam'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      const err = new Error('Invalid file type. Allowed: .bin, .hex, .ori, .winols, .dam');
      err.status = 400;
      cb(err);
    }
  }
});

// Admin password (set via environment variable or use the development default)
const adminPasswordFromEnv = process.env.ADMIN_PASSWORD || '';
const ADMIN_PASSWORD = adminPasswordFromEnv || 'admin123';
if (!adminPasswordFromEnv) {
  console.warn('⚠️ ADMIN_PASSWORD is not set — using the insecure development default "admin123".');
}
const ORDER_STATUSES = ['pending', 'processing', 'completed', 'cancelled'];

// Admin email for notifications (receives alerts for new orders)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
// Admin panel URL (for links in notification emails)
const ADMIN_URL = process.env.ADMIN_URL || (process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/admin`
  : 'http://localhost:3001');

// Log admin config at startup
console.log('👤 Admin configuration:');
console.log('   - Admin Email:', ADMIN_EMAIL ? `${ADMIN_EMAIL.substring(0, 5)}***` : '❌ NOT SET');
console.log('   - Admin URL:', ADMIN_URL);

// Email configuration
// Priority: Resend API (recommended for Railway) > SMTP (for local dev)
const resendApiKey = process.env.RESEND_API_KEY || '';
const emailFrom = process.env.EMAIL_FROM || 'AZ Performance <onboarding@resend.dev>'; // Use your verified domain

// Allowed services (POST /api/orders allowlist) + EUR price lookup (shared by emails)
const ALLOWED_SERVICES = ['Stage 1', 'E85', 'FAP', 'EGR', 'FAPEGR', 'AdBlue', 'Utilitaire', 'ImmoOff', 'Recherche', 'Diagnostic', 'DTCOff', 'Autres'];
const SERVICE_PRICES = {
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
  'Autres': 'On request'
};

// Legacy SMTP config (fallback for local development)
const emailUser = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER || '';
const emailPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || process.env.GMAIL_PASS || '';

// Initialize Resend client if API key is available
const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Fallback SMTP transporter for local development
let emailTransporter = null;
if (!resend && emailUser && emailPass) {
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  emailTransporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: emailUser, pass: emailPass },
    tls: { rejectUnauthorized: true }
  });
}

// Log email configuration status at startup
console.log('📧 Email configuration:');
if (resend) {
  console.log('   - Provider: Resend (HTTP API) ✅');
  console.log('   - API Key:', resendApiKey ? `${resendApiKey.substring(0, 8)}...` : '❌ NOT SET');
  console.log('   - From:', emailFrom);
} else if (emailTransporter) {
  console.log('   - Provider: SMTP (Nodemailer)');
  console.log('   - User:', emailUser ? `${emailUser.substring(0, 3)}***@***` : '❌ NOT SET');
} else {
  console.log('   - Provider: ❌ NOT CONFIGURED');
  console.log('   - Set RESEND_API_KEY for Railway or SMTP_USER/SMTP_PASS for local');
}

// Twilio configuration for WhatsApp (set via environment variables)
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;
const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'; // Twilio sandbox number

// In-memory admin sessions with a sliding expiry. Fine for a single API
// process; use a shared store if the API is ever scaled horizontally.
const ADMIN_SESSION_TTL_MS = Math.max(
  60 * 1000,
  Number(process.env.ADMIN_SESSION_TTL_MS) || 12 * 60 * 60 * 1000
);
const adminSessions = new Map(); // sessionId -> expiresAt (ms)

function createAdminSession() {
  const sessionId = crypto.randomUUID();
  adminSessions.set(sessionId, Date.now() + ADMIN_SESSION_TTL_MS);
  return sessionId;
}

const sessionCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [sessionId, expiresAt] of adminSessions) {
    if (expiresAt <= now) adminSessions.delete(sessionId);
  }
}, 15 * 60 * 1000);
if (typeof sessionCleanupTimer.unref === 'function') sessionCleanupTimer.unref();

// Simple in-memory rate limiter for admin login (brute-force protection)
const loginAttempts = new Map(); // ip -> { count, firstAttemptAt }
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;

// Escape HTML special characters for safe email rendering
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Strip CR/LF so user input cannot inject extra email headers.
const sanitizeHeader = (s, max = 200) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

// Trim, strip control characters, and cap the length of user-supplied text fields
const sanitizeText = (value, maxLength) => {
  if (typeof value !== 'string') return value;
  return value.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLength);
};

// Use only the base name and remove characters that could break the
// Content-Disposition header.
const safeDownloadName = (name, fallback = 'ecu-file.bin') => {
  const base = path.basename(String(name || ''));
  const cleaned = base.replace(/[\r\n"\\]/g, '_').trim();
  return cleaned || fallback;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (value) => typeof value === 'string'
  && value.length <= 254
  && EMAIL_RE.test(value);

// Constant-time password comparison (with an equal-length guard)
function safePasswordCompare(input, expected) {
  const a = Buffer.from(String(input || ''));
  const b = Buffer.from(String(expected || ''));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a); // burn constant time on length mismatch
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// Admin authentication middleware (accepts header or ?session= for downloads)
function requireAdmin(req, res, next) {
  const sessionId = req.headers['x-admin-session'] || req.query.session;
  const expiresAt = sessionId ? adminSessions.get(sessionId) : undefined;

  if (expiresAt && expiresAt > Date.now()) {
    // Sliding expiry: active admins stay logged in.
    adminSessions.set(sessionId, Date.now() + ADMIN_SESSION_TTL_MS);
    return next();
  }

  if (sessionId && expiresAt) adminSessions.delete(sessionId);
  res.status(401).json({ error: 'Unauthorized. Please login first.' });
}

// Routes

// Health check / root
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ECU Tuning API',
    version: require('./package.json').version,
    docs: 'See README for client/admin hosts.'
  });
});

// Admin login API
app.post('/api/admin/login', (req, res) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();

  // Drop expired rate-limit windows, and cap memory if the map grows too large
  const existing = loginAttempts.get(ip);
  if (existing && now - existing.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
  }
  if (loginAttempts.size > 10000) {
    for (const [key, attempt] of loginAttempts) {
      if (now - attempt.firstAttemptAt > LOGIN_WINDOW_MS) {
        loginAttempts.delete(key);
      }
    }
  }

  const attempts = loginAttempts.get(ip);
  if (attempts && attempts.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((LOGIN_WINDOW_MS - (now - attempts.firstAttemptAt)) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }

  const { password } = req.body || {};

  if (safePasswordCompare(password, ADMIN_PASSWORD)) {
    loginAttempts.delete(ip);
    const sessionId = createAdminSession();
    res.json({ success: true, sessionId });
  } else {
    loginAttempts.set(ip, {
      count: (attempts ? attempts.count : 0) + 1,
      firstAttemptAt: attempts ? attempts.firstAttemptAt : now
    });
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Admin logout API
app.post('/api/admin/logout', (req, res) => {
  const sessionId = req.headers['x-admin-session'];
  if (sessionId) {
    adminSessions.delete(sessionId);
  }
  res.json({ success: true });
});

// API: Submit order
app.post('/api/orders', orderSubmissionLimiter, upload.single('ecuFile'), async (req, res) => {
  // Remove the temporary upload on every rejected/failed request so invalid
  // submissions do not leave orphaned files on disk.
  const cleanupUpload = async () => {
    if (req.file && req.file.path) {
      try { await fs.remove(req.file.path); } catch (e) { /* ignore */ }
    }
  };

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const body = req.body || {};
    const service = typeof body.service === 'string' ? body.service.trim() : '';

    // Input hygiene: trim, strip control characters, and cap field lengths
    const cleanVehicleInfo = sanitizeText(body.vehicleInfo, 500) || '';
    const cleanCustomerName = sanitizeText(body.customerName, 200) || '';
    const cleanCustomerEmail = sanitizeText(body.customerEmail, 200) || '';
    const cleanCustomerPhone = sanitizeText(body.customerPhone, 50) || '';
    const cleanCustomServiceDescription = sanitizeText(body.customServiceDescription, 1000) || '';
    const cleanEcuReference = sanitizeText(body.ecuReference, 100) || null;

    if (!service || !cleanVehicleInfo) {
      await cleanupUpload();
      return res.status(400).json({ error: 'Service and vehicle info are required' });
    }

    if (!ALLOWED_SERVICES.includes(service)) {
      await cleanupUpload();
      return res.status(400).json({ error: 'Invalid service selected' });
    }

    // Validate custom service description if Autres is selected
    if (service === 'Autres' && !cleanCustomServiceDescription) {
      await cleanupUpload();
      return res.status(400).json({ error: 'Autres service description is required for custom modifications' });
    }

    if (cleanCustomerEmail && !isValidEmail(cleanCustomerEmail)) {
      await cleanupUpload();
      return res.status(400).json({ error: 'Invalid customer email address' });
    }

    // If Firebase is enabled, upload file to storage and set filePath to storage path + downloadURL
    let filePathToStore = req.file.path;
    let fileDownloadURL = null;
    if (firebaseUploadFn) {
      try {
        const dest = `orders/originals/${req.file.filename}`;
        const uploaded = await firebaseUploadFn(req.file.path, dest);
        if (uploaded && uploaded.path) {
          filePathToStore = uploaded.path;
          fileDownloadURL = uploaded.downloadURL;
          // Optionally remove local file after upload
          try { await fs.remove(req.file.path); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        console.error('Firebase upload failed, falling back to local storage:', e);
      }
    }

    const order = await db.createOrder({
      originalFileName: req.file.originalname,
      storedFileName: req.file.filename,
      filePath: filePathToStore,
      fileDownloadURL: fileDownloadURL,
      service: service,
      customServiceDescription: cleanCustomServiceDescription || null,
      vehicleInfo: cleanVehicleInfo,
      ecuReference: cleanEcuReference,
      customerName: cleanCustomerName || 'Anonymous',
      customerEmail: cleanCustomerEmail || '',
      customerPhone: cleanCustomerPhone || null,
      status: 'pending'
    });

    // Send admin notification (fire-and-forget, don't block response)
    sendAdminNotification({
      id: order.id,
      customer_name: cleanCustomerName || 'Anonymous',
      customer_email: cleanCustomerEmail || '',
      customer_phone: cleanCustomerPhone || null,
      vehicle_info: cleanVehicleInfo,
      service: service,
      ecu_reference: cleanEcuReference,
      custom_service_description: cleanCustomServiceDescription || null,
      original_file_name: req.file.originalname
    }).catch(err => console.error('Admin notification error:', err.message));

    res.json({ success: true, orderId: order.id, message: 'File uploaded successfully' });
  } catch (error) {
    await cleanupUpload();
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// API: Get all orders (admin only)
app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    const allOrders = await db.getAllOrders();
    res.set('X-Total-Count', String(allOrders.length));

    // Optional pagination: /api/orders?limit=50&offset=0
    const limit = Number.parseInt(req.query.limit, 10);
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    if (Number.isInteger(limit) && limit > 0) {
      return res.json(allOrders.slice(offset, offset + Math.min(limit, 500)));
    }

    res.json(allOrders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// API: Get single order (admin only)
app.get('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const order = await db.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// API: Update order status (admin only)
app.put('/api/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const status = typeof (req.body || {}).status === 'string'
      ? req.body.status.trim()
      : '';

    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Allowed: ${ORDER_STATUSES.join(', ')}`
      });
    }

    const order = await db.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    await db.updateOrderStatus(req.params.id, status);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// API: Upload modified file (admin only)
app.post('/api/orders/:id/modified', requireAdmin, upload.single('modifiedFile'), async (req, res) => {
  let movedLocalFile = null;

  try {
    console.log('📤 Upload modified file request for order:', req.params.id);

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const orderId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      await fs.remove(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    // Never accept a modified file for an order that does not exist.
    const existingOrder = await db.getOrder(orderId);
    if (!existingOrder) {
      await fs.remove(req.file.path).catch(() => {});
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log('📁 File received:', req.file.originalname, 'Size:', req.file.size);

    // Ensure modified directory exists
    await fs.ensureDir(modifiedDir);

    // Move file to modified directory or upload to Firebase
    let modifiedFilePath = path.join(modifiedDir, req.file.filename);
    let modifiedFileDownloadURL = null;

    if (firebaseUploadFn) {
      // upload and remove local file
      try {
        const dest = `orders/${orderId}/modified/${req.file.filename}`;
        const uploaded = await firebaseUploadFn(req.file.path, dest);
        if (uploaded && uploaded.path) {
          modifiedFilePath = uploaded.path;
          modifiedFileDownloadURL = uploaded.downloadURL;
          await fs.remove(req.file.path).catch(() => {});
        }
      } catch (e) {
        console.error('Firebase upload failed for modified file, falling back to local move:', e);
        await fs.move(req.file.path, modifiedFilePath, { overwrite: true });
        movedLocalFile = modifiedFilePath;
      }
    } else {
      await fs.move(req.file.path, modifiedFilePath, { overwrite: true });
      movedLocalFile = modifiedFilePath;
    }

    await db.updateOrderModifiedFile(orderId, {
      modifiedFileName: req.file.originalname,
      modifiedStoredFileName: req.file.filename,
      modifiedFilePath: modifiedFilePath,
      modifiedFileDownloadURL: modifiedFileDownloadURL
    });

    await db.updateOrderStatus(orderId, 'completed');

    // Get order details for notifications
    const order = await db.getOrder(orderId);

    // Send email and WhatsApp notifications (non-blocking - don't fail the request)
    if (order) {
      sendFileReadyNotifications(order, modifiedFilePath)
        .then(() => console.log('✅ Notifications sent successfully'))
        .catch(err => console.error('⚠️ Notification error (non-blocking):', err.message));
    }

    res.json({ success: true, message: 'Modified file uploaded successfully' });
  } catch (error) {
    // Do not leave a half-processed upload behind.
    if (req.file && req.file.path) {
      await fs.remove(req.file.path).catch(() => {});
    }
    if (movedLocalFile) {
      await fs.remove(movedLocalFile).catch(() => {});
    }
    console.error('❌ Error uploading modified file:', error);
    res.status(500).json({ error: 'Failed to upload modified file' });
  }
});

// API: Download original file (admin only)
app.get('/api/orders/:id/download/original', requireAdmin, async (req, res) => {
  try {
    const order = await db.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // If file is stored in Firebase, redirect to download URL; otherwise serve local file
    if (order.file_download_url) {
      return res.redirect(order.file_download_url);
    }
    const filePath = order.file_path;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.download(filePath, safeDownloadName(order.original_file_name));
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// API: Download modified file (admin only)
app.get('/api/orders/:id/download/modified', requireAdmin, async (req, res) => {
  try {
    const order = await db.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.modified_file_path && !order.modified_file_download_url) {
      return res.status(404).json({ error: 'Modified file not available yet' });
    }

    if (order.modified_file_download_url) {
      return res.redirect(order.modified_file_download_url);
    }

    const filePath = order.modified_file_path;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(
      filePath,
      safeDownloadName(order.modified_file_name || `modified_${order.original_file_name}`)
    );
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// API: Delete order (admin only)
app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const order = await db.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Best-effort file cleanup; a missing file must not block deleting the row.
    // Local storage paths are absolute; Firebase Storage keys are relative.
    for (const filePath of [order.file_path, order.modified_file_path]) {
      if (!filePath) continue;
      try {
        if (path.isAbsolute(filePath)) {
          await fs.remove(filePath);
        } else if (firebaseDeleteFn) {
          await firebaseDeleteFn(filePath);
        }
      } catch (e) {
        console.warn('Could not remove order file:', filePath, e.message);
      }
    }

    await db.deleteOrder(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// Lead research / business-development workspace (admin only)
app.use('/api/leads', createLeadsRouter({ requireAdmin }));

// 404 fallback for unknown routes (JSON, matching API style)
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler: multer/fileFilter errors -> 400, everything else -> 500 without leaking details
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  if (err instanceof multer.MulterError || err.status === 400) {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  console.error('Unhandled server error:', err && err.stack ? err.stack : err);
  res.status(500).json({ error: 'Internal server error' });
});

// Function to send file ready notifications
async function sendFileReadyNotifications(order, filePath) {
  console.log('📤 Sending notifications for order:', order.id);
  console.log('📧 Customer email:', order.customer_email ? 'provided' : 'not provided');
  console.log('📱 Customer phone:', order.customer_phone ? 'provided' : 'not provided');
  
  try {
    // Send email notification with file attachment
    if (order.customer_email) {
      await sendEmailNotification(order, filePath);
    } else {
      console.log('⚠️ No customer email provided, skipping email notification');
    }

    // Send WhatsApp notification
    if (order.customer_phone) {
      await sendWhatsAppNotification(order);
    } else {
      console.log('⚠️ No customer phone provided, skipping WhatsApp notification');
    }
    
    console.log('✅ Notifications completed for order:', order.id);
  } catch (error) {
    console.error('❌ Error sending notifications:', error.message);
    throw error;
  }
}

// Resolve an attachment from local disk or Firebase Storage, so Firebase mode
// sends the same attachment as the local SQLite mode.
async function loadAttachmentBuffer(filePath) {
  if (!filePath) return null;
  if (await fs.pathExists(filePath)) {
    return fs.readFile(filePath);
  }
  if (firebaseDownloadFn) {
    return firebaseDownloadFn(filePath);
  }
  return null;
}

// Function to send email with file attachment
async function sendEmailNotification(order, filePath) {
  try {
    console.log('📧 ========== EMAIL NOTIFICATION START ==========');
    console.log('   - Order ID:', order?.id);
    console.log('   - Customer Email:', order?.customer_email ? 'provided' : 'missing');
    console.log('   - Using:', resend ? 'Resend API' : 'SMTP');
    
    if (!resend && !emailTransporter) {
      console.log('⚠️ Email not configured. Set RESEND_API_KEY or SMTP credentials.');
      return;
    }
    
    if (!order?.customer_email) {
      console.log('⚠️ No customer email in order, skipping email notification');
      return;
    }

    const modifiedFileName = order.modified_file_name || order.modified_stored_file_name || 'modified_file.bin';
    const serviceName = order.service || 'ECU Tuning Service';
    const vehicleInfo = order.vehicle_info || 'Vehicle';
    const originalFileName = order.original_file_name || 'original_file.bin';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; color: #fff; padding: 20px; border-radius: 10px;">
        <h2 style="color: #FFD700;">🎉 Your Modified ECU File is Ready!</h2>
        <p>Hello ${escapeHtml(order.customer_name || 'Customer')},</p>
        <p>We're pleased to inform you that your ECU file modification has been completed.</p>
        
        <div style="background: #2d2d2d; padding: 20px; border-radius: 8px; margin: 20px 0; color: #fff;">
          <h3 style="color: #FFD700; margin-top: 0;">📋 Order Details:</h3>
          <p style="color: #fff;"><strong>Order ID:</strong> #${String(order.id).padStart(3, '0')}</p>
          <p style="color: #fff;"><strong>Service:</strong> ${escapeHtml(serviceName)}</p>
          <p style="color: #fff;"><strong>Price:</strong> ${SERVICE_PRICES[serviceName] || 'On request'}</p>
          <p>Prices in EUR</p>
          <p style="color: #fff;"><strong>Vehicle:</strong> ${escapeHtml(vehicleInfo)}</p>
          ${order.ecu_reference ? `<p style="color: #fff;"><strong>ECU Reference:</strong> ${escapeHtml(order.ecu_reference)}</p>` : ''}
          <p style="color: #fff;"><strong>Original File:</strong> ${escapeHtml(originalFileName)}</p>
          <p style="color: #fff;"><strong>Modified File:</strong> ${escapeHtml(modifiedFileName)}</p>
        </div>

        <p><strong style="color: #FFD700;">📥 Your modified file is attached!</strong></p>
        <p>Download the attached file and flash it to your ECU. If you have any issues with the attachment, please reply to this email.</p>
        
        <p style="color: #888; font-size: 12px; margin-top: 30px;">
          If you have any questions, please contact us at +213663334559.<br>
          <strong style="color: #FFD700;">AZ Performance</strong> - +213663334559
        </p>
      </div>
    `;

    console.log('📧 Sending email to customer:', order.customer_email ? 'address on file' : 'missing');

    const attachmentContent = await loadAttachmentBuffer(filePath);

    // Use Resend API (preferred for Railway)
    if (resend) {
      const emailOptions = {
        from: emailFrom,
        to: [order.customer_email],
        subject: sanitizeHeader(`✅ Your Modified ECU File is Ready - Order #${String(order.id).padStart(3, '0')}`),
        html: emailHtml
      };

      if (attachmentContent) {
        emailOptions.attachments = [{
          filename: safeDownloadName(modifiedFileName),
          content: attachmentContent
        }];
        console.log('📎 Attaching file:', safeDownloadName(modifiedFileName), '- Size:', attachmentContent.length, 'bytes');
      }

      const { data, error } = await resend.emails.send(emailOptions);

      if (error) {
        console.error('❌ Resend error:', error);
        throw new Error(error.message);
      }

      console.log('✅ Email sent via Resend with attachment:', data?.id);
    } 
    // Fallback to SMTP (for local development)
    else if (emailTransporter) {
      const mailOptions = {
        from: `"AZ Performance" <${emailUser}>`,
        to: order.customer_email,
        subject: sanitizeHeader(`✅ Your Modified ECU File is Ready - Order #${String(order.id).padStart(3, '0')}`),
        html: emailHtml
      };

      if (attachmentContent) {
        mailOptions.attachments = [{
          filename: safeDownloadName(modifiedFileName),
          content: attachmentContent
        }];
      }

      const info = await emailTransporter.sendMail(mailOptions);
      console.log('✅ Email sent via SMTP:', info.messageId);
    }

    console.log('📧 ========== EMAIL NOTIFICATION END ==========');
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    throw error;
  }
}

// Function to send admin notification for new orders
async function sendAdminNotification(order) {
  try {
    console.log('📧 ========== ADMIN NOTIFICATION START ==========');
    console.log('   - Order ID:', order?.id);
    console.log('   - Admin Email:', ADMIN_EMAIL ? 'configured' : '(not set)');
    
    if (!ADMIN_EMAIL) {
      console.log('⚠️ ADMIN_EMAIL not configured. Set ADMIN_EMAIL environment variable to receive new order notifications.');
      return;
    }
    
    if (!resend && !emailTransporter) {
      console.log('⚠️ Email not configured. Cannot send admin notification.');
      return;
    }

    const orderId = String(order.id).padStart(3, '0');
    const adminLink = escapeHtml(ADMIN_URL);
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; color: #fff; padding: 20px; border-radius: 10px;">
        <h2 style="color: #00FF00;">🚀 New Order Received!</h2>
        <p>A new ECU tuning order has been submitted.</p>
        
        <div style="background: #2d2d2d; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #FFD700; margin-top: 0;">📋 Order Details:</h3>
          <p style="color: #fff;"><strong>Order ID:</strong> #${orderId}</p>
          <p style="color: #fff;"><strong>Customer:</strong> ${escapeHtml(order.customer_name || 'Anonymous')}</p>
          <p style="color: #fff;"><strong>Email:</strong> ${escapeHtml(order.customer_email || 'Not provided')}</p>
          <p style="color: #fff;"><strong>Phone:</strong> ${escapeHtml(order.customer_phone || 'Not provided')}</p>
          <p style="color: #fff;"><strong>Vehicle:</strong> ${escapeHtml(order.vehicle_info || 'Not specified')}</p>
          <p style="color: #fff;"><strong>ECU Reference:</strong> ${order.ecu_reference ? escapeHtml(order.ecu_reference) : 'Not provided'}</p>
          <p style="color: #fff;"><strong>Service:</strong> ${escapeHtml(order.service || 'Not specified')}</p>
          <p style="color: #fff;"><strong>Price:</strong> ${SERVICE_PRICES[order.service] || 'On request'}</p>
          <p>Prices in EUR</p>
          ${order.custom_service_description ? `<p style="color: #fff;"><strong>Custom Request:</strong> ${escapeHtml(order.custom_service_description)}</p>` : ''}
          <p style="color: #fff;"><strong>Original File:</strong> ${escapeHtml(order.original_file_name || 'Unknown')}</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${adminLink}" style="display: inline-block; background: #FFD700; color: #000; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            🔐 Go to Admin Panel
          </a>
        </div>
        
        <p style="color: #888; font-size: 12px; margin-top: 30px; text-align: center;">
          AZ Performance - Admin Notification<br>
          +213663334559
        </p>
      </div>
    `;

    console.log('📧 Sending admin notification...');

    if (resend) {
      const { data, error } = await resend.emails.send({
        from: emailFrom,
        to: [ADMIN_EMAIL],
        subject: sanitizeHeader(`🚀 New Order #${orderId} - ${order.customer_name || 'Anonymous'} - ${order.service || 'ECU Service'}`),
        html: emailHtml
      });

      if (error) {
        console.error('❌ Resend error (admin):', error);
        throw new Error(error.message);
      }

      console.log('✅ Admin notification sent via Resend:', data?.id);
    } else if (emailTransporter) {
      const info = await emailTransporter.sendMail({
        from: `"AZ Performance" <${emailUser}>`,
        to: ADMIN_EMAIL,
        subject: sanitizeHeader(`🚀 New Order #${orderId} - ${order.customer_name || 'Anonymous'} - ${order.service || 'ECU Service'}`),
        html: emailHtml
      });

      console.log('✅ Admin notification sent via SMTP:', info.messageId);
    }

    console.log('📧 ========== ADMIN NOTIFICATION END ==========');
  } catch (error) {
    console.error('❌ Error sending admin notification:', error.message);
    // Don't throw - admin notification failure shouldn't break order creation
  }
}

// Function to send WhatsApp notification
async function sendWhatsAppNotification(order) {
  try {
    if (!twilioClient) {
      console.log('⚠️ WhatsApp not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.');
      console.log('📱 WhatsApp notification skipped.');
      return;
    }

    const message = await twilioClient.messages.create({
      from: twilioWhatsAppNumber,
      to: `whatsapp:${order.customer_phone}`,
      body: `✅ Your ECU file modification is ready!\n\n` +
            `Order #${String(order.id).padStart(3, '0')}\n` +
            `Service: ${order.service}\n` +
            `Vehicle: ${order.vehicle_info}\n\n` +
            `Your modified file has been sent to your email: ${order.customer_email}\n\n` +
            `Thank you for using AZ Performance!`
    });

    console.log('✅ WhatsApp message sent successfully:', message.sid);
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error.message);
    console.log('📱 WhatsApp send failed; customer notification skipped.');
  }
}

// Start server
let httpServer = null;

async function startServer() {
  try {
    // Refuse to boot a production deployment with the known development password.
    if (isProduction && !adminPasswordFromEnv) {
      throw new Error(
        'ADMIN_PASSWORD must be set to a strong value when NODE_ENV=production.'
      );
    }

    // Initialize databases first
    await db.init();
    await leadStore.init();

    httpServer = app.listen(PORT, () => {
      const isCloud = process.env.RAILWAY_ENVIRONMENT || process.env.RENDER;
      const url = isCloud ? process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RENDER_EXTERNAL_URL : `http://localhost:${PORT}`;
      
      console.log(`🚀 Server running on ${url}`);
      console.log(`📁 Uploads directory: ${uploadsDir}`);
      console.log(`🌐 Environment: ${isCloud ? 'Cloud' : 'Local'}`);
      console.log(
        `🌍 Lead research: ${process.env.LEAD_RESEARCH_CONTACT ? 'contact set' : '⚠️ set LEAD_RESEARCH_CONTACT before bulk research'}`
      );
      
      // Email status
      if (resend) {
        console.log('✅ Email configured via Resend API (ready to send)');
      } else if (emailTransporter) {
        console.log('✅ Email configured via SMTP - testing connection...');
        emailTransporter.verify()
          .then(() => console.log('✅ SMTP connection verified!'))
          .catch(err => console.log('⚠️ SMTP connection test failed:', err.message));
      } else {
        console.log('⚠️ Email not configured. Set RESEND_API_KEY for Railway.');
      }
      
      if (!twilioClient) {
        console.log('⚠️ WhatsApp not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.');
      } else {
        console.log('✅ WhatsApp configured');
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down...`);
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  if (typeof db.close === 'function') {
    await db.close().catch(() => {});
  }
  process.exit(0);
}

if (require.main === module) {
  startServer();

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = { app, startServer };
