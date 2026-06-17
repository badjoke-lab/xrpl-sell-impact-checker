# XSIC operations runbook

## Health endpoints

Use `/api/health` for the bounded core runtime:

- XRPL upstream latency and validated ledger
- D1 and KV binding availability
- Sell Impact precompute freshness
- Liquidity Pulse current/history freshness
- Flow Alert current/history freshness
- Exit Coverage contract status
- usage guard and retention-prune readiness

Use `/api/health-watchers` only when checking external watcher sources. It performs network requests and reports:

- primary source failures
- unresolved verifier sources
- stable / active / volatile classifications
- secondary volatile sources excluded from primary freshness

The external watcher check is intentionally separate so the core health endpoint remains bounded.

## Freshness states

- `fresh`: within the feature's normal freshness window
- `aging`: usable but approaching the stale boundary
- `stale`: retained context; not a current observation
- `partial`: some source or metric is unavailable
- `missing`: no usable materialized record
- `degraded`: a primary source failed or fallback mode is active

## Triage order

1. Read `/api/health` and note `status`, `service_health.degraded_mode`, `features`, and `ops_summary.warnings`.
2. Check the named feature endpoint and its latest timestamp.
3. Check GitHub Actions for the relevant update workflow.
4. Use `/api/health-watchers` only for Privacy / ZK Watch, Proof Anchor Checker, or Institutional Readiness Radar.
5. Keep stale values labelled. Never convert a source failure into a fresh or absent-state conclusion.

## Recovery actions

- XRPL upstream degraded: retain the latest labelled materialized record and retry through the endpoint pool.
- Precompute stale or missing: verify the popular-pair update workflow; live Estimate remains authoritative.
- Liquidity or Flow history stale: verify current materialization and bounded-history writes.
- Watcher primary source failed: retain the previous classification, show freshness degraded, and do not rescore maturity/readiness automatically.
- Verifier returns HTML: this is `unresolved`, not a service failure and not a verification result.

## Safety limits

- no 15-second production polling
- no raw upstream body retention
- no unbounded pair discovery
- no all-pair continuous calculation
- current rows use upsert semantics
- history remains bounded and is pruned by policy
