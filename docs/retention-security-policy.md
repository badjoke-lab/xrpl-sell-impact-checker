# XSIC retention and security policy

## Retention

The fixed target policy is:

- raw-ish quote summaries: 14 days
- hourly compact metrics: 120 days
- daily summaries: 400 days
- watcher change events: 30 days
- current snapshots: overwrite by stable key
- raw upstream response bodies: never retained

`/api/retention-policy` exposes the target policy. `/api/retention-prune` remains dry-run by default; `apply=1` is reserved for controlled maintenance. Current-row tables are not history-pruned.

Retention changes must remain bounded by pair, metric key, preset/window, or source name. New tables require an explicit current-row or retention rule before production writes are enabled.

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
- Watcher hashing uses normalized public content; stored state should contain hashes and summaries rather than full source bodies.
- A source failure must not be recorded as route absence, verification success, or readiness improvement.
