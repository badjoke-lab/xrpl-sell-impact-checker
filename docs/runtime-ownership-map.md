# XSIC Runtime Ownership Map

This document fixes the authoritative source, fallback, update path, and failure behavior for each XSIC runtime surface.

## Global rules

- Live XRPL responses are authoritative for user-triggered checks.
- Cached, precomputed, materialized, and repository snapshots are preload or fallback layers only.
- Every fallback exposes its source and freshness.
- Demo data is opt-in and labelled `demo`.
- Cloudflare scheduled triggers are intentionally excluded. Scheduled refresh uses GitHub Actions `schedule` / `workflow_dispatch` only.
- Storage is bounded and raw upstream bodies are not retained.

## Surface map

| Surface | Authoritative source | Fallback / preload | Update path | Required failure behavior |
|---|---|---|---|---|
| Sell Impact | Live `/api/book-offers` and `/api/amm-info` for the requested currency, issuer, and amount | Matching D1/KV pair precompute row | User-triggered live request; approved GitHub Actions refresh for current rows | Never present a mismatched seed as live; expose stale, partial, no-liquidity, or error |
| Liquidity Pulse | Live `/api/xrpl/amm-snapshot` | `/api/xrpl/liquidity-history` latest bounded snapshot; labelled demo only when selected | Runtime live fetch plus approved GitHub Actions history refresh | Latest known values may be retained only with stale/degraded attribution |
| Flow Alert | Committed `data/flow-history/*.json` served by `/api/xrpl/flow-history` | Runtime memory/filesystem fallback | `.github/workflows/update-flow-history.yml` | Return source mode and stale reason; reject malformed or non-monotonic history |
| Exit Coverage Map | Candidate discovery plus live XRPL `book_offers` and AMM checks | Fixed fixtures for tests; bounded current snapshot only with freshness | User-triggered runtime check; any scheduled materialization uses GitHub Actions | Keep `dual`, `book-only`, `amm-only`, `none`; separate invalid issuer, upstream failure, and no candidates |
| Exposure Graph | Data explicitly identified by the page/API as live or current | Labelled snapshot, inferred, unknown, or demo data | Producing script/workflow documented beside the source | Never turn inferred/demo/unknown exposure into a confirmed live fact |
| Token Heatmap | Validated `apps/token-heatmap/token-heatmap-snapshot.json` | Demo snapshot, then inline demo data, both labelled | Token Heatmap GitHub Actions refresh workflow and validator | Reject invalid snapshots; keep exit coverage pending until checked |
| Privacy / ZK Watch | Registered primary sources and normalized watcher results | Secondary/volatile sources for explanation only | Approved GitHub Actions watcher refresh | Volatile changes do not promote maturity; external and testnet status stay explicit |
| Proof Anchor Checker | Chain registry, proof-side APIs, and verifier surface as separate evidence channels | Last bounded source-state snapshot with freshness | Approved GitHub Actions watcher refresh | `Verifier Endpoint Unresolved` and `No Strong Link` are valid; unsupported verified/matched verdicts are not allowed |
| Institutional Readiness Radar | Reviewed eight-axis profile plus current primary-source evidence | Last bounded source-state snapshot; volatile sources excluded from main signal | Approved GitHub Actions watcher refresh and human-reviewed profile changes | Source activity alone cannot raise readiness; no definitive institutional-ready verdict |
| Service health | Direct checks of upstream/API reachability and latest successful feature refreshes | Last known observation with age | Request-time checks and approved GitHub Actions verification jobs | Report feature-level missing/stale/degraded states, not unconditional OK |

## Ownership boundaries

### UI

Owns user-visible state, source attribution, timestamps, warnings, and recovery actions. It does not decide that stale or demo data is live.

### Pages Functions / APIs

Own input validation, upstream access, normalized response contracts, timeout behavior, and source/freshness metadata.

### D1 / KV / repository JSON

Own bounded current or short-history records. They do not override a successful matching live result.

### GitHub Actions

Own scheduled refresh, validation, and repository snapshot commits. GitHub Actions cron syntax is allowed; Cloudflare scheduled triggers are not.

## Change rule

A PR that changes a source of truth, fallback priority, update path, or failure behavior must update this document in the same PR.
