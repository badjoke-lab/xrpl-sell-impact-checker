const {
  normalizeCurrencyInput,
  hedgedRpcCall,
  jsonResponse,
  cacheGet,
  cachePut,
} = require("./_rpc.cjs");

function parseAmmReserves(amm) {
  if (!amm) return null;

  // amm_info: amm has asset/asset2 and amount/amount2 (one is XRP drops, one is token object)
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

  // trading_fee exists on some responses (integer)
  const feeRaw = amm.trading_fee;
  const feePct =
    Number.isFinite(feeRaw) ? Number(feeRaw) / 100000 : null; // best-effort

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
  const issuer = url.searchParams.get("issuer") || "";
  const normalized = normalizeCurrencyInput(currency);
  const currencyNormalized = normalized.currencyNormalized;


  // Special-case: This endpoint expects an IOU (currency + issuer) paired with XRP.
  // "currency=XRP" alone is not a valid query here.
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
        amm: null,
        ammReserves: null,
        error: "xrp_not_supported",
        message: "XRP alone is not a valid AMM query for this tool. Provide an IOU token (currency + issuer).",
        attempts: [],
        cached: false
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
    return jsonResponse(
      {
        ok: false,
        endpointUsed: "",
        elapsedMs: 0,
        currencyInput: normalized.currencyInput,
        currencyNormalized,
        amm: null,
        ammReserves: null,
        error: "missing_params",
        attempts: [],
        cached: false,
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

  const rpcResult = result?.json?.result;
  const rpcError = result?.json?.error || rpcResult?.error || null;
  const amm = rpcResult?.amm || null;

  const body = {
    ok: !!amm && !rpcError,
    endpointUsed,
    elapsedMs,
    currencyInput: normalized.currencyInput,
    currencyNormalized,
    amm,
    ammReserves: parseAmmReserves(amm),
    error: rpcError || result?.error || null,
    attempts,
    cached: false,
  };

  const resp = jsonResponse(body, { status: 200, cacheSeconds: 60 });
  await cachePut(request, resp);
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
