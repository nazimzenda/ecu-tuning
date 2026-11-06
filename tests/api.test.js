'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Configure an isolated data directory BEFORE loading the application.
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecu-tuning-test-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = testDataDir;
process.env.ADMIN_PASSWORD = 'test-password-123';
process.env.ADMIN_EMAIL = '';
process.env.RESEND_API_KEY = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';

const request = require('supertest');
const { app } = require('../server');
const db = require('../db');
const leadStore = require('../leads/store');

const uploadsDir = path.join(testDataDir, 'uploads');
const modifiedDir = path.join(uploadsDir, 'modified');
const sampleFile = Buffer.from('ECU-TEST-FILE-0123456789');

let sessionId;

function withSession(req) {
  return req.set('x-admin-session', sessionId);
}

function validOrder() {
  return request(app)
    .post('/api/orders')
    .field('service', 'Stage 1')
    .field('vehicleInfo', '2015 VW Golf TDI')
    .field('ecuReference', 'EDC17C64')
    .field('customerName', 'Test Customer')
    .field('customerEmail', 'customer@example.com')
    .field('customerPhone', '+213555000000')
    .attach('ecuFile', sampleFile, 'test-ecu.bin');
}

before(async () => {
  await db.init();
  await leadStore.init();
});

after(async () => {
  if (typeof db.close === 'function') await db.close();
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('health endpoint reports the API as healthy', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});
test('security headers are present and x-powered-by is hidden', async () => {
  const res = await request(app).get('/');
  assert.equal(res.headers['x-powered-by'], undefined);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
});

test('admin login rejects a wrong password and accepts the configured one', async () => {
  const bad = await request(app)
    .post('/api/admin/login')
    .send({ password: 'wrong-password' });
  assert.equal(bad.status, 401);

  const good = await request(app)
    .post('/api/admin/login')
    .send({ password: 'test-password-123' });
  assert.equal(good.status, 200);
  assert.equal(good.body.success, true);
  assert.ok(good.body.sessionId);
  sessionId = good.body.sessionId;
});

test('admin routes require a valid session', async () => {
  const list = await request(app).get('/api/orders');
  assert.equal(list.status, 401);

  const single = await request(app).get('/api/orders/1');
  assert.equal(single.status, 401);
});

test('CORS allows configured origins and rejects unknown ones', async () => {
  const allowed = await request(app)
    .options('/api/orders')
    .set('Origin', 'http://localhost:3000')
    .set('Access-Control-Request-Method', 'POST');
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:3000');

  const blocked = await request(app)
    .options('/api/orders')
    .set('Origin', 'https://evil.example')
    .set('Access-Control-Request-Method', 'POST');
  assert.equal(blocked.status, 403);
});

test('invalid order submissions are rejected without leaving orphan files', async () => {
  const beforeFiles = fs.readdirSync(uploadsDir);

  const res = await request(app)
    .post('/api/orders')
    .field('service', 'Not A Real Service')
    .field('vehicleInfo', 'Test Car')
    .attach('ecuFile', sampleFile, 'bad.bin');

  assert.equal(res.status, 400);
  assert.match(res.body.error, /Invalid service/);
  assert.deepEqual(fs.readdirSync(uploadsDir), beforeFiles);
});

test('invalid email addresses are rejected', async () => {
  const res = await request(app)
    .post('/api/orders')
    .field('service', 'Stage 1')
    .field('vehicleInfo', 'Test Car')
    .field('customerEmail', 'not-an-email')
    .attach('ecuFile', sampleFile, 'bad-email.bin');

  assert.equal(res.status, 400);
  assert.match(res.body.error, /Invalid customer email/);
});

test('a valid order is stored and can be read back by an admin', async () => {
  const created = await validOrder();
  assert.equal(created.status, 200);
  assert.equal(created.body.success, true);
  assert.ok(created.body.orderId > 0);

  const list = await withSession(request(app).get('/api/orders'));
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body));
  assert.ok(list.body.length >= 1);

  const order = await withSession(request(app).get(`/api/orders/${created.body.orderId}`));
  assert.equal(order.status, 200);
  assert.equal(order.body.service, 'Stage 1');
  assert.equal(order.body.vehicle_info, '2015 VW Golf TDI');
  assert.equal(order.body.ecu_reference, 'EDC17C64');
  assert.equal(order.body.status, 'pending');
});

