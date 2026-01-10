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

const normalizeCurrency = (cur) => {
  const c = String(cur || "").toUpperCase().trim();
  if (!c) return "";
  if (/^[0-9A-F]{40}$/.test(c)) return c;
  if (c.length === 3) return c;
  const bytes = new TextEncoder().encode(c);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return (hex + "00".repeat(40)).slice(0, 40);
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

      // NOTE: amm_info can return error even on 200.
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
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }

  const startedAt = Date.now();

  let currencyRaw = "";
  let issuer = "";

  if (request.method === "GET") {
    const url = new URL(request.url);
    currencyRaw = url.searchParams.get("currency") || "";
    issuer = String(url.searchParams.get("issuer") || "").trim();
  } else if (request.method === "POST") {
    let body = null;
    try { body = await request.json(); } catch {}
    currencyRaw = String(body?.currency || "");
    issuer = String(body?.issuer || "").trim();
  } else {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const currency = normalizeCurrency(currencyRaw);

  if (!currency || !issuer) {
    return new Response(JSON.stringify({ ok: false, error: "missing_currency_or_issuer" }), {
      status: 400,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const payload = {
    method: "amm_info",
    params: [{
      asset: { currency, issuer },
      asset2: { currency: "XRP" },
    }],
  };

  const res = await fetchJsonRpc(payload);

  const upstreamError = res.ok ? (res.data?.error || res.data?.result?.error || null) : res.error;
  const amm = res.ok ? (res.data?.result?.amm ?? null) : null;

  return new Response(
    JSON.stringify({
      ok: !upstreamError && !!amm,
      endpointUsed: res.endpointUsed,
      elapsedMs: Date.now() - startedAt,

      currencyInput: currencyRaw,
      currencyNormalized: currency,

      amm,
      error: upstreamError,
      raw: res.ok ? res.data : null,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    }
  );
}
