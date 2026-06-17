const assert = require('node:assert/strict');
const fs = require('node:fs');
const freshness = require('../functions/api/runtime_freshness.cjs');
const runtime = require('../functions/api/runtime_request.cjs');

async function main() {
  assert.equal(runtime.normalizeField('currency', 'usd'), 'USD');
  assert.equal(runtime.normalizeField('amount', '010.00'), '10');
  assert.equal(runtime.normalizeField('mode', 'LIVE'), 'live');
  assert.equal(runtime.normalizeField('issuer', ' rExample '), 'rExample');

  const first = new Request('https://example.test/api?issuer=rABC&currency=usd&amount=010.00&mode=LIVE');
  const second = new Request('https://example.test/api?mode=live&amount=10&currency=USD&issuer=rABC');
  assert.equal(runtime.canonicalRequestKey(first), runtime.canonicalRequestKey(second));
  assert.notEqual(
    runtime.canonicalRequestKey(first),
    runtime.canonicalRequestKey(new Request('https://example.test/api?issuer=rDIFFERENT&currency=USD&amount=10&mode=live')),
  );
  assert.equal(runtime.stableObjectKey({ b: 2, a: 1 }), runtime.stableObjectKey({ a: 1, b: 2 }));

  let calls = 0;
  const factory = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true };
  };
  const [sharedA, sharedB] = await Promise.all([
    runtime.shareRequest('same-key', factory),
    runtime.shareRequest('same-key', factory),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(sharedA, sharedB);

  const checkedAt = '2026-06-18T00:02:00.000Z';
  assert.equal(freshness.classifyFreshness({ ok: true, observedAt: '2026-06-18T00:01:50.000Z', checkedAt }).status, 'fresh');
  assert.equal(freshness.classifyFreshness({ ok: true, observedAt: '2026-06-18T00:01:00.000Z', checkedAt }).status, 'aging');
  assert.equal(freshness.classifyFreshness({ ok: true, observedAt: '2026-06-17T23:58:00.000Z', checkedAt }).status, 'stale');
  assert.equal(freshness.classifyFreshness({ ok: true, observedAt: null, checkedAt }).status, 'missing');
  assert.equal(freshness.classifyFreshness({ ok: true, partial: true, observedAt: '2026-06-18T00:01:50.000Z', checkedAt }).status, 'partial');
  assert.equal(freshness.classifyFreshness({ ok: false, observedAt: '2026-06-18T00:01:50.000Z', checkedAt }).status, 'degraded');

  for (const file of ['functions/api/book-offers.js', 'functions/api/amm-info.js']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /runtime_endpoint\.js/);
    assert.match(source, /executeShared/);
    assert.match(source, /normalizedContext/);
  }

  console.log('Runtime identity and freshness checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
