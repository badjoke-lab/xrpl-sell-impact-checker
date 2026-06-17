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

function validateEnum(value, options = {}) {
  const field = options.field || "value";
  const allowed = Array.isArray(options.allowed) ? options.allowed : [];
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return options.required === false ? { ok: true, value: options.defaultValue } : invalid("missing_parameter", field, `${field} is required`);
  if (!allowed.includes(raw)) return invalid(`invalid_${field}`, field, `${field} must be one of: ${allowed.join(", ")}`, { allowed });
  return { ok: true, value: raw };
}

function validateWindow(value, options = {}) {
  return validateEnum(value, { field: "window", allowed: ["1h", "6h", "24h", "7d"], ...options });
}

function validatePreset(value, options = {}) {
  return validateEnum(value, { field: "preset", allowed: ["exchanges", "whales", "ripple"], ...options });
}

function validateIdentifier(value, options = {}) {
  const field = options.field || "id";
  const maxLength = Number.isInteger(options.maxLength) ? options.maxLength : 256;
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return options.required === false ? { ok: true, value: "" } : invalid("missing_parameter", field, `${field} is required`);
  if (raw.length > maxLength) return invalid("invalid_identifier", field, `${field} is too long`);
  return { ok: true, value: raw };
}

function validatePair(value) {
  const raw = String(value == null ? "" : value).trim();
  const parts = raw.split("|");
  if (parts.length !== 2) return invalid("invalid_pair", "pair", "pair must use currency|issuer format");
  const currency = validateCurrency(parts[0]);
  if (!currency.ok) return invalid(currency.code, "pair", currency.message);
  const issuer = validateIssuer(parts[1]);
  if (!issuer.ok) return invalid(issuer.code, "pair", issuer.message);
  return { ok: true, value: `${currency.value}|${issuer.value}`, currency: currency.value, issuer: issuer.value };
}

async function readInput(request) {
  const input = Object.fromEntries(new URL(request.url).searchParams.entries());
  if (["POST", "PUT", "PATCH"].includes(request.method)) {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) return { ok: false, status: 415, error: invalid("unsupported_media_type", "content-type", "Request body must use application/json") };
    let body;
    try {
      body = await request.json();
    } catch {
      return { ok: false, status: 400, error: invalid("invalid_json", "body", "Request body is not valid JSON") };
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: 400, error: invalid("invalid_json_object", "body", "Request body must be a JSON object") };
    Object.assign(input, body);
  }
  return { ok: true, input };
}

function firstValidationError(results) {
  return results.find((result) => result && !result.ok) || null;
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
  validateWindow,
  validatePreset,
  validateIdentifier,
  validatePair,
  readInput,
  firstValidationError,
};
