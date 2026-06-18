# XSIC final release gate

## Purpose

This gate closes the reliability-remediation schedule. It verifies that the individual feature contracts still pass together and that the repository retains its fixed trust, freshness, retention, accessibility, SEO, and operational boundaries.

Run locally with:

```bash
node scripts/check_release_gate.mjs
```

The same command runs in the `Final Release Gate` pull-request workflow.

## Required outcomes

The gate must confirm all of the following.

### Runtime and data boundaries

- request identity, timeout, response, and freshness contracts pass
- Sell Impact keeps live output authoritative and does not fabricate fallback routes or confidence
- Liquidity Pulse exposes bounded current/history windows and explicit missing, stale, partial, and degraded states
- Flow Alert distinguishes live data, materialized history fallback, fixed demo data, and unavailable data
- core health and watcher health expose degraded reasons and freshness state

### Exit Coverage Map

- every row uses exactly one of `dual`, `book-only`, `amm-only`, or `none`
- upstream failure is never converted to `none`
- invalid issuer remains separate from upstream failure
- every valid row retains its Sell Impact deep link
- observed ledger or freshness evidence remains exposed

### Labs evidence pages

- Privacy / ZK Watch keeps stage, role, network, source quality, and freshness separate
- external projects remain external and testnet-linked evidence remains experimental
- volatile secondary sources remain excluded from primary freshness conclusions
- Proof Anchor Checker separates chain, proof-side, verifier, and linkage evidence
- verifier HTML remains an `unresolved` state rather than a successful verification
- Proof Anchor Checker does not emit an unsupported Verified or Matched verdict
- Institutional Readiness Radar keeps eight axes separate and emits no composite institutional-ready verdict

### Retention and security

- current tables remain upsert-only
- history remains bounded by the published policy
- raw upstream response bodies are not retained
- API responses remain `no-store`
- baseline browser security headers remain present
- Cloudflare Cron Trigger configuration is prohibited and must not appear in `wrangler.toml`, `wrangler.json`, or `wrangler.jsonc`

### Public integration

- shared keyboard focus, skip-link, reduced-motion, mobile overflow, and table-scroll contracts pass
- all audited pages have title, description, canonical, Open Graph, Twitter, JSON-LD, and one page-specific `h1`
- canonical URLs appear in the sitemap
- public Labs routes appear in the Apps directory and map to real files

## Operational boundary

A passing repository gate proves deterministic contracts and static integration at the tested commit. It does not prove that a later deployment completed successfully or that every third-party source remains reachable indefinitely.

Production state must still be read from:

- `/api/health`
- `/api/health-watchers`
- feature-level freshness and source labels
- `docs/operations-runbook.md`

When a source fails, XSIC must retain the last labelled state or show an unavailable/degraded state. It must not infer route absence, proof verification, maturity promotion, or readiness improvement from failure.

## Completion definition

The remediation schedule is complete only after:

1. `scripts/check_release_gate.mjs` passes in GitHub Actions.
2. every required pull-request workflow for PR-18 succeeds.
3. PR-18 is squash-merged into `main`.
4. the resulting `main` commit is verified.

Passing this gate closes the planned 19-PR / 37-item remediation schedule. Future feature work must preserve these contracts or explicitly revise the fixed specifications before changing them.
