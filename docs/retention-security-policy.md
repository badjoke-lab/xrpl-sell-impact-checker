# XSIC retention and security policy

## Retention

The fixed target policy is:

- raw-ish quote summaries: 14 days
- general hourly compact metrics: 120 days
- general daily summaries: 400 days
- aggregate usage hourly metrics: 90 days
- aggregate usage daily metrics: 400 days
- raw individual usage events: never retained
- watcher change events: 30 days
- current snapshots: overwrite by stable key
- raw upstream response bodies: never retained

`/api/retention-policy` exposes the target policy. `/api/retention-prune` remains dry-run by default; `apply=1` is reserved for controlled maintenance. Current-row tables are not history-pruned.

Retention changes must remain bounded by pair, metric key, preset/window, source name, or aggregate usage bucket. New tables require an explicit current-row, aggregate-row, or retention rule before production writes are enabled.

Usage telemetry is governed by `docs/usage-metrics-privacy.md`. Only `usage_metric_hourly` and `usage_metric_daily` are permitted; no raw event table is allowed.

## Request and response security

Cloudflare Pages response headers enforce:

- MIME sniffing disabled
- strict referrer policy
- frame embedding denied
- camera, microphone, location, payment, and USB permissions disabled
- same-origin opener isolation
- a same-origin Content Security Policy
- API responses marked `no-store`

The CSP intentionally permits existing inline styles/scripts while blocking third-party script, frame, object, and connection origins. New external browser dependencies require an explicit review rather than a silent CSP expansion.

## Data handling

- API responses may expose normalized summaries, status, and evidence references.
- Private tokens, authorization headers, raw upstream HTML/JSON bodies, and internal debug dumps must not be written to D1 or KV.
- Usage metrics must not store IP addresses, full User-Agent strings, cookies, fingerprints, wallet/account identifiers, raw issuer/currency fields, referrer URLs, or request/response bodies.
- Watcher hashing uses normalized public content; stored state should contain hashes and summaries rather than full source bodies.
- A source failure must not be recorded as route absence, verification success, or readiness improvement.
