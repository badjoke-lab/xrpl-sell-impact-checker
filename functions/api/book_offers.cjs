const {
  normalizeCurrencyInput,
  hedgedRpcCall,
  jsonResponse,
  cacheGet,
  cachePut,
  CACHE_TTL_SECONDS,
} = require("./_rpc.cjs");

function buildBookOffersPayload({ currencyNormalized, issuer, limit }) {
  return {
    method: "book_offers",
    params: [
      {
        taker_gets: { currency: currencyNormalized, issuer },
        taker_pays: { currency: "XRP" },
        limit,
      },
    ],
  };
}

exports.onRequestGet = async (context) => {
  const { request } = context;
  const url = new URL(request.url);

  const currency = url.searchParams.get("currency") || "";
  const issuer = url.searchParams.get("issuer") || "";
  const limitRaw = Number(url.searchParams.get("limit") || "200");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 200;

  const normalized = normalizeCurrencyInput(currency);
  const currencyNormalized = normalized.currencyNormalized;


  // Special-case: This tool estimates selling an IOU into XRP.
  // "currency=XRP" alone is not a valid sell target here.
  {
    const u = new URL(context.request.url);
    const cur = (u.searchParams.get("currency") || "").trim();
    const iss = (u.searchParams.get("issuer") || "").trim();
    if ((cur.toUpperCase() === "XRP") && !iss) {
      const body = {
        ok: false,
        endpointUsed: "",
        elapsedMs: 0,
        currencyInput: cur,
        currencyNormalized: "XRP",
        offersCount: 0,
        bidsCount: 0,
        asksCount: 0,
        error: "xrp_not_supported",
        message: "XRP is the settlement asset. Enter an IOU token (currency + issuer) to estimate selling into XRP.",
        attempts: [],
        cached: false,
        isStale: false
      };
      return new Response(JSON.stringify(body), {
        status: 400,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*"
        }
      });
    }
  }

  // basic validation
  if (!currencyNormalized || !issuer) {
    return jsonResponse(
      {
        ok: false,
        endpointUsed: "",
        elapsedMs: 0,
        currencyInput: normalized.currencyInput,
        currencyNormalized,
        offersCount: 0,
        bidsCount: 0,
        asksCount: 0,
        error: "missing_params",
        attempts: [],
        cached: false,
        isStale: false,
      },
      { status: 400 }
    );
  }

  // cache
  const cached = await cacheGet(request);
  if (cached) {
    return cached;
  }

  const payload = buildBookOffersPayload({ currencyNormalized, issuer, limit });
  const start = performance.now();

  const { endpointUsed, result, attempts } = await hedgedRpcCall(payload, {
    timeoutMs: 6000,
    staggerMs: 700,
  });

  const elapsedMs = Math.round(performance.now() - start);

  // XRPL sometimes returns 200 with {"error":...}
  const rpcResult = result?.json?.result;
  const rpcError = result?.json?.error || rpcResult?.error || result?.json?.result?.error;
  const offers = Array.isArray(rpcResult?.offers) ? rpcResult.offers : [];

  const body = {
    ok: !!rpcResult && !rpcError,
    endpointUsed,
    elapsedMs,
    currencyInput: normalized.currencyInput,
    currencyNormalized,
    offers,
    offersCount: offers.length,
    bidsCount: offers.length,
    asksCount: offers.length,
    error: rpcError || result?.error || null,
    attempts,
    cached: false,
    isStale: false,
  };

  if (!body.ok) {
    const stale = await cacheGet(request, { markStale: true });
    if (stale) {
      return stale;
    }
    return jsonResponse(body, { status: 200 });
  }

  const resp = jsonResponse(body, { status: 200, cacheSeconds: CACHE_TTL_SECONDS });
  await cachePut(request, body);
  return resp;
};

// accept POST as well (debug / scripts)
exports.onRequestPost = async (context) => {
  const { request } = context;
  const url = new URL(request.url);
  const currency = url.searchParams.get("currency") || "";
  const issuer = url.searchParams.get("issuer") || "";
  url.searchParams.set("currency", currency);
  url.searchParams.set("issuer", issuer);
  return exports.onRequestGet({ ...context, request: new Request(url.toString(), request) });
};
