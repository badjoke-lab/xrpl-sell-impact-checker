const assert = require('node:assert/strict');
const fs = require('node:fs');
const watcher = require('../functions/api/watch_sources.cjs');

const page = fs.readFileSync('apps/privacy-zk-watch/index.html', 'utf8');
const runtime = fs.readFileSync('apps/privacy-zk-watch/privacy-zk-watch.js', 'utf8');
const endpoint = fs.readFileSync('functions/api/watch-sources.js', 'utf8');

for (const marker of ['XRPL core ZKP', 'Credentials / Deep Freeze', 'DNA Protocol on XRPL', 'XLS-0096 Confidential MPT']) {
  assert.equal(runtime.includes(marker), true, `Missing seed item: ${marker}`);
}
for (const marker of ['In Development', 'Live / Production', 'Demo / Experimental', 'Proposal']) {
  assert.equal(runtime.includes(marker), true, `Missing stage: ${marker}`);
}
assert.equal(runtime.includes('External Project Using XRPL'), true);
assert.equal(runtime.includes('Testnet-linked'), true);
assert.equal(runtime.includes('Strong proof-to-transaction linkage'), true);
assert.equal(runtime.includes('proof verified'), false);
assert.equal(page.includes('This page does not verify proof-to-transaction linkage.'), true);
assert.equal(page.includes('External projects remain external.'), true);
assert.equal(endpoint.includes("'dna_home_volatile'"), true);
assert.equal(watcher.SOURCE_REGISTRY.dna_home_volatile.group, 'secondary');
assert.equal(watcher.SOURCE_REGISTRY.dna_home_volatile.stability, 'volatile');
assert.equal(watcher.SOURCE_REGISTRY.dna_verifier.quality, 'unresolved');
assert.equal(watcher.SOURCE_REGISTRY.dna_zkbridge_dashboard.stability, 'active');
assert.equal(watcher.compactWhitespace('a  \n b'), 'a b');

console.log('Privacy ZK Watch maturity and source checks passed.');
