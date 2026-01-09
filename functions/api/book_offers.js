const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_BODY_BYTES = 10 * 1024;
const MAX_LIMIT = 200;
const XRPL_RPC_DEFAULT = "https://s1.ripple.com:51234/";
const XRPL_RPC_FALLBACK = "https://s2.ripple.com:51234/";
const CACHE_TTL_MS = 10 * 1000;
const CACHE_MAX_ENTRIES = 200;
const RATE_LIMIT_WINDOW_MS = 10 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const DEBUG_BODY_SNIPPET_LIMIT = 600;

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

function errorResponse(status, message, debug) {
  return jsonResponse(status, { error: message, debug });
}

function getUpstreamUrls(env) {
  const urls = [
    env?.XRPL_RPC_URL,
    env?.XRPL_RPC_URL_FALLBACK,
    XRPL_RPC_DEFAULT,
    XRPL_RPC_FALLBACK,
  ].filter(Boolean);
  return [...new Set(urls)];
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
    return errorResponse(400, "Invalid JSON body", {
      timestamp: new Date().toISOString(),
    });
  }

  const { currency, issuer, limit } = payload ?? {};
  const debug = {
    timestamp: new Date().toISOString(),
    input: {
      currency,
      issuer,
      limit,
    },
    upstream: null,
    upstreamBodySnippet: null,
    failures: [],
    durationMs: null,
  };

  if (!currency) {
    debug.validationError = "currency_required";
    return errorResponse(400, "currency is required", debug);
  }

  if (!CURRENCY_REGEX.test(currency)) {
    debug.validationError = "currency_invalid";
    return errorResponse(400, "Invalid currency format", debug);
  }

  const needsIssuer = currency !== "XRP";
  if (needsIssuer && !issuer) {
    debug.validationError = "issuer_required";
    return errorResponse(400, "issuer is required", debug);
  }

  if (issuer && !ISSUER_REGEX.test(issuer)) {
    debug.validationError = "issuer_invalid";
    return errorResponse(400, "Invalid issuer format", debug);
  }

  const normalizedLimit = Number(limit ?? 50);
  if (!Number.isInteger(normalizedLimit) || normalizedLimit <= 0) {
    debug.validationError = "limit_invalid";
    return errorResponse(400, "limit must be a positive integer", debug);
  }

  if (normalizedLimit > MAX_LIMIT) {
    debug.validationError = "limit_exceeded";
    return errorResponse(400, `limit must be <= ${MAX_LIMIT}`, debug);
  }
  debug.input.limit = normalizedLimit;

  const now = Date.now();
  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp, now)) {
    debug.validationError = "rate_limited";
    return errorResponse(
      429,
      "Too many requests. Please slow down and try again.",
      debug
    );
  }

  const cacheKey = `${currency}:${issuer}:${normalizedLimit}`;
  const cached = cacheStore.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    debug.durationMs = Date.now() - now;
    debug.upstream = cached.upstream ?? null;
    debug.cache = true;
    return jsonResponse(cached.status, { ...cached.body, debug });
  }

  pruneCache(now);

  const upstreamPayload = {
    method: "book_offers",
    params: [
      {
        taker_gets:
          currency === "XRP" ? { currency: "XRP" } : { currency, issuer },
        taker_pays: { currency: "XRP" },
        limit: normalizedLimit,
      },
    ],
  };

  const upstreamUrls = getUpstreamUrls(env);
  let upstreamResponse = null;
  let upstreamJson = null;
  let upstreamText = null;
  let selectedUpstream = null;

  for (const url of upstreamUrls) {
    try {
      upstreamResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upstreamPayload),
      });
    } catch (error) {
      debug.failures.push({
        url,
        error: error instanceof Error ? error.message : "Fetch failed",
      });
      upstreamResponse = null;
      continue;
    }

    if (!upstreamResponse.ok) {
      let snippet = null;
      try {
        upstreamText = await upstreamResponse.text();
        snippet = upstreamText.slice(0, DEBUG_BODY_SNIPPET_LIMIT);
      } catch {
        snippet = null;
      }
      debug.failures.push({
        url,
        status: upstreamResponse.status,
        bodySnippet: snippet,
      });
      upstreamResponse = null;
      continue;
    }

    try {
      upstreamText = await upstreamResponse.text();
      upstreamJson = JSON.parse(upstreamText);
      selectedUpstream = url;
      break;
    } catch (error) {
      debug.failures.push({
        url,
        status: upstreamResponse.status,
        error: error instanceof Error ? error.message : "Invalid JSON",
      });
      upstreamResponse = null;
      upstreamJson = null;
    }
  }

  if (!upstreamResponse || !selectedUpstream) {
    debug.durationMs = Date.now() - now;
    return errorResponse(502, "Upstream XRPL RPC unreachable", debug);
  }

  debug.upstream = {
    url: selectedUpstream,
    status: upstreamResponse.status,
  };
  debug.upstreamBodySnippet = upstreamText
    ? upstreamText.slice(0, DEBUG_BODY_SNIPPET_LIMIT)
    : null;
  debug.durationMs = Date.now() - now;

  cacheStore.set(cacheKey, {
    status: upstreamResponse.status,
    body: upstreamJson,
    upstream: debug.upstream,
    expiresAt: now + CACHE_TTL_MS,
  });

  return jsonResponse(upstreamResponse.status, { ...upstreamJson, debug });
}
