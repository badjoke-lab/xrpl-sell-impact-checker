import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectPairBrief, onRequestGet } from '../functions/api/pair-brief.js';

const issuer = 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq';
const input = { currency: 'USD', issuer, amount: 1000 };

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function mockFetch(url, options = {}) {
  const parsed = new URL(url);
  if (parsed.pathname === '/api/book-offers') {
    return Promise.resolve(response({
      ok: true, state: 'fresh', sourceMode: 'live', offersCount: 3,
      endpointUsed: 'mock-rpc', observedAt: '2026-06-20T00:00:00.000Z',
      freshness: { state: 'fresh', observedAt: '2026-06-20T00:00:00.000Z' },
    }));
  }
  if (parsed.pathname === '/api/amm-info') {
    return Promise.resolve(response({
      ok: true, sourceMode: 'live', endpointUsed: 'mock-rpc',
      observedAt: '2026-06-20T00:00:01.000Z', freshness: { state: 'fresh' },
      ammReserves: { xrpReserve: 500000, tokenReserve: 1000000, feePct: 0.003 },
    }));
  }
  if (parsed.pathname === '/api/xrpl/liquidity-current') {
    return Promise.resolve(response({ ok: true, latest: { observedAt: '2026-06-20T00:00:00.000Z', pool: 'xrp-rlusd', price: 0.5, liquidityUsd: 1000000, freshness: { state: 'fresh' } } }));
  }
  if (parsed.pathname === '/api/xrpl/liquidity-history') {
    return Promise.resolve(response({ ok: true, recent: [{ ts: '2026-06-20T00:00:00.000Z', liquidityUsd: 1000000 }], historyMeta: { count: 1, newestTs: '2026-06-20T00:00:00.000Z', freshness: { state: 'fresh' } } }));
  }
  if (parsed.pathname === '/api/xrpl/amm-snapshot') {
    return Promise.resolve(response({ ok: true, observedAt: '2026-06-20T00:00:00.000Z', pool: 'xrp-rlusd', price: 0.5, liquidityUsd: 1000000, sourceMode: 'live', freshness: { state: 'fresh' } }));
  }
  if (parsed.pathname === '/api/xrpl/whale-flow') {
    return Promise.resolve(response({ ok: true, ts: '2026-06-20T00:00:00.000Z', source: 'mock-flow', sourceMode: 'live', summary: { inflowXrp: 100, outflowXrp: 50, netXrp: 50 }, freshness: { state: 'fresh' } }));
  }
  if (parsed.pathname === '/api/xrpl/flow-history') {
    return Promise.resolve(response({ ok: true, recent: [], historyMeta: { count: 2, newestTs: '2026-06-20T00:00:00.000Z', freshness: { state: 'fresh' } } }));
  }
  if (parsed.pathname === '/api/exit-coverage') {
    return Promise.resolve(response({
      ok: true, source: 'fixed-proof', freshness: { state: 'fresh', checkedAt: '2026-06-20T00:00:00.000Z' },
      observedLedger: { index: 1, hash: 'A' },
      rows: [{ currency: 'USD', issuer, state: 'dual', bookPresent: true, ammPresent: true, sellImpactUrl: '/apps/sell-impact/?currency=USD', evidence: ['mock'] }],
    }));
  }
  if (parsed.pathname === '/api/xrpl' && options.method === 'POST') {
    return Promise.resolve(response({ endpointUsed: 'mock-rpc', result: { result: { lines: [
      { account: 'rCounterparty111111111111111111111', currency: 'USD', balance: '-75' },
      { account: 'rCounterparty222222222222222222222', currency: 'USD', balance: '25' },
    ] } } }));
  }
  return Promise.resolve(response({ error: 'not_found' }, 404));
}

const complete = await collectPairBrief(input, { baseUrl: 'https://example.test', fetchImpl: mockFetch });
assert.equal(complete.ok, true);
assert.equal(complete.partial, false);
assert.equal(complete.sections.sellImpact.state, 'available');
assert.equal(complete.sections.sellImpact.data.calculation, 'detail-tool-authoritative');
assert.equal(complete.sections.sellImpact.data.estimatedReceiveXrp, null);
assert.equal(complete.sections.exitCoverage.data.routeState, 'dual');
assert.equal(complete.sections.issuerExposure.data.totalExposure, 100);
assert.equal(complete.sections.liquidity.scope, 'xrp-rlusd-market-context');
assert.equal(complete.sections.flow.scope, 'exchange-flow-market-context');
assert.equal(Object.hasOwn(complete, 'score'), false);
assert.equal(Object.hasOwn(complete, 'recommendation'), false);
assert.match(complete.disclaimer, /No Buy\/Sell recommendation/);

const partialFetch = async (url, options) => {
  const parsed = new URL(url);
  if (parsed.pathname === '/api/amm-info') throw new Error('mock failure');
  if (parsed.pathname === '/api/exit-coverage') return response({ ok: true, source: 'fixed-proof', rows: [], freshness: { state: 'fresh' } });
  return mockFetch(url, options);
};
const partial = await collectPairBrief(input, { baseUrl: 'https://example.test', fetchImpl: partialFetch });
assert.equal(partial.ok, true);
assert.equal(partial.partial, true);
assert.equal(partial.sections.sellImpact.state, 'partial');
assert.equal(partial.sections.exitCoverage.state, 'unsupported');
assert.equal(partial.sections.exitCoverage.data.routeState, null);
assert.match(partial.sections.exitCoverage.warning, /not equivalent to none/);

const invalid = await onRequestGet({
  request: new Request('https://example.test/api/pair-brief?currency=XRP&issuer=bad&amount=0'),
  env: {},
  fetch: mockFetch,
});
assert.equal(invalid.status, 400);
const invalidPayload = await invalid.json();
assert.equal(invalidPayload.ok, false);
assert.equal(invalidPayload.meta.contract, 'xsic.error.v1');

const source = fs.readFileSync('functions/api/pair-brief.js', 'utf8');
for (const marker of ['Promise.all', 'Promise.race', 'SECTION_TIMEOUT_MS', 'OVERALL_TIMEOUT_MS', "state: 'unsupported'", 'detail-tool-authoritative']) {
  assert.equal(source.includes(marker), true, `Missing Pair Brief marker: ${marker}`);
}
for (const forbidden of ['riskScore', 'safetyScore', "recommendation: 'buy'", "recommendation: 'sell'"]) {
  assert.equal(source.includes(forbidden), false, `Forbidden Pair Brief output: ${forbidden}`);
}

console.log('Pair Brief API contract checks passed.');
