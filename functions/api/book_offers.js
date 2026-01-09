const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_BODY_BYTES = 10 * 1024;
const MAX_LIMIT = 200;
const XRPL_RPC_DEFAULT = "https://s1.ripple.com:51234/";
const CACHE_TTL_MS = 10 * 1000;
const CACHE_MAX_ENTRIES = 200;
const RATE_LIMIT_WINDOW_MS = 10 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const ISSUER_REGEX = /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/;
const CURRENCY_REGEX = /^[A-Z0-9]{3}$|^[A-F0-9]{40}$/;

const cacheStore = new Map();
const rateLimitStore = new Map();

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(status, message) {
  return jsonResponse(status, { error: message });
}

function getUpstreamUrl(env) {
  return env?.XRPL_RPC_URL || XRPL_RPC_DEFAULT;
}

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function pruneCache(now) {
  for (const [key, value] of cacheStore.entries()) {
    if (value.expiresAt <= now) {
      cacheStore.delete(key);
    }
  }
  if (cacheStore.size <= CACHE_MAX_ENTRIES) {
    return;
  }
  const keysToDelete = cacheStore.size - CACHE_MAX_ENTRIES;
  let deleted = 0;
  for (const key of cacheStore.keys()) {
    cacheStore.delete(key);
    deleted += 1;
    if (deleted >= keysToDelete) {
      break;
    }
  }
}

function isRateLimited(ip, now) {
  const entry = rateLimitStore.get(ip);
  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  rateLimitStore.set(ip, entry);
  return false;
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return errorResponse(400, "Content-Type must be application/json");
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength && contentLength > MAX_BODY_BYTES) {
    return errorResponse(413, "Request body too large");
  }

  let bodyText = "";
  try {
    bodyText = await request.text();
  } catch {
    return errorResponse(400, "Unable to read request body");
  }

  if (bodyText.length > MAX_BODY_BYTES) {
    return errorResponse(413, "Request body too large");
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const { currency, issuer, limit } = payload ?? {};

  if (!currency || !issuer) {
    return errorResponse(400, "currency and issuer are required");
  }

  if (!CURRENCY_REGEX.test(currency)) {
    return errorResponse(400, "Invalid currency format");
  }

  if (!ISSUER_REGEX.test(issuer)) {
    return errorResponse(400, "Invalid issuer format");
  }

  const normalizedLimit = Number(limit ?? 50);
  if (!Number.isInteger(normalizedLimit) || normalizedLimit <= 0) {
    return errorResponse(400, "limit must be a positive integer");
  }

  if (normalizedLimit > MAX_LIMIT) {
    return errorResponse(400, `limit must be <= ${MAX_LIMIT}`);
  }

  const now = Date.now();
  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp, now)) {
    return errorResponse(429, "Too many requests. Please slow down and try again.");
  }

  const cacheKey = `${currency}:${issuer}:${normalizedLimit}`;
  const cached = cacheStore.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return jsonResponse(cached.status, cached.body);
  }

  pruneCache(now);

  const upstreamPayload = {
    method: "book_offers",
    params: [
      {
        taker_gets: { currency, issuer },
        taker_pays: { currency: "XRP" },
        limit: normalizedLimit,
      },
    ],
  };

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(getUpstreamUrl(env), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(upstreamPayload),
    });
  } catch {
    return errorResponse(502, "Upstream XRPL RPC unreachable");
  }

  let upstreamJson;
  try {
    upstreamJson = await upstreamResponse.json();
  } catch {
    return errorResponse(502, "Invalid response from upstream XRPL RPC");
  }

  cacheStore.set(cacheKey, {
    status: upstreamResponse.status,
    body: upstreamJson,
    expiresAt: now + CACHE_TTL_MS,
  });

  return jsonResponse(upstreamResponse.status, upstreamJson);
}
