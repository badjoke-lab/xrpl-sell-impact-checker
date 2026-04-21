-- XSIC paid week1 foundation schema
-- Safe to apply after Cloudflare D1 binding is created.

CREATE TABLE IF NOT EXISTS source_registry (
  source_name TEXT PRIMARY KEY,
  source_group TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  refresh_interval_seconds INTEGER NOT NULL DEFAULT 300,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS source_current (
  source_name TEXT PRIMARY KEY,
  http_ok INTEGER NOT NULL DEFAULT 0,
  content_type TEXT,
  status_code INTEGER,
  observed_at TEXT,
  last_checked_at TEXT,
  normalized_hash TEXT,
  changed INTEGER NOT NULL DEFAULT 0,
  stable_class TEXT,
  summary_text TEXT,
  error_text TEXT
);

CREATE TABLE IF NOT EXISTS source_change_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  changed INTEGER NOT NULL DEFAULT 0,
  stable_class TEXT,
  summary_text TEXT,
  normalized_hash TEXT,
  error_text TEXT
);

CREATE TABLE IF NOT EXISTS pair_precompute_current (
  pair_key TEXT PRIMARY KEY,
  currency TEXT NOT NULL,
  issuer TEXT NOT NULL,
  last_success_at TEXT,
  last_error_at TEXT,
  endpoint_used TEXT,
  best_route TEXT,
  summary_json TEXT,
  stale INTEGER NOT NULL DEFAULT 0,
  error_text TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flow_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preset TEXT NOT NULL,
  window_key TEXT NOT NULL,
  ts INTEGER NOT NULL,
  pair_key TEXT,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flow_daily_compact (
  preset TEXT NOT NULL,
  day_key TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (preset, day_key)
);

CREATE TABLE IF NOT EXISTS metric_hourly (
  metric_key TEXT NOT NULL,
  bucket_ts TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (metric_key, bucket_ts)
);

CREATE TABLE IF NOT EXISTS metric_daily (
  metric_key TEXT NOT NULL,
  day_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (metric_key, day_key)
);

CREATE INDEX IF NOT EXISTS idx_source_change_events_source_observed
  ON source_change_events (source_name, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pair_precompute_updated
  ON pair_precompute_current (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_flow_events_preset_window_ts
  ON flow_events (preset, window_key, ts DESC);

CREATE INDEX IF NOT EXISTS idx_flow_events_pair_key_ts
  ON flow_events (pair_key, ts DESC);

CREATE INDEX IF NOT EXISTS idx_metric_hourly_metric_bucket
  ON metric_hourly (metric_key, bucket_ts DESC);

CREATE INDEX IF NOT EXISTS idx_metric_daily_metric_day
  ON metric_daily (metric_key, day_key DESC);
