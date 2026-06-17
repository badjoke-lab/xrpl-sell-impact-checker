const DAY_MS = 24 * 60 * 60 * 1000;

const RETENTION_POLICY = Object.freeze({
  rawishQuoteSummaryDays: 14,
  metricHourlyDays: 120,
  metricHourlyRowsPerKey: 120 * 24,
  metricDailyDays: 400,
  flowEventDays: 14,
  watcherChangeEventDays: 30,
  currentTables: ['pair_precompute_current', 'source_current'],
  currentMode: 'upsert-current-only',
  rawUpstreamBodyRetention: 'forbidden',
});

function isoDaysAgo(days, now = Date.now()) {
  return new Date(Number(now) - Number(days) * DAY_MS).toISOString();
}

function policySummary() {
  return {
    ...RETENTION_POLICY,
    metricHourlyCutoff: isoDaysAgo(RETENTION_POLICY.metricHourlyDays),
    metricDailyCutoff: isoDaysAgo(RETENTION_POLICY.metricDailyDays).slice(0, 10),
    flowEventCutoff: isoDaysAgo(RETENTION_POLICY.flowEventDays),
    watcherChangeEventCutoff: isoDaysAgo(RETENTION_POLICY.watcherChangeEventDays),
  };
}

module.exports = { RETENTION_POLICY, DAY_MS, isoDaysAgo, policySummary };
