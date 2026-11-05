const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

// Global error handlers to capture crashes and unhandled rejections
process.on('uncaughtException', (err) => {
  console.error('Uncatch Exception:', err && err.stack ? err.stack : err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const ADMIN_PORT = process.env.ADMIN_PORT || 3001;

// API base URL: env override takes priority in every environment (production included),
// falling back to localhost for local development
const API_BASE_URL = process.env.ADMIN_API_BASE_URL ||
  process.env.API_BASE_URL ||
  process.env.API_URL ||
  `http://localhost:${process.env.API_PORT || 4000}`;

const adminApp = express();

// Enable gzip compression
adminApp.use(compression());

// Cache static assets for 1 day in production
const cacheMaxAge = process.env.NODE_ENV === 'production' ? 86400000 : 0;

// Config endpoint. The array form is important: /admin/leads resolves a
// relative config.js to /admin/config.js, while /leads resolves to /config.js.
adminApp.get(['/config.js', '/admin/config.js'], (req, res) => {
  res.type('application/javascript');
  res.send(`window.API_BASE_URL = '${API_BASE_URL.replace(/'/g, "\\'")}';`);
});

// Lead intelligence workspace. Works both behind nginx (/admin/leads) and
// when the admin server is opened directly (/leads or /admin/leads).
const researchHtmlPath = path.join(__dirname, 'public', 'research.html');
adminApp.get(['/leads', '/admin/leads', '/research', '/admin/research'], (req, res) => {
  if (fs.existsSync(researchHtmlPath)) {
    res.sendFile(researchHtmlPath);
  } else {
    res.status(404).send('Lead research workspace not found');
  }
});

// Serve real static files for /admin/* requests (nginx may or may not strip the /admin prefix)
adminApp.use('/admin', express.static(path.join(__dirname, 'public'), {
  maxAge: cacheMaxAge,
  etag: true,
  lastModified: true,
  index: false,
  redirect: false
}));

// Serve CSS, JS, images, fonts (but NOT HTML files) with caching
adminApp.get(/\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/i, (req, res, next) => {
  express.static(path.join(__dirname, 'public'), {
    maxAge: cacheMaxAge,
    etag: true,
    lastModified: true
  })(req, res, next);
});

// Serve admin.html for ALL routes (including root)
adminApp.get('*', (req, res) => {
  const adminHtmlPath = path.join(__dirname, 'public', 'admin.html');
  if (fs.existsSync(adminHtmlPath)) {
    res.sendFile(adminHtmlPath);
  } else {
    res.status(404).send('Admin panel not found');
  }
});

const server = adminApp.listen(ADMIN_PORT, () => {
  console.log(`🔐 Admin server running at http://localhost:${ADMIN_PORT}`);
  console.log(`↪️  API Base URL: ${API_BASE_URL}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${ADMIN_PORT} is already in use`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

