# XSIC Architecture

## Purpose

XSIC is a static-first Cloudflare Pages application with Pages Functions for normalized API access, bounded storage, repository-managed materialized history, and GitHub Actions for scheduled refresh and validation.

The architecture prioritizes truthful source attribution, bounded failure behavior, and independently testable feature contracts over a single opaque score.

## Product layers

### Core decision layer

- Sell Impact
- Liquidity Pulse
- Flow Alert
- Exit Coverage Map
- Exposure Graph
- Token Heatmap
- planned Pair Brief aggregation

Core tools answer pre-trade and market-structure questions. They may combine live and materialized inputs, but each section preserves its own source mode and freshness.

### Labs and research layer

- Privacy / ZK Watch
- Proof Anchor Checker
- Institutional Readiness Radar

Labs surfaces organize reviewed evidence. They do not convert external activity, unresolved verifier endpoints, weak linkage, or source volatility into confirmed XRPL production claims.

### Shared trust layer

- input validation and JSON error envelopes
- bounded upstream transport
- canonical request identity and in-flight sharing
- shared freshness model
- feature and watcher health
- bounded retention and response security
- accessibility, mobile, SEO, and route contracts
- Final Release Gate and public production smoke

## Runtime topology

```text
Browser
  -> static HTML/CSS/JS on Cloudflare Pages
  -> /api/* Pages Functions
       -> live XRPL RPC and reviewed external sources
       -> D1/KV current and bounded history when configured
       -> committed repository JSON for designated history/snapshot surfaces

GitHub Actions
  -> scheduled refresh and validation
  -> bounded repository snapshots/current rows
  -> no Cloudflare Cron Triggers
```

## Source priority

The general priority for user-triggered market checks is:

```text
successful matching live result
  > valid matching materialized/precomputed current row
  > labelled stale fallback
  > explicit missing/partial/degraded failure
```

A feature may designate committed repository JSON as the authoritative history source. That does not make it the authoritative live/current observation.

## State model

XSIC keeps these states distinct:

- `fresh`
- `aging`
- `stale`
- `missing`
- `partial`
- `degraded`

Feature-specific states remain separate from transport state. For example, Exit Coverage `none` means successfully checked route absence; it never represents an upstream request failure.

## Storage boundaries

- Current rows are stable-key upserts.
- History has explicit caps and retention periods.
- Raw upstream bodies are not retained.
- Secrets, authorization headers, IP addresses, browser fingerprints, wallet identities, and unrestricted debug dumps are not persisted.
- Repository snapshots must pass deterministic schema validation before use.

## Scheduling boundary

Cloudflare Cron Triggers are prohibited. Scheduled refresh uses GitHub Actions `schedule` and `workflow_dispatch`. Request-time APIs remain available independently of scheduled materialization.

## Deployment and verification

Every runtime PR must pass applicable feature contracts and the Final Release Gate. Production-impacting changes also run `scripts/smoke_production.mjs` from a GitHub-hosted runner against the public site.

## Change control

A PR that changes source authority, fallback priority, retention, scheduling, privacy, or a user-visible trust conclusion must update the corresponding architecture, source map, runtime ownership, and roadmap/state documentation in the same PR.
