const LIMITS = {
  requestsMonthly: 1_800_000,
  cpuMsMonthly: 5_500_000,
  d1ReadsMonthly: 2_000_000_000,
  d1WritesMonthly: 4_000_000,
  d1StorageMb: 600,
  kvReadsMonthly: 1_000_000,
  kvWritesMonthly: 120_000,
  kvStorageMb: 80,
};

const RETENTION = {
  metricHourlyRowsPerKey: 720,
  flowRowsPerPresetWindow: 200,
  sourceChangeEventsDays: 30,
  pairPrecomputeCurrentMode: 'upsert-current-only',
  rawUpstreamBodyRetention: 'forbidden',
};

const WATCHER_POLICY = {
  minRefreshSeconds: 60,
  preferredRefreshSeconds: 300,
  continuousPollingSeconds: 15,
  continuousPollingAllowed: false,
  unboundedDiscoveryAllowed: false,
  allPairScanningAllowed: false,
};

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

function getBoundDb(env) {
  return env?.XSIC_DB || env?.DB || null;
}

async function first(db, sql, binds = []) {
  try {
    let stmt = db.prepare(sql);
    if (binds.length) stmt = stmt.bind(...binds);
    return await stmt.first();
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'query_failed' };
  }
}

async function countTable(db, table) {
  const row = await first(db, `SELECT COUNT(*) AS count FROM ${table}`);
  return row?.error ? { count: null, error: row.error } : { count: Number(row?.count || 0), error: null };
}

function usageState(value, limit) {
  if (!Number.isFinite(value) || !Number.isFinite(limit) || limit <= 0) return 'unknown';
  const ratio = value / limit;
  if (ratio >= 0.9) return 'critical';
  if (ratio >= 0.7) return 'warning';
  return 'ok';
}

function estimateStorageMb(rowCounts) {
  const metricHourly = Number(rowCounts.metric_hourly?.count || 0) * 3;
  const flowEvents = Number(rowCounts.flow_events?.count || 0) * 8;
  const sourceEvents = Number(rowCounts.source_change_events?.count || 0) * 4;
  const pairCurrent = Number(rowCounts.pair_precompute_current?.count || 0) * 6;
  const estimatedKb = metricHourly + flowEvents + sourceEvents + pairCurrent;
  return Math.round((estimatedKb / 1024) * 100) / 100;
}

function buildGuards(rowCounts, estimatedStorageMb) {
  const guards = [];
  const metricHourlyCount = Number(rowCounts.metric_hourly?.count || 0);
  const flowEventsCount = Number(rowCounts.flow_events?.count || 0);
  const sourceEventsCount = Number(rowCounts.source_change_events?.count || 0);

  guards.push({
    key: 'd1_storage_soft_cap',
    state: usageState(estimatedStorageMb, LIMITS.d1StorageMb),
    value: estimatedStorageMb,
    limit: LIMITS.d1StorageMb,
    unit: 'MB estimated',
  });
  guards.push({
    key: 'metric_hourly_row_guard',
    state: metricHourlyCount <= 10_000 ? 'ok' : metricHourlyCount <= 50_000 ? 'warning' : 'critical',
    value: metricHourlyCount,
    limit: 50_000,
    unit: 'rows',
  });
  guards.push({
    key: 'flow_events_row_guard',
    state: flowEventsCount <= 10_000 ? 'ok' : flowEventsCount <= 50_000 ? 'warning' : 'critical',
    value: flowEventsCount,
    limit: 50_000,
    unit: 'rows',
  });
  guards.push({
    key: 'source_change_events_row_guard',
    state: sourceEventsCount <= 5_000 ? 'ok' : sourceEventsCount <= 20_000 ? 'warning' : 'critical',
    value: sourceEventsCount,
    limit: 20_000,
    unit: 'rows',
  });
  guards.push({
    key: 'unbounded_discovery',
    state: WATCHER_POLICY.unboundedDiscoveryAllowed ? 'critical' : 'ok',
    value: WATCHER_POLICY.unboundedDiscoveryAllowed,
    limit: false,
    unit: 'boolean',
  });
  guards.push({
    key: 'all_pair_scanning',
    state: WATCHER_POLICY.allPairScanningAllowed ? 'critical' : 'ok',
    value: WATCHER_POLICY.allPairScanningAllowed,
    limit: false,
    unit: 'boolean',
  });
  guards.push({
    key: 'continuous_polling',
    state: WATCHER_POLICY.continuousPollingAllowed ? 'critical' : 'ok',
    value: WATCHER_POLICY.continuousPollingAllowed,
    limit: false,
    unit: 'boolean',
  });

  return guards;
}

function summarize(guards) {
  const critical = guards.filter((guard) => guard.state === 'critical').map((guard) => guard.key);
  const warning = guards.filter((guard) => guard.state === 'warning').map((guard) => guard.key);
  return {
    status: critical.length ? 'critical' : warning.length ? 'attention' : 'ok',
    critical,
    warning,
    next_action: critical.length
      ? 'Stop new watcher expansion and prune retained rows.'
      : warning.length
        ? 'Review retention and refresh cadence before adding new watcher sources.'
        : 'Safe to continue bounded paid-layer work.',
  };
}

export async function onRequestGet({ env }) {
  const checkedAt = new Date().toISOString();
  const db = getBoundDb(env);
  if (!db) {
    const guards = buildGuards({}, 0);
    return json({
      ok: false,
      checkedAt,
      source: 'usage-guard',
      d1_bound: false,
      limits: LIMITS,
      retention: RETENTION,
      watcher_policy: WATCHER_POLICY,
      row_counts: {},
      estimated_storage_mb: null,
      guards,
      summary: { status: 'attention', critical: [], warning: ['d1_missing'], next_action: 'Bind D1 before relying on usage guard.' },
    });
  }

  const tableNames = ['metric_hourly', 'metric_daily', 'flow_events', 'source_change_events', 'pair_precompute_current', 'source_current'];
  const rowCounts = {};
  for (const tableName of tableNames) {
    rowCounts[tableName] = await countTable(db, tableName);
  }
  const estimatedStorageMb = estimateStorageMb(rowCounts);
  const guards = buildGuards(rowCounts, estimatedStorageMb);

  return json({
    ok: true,
    checkedAt,
    source: 'usage-guard',
    d1_bound: true,
    limits: LIMITS,
    retention: RETENTION,
    watcher_policy: WATCHER_POLICY,
    row_counts: rowCounts,
    estimated_storage_mb: estimatedStorageMb,
    guards,
    summary: summarize(guards),
  });
}
