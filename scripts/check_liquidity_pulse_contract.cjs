const assert = require('node:assert/strict');
const fs = require('node:fs');

const entry = fs.readFileSync('apps/liquidity-pulse/liquidity-pulse.js', 'utf8');
const runtime = fs.readFileSync('apps/liquidity-pulse/liquidity-pulse-runtime.js', 'utf8');
const bridge = fs.readFileSync('apps/liquidity-pulse/liquidity-freshness-bridge.js', 'utf8');

assert.equal(entry.includes('liquidity-pulse-runtime.js'), true);
assert.equal(runtime.includes('const LIVE_REFRESH_MS = 60_000'), true);
assert.equal(runtime.includes('const LITE_REFRESH_MS = 120_000'), true);
assert.equal(runtime.includes("'1h': 13"), true);
assert.equal(runtime.includes("'6h': 73"), true);
assert.equal(runtime.includes("'24h': 289"), true);
assert.equal(runtime.includes('if (relevant.length < 2)'), true);
assert.equal(runtime.includes('24, 42, 62'), false);
assert.equal(runtime.includes('Math.random'), false);
assert.equal(runtime.includes("sourceMode: 'demo'"), true);
assert.equal(runtime.includes('materialized-current'), true);
assert.equal(runtime.includes('history-fallback'), true);
assert.equal(runtime.includes('xsic:liquidity-rendered'), true);
assert.equal(bridge.includes('fetch('), false);

console.log('Liquidity Pulse current/history checks passed.');
