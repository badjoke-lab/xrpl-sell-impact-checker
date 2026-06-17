const ERROR_CONTRACT = "xsic.error.v1";

function requestIdFrom(request) {
  const value = request && request.headers ? request.headers.get("x-request-id") || request.headers.get("cf-ray") : "";
  return value || `xsic-${Date.now()}`;
}

function errorPayload(options = {}) {
  return {
    ok: false,
    error: {
      code: options.code || "internal_error",
      message: options.message || "The request could not be completed.",
      field: options.field || null,
      details: options.details || null,
      retryable: Boolean(options.retryable),
    },
    meta: {
      contract: ERROR_CONTRACT,
      requestId: options.requestId || null,
      source: options.source || "xsic-api",
      observedAt: new Date().toISOString(),
    },
  };
}

function errorResponse(options = {}) {
  const status = Number.isInteger(options.status) ? options.status : 400;
  return new Response(JSON.stringify(errorPayload(options)), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

module.exports = { ERROR_CONTRACT, requestIdFrom, errorPayload, errorResponse };
