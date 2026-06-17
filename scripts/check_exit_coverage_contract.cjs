const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = require('../functions/api/exit_coverage_source.cjs');

const handler = fs.readFileSync('functions/api/exit_coverage_live_handler.cjs', 'utf8');
const runtime = fs.readFileSync('apps/exit-coverage-map/exit-coverage-runtime.js', 'utf8');
const bridge = fs.readFileSync('apps/exit-coverage-map/exit-coverage-api-bridge.js', 'utf8');

assert.equal(source.stateFromPresence(true, true), 'dual');
assert.equal(source.stateFromPresence(true, false), 'book-only');
assert.equal(source.stateFromPresence(false, true), 'amm-only');
assert.equal(source.stateFromPresence(false, false), 'none');
assert.equal(source.sourceFailed({ ok: false, error: 'actNotFound' }, true), false);
assert.equal(source.sourceFailed({ ok: false, error: 'upstream_timeout' }, true), true);
assert.equal(source.sourceFailed({ ok: false }, false), true);

assert.equal(handler.includes('account_info'), true);
assert.equal(handler.includes('404 / actMalformed'), true);
assert.equal(handler.includes('upstreamFailure'), true);
assert.equal(handler.includes("upstreamFailure ? 503 : 200"), true);
assert.equal(handler.includes('allRowsHaveSellImpactUrl'), true);
assert.equal(handler.includes('observedLedgerIndex'), true);
assert.equal(runtime.includes('No route state was inferred'), true);
assert.equal(runtime.includes('failed candidates were omitted'), true);
assert.equal(runtime.includes("event.key === 'Enter' || event.key === ' '"), true);
assert.equal(runtime.includes('/apps/sell-impact/?currency='), true);
assert.equal(bridge.includes('exit-coverage-runtime.js'), true);

console.log('Exit Coverage four-state and failure-boundary checks passed.');
