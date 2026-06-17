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

function invalid(code, field, message, details = null) {
  return { ok: false, code, field, message, details };
}

function validateCurrency(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return invalid("missing_parameter", "currency", "currency is required");
  if (raw.toUpperCase() === "XRP") return invalid("xrp_not_supported", "currency", "Provide an issued token currency, not XRP.");
  if (raw.length > 40) return invalid("invalid_currency", "currency", "currency is too long");
  return { ok: true, value: raw };
}

function validateIssuer(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return invalid("missing_parameter", "issuer", "issuer is required");
  if (!raw.startsWith("r") || raw.length < 25 || raw.length > 35) return invalid("invalid_issuer", "issuer", "issuer must be an XRPL classic account address");
  return { ok: true, value: raw };
}

function validateAmount(value, options = {}) {
  const field = options.field || "amount";
  const required = options.required !== false;
  const max = Number.isFinite(options.max) ? options.max : 1e30;
  if ((value == null || value === "") && !required) return { ok: true, value: null };
  if (value == null || value === "") return invalid("missing_parameter", field, `${field} is required`);
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > max) return invalid("invalid_amount", field, `${field} must be a finite positive number no greater than ${max}`);
  return { ok: true, value: numeric };
}

function validateInteger(value, options = {}) {
  const field = options.field || "value";
  const min = Number.isInteger(options.min) ? options.min : 1;
  const max = Number.isInteger(options.max) ? options.max : 200;
  if (value == null || value === "") return { ok: true, value: options.defaultValue };
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) return invalid("invalid_integer", field, `${field} must be an integer between ${min} and ${max}`);
  return { ok: true, value: numeric };
}

module.exports = {
  ERROR_CONTRACT,
  requestIdFrom,
  errorPayload,
  errorResponse,
  validateCurrency,
  validateIssuer,
  validateAmount,
  validateInteger,
};
