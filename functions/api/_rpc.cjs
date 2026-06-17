const {
  delay,
  fetchJsonWithRetry,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_RETRIES,
} = require("./_upstream.cjs");

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
  return { currencyInput: raw.toUpperCase(), currencyNormalized: toHex40FromAscii(raw) };
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
  return { observedAt: observedAt || null, ageMs: isoAgeMs(observedAt), cacheTtlSeconds, source, isStale: Boolean(isStale) };
}
function buildResponseState({ ok = false, isStale = false, partial = false } = {}) {
  if (isStale) return "stale";
  if (partial) return "partial";
  return ok ? "fresh" : "degraded";
}
function jsonResponse(obj, { status = 200, cacheSeconds = 0 } = {}) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
  };
  return new Response(JSON.stringify(obj), { status, headers });
}

async function hedgedRpcCall(payload, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const staggerMs = Number.isFinite(options.staggerMs) ? options.staggerMs : 700;
  const maxResponseBytes = Number.isFinite(options.maxResponseBytes) ? options.maxResponseBytes : DEFAULT_MAX_RESPONSE_BYTES;
  const retries = Number.isInteger(options.retries) ? options.retries : DEFAULT_RETRIES;
  const attempts = [];

  const runners = RPC_ENDPOINTS.map(async (endpoint, index) => {
    if (index > 0) await delay(index * staggerMs);
    const result = await fetchJsonWithRetry(endpoint, payload, { timeoutMs, maxResponseBytes, retries });
    attempts.push({
      endpoint,
      ok: Boolean(result.ok),
      status: result.status,
      elapsedMs: result.elapsedMs,
      contentType: result.contentType || "",
      bytes: result.bytes || 0,
      retryCount: result.retryCount || 0,
      error: result.error || null,
    });
    const hasRpcShape = result.json && (result.json.result || result.json.error);
    if (result.ok || hasRpcShape) return { endpointUsed: endpoint, result };
    throw new Error(result.error || "upstream_failed");
  });

  try {
    const winner = await Promise.any(runners);
    return { endpointUsed: winner.endpointUsed, result: winner.result, attempts };
  } catch {
    await Promise.allSettled(runners);
    return { endpointUsed: "", result: { ok: false, status: 0, elapsedMs: 0, error: "all_failed", json: null }, attempts };
  }
}

function buildCacheKeyRequest(request) {
  const url = new URL(request.url);
  const sortedParams = [...url.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) => {
    const keyDiff = aKey.localeCompare(bKey);
    return keyDiff !== 0 ? keyDiff : aValue.localeCompare(bValue);
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
      partial: Boolean(payload.partial),
      state: "stale",
      sourceMode: "cache-fallback",
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
      partial: Boolean(body?.partial),
      state: buildResponseState({ ok: body?.ok, partial: body?.partial }),
      sourceMode: body?.sourceMode || "cache",
      freshness: buildFreshnessMeta({ observedAt, cacheTtlSeconds: CACHE_TTL_SECONDS, isStale: false, source: "cache-api" }),
    };
    await caches.default.put(buildCacheKeyRequest(request), jsonResponse(cachedBody, { status: 200, cacheSeconds: CACHE_TTL_SECONDS }));
  } catch {}
}

module.exports = {
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
};
