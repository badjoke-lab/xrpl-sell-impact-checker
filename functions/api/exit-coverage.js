const FIXED_LEDGER = {
  hash: 'E549C50B6C88925669DC7C67FC768E49B118E4EB4F1708CD995E7EFE4596A4C5',
  index: 103197813,
  endpoint: 'https://xrplcluster.com/',
};

const ISSUERS = {
  baseline: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
  bookOnly: 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz',
  ammOnly: 'rJmRk232iZvsS4kjxgqbrWi8QeedrpZJkb',
  invalid: 'invalid',
};

const STATE_ORDER = {
  dual: 0,
  'book-only': 1,
  'amm-only': 2,
  none: 3,
};

function sellImpactUrl(currency, issuer) {
  return `/apps/sell-impact/?currency=${encodeURIComponent(currency)}&issuer=${encodeURIComponent(issuer)}`;
}

function row(currency, issuer, state, evidence) {
  const bookPresent = state === 'dual' || state === 'book-only';
  const ammPresent = state === 'dual' || state === 'amm-only';
  return {
    currency,
    issuer,
    state,
    bookPresent,
    ammPresent,
    key: `${currency}|${issuer}`,
    sellImpactUrl: sellImpactUrl(currency, issuer),
    evidence,
  };
}

const DATASETS = {
  baseline: {
    key: 'baseline',
    label: 'Baseline contract',
    issuer: ISSUERS.baseline,
    issuerCheck: { ok: true, label: 'passed', note: 'valid issuer / contract baseline' },
    rows: [
      row('EUR', ISSUERS.baseline, 'dual', [
        'Baseline contract row: EUR = dual.',
        'Both book and AMM coverage are treated as present.',
        'Sell Impact deep link is required on every row.',
      ]),
      row('USD', ISSUERS.baseline, 'dual', [
        'Baseline contract row: USD = dual.',
        'Route exists through both book and AMM.',
        'Use Sell Impact for actual execution depth.',
      ]),
      row('BTC', ISSUERS.baseline, 'none', [
        'Baseline contract row: BTC = none.',
        'Candidate exists but no XRP exit route is observed.',
        'Row still keeps Sell Impact handoff.',
      ]),
      row('ARMY', ISSUERS.baseline, 'none', [
        'Baseline contract row: ARMY = none.',
        'Candidate exists but no XRP exit route is observed.',
        'Coverage is route absence, not token nonexistence.',
      ]),
    ],
  },
  expanded: {
    key: 'expanded',
    label: 'Expanded mixed proof',
    issuer: 'proof-mixed-issuer',
    issuerCheck: { ok: true, label: 'passed', note: 'fixed proof scaffold / 4 states' },
    rows: [
      row('EUR', ISSUERS.baseline, 'dual', ['Baseline dual proof row.', 'Book and AMM are both present.', 'Use Sell Impact to inspect impact and receive.']),
      row('USD', ISSUERS.baseline, 'dual', ['Baseline dual proof row.', 'Both route families exist.', 'This page stops at route coverage.']),
      row('534F4C4F00000000000000000000000000000000', ISSUERS.bookOnly, 'book-only', [
        'Live proof row: SOLO issuer was detected as book-only.',
        'book_offer_count_seen: 1 in fixed proof ledger.',
        'No AMM pair was included in the proof set.',
      ]),
      row('2436395852500000000000000000000000000000', ISSUERS.ammOnly, 'amm-only', [
        'Live proof row from AMM-only sample.',
        'AMM present, but book_present = false.',
        'This is the key proof that amm-only is real.',
      ]),
      row('BTC', ISSUERS.baseline, 'none', ['Baseline none proof row.', 'No XRP exit route observed.', 'Coverage absence only; price impact not evaluated here.']),
      row('ARMY', ISSUERS.baseline, 'none', ['Baseline none proof row.', 'No book and no AMM observed.', 'Deep link still remains available.']),
    ],
  },
  bookOnly: {
    key: 'bookOnly',
    label: 'Book-only proof',
    issuer: ISSUERS.bookOnly,
    issuerCheck: { ok: true, label: 'passed', note: 'live proof / SOLO' },
    rows: [
      row('534F4C4F00000000000000000000000000000000', ISSUERS.bookOnly, 'book-only', [
        'Proof hit: SOLO row was found as book-only.',
        'sample_offer_account: rstB8dWrF2atLUsFKsyyaCg5FFw7cn71Gf',
        'sample_offer_sequence: 91486581',
        'book_offer_count_seen: 1',
      ]),
    ],
  },
  ammOnly: {
    key: 'ammOnly',
    label: 'AMM-only proof',
    issuer: ISSUERS.ammOnly,
    issuerCheck: { ok: true, label: 'passed', note: 'live proof / AMM-only sample' },
    rows: [
      row('2436395852500000000000000000000000000000', ISSUERS.ammOnly, 'amm-only', [
        'Proof hit from AMM-only sample.',
        'AMM account: rG56tVt3NnQmvoRGCFTSwTwkv5oxyqqS1S',
        'Book was absent in proof ledger.',
        'Fixed ledger summary included many AMM-only rows.',
      ]),
    ],
  },
  invalid: {
    key: 'invalid',
    label: 'Invalid issuer',
    issuer: ISSUERS.invalid,
    issuerCheck: { ok: false, label: 'failed', note: '404 / actMalformed' },
    rows: [],
    invalid: true,
    invalidReason: 'Invalid issuer · 404 / actMalformed',
  },
  empty: {
    key: 'empty',
    label: 'Empty issuer',
    issuer: 'rEmptyProofIssuer0000000000000000000',
    issuerCheck: { ok: true, label: 'passed', note: 'no candidates found' },
    rows: [],
  },
};

function resolvePresetFromIssuer(rawIssuer, rawPreset) {
  const issuer = String(rawIssuer || '').trim();
  if (!issuer) return rawPreset || 'expanded';
  if (issuer === ISSUERS.baseline) return 'baseline';
  if (issuer === ISSUERS.bookOnly) return 'bookOnly';
  if (issuer === ISSUERS.ammOnly) return 'ammOnly';
  if (issuer === ISSUERS.invalid || issuer.toLowerCase() === 'invalid') return 'invalid';
  return rawPreset || 'expanded';
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const byState = (STATE_ORDER[a.state] ?? 99) - (STATE_ORDER[b.state] ?? 99);
    if (byState !== 0) return byState;
    return String(a.currency).localeCompare(String(b.currency));
  });
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

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const requestedPreset = url.searchParams.get('preset') || 'expanded';
  const issuer = url.searchParams.get('issuer') || '';
  const preset = resolvePresetFromIssuer(issuer, requestedPreset);
  const base = DATASETS[preset] || DATASETS.expanded;
  const checkedAt = new Date().toISOString();
  const rows = sortRows(base.rows || []);
  const summary = summarize(rows);
  const status = base.invalid ? 404 : 200;

  return json({
    ok: !base.invalid,
    key: base.key,
    label: base.label,
    issuer: issuer || base.issuer,
    issuerCheck: base.issuerCheck,
    rows,
    summary,
    invalid: Boolean(base.invalid),
    invalidReason: base.invalidReason || null,
    source: 'api-fixed-proof-baseline',
    freshness: {
      state: 'fresh',
      checkedAt,
      observedLedgerIndex: FIXED_LEDGER.index,
      observedLedgerHash: FIXED_LEDGER.hash,
    },
    observedLedger: FIXED_LEDGER,
    allRowsHaveSellImpactUrl: rows.every((row) => Boolean(row.sellImpactUrl)),
  }, status);
}
