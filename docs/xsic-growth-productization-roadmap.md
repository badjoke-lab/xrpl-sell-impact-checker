# XSIC Growth & Productization Roadmap

## 1. Authority and purpose

This document is the recovery source of truth for the XSIC phase that follows reliability remediation.

When work is interrupted, compare this file with the current `main` SHA, merged pull requests, open branches, and workflow status. Resume from the first PR whose completion conditions are not fully satisfied.

This roadmap governs NX-00 through NX-14. The earlier reliability-remediation schedule remains closed in `docs/xsic-remediation-closeout.md`.

## 2. Fixed baseline

```text
Repository: badjoke-lab/xrpl-sell-impact-checker
Phase baseline main: c634aaadf068f6c8e1fba0fd3675e2f9101a0306
Previous phase: 19 / 19 scheduled PRs complete
Previous items: 37 / 37 complete
Next phase: Growth & Productization
```

## 3. Current position

```text
Roadmap status: ACTIVE
Current PR: NX-00
Current task: freeze this roadmap in the repository
Next PR after merge: NX-01 Repository truth alignment
Completed NX PRs: 0 / 15
Conditional paid PRs authorized: no
```

### Status legend

- `[ ]` not started
- `[~]` in progress
- `[x]` merged and verified
- `[!]` blocked; blocking reason must be written beside the item
- `[H]` held by an explicit product decision

## 4. Recovery protocol

After any interruption:

1. Read this file from current `main`.
2. Fetch the current `main` SHA.
3. List open and recently merged PRs.
4. Compare the current SHA with the last verified SHA recorded below.
5. Check the active PR's changed files and workflows.
6. Resume from the first unchecked completion condition.
7. Do not skip forward because later code appears to exist; the PR must also have passed its required gates and been recorded here.

Every NX PR must update this document before merge:

- mark its schedule row complete;
- record GitHub PR number;
- record merge SHA;
- set the next PR;
- update completed count;
- record any accepted deviation;
- update the last verified main SHA.

A change to scope, order, privacy rules, retention, monetization criteria, or Cloudflare scheduling policy requires an explicit roadmap amendment PR.

## 5. Product direction

XSIC will move from a collection of separate XRPL tools to a unified pre-trade decision console.

The central product will be **XSIC Pair Brief**. A user enters currency, issuer, and sell amount once, then receives separately labelled Sell Impact, Liquidity, Flow, Exit Coverage, Issuer Exposure, freshness, and source state.

The system must not emit a composite safety score, Buy/Sell recommendation, token certification, cryptographic verification claim, or institutional-ready verdict.

## 6. Common rules for all NX PRs

- One primary purpose per PR.
- Work sequentially unless this file explicitly allows parallel work.
- All applicable feature contracts and `Final Release Gate` must pass before merge.
- Production-impacting PRs must run the production smoke matrix.
- Cloudflare Cron Trigger configuration is prohibited.
- Recurring refresh may use GitHub Actions schedule only.
- No IP address, browser fingerprint, wallet identity, full User-Agent, raw upstream body, authorization header, or unrestricted debug dump may be persisted.
- Current state uses stable-key upsert.
- History requires explicit bounded retention and indexes.
- Source failure must remain stale, partial, missing, unavailable, or degraded; it must not create a positive conclusion.
- Each PR must be independently revertible by a normal revert PR.

## 7. Schedule overview

| Status | PR | Purpose | Depends on | GitHub PR | Merge SHA |
|---|---|---|---|---:|---|
| [~] | NX-00 | Freeze roadmap and recovery checkpoint | baseline | — | — |
| [ ] | NX-01 | Repository truth alignment | NX-00 | — | — |
| [ ] | NX-02 | Usage metrics schema and privacy contract | NX-01 | — | — |
| [ ] | NX-03 | Core usage instrumentation | NX-02 | — | — |
| [ ] | NX-04 | Usage and operations summary | NX-03 | — | — |
| [ ] | NX-05 | Pair Brief API contract | NX-04 | — | — |
| [ ] | NX-06 | Pair Brief UI | NX-05 | — | — |
| [ ] | NX-07 | Cross-tool state propagation | NX-06 | — | — |
| [ ] | NX-08 | Shareable snapshot and export | NX-07 | — | — |
| [ ] | NX-09 | Curated Pair Registry v1 | NX-08 | — | — |
| [ ] | NX-10 | Materialization workflows | NX-09 | — | — |
| [ ] | NX-11 | Pair coverage and refresh health | NX-10 | — | — |
| [ ] | NX-12 | Durable watcher change history | NX-11 | — | — |
| [ ] | NX-13 | Contextual support funnel | NX-04, NX-08 | — | — |
| [ ] | NX-14 | 30-day validation and monetization gate | NX-13 + observation | — | — |

## 8. PR definitions

### NX-00 — Roadmap freeze and recovery checkpoint

Deliverables:

- this roadmap file;
- README link to this roadmap;
- fixed baseline, update protocol, status table, and recovery procedure.

Completion conditions:

- roadmap is present on `main`;
- NX-00 through NX-14 are defined;
- the current position is recoverable from repository state alone;
- applicable documentation and release gates pass.

### NX-01 — Repository truth alignment

Align README, architecture, source ownership, Core/Labs classification, Flow history documentation, package scripts, and deployment verification with the current implementation.

Completion conditions:

- public description matches the actual app surface;
- `check:release` and `smoke:production` commands exist;
- current/history/fallback ownership is explicit;
- this roadmap records the merge.

### NX-02 — Usage metrics schema and privacy contract

