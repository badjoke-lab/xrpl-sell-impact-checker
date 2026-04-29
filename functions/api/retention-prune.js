const RETENTION = {
  metricHourlyRowsPerKey: 720,
  metricDailyDays: 400,
  flowRowsPerPresetWindow: 200,
  sourceChangeEventsDays: 30,
  pairPrecomputeCurrentMode: 'upsert-current-only',
  sourceCurrentMode: 'upsert-current-only',
  rawUpstreamBodyRetention: 'forbidden',
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

function getDb(env) {
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

async function run(db, sql, binds = []) {
  try {
    let stmt = db.prepare(sql);
    if (binds.length) stmt = stmt.bind(...binds);
    const result = await stmt.run();
    return { ok: true, meta: result?.meta || null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'query_failed' };
  }
}

function numberFromRow(row) {
  if (!row || row.error) return null;
  return Number(row.count || row.COUNT || 0);
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function metricHourlyPlan(db) {
  const stale = await first(db, `
    SELECT COUNT(*) AS count FROM (
      SELECT ROW_NUMBER() OVER (PARTITION BY metric_key ORDER BY bucket_ts DESC) AS rn
      FROM metric_hourly
    ) ranked
    WHERE rn > ?
  `, [RETENTION.metricHourlyRowsPerKey]);
  return {
    key: 'metric_hourly',
    mode: 'keep_latest_per_metric_key',
    keep: RETENTION.metricHourlyRowsPerKey,
    stale_rows: numberFromRow(stale),
    error: stale?.error || null,
  };
}

async function pruneMetricHourly(db) {
  return run(db, `
    DELETE FROM metric_hourly
    WHERE rowid IN (
      SELECT rowid FROM (
        SELECT rowid, ROW_NUMBER() OVER (PARTITION BY metric_key ORDER BY bucket_ts DESC) AS rn
        FROM metric_hourly
      ) ranked
      WHERE rn > ?
    )
  `, [RETENTION.metricHourlyRowsPerKey]);
}

async function metricDailyPlan(db) {
  const cutoff = isoDaysAgo(RETENTION.metricDailyDays).slice(0, 10);
  const stale = await first(db, 'SELECT COUNT(*) AS count FROM metric_daily WHERE day_key < ?', [cutoff]);
  return {
    key: 'metric_daily',
    mode: 'delete_older_than_day_key',
    keep_days: RETENTION.metricDailyDays,
    cutoff_day_key: cutoff,
    stale_rows: numberFromRow(stale),
    error: stale?.error || null,
  };
}

async function pruneMetricDaily(db) {
  const cutoff = isoDaysAgo(RETENTION.metricDailyDays).slice(0, 10);
  return run(db, 'DELETE FROM metric_daily WHERE day_key < ?', [cutoff]);
}

async function flowEventsPlan(db) {
  const stale = await first(db, `
    SELECT COUNT(*) AS count FROM (
      SELECT ROW_NUMBER() OVER (PARTITION BY preset, window_key ORDER BY ts DESC) AS rn
      FROM flow_events
    ) ranked
    WHERE rn > ?
  `, [RETENTION.flowRowsPerPresetWindow]);
  return {
    key: 'flow_events',
    mode: 'keep_latest_per_preset_window',
    keep: RETENTION.flowRowsPerPresetWindow,
    stale_rows: numberFromRow(stale),
    error: stale?.error || null,
  };
}

async function pruneFlowEvents(db) {
  return run(db, `
    DELETE FROM flow_events
    WHERE rowid IN (
      SELECT rowid FROM (
        SELECT rowid, ROW_NUMBER() OVER (PARTITION BY preset, window_key ORDER BY ts DESC) AS rn
        FROM flow_events
      ) ranked
      WHERE rn > ?
    )
  `, [RETENTION.flowRowsPerPresetWindow]);
}

async function sourceChangeEventsPlan(db) {
  const cutoff = isoDaysAgo(RETENTION.sourceChangeEventsDays);
  const stale = await first(db, 'SELECT COUNT(*) AS count FROM source_change_events WHERE observed_at < ?', [cutoff]);
  return {
    key: 'source_change_events',
    mode: 'delete_older_than_observed_at',
    keep_days: RETENTION.sourceChangeEventsDays,
    cutoff_observed_at: cutoff,
    stale_rows: numberFromRow(stale),
    error: stale?.error || null,
  };
}

async function pruneSourceChangeEvents(db) {
  const cutoff = isoDaysAgo(RETENTION.sourceChangeEventsDays);
  return run(db, 'DELETE FROM source_change_events WHERE observed_at < ?', [cutoff]);
}

async function buildPlan(db) {
  return [
    await metricHourlyPlan(db),
    await metricDailyPlan(db),
    await flowEventsPlan(db),
    await sourceChangeEventsPlan(db),
    {
      key: 'pair_precompute_current',
      mode: RETENTION.pairPrecomputeCurrentMode,
      stale_rows: 0,
      error: null,
    },
    {
      key: 'source_current',
      mode: RETENTION.sourceCurrentMode,
      stale_rows: 0,
      error: null,
    },
  ];
}

function planSummary(plans) {
  const errors = plans.filter((plan) => plan.error).map((plan) => ({ key: plan.key, error: plan.error }));
  const staleRows = plans.reduce((sum, plan) => sum + Number(plan.stale_rows || 0), 0);
  return {
    status: errors.length ? 'attention' : 'ok',
    stale_rows: staleRows,
    errors,
    raw_upstream_body_retention: RETENTION.rawUpstreamBodyRetention,
  };
}

async function applyPrune(db) {
  const results = [
    { key: 'metric_hourly', result: await pruneMetricHourly(db) },
    { key: 'metric_daily', result: await pruneMetricDaily(db) },
    { key: 'flow_events', result: await pruneFlowEvents(db) },
    { key: 'source_change_events', result: await pruneSourceChangeEvents(db) },
  ];
  const errors = results.filter((entry) => !entry.result.ok).map((entry) => ({ key: entry.key, error: entry.result.error }));
  return {
    ok: errors.length === 0,
    results,
    errors,
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const apply = url.searchParams.get('apply') === '1';
  const db = getDb(env);
  const checkedAt = new Date().toISOString();

  if (!db) {
    return json({
      ok: false,
      checkedAt,
      source: 'retention-prune',
      apply,
      d1_bound: false,
      retention: RETENTION,
      summary: { status: 'attention', stale_rows: null, errors: [{ key: 'd1', error: 'missing_binding' }] },
      plans: [],
    }, 200);
  }

  const before = await buildPlan(db);
  const beforeSummary = planSummary(before);
  let prune = null;
  let after = null;
  let afterSummary = null;

  if (apply) {
    prune = await applyPrune(db);
    after = await buildPlan(db);
    afterSummary = planSummary(after);
  }

  return json({
    ok: beforeSummary.errors.length === 0 && (!prune || prune.ok),
    checkedAt,
    source: 'retention-prune',
    apply,
    dryRun: !apply,
    d1_bound: true,
    retention: RETENTION,
    summary: apply ? afterSummary : beforeSummary,
    before,
    prune,
    after,
    notes: [
      'Default mode is dry-run. Add apply=1 to prune retained rows.',
      'Current-row tables are not pruned because they are upsert-only.',
      'Raw upstream bodies remain forbidden.',
    ],
  });
}
