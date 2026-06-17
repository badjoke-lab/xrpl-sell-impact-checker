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

module.exports = { normalizeField, canonicalRequestKey };
