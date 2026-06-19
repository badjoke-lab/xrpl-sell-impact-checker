const assert = require('node:assert/strict');
const fs = require('node:fs');
const policy = require('../shared/usage-metrics-policy.cjs');
const retention = require('../shared/retention-policy.cjs');

const migration = fs.readFileSync('migrations/20260620_usage_metrics_aggregate.sql', 'utf8');
const docs = fs.readFileSync('docs/usage-metrics-privacy.md', 'utf8');
const retentionDocs = fs.readFileSync('docs/retention-security-policy.md', 'utf8');

assert.equal(policy.USAGE_RETENTION.hourlyDays, 90);
assert.equal(policy.USAGE_RETENTION.dailyDays, 400);
assert.equal(policy.USAGE_RETENTION.rawEventRetention, 'forbidden');
assert.equal(retention.RETENTION_POLICY.usageMetricHourlyDays, 90);
assert.equal(retention.RETENTION_POLICY.usageMetricDailyDays, 400);
assert.equal(retention.RETENTION_POLICY.usageRawEventRetention, 'forbidden');

for (const event of [
  'page_view',
  'estimate_started',
  'estimate_completed',
  'estimate_failed',
  'pair_brief_opened',
  'support_clicked',
]) {
  assert.equal(policy.USAGE_EVENT_NAMES.includes(event), true, `Missing allowed event: ${event}`);
}

for (const field of [
  'ip_address',
  'user_agent',
  'cookie',
  'fingerprint',
  'wallet_address',
  'issuer',
  'currency',
  'request_body',
  'response_body',
  'authorization',
]) {
  assert.equal(policy.PROHIBITED_USAGE_FIELDS.includes(field), true, `Missing prohibited field: ${field}`);
}

const valid = policy.validateAggregateDimensions({
  eventName: 'estimate_completed',
  featureName: 'sell-impact',
  pairKeyHash: policy.pairKeyHash('USD', 'rExampleIssuer'),
});
assert.equal(valid.ok, true);
assert.equal(valid.pairKeyHash.length, 64);

const invalid = policy.validateAggregateDimensions({
  eventName: 'estimate_completed',
  featureName: 'sell-impact',
  issuer: 'rMustNotPersist',
});
assert.equal(invalid.ok, false);
assert.deepEqual(invalid.prohibited, ['issuer']);

for (const marker of [
  'CREATE TABLE IF NOT EXISTS usage_metric_hourly',
  'CREATE TABLE IF NOT EXISTS usage_metric_daily',
  'PRIMARY KEY (bucket_hour, event_name, feature_name, pair_key_hash)',
  'PRIMARY KEY (day_key, event_name, feature_name, pair_key_hash)',
  'CHECK (request_count >= 0)',
]) {
  assert.equal(migration.includes(marker), true, `Missing migration marker: ${marker}`);
}

assert.equal(/CREATE TABLE[^;]*(raw|event_log|session)/i.test(migration), false, 'Raw usage event/session table is forbidden');
assert.equal(migration.includes('ip_address'), false);
assert.equal(migration.includes('user_agent'), false);
assert.equal(migration.includes('wallet_address'), false);
assert.equal(migration.includes('issuer TEXT'), false);
assert.equal(migration.includes('currency TEXT'), false);

for (const marker of [
  'does not create a user profile',
  'There is no individual-event table',
  'Metrics collection is secondary',
  'hourly rows older than 90 days',
  'daily rows older than 400 days',
]) {
  assert.equal(docs.includes(marker), true, `Missing privacy marker: ${marker}`);
}

assert.equal(retentionDocs.includes('raw individual usage events: never retained'), true);
assert.equal(retentionDocs.includes('Usage metrics must not store IP addresses'), true);

console.log('Usage metrics schema and privacy contract checks passed.');
