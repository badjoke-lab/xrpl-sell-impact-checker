const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_RETRIES = 1;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function acceptsJson(contentType) {
  const value = String(contentType || "").toLowerCase();
  return value.includes("application/json") || value.includes("application/json-rpc") || value.includes("text/json");
}

async function readLimitedText(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, error: "response_too_large", bytes: declared };
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    return bytes > maxBytes ? { ok: false, error: "response_too_large", bytes } : { ok: true, text, bytes };
  }

  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, error: "response_too_large", bytes };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text, bytes };
  } finally {
    reader.releaseLock();
  }
}

function retryable(result) {
  return result.error === "timeout" || result.error === "fetch_failed" || result.status === 429 || result.status >= 500;
}

async function fetchJsonOnce(url, payload, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const maxBytes = Number.isFinite(options.maxResponseBytes) ? options.maxResponseBytes : DEFAULT_MAX_RESPONSE_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    if (!acceptsJson(contentType)) {
      await response.body?.cancel?.().catch(() => {});
      return { ok: false, status: response.status, elapsedMs: Math.round(performance.now() - started), contentType, bytes: 0, error: "unexpected_content_type", json: null };
    }

    const body = await readLimitedText(response, maxBytes);
    if (!body.ok) {
      return { ok: false, status: response.status, elapsedMs: Math.round(performance.now() - started), contentType, bytes: body.bytes, error: body.error, json: null };
    }

    try {
      const json = JSON.parse(body.text);
      return { ok: response.ok, status: response.status, elapsedMs: Math.round(performance.now() - started), contentType, bytes: body.bytes, error: response.ok ? null : `http_${response.status}`, json };
    } catch {
      return { ok: false, status: response.status, elapsedMs: Math.round(performance.now() - started), contentType, bytes: body.bytes, error: "invalid_json", json: null };
    }
  } catch (error) {
    const timedOut = error?.name === "AbortError" || controller.signal.aborted;
    return { ok: false, status: 0, elapsedMs: Math.round(performance.now() - started), contentType: "", bytes: 0, error: timedOut ? "timeout" : "fetch_failed", json: null };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithRetry(url, payload, options = {}) {
  const retries = Number.isInteger(options.retries) ? Math.max(0, options.retries) : DEFAULT_RETRIES;
  let result;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    result = await fetchJsonOnce(url, payload, options);
    result.retryCount = attempt;
    const hasRpcShape = result.json && (result.json.result || result.json.error);
    if (result.ok || hasRpcShape || !retryable(result) || attempt === retries) return result;
    await delay(150 * (attempt + 1));
  }
  return result;
}

module.exports = {
  delay,
  fetchJsonWithRetry,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_RETRIES,
};
