const assert = require('node:assert/strict');
const fs = require('node:fs');

const entry = fs.readFileSync('apps/flow-alert/flow-alert.js', 'utf8');
const runtime = fs.readFileSync('apps/flow-alert/flow-alert-runtime.js', 'utf8');

assert.equal(entry.includes('flow-alert-runtime.js'), true);
assert.equal(runtime.includes('const FLOW_REFRESH_MS = 60_000'), true);
assert.equal(runtime.includes('const FLOW_LITE_REFRESH_MS = 120_000'), true);
assert.equal(runtime.includes('history-fallback'), true);
assert.equal(runtime.includes('materialized history fallback'), true);
assert.equal(runtime.includes("sourceMode: 'demo'"), true);
assert.equal(runtime.includes('Math.random'), false);
assert.equal(runtime.includes('xsic:flow-rendered'), true);
assert.equal(runtime.includes('/api/xrpl/flow-history'), true);
assert.equal(runtime.includes('/api/xrpl/whale-flow'), true);
assert.equal(runtime.includes('/api/xrpl/escrow-watch'), true);

console.log('Flow Alert current/history checks passed.');
