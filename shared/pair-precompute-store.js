export const PRECOMPUTE_WARN_AFTER_MS = 90 * 60 * 1000;
export const PRECOMPUTE_STALE_AFTER_MS = 150 * 60 * 1000;

function getBoundDb(env) {
  return env?.XSIC_DB || env?.DB || null;
}

function parseSummaryText(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseTimestampMs(value) {
  if (!value) return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

export function summarizePrecomputeFreshness(lastSuccessAt, now = Date.now()) {
  const tsMs = parseTimestampMs(lastSuccessAt);
  if (!tsMs) {
    return {
      state: 'missing',
      ageMs: null,
      warnAfterMs: PRECOMPUTE_WARN_AFTER_MS,
      staleAfterMs: PRECOMPUTE_STALE_AFTER_MS,
      isWarning: true,
      isStale: true,
    };
  }

  const ageMs = Math.max(0, Number(now) - tsMs);
  const state = ageMs >= PRECOMPUTE_STALE_AFTER_MS
    ? 'stale'
    : ageMs >= PRECOMPUTE_WARN_AFTER_MS
      ? 'aging'
      : 'fresh';

  return {
    state,
    ageMs,
    warnAfterMs: PRECOMPUTE_WARN_AFTER_MS,
    staleAfterMs: PRECOMPUTE_STALE_AFTER_MS,
    isWarning: state !== 'fresh',
    isStale: state === 'stale',
  };
}

function withFreshness(row) {
  if (!row) return null;
  return {
    ...row,
    freshness: summarizePrecomputeFreshness(row.lastSuccessAt || row.updatedAt || null),
  };
}

export async function getPairPrecompute(pairKey, env) {
  const db = getBoundDb(env);
  if (!db) return null;

  const row = await db
    .prepare(`SELECT pair_key, currency, issuer, last_success_at, last_error_at, endpoint_used,
      best_route, summary_json, stale, error_text, updated_at
      FROM pair_precompute_current
      WHERE pair_key = ?1`)
    .bind(pairKey)
    .first();

  if (!row) return null;
  return withFreshness({
    pairKey: row.pair_key,
    currency: row.currency,
    issuer: row.issuer,
    lastSuccessAt: row.last_success_at,
    lastErrorAt: row.last_error_at,
    endpointUsed: row.endpoint_used,
    bestRoute: row.best_route,
    summary: parseSummaryText(row.summary_json),
    stale: Boolean(row.stale),
    errorText: row.error_text,
    updatedAt: row.updated_at,
  });
}

export async function listPairPrecomputes(env, limit = 20) {
  const db = getBoundDb(env);
  if (!db) return [];
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));

  const { results } = await db
    .prepare(`SELECT pair_key, currency, issuer, last_success_at, last_error_at, endpoint_used,
      best_route, summary_json, stale, error_text, updated_at
      FROM pair_precompute_current
      ORDER BY COALESCE(last_success_at, updated_at) DESC
      LIMIT ?1`)
    .bind(safeLimit)
    .all();

  return (results || []).map((row) => withFreshness({
    pairKey: row.pair_key,
    currency: row.currency,
    issuer: row.issuer,
    lastSuccessAt: row.last_success_at,
    lastErrorAt: row.last_error_at,
    endpointUsed: row.endpoint_used,
    bestRoute: row.best_route,
    summary: parseSummaryText(row.summary_json),
    stale: Boolean(row.stale),
    errorText: row.error_text,
    updatedAt: row.updated_at,
  }));
}

export async function upsertPairPrecompute(row, env) {
  const db = getBoundDb(env);
  if (!db) {
    return { ok: false, reason: 'd1_not_bound' };
  }

  const summaryJson = JSON.stringify(row.summary || {});
  await db
    .prepare(`INSERT INTO pair_precompute_current (
      pair_key,
      currency,
      issuer,
      last_success_at,
      last_error_at,
      endpoint_used,
      best_route,
      summary_json,
      stale,
      error_text,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, CURRENT_TIMESTAMP)
    ON CONFLICT(pair_key) DO UPDATE SET
      currency = excluded.currency,
      issuer = excluded.issuer,
      last_success_at = excluded.last_success_at,
      last_error_at = excluded.last_error_at,
      endpoint_used = excluded.endpoint_used,
      best_route = excluded.best_route,
      summary_json = excluded.summary_json,
      stale = excluded.stale,
      error_text = excluded.error_text,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(
      row.pairKey,
      row.currency,
      row.issuer,
      row.lastSuccessAt || null,
      row.lastErrorAt || null,
      row.endpointUsed || null,
      row.bestRoute || null,
      summaryJson,
      row.stale ? 1 : 0,
      row.errorText || null
    )
    .run();

  return { ok: true };
}

export async function getPairPrecomputeStats(env) {
  const db = getBoundDb(env);
  if (!db) {
    return {
      count: 0,
      latestSuccessAt: null,
      staleCount: 0,
      freshness: summarizePrecomputeFreshness(null),
    };
  }

  const row = await db
    .prepare(`SELECT COUNT(*) AS count,
      MAX(last_success_at) AS latestSuccessAt,
      SUM(IIF(stale = 1, 1, 0)) AS staleCount
      FROM pair_precompute_current`)
    .first();

  const latestSuccessAt = row?.latestSuccessAt || null;
  return {
    count: Number(row?.count || 0),
    latestSuccessAt,
    staleCount: Number(row?.staleCount || 0),
    freshness: summarizePrecomputeFreshness(latestSuccessAt),
  };
}
