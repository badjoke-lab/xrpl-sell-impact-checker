# XSIC Usage Metrics Privacy Contract

## Purpose

XSIC measures product usage only through bounded aggregate counters. It does not create a user profile, session history, wallet history, or raw event ledger.

## Storage model

Only two aggregate tables are allowed:

- `usage_metric_hourly` — 90-day retention;
- `usage_metric_daily` — 400-day retention.

Each row is an upserted counter keyed by time bucket, event name, feature name, and an optional canonical pair hash. There is no individual-event table.

## Allowed dimensions

- reviewed event name from `shared/usage-metrics-policy.cjs`;
- reviewed feature name from the same policy;
- optional SHA-256 hash of normalized `CURRENCY:issuer`;
- aggregate request, success, degraded, and error counters;
- aggregate update timestamp.

The pair hash supports repeated-pair analysis without retaining the issuer or currency value in the metrics tables. It is not a user identifier.

## Prohibited data

Usage metrics must not store or accept:

- IP address or client address;
- full User-Agent;
- cookie or persistent browser identifier;
- browser/device fingerprint;
- wallet address, XRPL account, or connected-wallet identity;
- raw issuer or currency dimensions;
- complete referrer URL or query string;
- request or response body;
- authorization header, secret, or private token;
- raw upstream HTML or JSON;
- an unrestricted metadata object.

## Fail-open rule

Metrics collection is secondary. A missing D1 binding, schema error, validation error, write timeout, or rate limit must not block or change a Core tool result. The caller receives no stronger conclusion because telemetry failed.

## Bot and CI handling

Synthetic smoke and CI traffic must be excludable through a reviewed event flag or request header that is not persisted as a user identifier. Exclusion logic is implemented with instrumentation in NX-03.

## Retention and deletion

- hourly rows older than 90 days are eligible for pruning;
- daily rows older than 400 days are eligible for pruning;
- pruning is bounded and dry-run by default until explicitly applied;
- no raw-event deletion workflow exists because raw events are never stored.

## Change rule

New events or features require review of the allowlists and contract tests. Adding a new dimension requires a roadmap amendment if it can materially increase identifiability, retention, or cost.
