const assert = require('node:assert/strict');
const fs = require('node:fs');

const summary = fs.readFileSync('apps/sell-impact/precompute-summary-bridge.js', 'utf8');
const freshness = fs.readFileSync('apps/sell-impact/precompute-freshness-bridge.js', 'utf8');

assert.equal(summary.includes('computeConfidence'), false);
assert.equal(summary.includes('computeDepth'), false);
assert.equal(summary.includes('fallbackReceive'), false);
assert.equal(summary.includes('No fallback output is inferred or fabricated.'), true);
assert.equal(summary.includes('Alternative-route comparison; not an execution split'), true);
assert.equal(summary.includes('summaryPairKey(summary, data.row) !== pairKey(requestedInput)'), true);
assert.equal(summary.includes('lastLiveInputKey'), true);
assert.equal(summary.includes('xsic:precompute-applied'), true);
assert.equal(freshness.includes('fetch('), false);
assert.equal(freshness.includes('xsic:precompute-applied'), true);

console.log('Sell Impact trust-boundary checks passed.');
