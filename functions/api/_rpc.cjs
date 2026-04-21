const RPC_ENDPOINTS = [
  "https://xrplcluster.com/",
  "https://s1.ripple.com:51234/",
  "https://s2.ripple.com:51234/",
];

const CACHE_TTL_SECONDS = 30;

function isHex40(v) {
  return typeof v === "string" && /^[0-9A-Fa-f]{40}$/.test(v.trim());
}
function toHex40FromAscii(code) {
  const raw = String(code || "").trim();
  if (!raw) return "";
  if (isHex40(raw)) return raw.toUpperCase();
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
function normalizeIssuerInput(input) {
  return String(input || "").trim();
}
function buildPairKey({ currencyNormalized, issuer }) {
  const currency = String(currencyNormalized || "").trim().toUpperCase();
  const normalizedIssuer = normalizeIssuerInput(issuer);
  if (!currency || !normalizedIssuer) return "";
  return `${currency}|${normalizedIssuer}`;
}
function nowIso() {
  return new Date().toISOString();
}
function isoAgeMs(isoString) {
  if (!isoString) return null;
  const parsed = Date.parse(isoString);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Date.now() - parsed);
}
function buildFreshnessMeta({ observedAt, cacheTtlSeconds = CACHE_TTL_SECONDS, isStale = false, source = "runtime" } = {}) {
  return {
    observedAt: observedAt || null,
    ageMs: isoAgeMs(observedAt),
    cacheTtlSeconds,
    source,
    isStale: Boolean(isStale),
  };
}
function jsonResponse(obj, { status = 200, cacheSeconds = 0 } = {}) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  };
  headers["cache-control"] = cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store";
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
    return { ok: res.ok, status: res.status, elapsedMs: Math.round(performance.now() - start), json };
  } catch (e) {
    return { ok: false, status: 0, elapsedMs: Math.round(performance.now() - start), error: e?.message || "fetch_failed" };
  } finally {
    clearTimeout(t);
  }
}
async function hedgedRpcCall(payload, { timeoutMs = 6000, staggerMs = 700 } = {}) {
  const attempts = [];
  let settled = false;
  const runners = RPC_ENDPOINTS.map((endpoint, idx) => {
    const delay = idx * staggerMs;
    return new Promise((resolve) => {
      setTimeout(async () => {
        if (settled) return resolve(null);
        const result = await fetchJsonWithTimeout(endpoint, payload, timeoutMs);
        attempts.push({ endpoint, ok: !!result.ok, status: result.status, elapsedMs: result.elapsedMs, error: result.error || null });
        const hasRpcShape = result?.json && (result.json.result || result.json.error);
        if (!settled && (result.ok || hasRpcShape)) {
          settled = true;
          return resolve({ endpointUsed: endpoint, result });
        }
        return resolve(null);
      }, delay);
    });
  });
  const winner = await Promise.race(runners);
  if (winner && winner.result) return { endpointUsed: winner.endpointUsed, result: winner.result, attempts };
  const all = (await Promise.all(runners)).filter(Boolean);
  const fallback = all.find((x) => x?.result?.ok) || all[0] || null;
  if (fallback) return { endpointUsed: fallback.endpointUsed, result: fallback.result, attempts };
  return { endpointUsed: "", result: { ok: false, status: 0, elapsedMs: 0, error: "all_failed", json: null }, attempts };
}
function buildCacheKeyRequest(request) {
  const url = new URL(request.url);
  const sortedParams = [...url.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) => {
    const keyDiff = aKey.localeCompare(bKey);
    if (keyDiff !== 0) return keyDiff;
    return aValue.localeCompare(bValue);
  });
  url.search = new URLSearchParams(sortedParams).toString();
  return new Request(url.toString(), { method: request.method });
}
async function cacheGet(request, { markStale = false } = {}) {
  try {
    if (request.method !== "GET") return null;
    const hit = await caches.default.match(buildCacheKeyRequest(request));
    if (!hit) return null;
    if (!markStale) return hit;
    const payload = await hit.json().catch(() => null);
    if (!payload || typeof payload !== "object") return null;
    return jsonResponse({
      ...payload,
      cached: true,
      isStale: true,
      staleReason: payload.staleReason || "upstream_refresh_failed",
      freshness: buildFreshnessMeta({
        observedAt: payload.observedAt || payload.freshness?.observedAt || null,
        cacheTtlSeconds: payload.freshness?.cacheTtlSeconds || CACHE_TTL_SECONDS,
        isStale: true,
        source: payload.freshness?.source || "cache-api",
      }),
    }, { status: 200, cacheSeconds: CACHE_TTL_SECONDS });
  } catch {
    return null;
  }
}
async function cachePut(request, body) {
  try {
    if (request.method !== "GET") return;
    const observedAt = body?.observedAt || nowIso();
    const cachedBody = {
      ...body,
      observedAt,
      cached: true,
      isStale: false,
      freshness: buildFreshnessMeta({ observedAt, cacheTtlSeconds: CACHE_TTL_SECONDS, isStale: false, source: "cache-api" }),
    };
    await caches.default.put(
      buildCacheKeyRequest(request),
      jsonResponse(cachedBody, { status: 200, cacheSeconds: CACHE_TTL_SECONDS })
    );
  } catch {}
}
module.exports = {
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
};
