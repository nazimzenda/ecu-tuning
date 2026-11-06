require('./load-env');

const express = require('express');
const path = require('path');
const compression = require('compression');
const securityHeaders = require('./security');

const CLIENT_PORT = process.env.CLIENT_PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// API base URL: an explicit env override always wins. In production the
// default is the same origin (empty string) because nginx serves the UI and
// proxies /api on one host; in development it points at the local API port.
const API_BASE_URL = process.env.CLIENT_API_BASE_URL ||
  process.env.API_BASE_URL ||
  process.env.API_URL ||
  (isProduction ? '' : `http://localhost:${process.env.API_PORT || 4000}`);

const clientApp = express();
clientApp.disable('x-powered-by');
clientApp.use(securityHeaders);
clientApp.use(compression());

// Cache static assets for 1 day in production. HTML stays fresh so deploys
// are visible immediately.
const cacheMaxAge = isProduction ? 86400000 : 0;

clientApp.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send(`window.API_BASE_URL = ${JSON.stringify(API_BASE_URL)};`);
});

clientApp.use(express.static(path.join(__dirname, 'public'), {
  maxAge: cacheMaxAge,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (/\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Single-page fallback for navigation routes only. Missing assets must 404
// instead of returning index.html with a 200.
clientApp.get('*', (req, res, next) => {
  if (path.extname(req.path)) return next();
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

clientApp.use((req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

const server = clientApp.listen(CLIENT_PORT, () => {
  const apiLabel = API_BASE_URL || '(same origin)';
  console.log(`🟡 Client server running at http://localhost:${CLIENT_PORT}`);
  console.log(`↪️  API base URL: ${apiLabel}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${CLIENT_PORT} is already in use`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
