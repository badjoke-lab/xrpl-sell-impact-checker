import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildUsageSummary, onRequestGet } from '../functions/api/usage-summary.js';

const rows = [
  { day_key: '2026-06-20', event_name: 'estimate_started', feature_name: 'sell-impact', pair_key_hash: 'a'.repeat(64), request_count: 10, success_count: 0, degraded_count: 0, error_count: 0 },
  { day_key: '2026-06-20', event_name: 'estimate_completed', feature_name: 'sell-impact', pair_key_hash: 'a'.repeat(64), request_count: 8, success_count: 7, degraded_count: 1, error_count: 0 },
  { day_key: '2026-06-20', event_name: 'estimate_failed', feature_name: 'sell-impact', pair_key_hash: 'b'.repeat(64), request_count: 2, success_count: 0, degraded_count: 0, error_count: 2 },
];

const summary = buildUsageSummary(rows, 7);
assert.equal(summary.state, 'available');
assert.equal(summary.activeDays, 1);
assert.equal(summary.estimates.started, 10);
assert.equal(summary.estimates.completed, 8);
assert.equal(summary.estimates.completionRate, 0.8);
assert.equal(summary.topPairs.length, 1);
assert.equal(summary.topPairs[0].pairKeyHash, 'a'.repeat(64));
assert.equal(summary.suppressedPairCount, 1);
assert.equal(buildUsageSummary([], 7).state, 'zero');

const missing = await onRequestGet({
  request: new Request('https://example.test/api/usage-summary?range=7'),
  env: {},
});
assert.equal(missing.status, 200);
const missingPayload = await missing.json();
assert.equal(missingPayload.ok, false);
assert.equal(missingPayload.usage.state, 'unavailable');
assert.equal(missingPayload.operations.state, 'separate_contracts');

const invalid = await onRequestGet({
  request: new Request('https://example.test/api/usage-summary?range=14'),
  env: {},
});
assert.equal(invalid.status, 400);

const db = {
  prepare(sql) {
    assert.equal(sql.includes('usage_metric_daily'), true);
    return {
      bind(cutoff) {
        assert.match(cutoff, /^\d{4}-\d{2}-\d{2}$/);
        return { all: async () => ({ results: rows }) };
      },
    };
  },
};
const available = await onRequestGet({
  request: new Request('https://example.test/api/usage-summary?range=30'),
  env: { XSIC_DB: db },
});
assert.equal(available.status, 200);
const availablePayload = await available.json();
assert.equal(availablePayload.ok, true);
assert.equal(availablePayload.usage.rangeDays, 30);
assert.equal(availablePayload.operations.note.includes('not inferred'), true);

const report = fs.readFileSync('scripts/report_usage_operations.mjs', 'utf8');
for (const marker of ['/api/usage-summary', '/api/health', '/api/health-watchers', '/api/retention-policy', 'usageAndHealthAreSeparate']) {
  assert.equal(report.includes(marker), true, `Missing report marker: ${marker}`);
}

console.log('Usage and operations summary contract checks passed.');