test('order status accepts only known values and rejects unknown ids', async () => {
  const created = await validOrder();
  const id = created.body.orderId;

  const invalid = await withSession(request(app).put(`/api/orders/${id}/status`))
    .send({ status: 'not-a-status' });
  assert.equal(invalid.status, 400);

  const missing = await withSession(request(app).put('/api/orders/999999/status'))
    .send({ status: 'processing' });
  assert.equal(missing.status, 404);

  const ok = await withSession(request(app).put(`/api/orders/${id}/status`))
    .send({ status: 'processing' });
  assert.equal(ok.status, 200);

  const order = await withSession(request(app).get(`/api/orders/${id}`));
  assert.equal(order.body.status, 'processing');
});

test('a modified file cannot be attached to a non-existent order', async () => {
  const beforeFiles = fs.readdirSync(modifiedDir);

  const res = await withSession(request(app).post('/api/orders/999999/modified'))
    .attach('modifiedFile', sampleFile, 'modified.bin');

  assert.equal(res.status, 404);
  assert.deepEqual(fs.readdirSync(modifiedDir), beforeFiles);
});

test('uploading a modified file completes the order and enables downloads', async () => {
  const created = await validOrder();
  const id = created.body.orderId;

  const upload = await withSession(request(app).post(`/api/orders/${id}/modified`))
    .attach('modifiedFile', sampleFile, 'tuned.bin');
  assert.equal(upload.status, 200);
  assert.equal(upload.body.success, true);

  const order = await withSession(request(app).get(`/api/orders/${id}`));
  assert.equal(order.body.status, 'completed');
  assert.equal(order.body.modified_file_name, 'tuned.bin');
  assert.ok(fs.existsSync(order.body.modified_file_path));

  const original = await request(app)
    .get(`/api/orders/${id}/download/original`)
    .query({ session: sessionId });
  assert.equal(original.status, 200);

  const modified = await request(app)
    .get(`/api/orders/${id}/download/modified`)
    .query({ session: sessionId });
  assert.equal(modified.status, 200);
});

test('deleting an order removes its files and database row', async () => {
  const created = await validOrder();
  const id = created.body.orderId;

  const order = await withSession(request(app).get(`/api/orders/${id}`));
  const originalPath = order.body.file_path;

  const deleted = await withSession(request(app).delete(`/api/orders/${id}`));
  assert.equal(deleted.status, 200);

  const missing = await withSession(request(app).get(`/api/orders/${id}`));
  assert.equal(missing.status, 404);
  assert.equal(fs.existsSync(originalPath), false);
});

test('the lead workspace is admin-only and returns its configuration', async () => {
  const unauthorized = await request(app).get('/api/leads/config');
  assert.equal(unauthorized.status, 401);

  const res = await withSession(request(app).get('/api/leads/config'));
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.countries));
  assert.ok(res.body.countries.length > 0);
});

test('SQLite adapter stores Firebase download URLs', async () => {
  const created = await db.createOrder({
    originalFileName: 'cloud.bin',
    storedFileName: 'cloud-stored.bin',
    filePath: 'orders/originals/cloud-stored.bin',
    fileDownloadURL: 'https://example.com/download/cloud.bin',
    service: 'Stage 1',
    vehicleInfo: 'Test Car',
    customerName: 'Cloud Tester',
    customerEmail: 'cloud@example.com',
    customerPhone: null,
    status: 'pending'
  });

  const loaded = await db.getOrder(created.id);
  assert.equal(loaded.file_download_url, 'https://example.com/download/cloud.bin');
  await db.deleteOrder(created.id);
});
