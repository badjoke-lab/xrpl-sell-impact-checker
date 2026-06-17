const ABSENCE_ERRORS = new Set(['actNotFound', 'objectNotFound', 'entryNotFound', 'rpcACT_NOT_FOUND']);

function errorCode(payload) {
  return payload?.error || payload?.code || null;
}

function sourceFailed(payload, responseOk) {
  if (!responseOk) return true;
  const code = String(errorCode(payload) || '');
  if (!code || ABSENCE_ERRORS.has(code)) return false;
  return /all_failed|upstream|timeout|unreachable|invalid_json|non_json|http_/i.test(code)
    || (payload?.ok === false && !payload?.endpointUsed && Array.isArray(payload?.attempts) && payload.attempts.length > 0);
}

async function readJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const type = response.headers.get('content-type') || '';
    if (!type.toLowerCase().includes('application/json')) {
      return { responseOk: false, status: response.status, payload: { ok: false, error: 'non_json_response' } };
    }
    const payload = await response.json().catch(() => ({ ok: false, error: 'invalid_json' }));
    return { responseOk: response.ok, status: response.status, payload };
  } catch (error) {
    return {
      responseOk: false,
      status: 0,
      payload: { ok: false, error: error?.name === 'AbortError' ? 'upstream_timeout' : 'upstream_unreachable' },
    };
  } finally {
    clearTimeout(timer);
  }
}

function stateFromPresence(bookPresent, ammPresent) {
  if (bookPresent && ammPresent) return 'dual';
  if (bookPresent) return 'book-only';
  if (ammPresent) return 'amm-only';
  return 'none';
}

function sellImpactUrl(currency, issuer) {
  return `/apps/sell-impact/?currency=${encodeURIComponent(currency)}&issuer=${encodeURIComponent(issuer)}`;
}

async function inspectPair(origin, issuer, candidate) {
  const bookUrl = `${origin}/api/book-offers?currency=${encodeURIComponent(candidate.currency)}&issuer=${encodeURIComponent(issuer)}&limit=20`;
  const ammUrl = `${origin}/api/amm-info?currency=${encodeURIComponent(candidate.currency)}&issuer=${encodeURIComponent(issuer)}`;
  const [bookResult, ammResult] = await Promise.all([readJson(bookUrl), readJson(ammUrl)]);
  const book = bookResult.payload;
  const amm = ammResult.payload;

  if (sourceFailed(book, bookResult.responseOk) || sourceFailed(amm, ammResult.responseOk)) {
    const error = new Error('coverage_source_failed');
    error.details = {
      currency: candidate.currency,
      book: { status: bookResult.status, error: errorCode(book) },
      amm: { status: ammResult.status, error: errorCode(amm) },
    };
    throw error;
  }

  const bookPresent = Boolean(book?.ok && Number(book?.offersCount || 0) > 0);
  const ammPresent = Boolean(amm?.ok && amm?.amm);
  const ammCode = String(errorCode(amm) || '');
  if (!ammPresent && ammCode && !ABSENCE_ERRORS.has(ammCode)) {
    const error = new Error('amm_state_unresolved');
    error.details = { currency: candidate.currency, amm: { status: ammResult.status, error: ammCode } };
    throw error;
  }

  return {
    currency: candidate.currency,
    label: candidate.label || candidate.currency,
    issuer,
    key: `${candidate.currency}|${issuer}`,
    state: stateFromPresence(bookPresent, ammPresent),
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
    sourceStatus: {
      book: bookPresent ? 'present' : 'confirmed-absent',
      amm: ammPresent ? 'present' : 'confirmed-absent',
    },
  };
}

module.exports = { inspectPair, stateFromPresence, sellImpactUrl, errorCode, sourceFailed };