Add aggregate-only D1 usage tables and a privacy contract. Store no individual event history. Hourly aggregates retain 90 days; daily aggregates retain 400 days unless a later amendment changes the policy.

Completion conditions:

- backward-compatible migration;
- PII-forbidden contract;
- retention policy updated;
- metrics failure cannot break Core tools.

### NX-03 — Core usage instrumentation

Instrument Core page views, estimates, cross-tool transitions, support clicks, and feature-interest signals through a fail-open event endpoint.

Completion conditions:

- duplicate events are controlled;
- payloads contain no prohibited identifiers;
- CI/smoke traffic can be excluded;
- production smoke passes.

### NX-04 — Usage and operations summary

Provide 7-day and 30-day aggregate usage alongside, but not mixed with, operational health.

Completion conditions:

- zero usage differs from query failure;
- low-volume pair data is suppressed below an anonymity threshold;
- usage, error, degraded, freshness, and workflow health are distinguishable.

### NX-05 — Pair Brief API contract

Create `/api/pair-brief` with separately labelled Sell Impact, Liquidity, Flow, Exit Coverage, Exposure, freshness, source modes, warnings, and partial state.

Completion conditions:

- bounded parallel requests;
- no composite score or recommendation;
- partial and degraded states are deterministic;
- production smoke passes.

### NX-06 — Pair Brief UI

Publish `/apps/pair-brief/` with one input flow and section-level results.

Completion conditions:

- mobile-first critical summary;
- detail links to existing tools;
- accessibility, SEO, sitemap, Apps directory, and production smoke pass.

### NX-07 — Cross-tool state propagation

Standardize query parameters and preserve currency, issuer, amount, window, preset, and source when moving between Pair Brief and Core tools.

Completion conditions:

- invalid query handling is shared;
- back/forward navigation works;
- no secret or personal information enters URLs;
- production smoke passes.

### NX-08 — Shareable snapshot and export

Add share URL, Markdown copy, JSON download, and print view containing checked time, observed ledger, source modes, freshness, warnings, and version.

Completion conditions:

- exports agree with displayed results;
- stale snapshots are labelled;
- no raw upstream or personal data is exported;
- production smoke passes.

### NX-09 — Curated Pair Registry v1

Add a reviewed registry of approximately 12–20 supported pairs with stable IDs, issuer/currency, display metadata, priority, enabled state, amount seeds, supported features, and review date.

Completion conditions:

- duplicate checks;
- enabled, disabled, and unsupported are distinct;
- listing is explicitly not endorsement;
- API and UI use the same registry.

### NX-10 — Materialization workflows

Use GitHub Actions schedule to refresh reviewed pair summaries. Do not use Cloudflare Cron.

Completion conditions:

- zero updates are not silently successful;
- pair-level failure summary;
- current upsert and bounded history;
- stale fallback retained;
- production smoke passes.

### NX-11 — Pair coverage and refresh health

Add pair/feature coverage, last success, freshness, unsupported state, and failure reason.

Completion conditions:

- coverage is not confused with route state;
- unsupported differs from failed;
- Pair Brief explains unavailable sections;
- production smoke passes.

### NX-12 — Durable watcher change history

Persist bounded source hashes and change events for Privacy/ZK, Proof Anchor, and Readiness sources without storing full source bodies.

Completion conditions:

- unchanged hashes do not create change events;
- changed, unchanged, and failed are distinct;
- volatile sources do not drive primary conclusions;
- no automatic maturity/readiness promotion;
- production smoke passes.

### NX-13 — Contextual support funnel

Add non-blocking support and feature-interest prompts after successful value delivery, not before results or on error screens.

Completion conditions:

- Core remains free;
- impressions and clicks are aggregate-only;
- support is not connected to investment conclusions;
- production smoke passes.

### NX-14 — 30-day validation and monetization gate

After at least 30 days, produce a reproducible report covering Pair Brief runs, active days, completion, degraded/error rate, repeat pair use, support interest, paid-feature interest, and platform usage.

Initial GO criteria:

- at least 100 successful Pair Brief runs;
- usage on at least 15 of 30 days;
- completion rate at least 70%;
- degraded plus error rate below 10%;
- repeated pair use on at least 5 days;
- at least 5 support clicks or 1% support CTR;
- at least 10 interest events for one paid candidate.

If criteria are not met, paid development remains unauthorized. A GO decision may authorize only the highest-demand candidate first.

## 9. Conditional paid phase

No paid PR is authorized at roadmap creation.

Possible later PRs, only after NX-14 GO:

- PAID-01 minimal account/auth and legal review;
- PAID-02 saved watchlists;
- PAID-03 scheduled alerts;
- PAID-04 batch checks or bulk export;
- PAID-05 Stripe entitlement;
- PAID-06 limits, billing, refund, and disclosure;
- PAID-07 paid production gate.

The order must follow measured demand; these PRs are not pre-approved as a bundle.

## 10. Phase timing

- Weeks 1–2: NX-00 through NX-04
- Weeks 3–5: NX-05 through NX-08
- Weeks 6–8: NX-09 through NX-13
- Weeks 9–12: observation period
- Week 13: NX-14

Dates are indicative. Completion conditions and verified merges take precedence over calendar targets.

## 11. Verified-state ledger

| Checkpoint | Main SHA | Result |
|---|---|---|
| Reliability remediation closeout | `c634aaadf068f6c8e1fba0fd3675e2f9101a0306` | verified baseline |
| NX-00 | pending | roadmap branch in progress |

## 12. Next action

Complete NX-00, merge it, update this file with the PR number and merge SHA, then begin NX-01 from the verified `main` SHA.
