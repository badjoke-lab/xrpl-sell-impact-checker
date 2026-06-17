const assert = require('node:assert/strict');
const fs = require('node:fs');

const exposure = fs.readFileSync('apps/exposure-graph/exposure-guardrails.js', 'utf8');
const heatmap = fs.readFileSync('apps/token-heatmap/token-heatmap-guardrails.js', 'utf8');
const nav = fs.readFileSync('shared/nav.js', 'utf8');
const demo = JSON.parse(fs.readFileSync('apps/token-heatmap/token-heatmap-snapshot.demo.json', 'utf8'));
const live = JSON.parse(fs.readFileSync('apps/token-heatmap/token-heatmap-snapshot.json', 'utf8'));

assert.equal(exposure.includes('not a safety, solvency, credit, or institutional-readiness rating'), true);
assert.equal(exposure.includes('not as a validated risk score'), true);
assert.equal(exposure.includes('Decision-grade combined read'), false);
assert.equal(heatmap.includes('exitButton.disabled = true'), true);
assert.equal(heatmap.includes('Exit-route checks are not connected'), true);
assert.equal(nav.includes('/apps/exposure-graph/exposure-guardrails.js'), true);
assert.equal(nav.includes('/apps/token-heatmap/token-heatmap-guardrails.js'), true);
assert.equal(demo.tokens.length > 0, true);
assert.equal(demo.tokens.every((token) => token.exitCoverage === 'unknown'), true);
assert.equal(live.tokens.length > 0, true);
assert.equal(live.tokens.every((token) => token.exitCoverage === 'unknown'), true);
assert.equal(/dual|book-only|amm-only|none/.test(demo.tokens.map((token) => token.exitCoverage).join(',')), false);

console.log('Exposure Graph and Token Heatmap trust checks passed.');
