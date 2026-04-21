const {
  normalizeCurrencyInput,
  normalizeIssuerInput,
  buildPairKey,
  buildFreshnessMeta,
  nowIso,
  hedgedRpcCall,
  jsonResponse,
  cacheGet,
  cachePut,
  CACHE_TTL_SECONDS,
} = require("./_rpc.cjs");

function parseAmmReserves(amm) {
  if (!amm) return null;

  const asset = amm.asset || null;
  const asset2 = amm.asset2 || null;
  const amount = amm.amount;
  const amount2 = amm.amount2;

  let xrpDrops = null;
  let tokenObj = null;

  const isXrpAsset = (a) => a && (a.currency === "XRP" || a.currency === "xrp");
  const isTokenAmountObj = (v) => v && typeof v === "object" && typeof v.value === "string";

  if (isXrpAsset(asset)) {
    xrpDrops = typeof amount === "string" ? amount : null;
    tokenObj = isTokenAmountObj(amount2) ? amount2 : null;
  } else if (isXrpAsset(asset2)) {
    xrpDrops = typeof amount2 === "string" ? amount2 : null;
    tokenObj = isTokenAmountObj(amount) ? amount : null;
  }

  const xrpReserve = xrpDrops ? Number(xrpDrops) / 1_000_000 : null;
  const tokenReserve = tokenObj ? Number(tokenObj.value) : null;
  const feeRaw = amm.trading_fee;
  const feePct = Number.isFinite(feeRaw) ? Number(feeRaw) / 100000 : null;

  if (!Number.isFinite(xrpReserve) || !Number.isFinite(tokenReserve)) {
    return null;
  }

  return {
    xrpReserve,
    tokenReserve,
    feePct,
    feeRaw: Number.isFinite(feeRaw) ? feeRaw : null,
  };
}

exports.onRequestGet = async (context) => {
  const { request } = context;
  const url = new URL(request.url);

  const currency = url.searchParams.get("currency") || "";
  const issuer = normalizeIssuerInput(url.searchParams.get("issuer") || "");
  const normalized = normalizeCurrencyInput(currency);
  const currencyNormalized = normalized.currencyNormalized;
  const pairKey = buildPairKey({ currencyNormalized, issuer });

  {
    const u = new URL(context.request.url);
    const cur = (u.searchParams.get("currency") || "").trim();
    const iss = (u.searchParams.get("issuer") || "").trim();
    if ((cur.toUpperCase() === "XRP") && !iss) {
      const observedAt = nowIso();
      const body = {
        ok: false,
        endpointUsed: "",
        elapsedMs: 0,
        currencyInput: cur,
        currencyNormalized: "XRP",
        issuer: "",
        pairKey: "",
        amm: null,
        ammReserves: null,
        error: "xrp_not_supported",
        message: "XRP alone is not a valid AMM query for this tool. Provide an IOU token (currency + issuer).",
        attempts: [],
        observedAt,
        freshness: buildFreshnessMeta({ observedAt, source: "runtime", isStale: false }),
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

  if (!currencyNormalized || !issuer) {
    const observedAt = nowIso();
    return jsonResponse(
      {
        ok: false,
        endpointUsed: "",
        elapsedMs: 0,
        currencyInput: normalized.currencyInput,
        currencyNormalized,
        issuer,
        pairKey,
        amm: null,
        ammReserves: null,
        error: "missing_params",
        attempts: [],
        observedAt,
        freshness: buildFreshnessMeta({ observedAt, source: "runtime", isStale: false }),
        cached: false,
        isStale: false,
      },
      { status: 400 }
    );
  }

  const cached = await cacheGet(request);
  if (cached) {
    return cached;
  }

  const payload = {
    method: "amm_info",
    params: [
      {
        asset: { currency: currencyNormalized, issuer },
        asset2: { currency: "XRP" },
      },
    ],
  };

  const start = performance.now();

  const { endpointUsed, result, attempts } = await hedgedRpcCall(payload, {
    timeoutMs: 6000,
    staggerMs: 700,
  });

  const elapsedMs = Math.round(performance.now() - start);
  const observedAt = nowIso();
  const rpcResult = result?.json?.result;
  const rpcError = result?.json?.error || rpcResult?.error || null;
  const amm = rpcResult?.amm || null;

  const body = {
    ok: !!amm && !rpcError,
    endpointUsed,
    elapsedMs,
    currencyInput: normalized.currencyInput,
    currencyNormalized,
    issuer,
    pairKey,
    amm,
    ammReserves: parseAmmReserves(amm),
    error: rpcError || result?.error || null,
    attempts,
    observedAt,
    freshness: buildFreshnessMeta({ observedAt, cacheTtlSeconds: CACHE_TTL_SECONDS, source: endpointUsed || "runtime", isStale: false }),
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

exports.onRequestPost = async (context) => {
  const { request } = context;
  const url = new URL(request.url);
  const currency = url.searchParams.get("currency") || "";
  const issuer = url.searchParams.get("issuer") || "";
  url.searchParams.set("currency", currency);
  url.searchParams.set("issuer", issuer);
  return exports.onRequestGet({ ...context, request: new Request(url.toString(), request) });
};
