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

// In production (Railway), use empty string so API calls go to same origin via Nginx
// In development, use explicit localhost URL
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? ''
  : (process.env.ADMIN_API_BASE_URL ||
     process.env.API_BASE_URL ||
     process.env.API_URL ||
     `http://localhost:${process.env.API_PORT || 4000}`);

const adminApp = express();

// Enable gzip compression
adminApp.use(compression());

// Cache static assets for 1 day in production
const cacheMaxAge = process.env.NODE_ENV === 'production' ? 86400000 : 0;

// Config endpoint
adminApp.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.API_BASE_URL = '${API_BASE_URL.replace(/'/g, "\\'")}';`);
});

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

