const XRPL_ENDPOINTS = [
  "https://xrplcluster.com/",
  "https://s1.ripple.com:51234/",
  "https://s2.ripple.com:51234/",
];

const UPSTREAM_TIMEOUT_MS = 4000;

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function fetchRpcHealth(endpoint) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "server_info", params: [{}] }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    const info = parsed?.result?.info ?? null;
    const complete = Boolean(
      response.ok &&
        info &&
        typeof info.server_state === "string" &&
        typeof info.validated_ledger?.seq === "number"
    );

    return {
      endpoint,
      httpStatus: response.status,
      latencyMs,
      complete,
      hasResult: Boolean(parsed?.result),
      isJson: Boolean(parsed),
    };
  } catch (error) {
    return {
      endpoint,
      httpStatus: 0,
      latencyMs: Date.now() - startedAt,
      complete: false,
      hasResult: false,
      isJson: false,
      error: error instanceof Error ? error.message : "fetch_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function onRequestGet() {
  const checkedAt = new Date().toISOString();

  try {
    let sawPartial = false;
    const attempts = [];

    for (const endpoint of XRPL_ENDPOINTS) {
      const attempt = await fetchRpcHealth(endpoint);
      attempts.push({
        endpoint: attempt.endpoint,
        http_status: attempt.httpStatus,
        latency_ms: attempt.latencyMs,
        error: attempt.error || null,
      });

      if (attempt.complete) {
        return jsonResponse({
          status: "ok",
          checked_at: checkedAt,
          details: {
            endpoint: attempt.endpoint,
            latency_ms: attempt.latencyMs,
            http_status: attempt.httpStatus,
          },
        });
      }

      if (attempt.httpStatus > 0 && (attempt.hasResult || attempt.isJson)) {
        sawPartial = true;
      }
    }

    return jsonResponse({
      status: sawPartial ? "stale" : "down",
      checked_at: checkedAt,
      details: {
        reason: sawPartial ? "partial_upstream_response" : "upstream_unreachable",
        timeout_ms: UPSTREAM_TIMEOUT_MS,
        attempts,
      },
    });
  } catch {
    return jsonResponse({
      status: "down",
      checked_at: checkedAt,
      details: {
        reason: "health_check_failed",
        timeout_ms: UPSTREAM_TIMEOUT_MS,
      },
    });
  }
}
