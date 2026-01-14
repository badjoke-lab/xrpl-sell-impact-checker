const RPC_ENDPOINTS = [
  "https://xrplcluster.com/",
  "https://s1.ripple.com:51234/",
  "https://s2.ripple.com:51234/",
];

// --- currency normalize: "SOLO" -> 40hex(ASCII + zero pad) ---
function isHex40(v) {
  return typeof v === "string" && /^[0-9A-Fa-f]{40}$/.test(v.trim());
}
function toHex40FromAscii(code) {
  const raw = String(code || "").trim();
  if (!raw) return "";
  if (isHex40(raw)) return raw.toUpperCase();
  // XRPL: 3-char codes can stay as 3 chars. 4+ should be 160-bit hex.
  if (/^[A-Za-z0-9]{3}$/.test(raw)) return raw.toUpperCase();
  const bytes = Buffer.from(raw, "utf8");
  const out = Buffer.alloc(20);
  bytes.copy(out, 0, 0, Math.min(bytes.length, 20));
  return out.toString("hex").toUpperCase();
}
function normalizeCurrencyInput(input) {
  const raw = String(input || "").trim();
  if (!raw) return { currencyInput: "", currencyNormalized: "" };
  const normalized = toHex40FromAscii(raw);
  return { currencyInput: raw.toUpperCase(), currencyNormalized: normalized };
}

// --- tiny helpers ---
function jsonResponse(obj, { status = 200, cacheSeconds = 0 } = {}) {
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (cacheSeconds > 0) {
    headers["cache-control"] = `public, max-age=${cacheSeconds}`;
  } else {
    headers["cache-control"] = "no-store";
  }
  return new Response(JSON.stringify(obj), { status, headers });
}

async function fetchJsonWithTimeout(url, payload, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { _invalid_json: true, _raw: text.slice(0, 200) };
    }
    return {
      ok: res.ok,
      status: res.status,
      elapsedMs: Math.round(performance.now() - start),
      json,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      elapsedMs: Math.round(performance.now() - start),
      error: e?.message || "fetch_failed",
    };
  } finally {
    clearTimeout(t);
  }
}

// stagger parallel (happy eyeballs)
async function hedgedRpcCall(payload, { timeoutMs = 6000, staggerMs = 700 } = {}) {
  const attempts = [];
  let settled = false;

  const controllers = [];
  const runners = RPC_ENDPOINTS.map((endpoint, idx) => {
    const delay = idx * staggerMs;
    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        if (settled) return resolve(null);
        const result = await fetchJsonWithTimeout(endpoint, payload, timeoutMs);
        attempts.push({
          endpoint,
          ok: !!result.ok,
          status: result.status,
          elapsedMs: result.elapsedMs,
          error: result.error || null,
        });
        // We accept first network success (HTTP ok) OR first JSON with result/error (even if HTTP 200 w/ rpc error)
        const hasRpcShape = result?.json && (result.json.result || result.json.error);
        if (!settled && (result.ok || hasRpcShape)) {
          settled = true;
          // nothing to abort here because each attempt has its own timeout; we just stop accepting later ones
          return resolve({ endpointUsed: endpoint, result });
        }
        return resolve(null);
      }, delay);
      controllers.push({ timer });
    });
  });

  const winner = await Promise.race(runners);
  if (winner && winner.result) {
    return { endpointUsed: winner.endpointUsed, result: winner.result, attempts };
  }

  // If no winner in race (very rare), wait all and pick first ok
  const all = (await Promise.all(runners)).filter(Boolean);
  const fallback = all.find((x) => x?.result?.ok) || all[0] || null;
  if (fallback) {
    return { endpointUsed: fallback.endpointUsed, result: fallback.result, attempts };
  }
  return { endpointUsed: "", result: { ok: false, status: 0, elapsedMs: 0, error: "all_failed", json: null }, attempts };
}

// Cache API helpers (GET only, keyed by full URL)
async function cacheGet(request) {
  try {
    if (request.method !== "GET") return null;
    const cache = caches.default;
    const hit = await cache.match(request);
    return hit || null;
  } catch {
    return null;
  }
}
async function cachePut(request, response) {
  try {
    if (request.method !== "GET") return;
    const cache = caches.default;
    await cache.put(request, response.clone());
  } catch {}
}

module.exports = {
  normalizeCurrencyInput,
  hedgedRpcCall,
  jsonResponse,
  cacheGet,
  cachePut,
};
