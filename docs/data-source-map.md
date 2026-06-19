# XSIC Data Source Map

This document lists the public/runtime data channels that feed each XSIC surface. `docs/runtime-ownership-map.md` remains authoritative for source priority and failure behavior.

## Core tools

| Surface | Current/live channel | Materialized/history channel | Demo/test channel | Public contract |
|---|---|---|---|---|
| Sell Impact | `/api/book-offers`, `/api/amm-info` | matching precompute/current rows | deterministic fixtures | live result remains authoritative |
| Liquidity Pulse | `/api/xrpl/amm-snapshot` | `/api/xrpl/liquidity-history` | fixed labelled demo | source and freshness are displayed separately |
| Flow Alert | current flow snapshot/observation | `/api/xrpl/flow-history` backed by `data/flow-history/*.json` | fixed labelled demo | committed JSON is authoritative history, not an unlabelled live substitute |
| Exit Coverage Map | `/api/exit-coverage` live discovery and route checks | optional bounded current materialization | deterministic fixtures | only `dual`, `book-only`, `amm-only`, `none`; failure is separate |
| Exposure Graph | source-labelled current API/page data | labelled bounded snapshot where available | labelled heuristic/demo data | combined output is heuristic, not a decision-grade score |
| Token Heatmap | validated snapshot | `apps/token-heatmap/token-heatmap-snapshot.json` | demo snapshot/inline demo | exit route remains unknown until checked |

## Labs and research tools

| Surface | Primary evidence | Secondary/volatile evidence | Required caution |
|---|---|---|---|
| Privacy / ZK Watch | registered primary stable/active sources | secondary and volatile sources | volatile activity cannot promote maturity |
| Proof Anchor Checker | chain registry, proof evidence, verifier evidence, linkage evidence as separate channels | bounded last source-state | unresolved verifier and no-strong-link remain valid outcomes |
| Institutional Readiness Radar | reviewed eight-axis profile and primary sources | volatile source context | source activity cannot raise readiness automatically; no composite verdict |

## Shared operational sources

| Contract | Source |
|---|---|
| Core health | `/api/health` |
| Watcher health | `/api/health-watchers` |
| Watch source state | `/api/watch-sources` |
| Retention policy | shared retention policy/API contract |
| Release verification | `scripts/check_release_gate.mjs` and `.github/workflows/final-release-gate.yml` |
| Public smoke | `scripts/smoke_production.mjs` and `.github/workflows/production-closeout.yml` |

## Data ownership rules

- Live XRPL responses are authoritative for successful matching user-triggered checks.
- Repository JSON is authoritative only for surfaces explicitly designated as repository-managed history or validated snapshot data.
- Materialized data must expose observation time, source mode, and freshness.
- Demo data is never selected silently.
- A failed source check cannot be converted into route absence, verification, matched linkage, maturity, or readiness.
- Current and history sources must remain distinguishable in APIs and UI.

## Update mechanisms

- User-triggered request-time refresh: Pages Functions.
- Scheduled materialization and repository snapshot refresh: GitHub Actions.
- Human-reviewed profile/source changes: normal pull requests.
- Cloudflare Cron Triggers: prohibited.

## Planned Pair Brief

Pair Brief will aggregate existing Core contracts. It will not create a new opaque truth source. Each section must preserve the original feature result, source mode, observation time, freshness, and warnings.
