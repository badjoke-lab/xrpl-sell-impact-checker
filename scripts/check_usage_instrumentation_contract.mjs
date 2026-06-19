import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  USAGE_EVENT_NAMES,
  USAGE_FEATURE_NAMES,
  validateUsagePayload,
} from '../shared/usage-metrics-policy.js';
import {
  onRequestOptions,
  onRequestPost,
  onRequestGet,
} from '../functions/api/usage-event.js';

const browser = fs.readFileSync('shared/usage-metrics.js', 'utf8');
const sellImpact = fs.readFileSync('shared/usage-sell-impact.js', 'utf8');
const accessibility = fs.readFileSync('shared/accessibility.js', 'utf8');

assert.equal(USAGE_EVENT_NAMES.includes('estimate_completed'), true);
assert.equal(USAGE_FEATURE_NAMES.includes('sell-impact'), true);
assert.equal(validateUsagePayload({ eventName: 'page_view', featureName: 'home', pairKeyHash: '', outcome: 'neutral', synthetic: false }).ok, true);
assert.equal(validateUsagePayload({ eventName: 'page_view', featureName: 'home', issuer: 'forbidden' }).ok, false);
assert.equal(validateUsagePayload({ eventName: 'unknown', featureName: 'home' }).ok, false);

const optionsResponse = await onRequestOptions();
assert.equal(optionsResponse.status, 204);
assert.equal(await optionsResponse.text(), '');

const methodResponse = await onRequestGet();
assert.equal(methodResponse.status, 405);

const basePayload = { eventName: 'page_view', featureName: 'home', pairKeyHash: '', outcome: 'neutral', synthetic: false };
const unavailableResponse = await onRequestPost({
  request: new Request('https://example.test/api/usage-event', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(basePayload),
  }),
  env: {},
});
assert.equal(unavailableResponse.status, 202);
assert.deepEqual(await unavailableResponse.json(), { ok: true, recorded: false, reason: 'metrics_unavailable' });

const syntheticResponse = await onRequestPost({
  request: new Request('https://example.test/api/usage-event', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-xsic-synthetic': '1' },
    body: JSON.stringify(basePayload),
  }),
  env: {},
});
assert.equal(syntheticResponse.status, 202);
assert.equal((await syntheticResponse.json()).reason, 'synthetic');

const prohibitedResponse = await onRequestPost({
  request: new Request('https://example.test/api/usage-event', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...basePayload, issuer: 'not-allowed' }),
  }),
  env: {},
});
assert.equal(prohibitedResponse.status, 400);

const statements = [];
const db = {
  prepare(sql) {
    return {
      bind(...values) {
        const statement = { sql, values, run: async () => ({ success: true }) };
        statements.push(statement);
        return statement;
      },
    };
  },
  async batch(batchStatements) {
    assert.equal(batchStatements.length, 2);
    return batchStatements.map(() => ({ success: true }));
  },
};
const recordedResponse = await onRequestPost({
  request: new Request('https://example.test/api/usage-event', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...basePayload, eventName: 'estimate_completed', featureName: 'sell-impact', outcome: 'success' }),
  }),
  env: { XSIC_DB: db },
});
assert.equal(recordedResponse.status, 202);
assert.deepEqual(await recordedResponse.json(), { ok: true, recorded: true });
assert.equal(statements.length, 2);
assert.equal(statements[0].sql.includes('usage_metric_hourly'), true);
assert.equal(statements[1].sql.includes('usage_metric_daily'), true);

for (const marker of ['navigator.webdriver', 'xsic_synthetic', 'recent.get', 'keepalive: true', 'credentials: \'same-origin\'']) {
  assert.equal(browser.includes(marker), true, `Missing browser instrumentation marker: ${marker}`);
}
assert.equal(browser.includes('localStorage'), false);
assert.equal(browser.includes('document.cookie'), false);
assert.equal(browser.includes('fingerprint'), false);
for (const marker of ['estimate_started', 'estimate_completed', 'estimate_failed', 'MutationObserver']) {
  assert.equal(sellImpact.includes(marker), true, `Missing Sell Impact marker: ${marker}`);
}
assert.equal(accessibility.includes("import('/shared/usage-metrics.js')"), true);

console.log('Usage instrumentation contract checks passed.');
