#!/usr/bin/env node
// Cross-platform local launcher for the three Node servers.
// Usage: npm run start:all
require('../load-env');

const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const entries = [
  ['API', 'server.js'],
  ['Client', 'client-server.js'],
  ['Admin', 'admin-server.js']
];

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 250).unref();
}

for (const [name, file] of entries) {
  const child = spawn(process.execPath, [path.join(root, file)], {
    cwd: root,
    env: process.env,
    stdio: 'inherit'
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`❌ ${name} server exited (${signal || code}). Stopping the other servers.`);
    shutdown(code || 1);
  });

  children.push(child);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
console.log('🚀 Starting API, client and admin servers. Press Ctrl+C to stop all.');
