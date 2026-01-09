const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const XRPL_ENDPOINTS = [
  "https://s1.ripple.com:51234/",
  "https://s2.ripple.com:51234/",
];
const TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 25 * 1024;
const ALLOWED_METHODS = new Set(["server_info", "book_offers"]);

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function errorPayload(base, message, details = null) {
  return {
    ok: false,
    endpointUsed: null,
    httpStatus: null,
    elapsedMs: base.elapsedMs,
    result: null,
    error: {
      message,
      details,
    },
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequest({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const startTime = Date.now();
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(400, errorPayload({ elapsedMs: 0 }, "Content-Type must be application/json"));
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength && contentLength > MAX_BODY_BYTES) {
    return jsonResponse(413, errorPayload({ elapsedMs: 0 }, "Request body too large"));
  }

  let bodyText = "";
  try {
    bodyText = await request.text();
  } catch {
    return jsonResponse(400, errorPayload({ elapsedMs: 0 }, "Unable to read request body"));
  }

  if (bodyText.length > MAX_BODY_BYTES) {
    return jsonResponse(413, errorPayload({ elapsedMs: 0 }, "Request body too large"));
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return jsonResponse(400, errorPayload({ elapsedMs: 0 }, "Invalid JSON body"));
  }

  const rpcMethod = payload?.method;
  if (!rpcMethod || !ALLOWED_METHODS.has(rpcMethod)) {
    return jsonResponse(
      400,
      errorPayload({ elapsedMs: 0 }, "Method not allowed", {
        allowed: Array.from(ALLOWED_METHODS),
        received: rpcMethod ?? null,
      })
    );
  }

  const failures = [];
  for (const endpoint of XRPL_ENDPOINTS) {
    let response;
    try {
      response = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        TIMEOUT_MS
      );
    } catch (error) {
      failures.push({
        endpoint,
        error: error instanceof Error ? error.message : "Fetch failed",
      });
      continue;
    }

    const elapsedMs = Date.now() - startTime;
    if (!response.ok) {
      failures.push({
        endpoint,
        httpStatus: response.status,
      });
      continue;
    }

    let resultJson;
    try {
      resultJson = await response.json();
    } catch (error) {
      failures.push({
        endpoint,
        httpStatus: response.status,
        error: error instanceof Error ? error.message : "Invalid JSON response",
      });
      continue;
    }

    return jsonResponse(response.status, {
      ok: true,
      endpointUsed: endpoint,
      httpStatus: response.status,
      elapsedMs,
      result: resultJson,
      error: null,
    });
  }

  return jsonResponse(
    502,
    errorPayload(
      { elapsedMs: Date.now() - startTime },
      "Upstream XRPL RPC unreachable",
      { failures }
    )
  );
}
