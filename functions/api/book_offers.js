import { normalizeCurrencyInput } from "../../shared/normalizeCurrency.js";

const XRPL_RPC_ENDPOINTS = [
  "https://s1.ripple.com:51234/",
  "https://s2.ripple.com:51234/",
];

const withTimeout = async (promiseFactory, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await promiseFactory(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

const fetchJsonRpc = async (payload) => {
  let lastErr = null;

  for (const endpoint of XRPL_RPC_ENDPOINTS) {
    try {
      const res = await withTimeout(
        (signal) =>
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal,
          }),
        15000
      );

      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        lastErr = new Error(`non_json_upstream (${res.status})`);
        continue;
      }

      const upstreamError = data?.error || data?.result?.error || null;
      if (upstreamError) {
        lastErr = new Error(String(upstreamError));
        // XRPLはエラーでも200返すので、次endpointへフォールバックしてみる
        continue;
      }

      return { ok: true, endpointUsed: endpoint, httpStatus: res.status, data };
    } catch (e) {
      lastErr = e;
      continue;
    }
  }

  return { ok: false, endpointUsed: null, error: String(lastErr?.message || lastErr) };
};

export async function onRequest(context) {
  const { request } = context;

  // CORS
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const startedAt = Date.now();
  const url = new URL(request.url);

  const currencyRaw = url.searchParams.get("currency") || "";
  const issuer = String(url.searchParams.get("issuer") || "").trim();
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 50)));

  const currencyResult = normalizeCurrencyInput(currencyRaw);
  const currency = currencyResult.error ? "" : currencyResult.currencyNormalized;

  if (!currency || !issuer) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: currencyResult.error ? `invalid_currency_${currencyResult.error.code}` : "missing_currency_or_issuer",
      }),
      { status: 400, headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }

  const tokenIssue = { currency, issuer };

  // bids: you sell TOKEN, receive XRP  (this is what "sell impact" needs)
  const payloadBids = {
    method: "book_offers",
    params: [{
      taker_gets: { currency: "XRP" },
      taker_pays: tokenIssue,
      limit,
    }],
  };

  // asks: you buy TOKEN with XRP (useful for diagnostics)
  const payloadAsks = {
    method: "book_offers",
    params: [{
      taker_gets: tokenIssue,
      taker_pays: { currency: "XRP" },
      limit,
    }],
  };

  const [bidsRes, asksRes] = await Promise.all([
    fetchJsonRpc(payloadBids),
    fetchJsonRpc(payloadAsks),
  ]);

  // choose endpointUsed for display
  const endpointUsed = bidsRes.endpointUsed || asksRes.endpointUsed || null;

  const bidsOffers = bidsRes.ok ? (bidsRes.data?.result?.offers || []) : [];
  const asksOffers = asksRes.ok ? (asksRes.data?.result?.offers || []) : [];

  const error =
    bidsRes.ok && asksRes.ok
      ? null
      : { bids: bidsRes.ok ? null : bidsRes.error, asks: asksRes.ok ? null : asksRes.error };

  // IMPORTANT:
  // keep backward-compat: frontend expects "offers" array
  // we map offers = bids (sell-side liquidity)
  return new Response(
    JSON.stringify({
      ok: !error,
      endpointUsed,
      elapsedMs: Date.now() - startedAt,

      currencyInput: currencyRaw,
      currencyNormalized: currency,

      bidsCount: Array.isArray(bidsOffers) ? bidsOffers.length : 0,
      asksCount: Array.isArray(asksOffers) ? asksOffers.length : 0,

      offersCount: Array.isArray(bidsOffers) ? bidsOffers.length : 0,
      offers: Array.isArray(bidsOffers) ? bidsOffers : [],

      bids: Array.isArray(bidsOffers) ? bidsOffers : [],
      asks: Array.isArray(asksOffers) ? asksOffers : [],

      error,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    }
  );
}
