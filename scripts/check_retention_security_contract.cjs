const assert = require('node:assert/strict');
const fs = require('node:fs');
const policy = require('../shared/retention-policy.cjs');

const headers = fs.readFileSync('_headers', 'utf8');
const prune = fs.readFileSync('functions/api/retention-prune.js', 'utf8');
const endpoint = fs.readFileSync('functions/api/retention-policy.js', 'utf8');
const docs = fs.readFileSync('docs/retention-security-policy.md', 'utf8');

assert.equal(policy.RETENTION_POLICY.rawishQuoteSummaryDays, 14);
assert.equal(policy.RETENTION_POLICY.metricHourlyDays, 120);
assert.equal(policy.RETENTION_POLICY.metricDailyDays, 400);
assert.equal(policy.RETENTION_POLICY.watcherChangeEventDays, 30);
assert.equal(policy.RETENTION_POLICY.currentMode, 'upsert-current-only');
assert.equal(policy.RETENTION_POLICY.rawUpstreamBodyRetention, 'forbidden');
assert.equal(policy.RETENTION_POLICY.metricHourlyRowsPerKey, 2880);

assert.equal(prune.includes("const apply = url.searchParams.get('apply') === '1'"), true);
assert.equal(prune.includes('dryRun: !apply'), true);
assert.equal(prune.includes('Current-row tables are not pruned because they are upsert-only.'), true);
assert.equal(prune.includes('Raw upstream bodies remain forbidden.'), true);
assert.equal(endpoint.includes('rawUpstreamBodiesStored: false'), true);

for (const marker of [
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'X-Frame-Options: DENY',
  'Content-Security-Policy:',
  "object-src 'none'",
  "frame-ancestors 'none'",
  'Cache-Control: no-store',
]) {
  assert.equal(headers.includes(marker), true, `Missing security header: ${marker}`);
}
assert.equal(docs.includes('raw upstream response bodies: never retained'), true);
assert.equal(docs.includes('A source failure must not be recorded as route absence'), true);

console.log('Retention and response-security checks passed.');
