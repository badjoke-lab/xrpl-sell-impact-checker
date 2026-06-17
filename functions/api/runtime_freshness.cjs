const DEFAULT_FRESH_FOR_MS = 30_000;
const DEFAULT_STALE_AFTER_MS = 120_000;

function ageMs(observedAt, nowMs = Date.now()) {
  const parsed = Date.parse(observedAt || "");
  return Number.isFinite(parsed) ? Math.max(0, nowMs - parsed) : null;
}

function classifyFreshness(options = {}) {
  const checkedAt = options.checkedAt || new Date().toISOString();
  const observedAt = options.observedAt || null;
  const lastSuccessAt = options.lastSuccessAt || (options.ok ? observedAt : null);
  const freshForMs = Number.isFinite(options.freshForMs) ? options.freshForMs : DEFAULT_FRESH_FOR_MS;
  const staleAfterMs = Number.isFinite(options.staleAfterMs) ? options.staleAfterMs : DEFAULT_STALE_AFTER_MS;
  const age = ageMs(observedAt, Date.parse(checkedAt));
  const missing = Boolean(options.missing || !observedAt);
  const partial = Boolean(options.partial);
  const forcedStale = Boolean(options.isStale);
  let status = "fresh";
  if (missing) status = "missing";
  else if (partial) status = "partial";
  else if (!options.ok) status = "degraded";
  else if (forcedStale || age === null || age > staleAfterMs) status = "stale";
  else if (age > freshForMs) status = "aging";

  return {
    status,
    checkedAt,
    observedAt,
    lastSuccessAt,
    ageMs: age,
    freshForMs,
    staleAfterMs,
    isStale: status === "stale",
    partial,
    missing,
  };
}

module.exports = {
  DEFAULT_FRESH_FOR_MS,
  DEFAULT_STALE_AFTER_MS,
  ageMs,
  classifyFreshness,
};
