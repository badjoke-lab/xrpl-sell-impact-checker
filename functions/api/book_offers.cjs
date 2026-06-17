const {
  normalizeCurrencyInput,
  normalizeIssuerInput,
  buildPairKey,
  buildFreshnessMeta,
  buildResponseState,
  nowIso,
  hedgedRpcCall,
  jsonResponse,
  cacheGet,
  cachePut,
  CACHE_TTL_SECONDS,
} = require("./_rpc.cjs");

function buildBookOffersPayload({ currencyNormalized, issuer, limit }) {
  return {
    method: "book_offers",
    params: [{ taker_gets: { currency: currencyNormalized, issuer }, taker_pays: { currency: "XRP" }, limit }],
  };
}

exports.onRequestGet = async (context) => {
  const { request } = context;
  const url = new URL(request.url);
  const currency = url.searchParams.get("currency") || "";
  const issuer = normalizeIssuerInput(url.searchParams.get("issuer") || "");
  const limitRaw = Number(url.searchParams.get("limit") || "200");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 200;
  const normalized = normalizeCurrencyInput(currency);
  const currencyNormalized = normalized.currencyNormalized;
  const pairKey = buildPairKey({ currencyNormalized, issuer });

  if (!currencyNormalized || !issuer) {
    const observedAt = nowIso();
    return jsonResponse({
      ok: false,
      endpointUsed: "",
      elapsedMs: 0,
      currencyInput: normalized.currencyInput,
      currencyNormalized,
      issuer,
      pairKey,
      offersCount: 0,
      bidsCount: 0,
      asksCount: 0,
      error: "missing_params",
      attempts: [],
      observedAt,
      freshness: buildFreshnessMeta({ observedAt, source: "runtime", isStale: false }),
      cached: false,
      isStale: false,
      partial: false,
      state: "degraded",
      sourceMode: "none",
    }, { status: 400 });
  }

  const cached = await cacheGet(request);
  if (cached) return cached;

  const payload = buildBookOffersPayload({ currencyNormalized, issuer, limit });
  const start = performance.now();
  const { endpointUsed, result, attempts } = await hedgedRpcCall(payload, { timeoutMs: 6000, staggerMs: 700 });
  const elapsedMs = Math.round(performance.now() - start);
  const observedAt = nowIso();
  const rpcResult = result?.json?.result;
  const rpcError = result?.json?.error || rpcResult?.error || result?.json?.result?.error;
  const offers = Array.isArray(rpcResult?.offers) ? rpcResult.offers : [];
  const ok = Boolean(rpcResult) && !rpcError;

  const body = {
    ok,
    endpointUsed,
    elapsedMs,
    currencyInput: normalized.currencyInput,
    currencyNormalized,
    issuer,
    pairKey,
    offers,
    offersCount: offers.length,
    bidsCount: offers.length,
    asksCount: offers.length,
    error: rpcError || result?.error || null,
    upstreamStatus: result?.status || 0,
    attempts,
    observedAt,
    freshness: buildFreshnessMeta({ observedAt, cacheTtlSeconds: CACHE_TTL_SECONDS, source: endpointUsed || "runtime", isStale: false }),
    cached: false,
    isStale: false,
    partial: false,
    state: buildResponseState({ ok }),
    sourceMode: endpointUsed ? "live" : "none",
  };

  if (!body.ok) {
    const stale = await cacheGet(request, { markStale: true });
    if (stale) return stale;
    return jsonResponse(body, { status: 502 });
  }

  const response = jsonResponse(body, { status: 200, cacheSeconds: CACHE_TTL_SECONDS });
  await cachePut(request, body);
  return response;
};

exports.onRequestPost = async (context) => exports.onRequestGet(context);
