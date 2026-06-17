const assert = require('node:assert/strict');
const fs = require('node:fs');

const core = fs.readFileSync('functions/api/health.js', 'utf8');
const watchers = fs.readFileSync('functions/api/health-watchers.js', 'utf8');
const runbook = fs.readFileSync('docs/operations-runbook.md', 'utf8');

for (const marker of [
  'precompute_freshness',
  'liquidity_pulse_freshness',
  'flow_alert_freshness',
  'feature_freshness',
  'degraded_mode',
  'ops_summary',
]) {
  assert.equal(core.includes(marker), true, `Missing core health field: ${marker}`);
}
assert.equal(watchers.includes('primary_failed'), true);
assert.equal(watchers.includes('unresolved_sources'), true);
assert.equal(watchers.includes('volatile_sources_excluded_from_primary'), true);
assert.equal(watchers.includes("status === 'ok' ? 200 : 207"), true);
for (const marker of ['fresh', 'aging', 'stale', 'partial', 'missing', 'degraded']) {
  assert.equal(runbook.includes(`\`${marker}\``), true, `Missing runbook state: ${marker}`);
}
assert.equal(runbook.includes('Never convert a source failure into a fresh or absent-state conclusion.'), true);
assert.equal(runbook.includes('no 15-second production polling'), true);
assert.equal(runbook.includes('no raw upstream body retention'), true);

console.log('Health aggregation and operations runbook checks passed.');
