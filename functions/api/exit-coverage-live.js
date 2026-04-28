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
  [ISSUERS.bookOnly]: [
    { currency: '534F4C4F00000000000000000000000000000000', label: 'SOLO' },
  ],
  [ISSUERS.ammOnly]: [
    { currency: '2436395852500000000000000000000000000000', label: 'AMM-only proof token' },
  ],
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

function sellImpactUrl(currency, issuer) {
  return `/apps/sell-impact/?currency=${encodeURIComponent(currency)}&issuer=${encodeURIComponent(issuer)}`;
}

function stateFromPresence(bookPresent, ammPresent) {
  if (bookPresent && ammPresent) return 'dual';
  if (bookPresent) return 'book-only';
  if (ammPresent) return 'amm-only';
  return 'none';
}

async function readJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  return res.json().catch(() => ({ ok: false, error: 'invalid_json', httpStatus: res.status }));
}

async function inspect(origin, issuer, candidate) {
  const bookUrl = `${origin}/api/book-offers?currency=${encodeURIComponent(candidate.currency)}&issuer=${encodeURIComponent(issuer)}&limit=20`;
  const ammUrl = `${origin}/api/amm-info?currency=${encodeURIComponent(candidate.currency)}&issuer=${encodeURIComponent(issuer)}`;
  const [book, amm] = await Promise.all([readJson(bookUrl), readJson(ammUrl)]);
  const bookPresent = Boolean(book?.ok && Number(book?.offersCount || 0) > 0);
  const ammPresent = Boolean(amm?.ok && amm?.amm);
  const state = stateFromPresence(bookPresent, ammPresent);
  return {
    currency: candidate.currency,
    label: candidate.label || candidate.currency,
    issuer,
    key: `${candidate.currency}|${issuer}`,
    state,
    bookPresent,
    ammPresent,
    sellImpactUrl: sellImpactUrl(candidate.currency, issuer),
    checkedAt: new Date().toISOString(),
    source: candidate.explicit ? 'limited-live-explicit-currency' : 'limited-live-seeded-candidates',
    evidence: [
      `Candidate: ${candidate.label || candidate.currency}`,
      `book_offers: ${bookPresent ? 'present' : 'not observed'}`,
      `amm_info: ${ammPresent ? 'present' : 'not observed'}`,
    ],
  };
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
  const normalizedCurrency = normalizeCurrency(explicitCurrency);
  if (normalizedCurrency) {
    return [{ currency: normalizedCurrency, label: normalizedCurrency, explicit: true }];
  }
  return (SEEDED_CANDIDATES[issuer] || []).slice(0, MAX_CANDIDATES);
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const issuer = String(url.searchParams.get('issuer') || '').trim();
  const explicitCurrency = url.searchParams.get('currency') || '';
  const checkedAt = new Date().toISOString();

  if (!isClassicAddress(issuer)) {
    return json({
      ok: false,
      key: 'invalid',
      issuer,
      issuerCheck: { ok: false, label: 'failed', note: '404 / actMalformed' },
      rows: [],
      summary: summarize([]),
      invalid: true,
      invalidReason: 'Invalid issuer · 404 / actMalformed',
      source: 'limited-live-validation',
      freshness: { state: 'fresh', checkedAt },
      allRowsHaveSellImpactUrl: true,
    }, 404);
  }

  if (explicitCurrency && !normalizeCurrency(explicitCurrency)) {
    return json({
      ok: false,
      key: 'invalid-currency',
      issuer,
      issuerCheck: { ok: true, label: 'passed', note: 'issuer format accepted' },
      rows: [],
      summary: summarize([]),
      invalid: true,
      invalidReason: 'Invalid currency · use 3-6 alphanumeric code or 40-character hex currency',
      source: 'limited-live-validation',
      freshness: { state: 'fresh', checkedAt },
      allRowsHaveSellImpactUrl: true,
    }, 400);
  }

  const candidates = buildCandidates(issuer, explicitCurrency);
  const settled = await Promise.allSettled(candidates.map((candidate) => inspect(url.origin, issuer, candidate)));
  const rows = settled
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .sort((a, b) => (ORDER[a.state] ?? 99) - (ORDER[b.state] ?? 99) || String(a.currency).localeCompare(String(b.currency)));
  const failures = settled.filter((result) => result.status === 'rejected').length;
  const explicitMode = Boolean(normalizeCurrency(explicitCurrency));

  return json({
    ok: true,
    key: explicitMode ? 'limited-live-explicit' : 'limited-live',
    label: explicitMode ? 'Limited live explicit currency' : 'Limited live coverage',
    issuer,
    issuerCheck: { ok: true, label: 'passed', note: explicitMode ? 'explicit currency live check' : candidates.length ? 'seeded live candidate check' : 'valid issuer / no seeded candidates' },
    rows,
    summary: summarize(rows),
    invalid: false,
    invalidReason: null,
    source: explicitMode ? 'limited-live-explicit-currency' : 'limited-live-seeded-candidates',
    mode: 'live',
    partial: failures > 0,
    freshness: { state: failures ? 'aging' : 'fresh', checkedAt },
    allRowsHaveSellImpactUrl: rows.every((row) => Boolean(row.sellImpactUrl)),
    limits: { maxCandidates: MAX_CANDIDATES, explicitCurrency: explicitMode },
  });
}
