/**
 * Lightweight regression tests for the lead-research core.
 * Run with: npm run leads:test
 */

const assert = require('node:assert/strict');
const {
  detectCompliance,
  detectServices,
  scoreLead,
  applyScore,
  normalizePhone,
  isPersonalEmail
} = require('./score');
const {
  isPrivateIp,
  robotsAllows,
  extractEmails,
  extractPhones,
  extractWhatsApp
} = require('./enrich');
const { buildQuery } = require('./sources/overpass');
const { leadsToCsv } = require('./routes');

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

test('detects English emissions-delete wording', () => {
  const result = detectCompliance('DPF delete, EGR removal and AdBlue delete');
  assert.equal(result.status, 'review');
  assert.ok(result.flags.some((flag) => flag.id === 'dpf_delete'));
  assert.ok(result.flags.some((flag) => flag.id === 'egr_delete'));
  assert.ok(result.flags.some((flag) => flag.id === 'adblue_delete'));
});

test('detects multilingual emissions-delete wording', () => {
  const result = detectCompliance('Suppression FAP, désactivation EGR, anulación AdBlue, rimozione DPF');
  assert.equal(result.status, 'review');
  assert.ok(result.flags.length >= 3);
});

test('lawful emissions repair is not treated as a defeat flag', () => {
  const result = detectCompliance('DPF cleaning, EGR repair and AdBlue service');
  assert.equal(result.status, 'clear');
  assert.ok(detectServices('DPF cleaning, EGR repair and AdBlue service').includes('emissionsRepair'));
});

test('does not verify a lead whose website is blocked or unchecked', () => {
  const base = {
    name: 'ECU Tuning Test',
    city: 'Lyon',
    country_code: 'FR',
    latitude: 45.76,
    longitude: 4.83,
    geo_precision: 'rooftop',
    website: 'https://example.com',
    email: 'info@example.com',
    phone: '+33 1 23 45 67 89'
  };
  const blocked = scoreLead({ ...base, website_status: 'blocked' });
  assert.notEqual(blocked.verification_status, 'verified');
  assert.equal(blocked.confidence_parts.website, 0);

  const ok = scoreLead({ ...base, website_status: 'ok' });
  assert.equal(ok.verification_status, 'verified');
  assert.equal(ok.confidence_parts.website, 12);
});

test('score explanation is stored in raw_data', () => {
  const lead = applyScore({
    name: 'Stage 1 Tuning',
    city: 'Berlin',
    country_code: 'DE',
    latitude: 52.5,
    longitude: 13.4,
    geo_precision: 'rooftop',
    website: 'https://example.de',
    website_status: 'ok',
    email: 'info@example.de'
  });
  assert.ok(lead.raw_data.scoring);
  assert.ok(Array.isArray(lead.raw_data.scoring.reasons));
  assert.ok(lead.raw_data.scoring.parts.location > 0);
});

test('private and link-local addresses are rejected', () => {
  assert.equal(isPrivateIp('127.0.0.1'), true);
  assert.equal(isPrivateIp('10.0.0.5'), true);
  assert.equal(isPrivateIp('172.16.0.5'), true);
  assert.equal(isPrivateIp('192.168.1.1'), true);
  assert.equal(isPrivateIp('169.254.169.254'), true);
  assert.equal(isPrivateIp('8.8.8.8'), false);
  assert.equal(isPrivateIp('1.1.1.1'), false);
});

test('robots.txt rules are respected', () => {
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/public';
  assert.equal(robotsAllows(robots, '/private/page'), false);
  assert.equal(robotsAllows(robots, '/private/public/page'), true);
  assert.equal(robotsAllows(robots, '/about'), true);
});

test('contact extraction ignores image filenames and picks business email', () => {
  const html = `
    <a href="mailto:info@example-tuning.de">Email</a>
    <img src="logo@2x.png">
    <a href="tel:+49 30 123456">Call</a>
    <a href="https://wa.me/491701234567">WhatsApp</a>
  `;
  const emails = extractEmails(html);
  assert.ok(emails.includes('info@example-tuning.de'));
  assert.ok(!emails.some((email) => email.endsWith('.png')));
  assert.deepEqual(extractPhones(html), ['+4930123456']);
  assert.equal(extractWhatsApp(html), '+491701234567');
});

test('phone normalisation handles international prefixes', () => {
  assert.equal(normalizePhone('00 33 1 23 45 67 89'), '+33123456789');
  assert.equal(normalizePhone('+49 (0) 30 123456'), '+49030123456');
});

test('personal email detection', () => {
  assert.equal(isPersonalEmail('someone@gmail.com'), true);
  assert.equal(isPersonalEmail('info@company.de'), false);
});

test('Overpass query is bounded to a bbox', () => {
  const query = buildQuery([45.7, 4.7, 45.9, 4.9], { limit: 100 });
  assert.ok(query.includes('45.7,4.7,45.9,4.9'));
  assert.ok(query.includes('out center tags 100'));
});

test('CSV export prevents formula injection but keeps coordinates', () => {
  const csv = leadsToCsv([
    {
      name: '=HYPERLINK("https://evil")',
      latitude: -3.7038,
      longitude: 40.4168,
      country_code: 'ES',
      services: ['remapping']
    }
  ]);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('-3.7038'));
  assert.ok(csv.includes('40.4168'));
});

console.log(`\n${passed} test(s) passed.`);
