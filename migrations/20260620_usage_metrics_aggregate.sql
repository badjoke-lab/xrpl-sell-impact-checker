-- Aggregate-only XSIC usage metrics.
-- No raw individual-event table is permitted.

CREATE TABLE IF NOT EXISTS usage_metric_hourly (
  bucket_hour TEXT NOT NULL,
  event_name TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  pair_key_hash TEXT NOT NULL DEFAULT '',
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  degraded_count INTEGER NOT NULL DEFAULT 0 CHECK (degraded_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bucket_hour, event_name, feature_name, pair_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_usage_metric_hourly_bucket
  ON usage_metric_hourly (bucket_hour);

CREATE INDEX IF NOT EXISTS idx_usage_metric_hourly_feature_event
  ON usage_metric_hourly (feature_name, event_name, bucket_hour);

CREATE TABLE IF NOT EXISTS usage_metric_daily (
  day_key TEXT NOT NULL,
  event_name TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  pair_key_hash TEXT NOT NULL DEFAULT '',
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  degraded_count INTEGER NOT NULL DEFAULT 0 CHECK (degraded_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day_key, event_name, feature_name, pair_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_usage_metric_daily_day
  ON usage_metric_daily (day_key);

CREATE INDEX IF NOT EXISTS idx_usage_metric_daily_feature_event
  ON usage_metric_daily (feature_name, event_name, day_key);
