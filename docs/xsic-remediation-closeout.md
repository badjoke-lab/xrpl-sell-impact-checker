# XSIC reliability remediation closeout

## Final status

- Scheduled PRs: **19 / 19 merged**
- Remediation items: **37 / 37 closed**
- Scheduled-remediation final SHA: `406eb632ce67c3b1fd87bc0147fcccf2133fd77d`
- Final scheduled PR: `#267` / PR-18
- PR-18 aggregate repository gate: passed
- Production smoke: enforced by `production-closeout.yml`

## Merged PR ledger

- #249 PR-00 plan
- #250 PR-01 guardrails and runtime ownership
- #251 PR-02 validation baseline
- #252 PR-03 API input and error contracts
- #253 PR-04 upstream request hardening
- #254 PR-05 request identity and freshness
- #255 PR-06 Sell Impact boundaries
- #256 PR-07 Liquidity Pulse current/history
- #257 PR-08 Flow Alert current/history
- #258 PR-09 Exit Coverage four-state runtime
- #259 PR-10 Exposure/Heatmap trust guardrails
- #260 PR-11 Privacy/ZK Watch and watcher foundation
- #261 PR-12 Proof Anchor Checker
- #262 PR-13 Institutional Readiness Radar
- #263 PR-14 health and operations
- #264 PR-15 retention and response security
- #265 PR-16 accessibility and mobile
- #266 PR-17 Apps/SEO publication
- #267 PR-18 aggregate release gate

## Validation

PR #267 ran 13 workflows; all succeeded, including `Final Release Gate`. The aggregate command covers shared runtime behavior, Sell Impact, Liquidity Pulse, Flow Alert, Exit Coverage, Exposure/Heatmap, all three watcher pages, health/ops, retention/security, accessibility/mobile, SEO, and public routes.

The production smoke runs from a GitHub-hosted runner against `https://xsic.badjoke-lab.com`. It checks 13 HTML routes plus `/api/ping`, `/api/health`, `/api/health-watchers`, `/api/watch-sources`, `/api/exit-coverage`, and `/api/proof-anchor`.

## Fixed boundaries

- Sell Impact live output remains authoritative.
- Exit Coverage remains `dual`, `book-only`, `amm-only`, or `none`; failures never become `none`.
- External/testnet privacy projects remain external/experimental.
- Verifier HTML remains unresolved; Proof Anchor emits no unsupported verified/matched result.
- Readiness keeps eight axes and no composite verdict.
- Token Heatmap exit mode stays disabled until route data exists.
- Current rows are upsert-only; history is bounded; raw upstream bodies are not retained.
- Cloudflare Cron Trigger configuration remains prohibited.

## Accepted risks

- Third-party sources can change or fail independently.
- No strong public proof-to-transaction join key exists.
- Watcher change memory is best-effort until durable history is added.
- Exit Coverage discovery is bounded, not exhaustive.
- Production smoke is contract-level, not visual regression.
- Repository CI cannot guarantee future deployment propagation.

## Rollback

Use a normal revert PR, starting with the latest affected change. Preserve D1/KV data, retain labelled stale fallback, never map source failure to route absence, review retention dry-run before deletion, and never restore Cloudflare Cron as a rollback.

## Operating rules

All runtime PRs must pass `Final Release Gate`. New pages must update Apps, sitemap, structured data, and route checks. New APIs must use shared validation, error, timeout, size, and freshness contracts. New history requires bounded retention and indexes. Source changes must not auto-promote maturity, linkage, or readiness.

The remediation closes when the production smoke succeeds and the closeout correction is merged; the resulting merge SHA is recorded in the operator report.
