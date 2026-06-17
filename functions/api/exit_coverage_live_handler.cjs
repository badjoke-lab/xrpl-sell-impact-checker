const rpc = require('./_rpc.cjs');
const source = require('./exit_coverage_source.cjs');

const ISSUERS = {
  baseline: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
  bookOnly: 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz',
  ammOnly: 'rJmRk232iZvsS4kjxgqbrWi8QeedrpZJkb',
};

const SEEDED_CANDIDATES = {
  [ISSUERS.baseline]: [
    { currency: 'USD', label: 'Bitstamp USD' },
    { currency: 'EUR', label: 'Bitstamp EUR' },
    { currency: 'BTC', label: 'Bitstamp BTC' },
    { currency: 'ARMY', label: 'ARMY' },
  ],
  [ISSUERS.bookOnly]: [{ currency: '534F4C4F00000000000000000000000000000000', label: 'SOLO' }],
  [ISSUERS.ammOnly]: [{ currency: '2436395852500000000000000000000000000000', label: 'AMM-only proof token' }],
};

const ORDER = { dual: 0, 'book-only': 1, 'amm-only': 2, none: 3 };
const MAX_CANDIDATES = 12;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

function isClassicAddress(value) {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(String(value || '').trim());
}

function normalizeCurrency(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const upper = text.toUpperCase();
  if (/^[A-Z0-9]{3,6}$/.test(upper)) return upper;
  if (/^[A-Fa-f0-9]{40}$/.test(text)) return text.toUpperCase();
  return '';
}

function summarize(rows) {
  return {
    total: rows.length,
    dual: rows.filter((row) => row.state === 'dual').length,
    bookOnly: rows.filter((row) => row.state === 'book-only').length,
    ammOnly: rows.filter((row) => row.state === 'amm-only').length,
    none: rows.filter((row) => row.state === 'none').length,
  };
}

function buildCandidates(issuer, explicitCurrency) {
  const currency = normalizeCurrency(explicitCurrency);
  if (currency) return [{ currency, label: currency, explicit: true }];
  return (SEEDED_CANDIDATES[issuer] || []).slice(0, MAX_CANDIDATES);
}

function invalidPayload(issuer, reason, checkedAt, note = '404 / actMalformed') {
  return {
    ok: false,
    key: 'invalid',
    issuer,
    issuerCheck: { ok: false, label: 'failed', note },
    rows: [],
    summary: summarize([]),
    invalid: true,
    invalidReason: reason,
    upstreamFailure: false,
    source: 'limited-live-validation',
    freshness: { state: 'fresh', checkedAt },
    allRowsHaveSellImpactUrl: true,
  };
}

async function validateIssuer(issuer) {
  const payload = {
    method: 'account_info',
    params: [{ account: issuer, ledger_index: 'validated', strict: true }],
  };
  const result = await rpc.hedgedRpcCall(payload, { timeoutMs: 6000, staggerMs: 700 });
  const rpcResult = result?.result?.json?.result || null;
  const code = result?.result?.json?.error || rpcResult?.error || result?.result?.error || null;
  if (!result?.endpointUsed && (!rpcResult || code)) {
    if (code && !/all_failed|upstream|timeout|unreachable/i.test(String(code))) {
      return { ok: false, invalid: true, code: String(code), endpointUsed: '' };
    }
    return { ok: false, invalid: false, code: String(code || 'upstream_unreachable'), endpointUsed: '' };
  }
  if (code || !rpcResult?.account_data) {
    return { ok: false, invalid: true, code: String(code || 'actNotFound'), endpointUsed: result.endpointUsed || '' };
  }
  return {
    ok: true,
    invalid: false,
    code: null,
    endpointUsed: result.endpointUsed || '',
    ledgerIndex: rpcResult.ledger_index ?? null,
    ledgerHash: rpcResult.ledger_hash || null,
  };
}

exports.onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const issuer = String(url.searchParams.get('issuer') || '').trim();
  const explicitCurrency = url.searchParams.get('currency') || '';
  const checkedAt = new Date().toISOString();

  if (!isClassicAddress(issuer)) {
    return json(invalidPayload(issuer, 'Invalid issuer · 404 / actMalformed', checkedAt), 404);
  }

  if (explicitCurrency && !normalizeCurrency(explicitCurrency)) {
    const payload = invalidPayload(
      issuer,
      'Invalid currency · use 3-6 alphanumeric code or 40-character hex currency',
      checkedAt,
      'issuer format accepted / currency rejected',
    );
    payload.key = 'invalid-currency';
    payload.issuerCheck = { ok: true, label: 'passed', note: 'issuer format accepted' };
    return json(payload, 400);
  }

  const issuerValidation = await validateIssuer(issuer);
  if (!issuerValidation.ok) {
    if (issuerValidation.invalid) {
      const note = `404 / ${issuerValidation.code}`;
      return json(invalidPayload(issuer, `Invalid issuer · ${note}`, checkedAt, note), 404);
    }
    return json({
      ok: false,
      key: 'upstream-validation-failed',
      issuer,
      issuerCheck: { ok: null, label: 'unknown', note: 'issuer validation unavailable' },
      rows: [],
      summary: summarize([]),
      invalid: false,
      invalidReason: null,
      upstreamFailure: true,
      error: issuerValidation.code,
      source: 'live-account-validation',
      freshness: { state: 'degraded', checkedAt },
      allRowsHaveSellImpactUrl: true,
    }, 503);
  }

  const candidates = buildCandidates(issuer, explicitCurrency);
  const settled = await Promise.allSettled(
    candidates.map((candidate) => source.inspectPair(url.origin, issuer, candidate)),
  );
  const rows = settled
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .sort((a, b) => (ORDER[a.state] ?? 99) - (ORDER[b.state] ?? 99) || String(a.currency).localeCompare(String(b.currency)));
  const failures = settled
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason?.details || { error: result.reason?.message || 'coverage_source_failed' });
  const explicitMode = Boolean(normalizeCurrency(explicitCurrency));
  const upstreamFailure = candidates.length > 0 && rows.length === 0 && failures.length === candidates.length;
  const partial = failures.length > 0 && !upstreamFailure;

  return json({
    ok: !upstreamFailure,
    key: explicitMode ? 'limited-live-explicit' : 'limited-live',
    label: explicitMode ? 'Limited live explicit currency' : 'Limited live coverage',
    issuer,
    issuerCheck: {
      ok: true,
      label: 'passed',
      note: explicitMode ? 'explicit currency live check' : candidates.length ? 'seeded live candidate check' : 'valid issuer / no seeded candidates',
    },
    rows,
    summary: summarize(rows),
    invalid: false,
    invalidReason: null,
    upstreamFailure,
    source: explicitMode ? 'limited-live-explicit-currency' : 'limited-live-seeded-candidates',
    mode: 'live',
    partial,
    failures,
    freshness: {
      state: upstreamFailure ? 'degraded' : partial ? 'partial' : 'fresh',
      checkedAt,
      observedLedgerIndex: issuerValidation.ledgerIndex,
      observedLedgerHash: issuerValidation.ledgerHash,
      endpointUsed: issuerValidation.endpointUsed,
    },
    observedLedger: {
      index: issuerValidation.ledgerIndex,
      hash: issuerValidation.ledgerHash,
      endpoint: issuerValidation.endpointUsed,
    },
    allRowsHaveSellImpactUrl: rows.every((row) => Boolean(row.sellImpactUrl)),
    limits: { maxCandidates: MAX_CANDIDATES, explicitCurrency: explicitMode },
  }, upstreamFailure ? 503 : 200);
};
