const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const DEFAULT_LIMIT = 50;

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(status, message, startTime) {
  return jsonResponse(status, {
    ok: false,
    endpointUsed: null,
    elapsedMs: Date.now() - startTime,
    offersCount: 0,
    offers: [],
    error: message,
  });
}

export async function onRequest({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const startTime = Date.now();
  const url = new URL(request.url);
  const currency = url.searchParams.get("currency");
  const issuer = url.searchParams.get("issuer");
  const limitParam = url.searchParams.get("limit");

  if (!currency) {
    return errorResponse(400, "currency is required", startTime);
  }

  if (!issuer) {
    return errorResponse(400, "issuer is required", startTime);
  }

  let limit = DEFAULT_LIMIT;
  if (limitParam !== null) {
    limit = Number(limitParam);
    if (!Number.isInteger(limit) || limit <= 0) {
      return errorResponse(400, "limit must be a positive integer", startTime);
    }
  }

  const xrplPayload = {
    method: "book_offers",
    params: [
      {
        taker_gets: "XRP",
        taker_pays: { currency, issuer },
        limit,
      },
    ],
  };

  let proxyResponse;
  try {
    const proxyUrl = new URL("/api/xrpl", request.url);
    proxyResponse = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(xrplPayload),
    });
  } catch (error) {
    return jsonResponse(502, {
      ok: false,
      endpointUsed: null,
      elapsedMs: Date.now() - startTime,
      offersCount: 0,
      offers: [],
      error:
        error instanceof Error ? error.message : "Unable to reach /api/xrpl",
    });
  }

  let proxyJson;
  try {
    proxyJson = await proxyResponse.json();
  } catch (error) {
    return jsonResponse(502, {
      ok: false,
      endpointUsed: null,
      elapsedMs: Date.now() - startTime,
      offersCount: 0,
      offers: [],
      error: error instanceof Error ? error.message : "Invalid proxy response",
    });
  }

  if (!proxyResponse.ok || !proxyJson?.ok) {
    return jsonResponse(proxyResponse.status || 502, {
      ok: false,
      endpointUsed: proxyJson?.endpointUsed ?? null,
      elapsedMs: Date.now() - startTime,
      offersCount: 0,
      offers: [],
      error: proxyJson?.error?.message ?? "XRPL proxy error",
    });
  }

  const offers =
    proxyJson?.result?.result?.offers ?? proxyJson?.result?.offers ?? [];

  return jsonResponse(200, {
    ok: true,
    endpointUsed: proxyJson.endpointUsed ?? null,
    elapsedMs: Date.now() - startTime,
    offersCount: Array.isArray(offers) ? offers.length : 0,
    offers: Array.isArray(offers) ? offers : [],
    error: null,
  });
}
