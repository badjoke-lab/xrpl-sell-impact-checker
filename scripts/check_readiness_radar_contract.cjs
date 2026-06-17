const assert = require('node:assert/strict');
const fs = require('node:fs');

const page = fs.readFileSync('apps/institutional-readiness-radar/index.html', 'utf8');
const runtime = fs.readFileSync('apps/institutional-readiness-radar/institutional-readiness-radar.js', 'utf8');

const axes = [
  'Technical Maturity',
  'Production Readiness',
  'Verifiability / Auditability',
  'Compliance Alignment',
  'Operational Clarity',
  'Ecosystem Integration',
  'Source Credibility',
  'Adoption Signal',
];
for (const axis of axes) assert.equal(runtime.includes(axis), true, `Missing axis: ${axis}`);
assert.equal(runtime.includes("name: 'Verifiability / Auditability', level: 'Low'"), true);
assert.equal(runtime.includes("name: 'Technical Maturity', level: 'Medium'"), true);
assert.equal(runtime.includes("name: 'Production Readiness', level: 'Low'"), true);
assert.equal(runtime.includes("name: 'Adoption Signal', level: 'Low'"), true);
assert.equal(runtime.includes("source.excludedFromPrimary"), true);
assert.equal(runtime.includes('/api/watch-sources?group=readiness'), true);
assert.equal(page.includes('does not issue an institutional-ready verdict or a composite score'), true);
assert.equal(page.includes('Testnet activity does not establish production readiness'), true);
assert.equal(runtime.includes('compositeScore'), false);
assert.equal(runtime.includes('overallScore'), false);

console.log('Institutional Readiness Radar eight-axis checks passed.');
