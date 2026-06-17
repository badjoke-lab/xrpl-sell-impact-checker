const assert = require('node:assert/strict');
const fs = require('node:fs');
const checker = require('../functions/api/proof_anchor_checker.cjs');

const page = fs.readFileSync('apps/proof-anchor-checker/index.html', 'utf8');
const runtime = fs.readFileSync('apps/proof-anchor-checker/proof-anchor-checker.js', 'utf8');
const endpoint = fs.readFileSync('functions/api/proof-anchor.js', 'utf8');
const core = fs.readFileSync('functions/api/proof_anchor_checker.cjs', 'utf8');

assert.equal(checker.extractInput('0A847CC56520B80E886615BEECA2462F2DAA23C4821ADC326669A6A458715B52').type, 'xrpl-hash');
assert.equal(checker.extractInput('5923559f-95de-4d4f-a25d-79e74f04870b').type, 'proof-uuid');
assert.equal(checker.extractInput('67fe39b1').type, 'proof-id');
const noLink = checker.linkage({ hash: 'A'.repeat(64) }, { view: { txHashDisplay: 'BBBBBBBB…CCCC' } }, [{ hash: 'A'.repeat(64) }]);
assert.equal(noLink.strongJoinKeyFound, false);
assert.equal(noLink.status, 'No Strong Link Between Proof And XRPL Tx');
assert.equal(noLink.prefixMatches, 0);

for (const marker of ['XRPL anchor registry', 'Proof-side record', 'Verifier endpoint', 'Linkage']) assert.equal(page.includes(marker), true);
assert.equal(page.includes('This release never emits Verified, Matched, Chain-confirmed proof, or Same record confirmed.'), true);
assert.equal(runtime.includes("setText('#status-linkage', 'Verified')"), false);
assert.equal(runtime.includes("setText('#status-linkage', 'Matched')"), false);
assert.equal(core.includes("status: 'No Strong Link Between Proof And XRPL Tx'"), true);
assert.equal(core.includes("prohibitedVerdicts: ['Verified'"), true);
assert.equal(page.includes('This tool does not prove that a proof and XRPL transaction are the same record.'), true);
assert.equal(runtime.includes('Candidate string'), true);
assert.equal(runtime.includes('Not enough evidence'), true);
assert.equal(endpoint.includes('checker.check(input)'), true);

console.log('Proof Anchor evidence separation checks passed.');
