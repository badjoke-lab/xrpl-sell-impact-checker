const ALLOWED_RANGES = new Set([7, 30]);
const ANONYMITY_THRESHOLD = 5;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

function getDb(env) {
  return env?.XSIC_DB || env?.DB || null;
}

function dayKeyDaysAgo(days, now = Date.now()) {
  return new Date(now - (days - 1) * 86400000).toISOString().slice(0, 10);
}

function safeRate(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function addCounts(target, row) {
  target.requests += Number(row.request_count || 0);
  target.success += Number(row.success_count || 0);
  target.degraded += Number(row.degraded_count || 0);
  target.errors += Number(row.error_count || 0);
}

function emptyCounts() {
  return { requests: 0, success: 0, degraded: 0, errors: 0 };
}

export function buildUsageSummary(rows, rangeDays) {
  const total = emptyCounts();
  const byFeatureMap = new Map();
  const byEventMap = new Map();
  const pairMap = new Map();
  const activeDays = new Set();

  for (const row of rows || []) {
    addCounts(total, row);
    if (row.day_key) activeDays.add(row.day_key);

    const feature = String(row.feature_name || 'unknown');
    const featureCounts = byFeatureMap.get(feature) || emptyCounts();
    addCounts(featureCounts, row);
    byFeatureMap.set(feature, featureCounts);

    const eventName = String(row.event_name || 'unknown');
    const eventCounts = byEventMap.get(eventName) || emptyCounts();
    addCounts(eventCounts, row);
    byEventMap.set(eventName, eventCounts);

    const pairHash = String(row.pair_key_hash || '');
    if (pairHash) {
      const pairCounts = pairMap.get(pairHash) || emptyCounts();
      addCounts(pairCounts, row);
      pairMap.set(pairHash, pairCounts);
    }
  }

  const eventCount = (name, field = 'requests') => Number(byEventMap.get(name)?.[field] || 0);
  const estimateStarted = eventCount('estimate_started');
  const estimateCompleted = eventCount('estimate_completed');
  const estimateFailed = eventCount('estimate_failed');

  const topPairs = [...pairMap.entries()]
    .filter(([, counts]) => counts.requests >= ANONYMITY_THRESHOLD)
    .map(([pairKeyHash, counts]) => ({ pairKeyHash, ...counts }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 20);

  return {
    state: total.requests === 0 ? 'zero' : 'available',
    rangeDays,
    anonymityThreshold: ANONYMITY_THRESHOLD,
    activeDays: activeDays.size,
    total,
    estimates: {
      started: estimateStarted,
      completed: estimateCompleted,
      failed: estimateFailed,
      completionRate: safeRate(estimateCompleted, estimateStarted),
      failureRate: safeRate(estimateFailed, estimateStarted),
    },
    quality: {
      degradedRate: safeRate(total.degraded, total.requests),
      errorRate: safeRate(total.errors, total.requests),
    },
    byFeature: Object.fromEntries([...byFeatureMap.entries()].sort(([a], [b]) => a.localeCompare(b))),
    byEvent: Object.fromEntries([...byEventMap.entries()].sort(([a], [b]) => a.localeCompare(b))),
    topPairs,
    suppressedPairCount: [...pairMap.values()].filter((counts) => counts.requests < ANONYMITY_THRESHOLD).length,
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const requestedRange = Number(url.searchParams.get('range') || 7);
  if (!ALLOWED_RANGES.has(requestedRange)) {
    return json({ ok: false, error: 'invalid_range', allowed: [...ALLOWED_RANGES] }, 400);
  }

  const checkedAt = new Date().toISOString();
  const operations = {
    state: 'separate_contracts',
    coreHealth: '/api/health',
    watcherHealth: '/api/health-watchers',
    retentionPolicy: '/api/retention-policy',
    note: 'Operational health is not inferred from usage counters.',
  };
  const db = getDb(env);
  if (!db) {
    return json({
      ok: false,
      checkedAt,
      usage: { state: 'unavailable', rangeDays: requestedRange, reason: 'missing_binding' },
      operations,
    });
  }

  try {
    const cutoff = dayKeyDaysAgo(requestedRange);
    const result = await db.prepare(`
      SELECT day_key, event_name, feature_name, pair_key_hash,
        SUM(request_count) AS request_count,
        SUM(success_count) AS success_count,
        SUM(degraded_count) AS degraded_count,
        SUM(error_count) AS error_count
      FROM usage_metric_daily
      WHERE day_key >= ?
      GROUP BY day_key, event_name, feature_name, pair_key_hash
      ORDER BY day_key ASC
    `).bind(cutoff).all();
    const rows = Array.isArray(result?.results) ? result.results : [];
    return json({ ok: true, checkedAt, usage: buildUsageSummary(rows, requestedRange), operations });
  } catch {
    return json({
      ok: false,
      checkedAt,
      usage: { state: 'unavailable', rangeDays: requestedRange, reason: 'query_failed' },
      operations,
    });
  }
}
