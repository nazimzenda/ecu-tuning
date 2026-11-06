require('./load-env');

const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const securityHeaders = require('./security');

// Global error handlers to capture crashes and unhandled rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err && err.stack ? err.stack : err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const ADMIN_PORT = process.env.ADMIN_PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// API base URL: an explicit env override always wins. In production the
// default is the same origin (empty string) because nginx serves the UI and
// proxies /api on one host; in development it points at the local API port.
const API_BASE_URL = process.env.ADMIN_API_BASE_URL ||
  process.env.API_BASE_URL ||
  process.env.API_URL ||
  (isProduction ? '' : `http://localhost:${process.env.API_PORT || 4000}`);

const adminApp = express();
adminApp.disable('x-powered-by');
adminApp.use(securityHeaders);
adminApp.use(compression());

// Cache static assets for 1 day in production. HTML stays fresh so deploys
// are visible immediately.
const cacheMaxAge = isProduction ? 86400000 : 0;

// Config endpoint. The array form is important: /admin/leads resolves a
// relative config.js to /admin/config.js, while /leads resolves to /config.js.
adminApp.get(['/config.js', '/admin/config.js'], (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send(`window.API_BASE_URL = ${JSON.stringify(API_BASE_URL)};`);
});

// Lead intelligence workspace. Works both behind nginx (/admin/leads) and
// when the admin server is opened directly (/leads or /admin/leads).
const researchHtmlPath = path.join(__dirname, 'public', 'research.html');
adminApp.get(['/leads', '/admin/leads', '/research', '/admin/research'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  if (fs.existsSync(researchHtmlPath)) {
    res.sendFile(researchHtmlPath);
  } else {
    res.status(404).send('Lead research workspace not found');
  }
});

const staticOptions = {
  maxAge: cacheMaxAge,
  etag: true,
  lastModified: true,
  index: false,
  redirect: false,
  setHeaders: (res, filePath) => {
    if (/\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
};

// Serve real static files for /admin/* requests (nginx may or may not strip
// the /admin prefix).
adminApp.use('/admin', express.static(path.join(__dirname, 'public'), staticOptions));

// Serve CSS, JS, images and fonts (but NOT HTML files) with caching.
adminApp.get(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i, (req, res, next) => {
  express.static(path.join(__dirname, 'public'), staticOptions)(req, res, next);
});

// Serve admin.html for navigation routes (including root). Missing assets
// must 404 instead of being answered with HTML.
adminApp.get('*', (req, res, next) => {
  if (path.extname(req.path)) return next();
  const adminHtmlPath = path.join(__dirname, 'public', 'admin.html');
  if (fs.existsSync(adminHtmlPath)) {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(adminHtmlPath);
  } else {
    res.status(404).send('Admin panel not found');
  }
});

adminApp.use((req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

const server = adminApp.listen(ADMIN_PORT, () => {
  console.log(`🔐 Admin server running at http://localhost:${ADMIN_PORT}`);
  console.log(`↪️  API base URL: ${API_BASE_URL || '(same origin)'}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${ADMIN_PORT} is already in use`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
