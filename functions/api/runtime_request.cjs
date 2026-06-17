const activeRequests = new Map();

function normalizeField(key, value) {
  const raw = String(value == null ? "" : value).trim();
  if (key === "currency") return raw.toUpperCase();
  if (key === "mode" || key === "window" || key === "preset") return raw.toLowerCase();
  if (key === "amount") {
    const number = Number(raw);
    return Number.isFinite(number) ? number.toString() : raw;
  }
  return raw;
}

function canonicalRequestKey(request) {
  const url = new URL(request.url);
  const entries = [...url.searchParams.entries()].map(([key, value]) => [key, normalizeField(key, value)]);
  entries.sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue));
  url.search = new URLSearchParams(entries).toString();
  return `${request.method.toUpperCase()}|${url.origin}|${url.pathname}|${url.search}`;
}

function stableObjectKey(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableObjectKey).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableObjectKey(value[key])}`).join(",")}}`;
}

async function shareRequest(key, factory) {
  if (activeRequests.has(key)) return activeRequests.get(key);
  const promise = Promise.resolve().then(factory);
  activeRequests.set(key, promise);
  try {
    return await promise;
  } finally {
    if (activeRequests.get(key) === promise) activeRequests.delete(key);
  }
}

module.exports = { normalizeField, canonicalRequestKey, stableObjectKey, shareRequest };
