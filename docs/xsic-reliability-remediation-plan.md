# XSIC Reliability Remediation Plan

## 1. Purpose

This document is the execution ledger for the XSIC full reliability remediation.
It converts the completed audit into a fixed sequence of **19 pull requests** covering **37 remediation items**.

The remediation is intentionally incremental:

- one pull request at a time;
- one bounded concern per pull request;
- validation before merge;
- a status report after every merge;
- no implementation work from a later pull request before the prior pull request is merged and reported.

PR-00 is documentation-only. It must not change runtime code, configuration, data, workflows, or the public site.

## 2. Non-negotiable guardrails

1. **Cloudflare Cron Triggers are prohibited.** They were intentionally removed after a high-cost incident. They must not be used, re-added, proposed, or restored.
2. Scheduled refresh work must continue through the existing GitHub Actions `schedule` / `workflow_dispatch` pattern or an explicitly approved non-Cloudflare-Cron mechanism.
3. Live XRPL results remain the source of truth. Cached, precomputed, materialized, or repository snapshots may improve initial display and fallback behavior, but must never be presented as a fresh live result when they are not.
4. Storage must remain bounded. Raw upstream JSON, HTML, and debug bodies must not be retained long term.
5. `fresh`, `aging`, `stale`, `missing`, `partial`, and `degraded` states must be explicit and must not be collapsed into a generic success state.
6. External projects, testnet activity, proposals, unresolved verifier surfaces, and weak sources must not be represented as XRPL core production facts.
7. Each remediation PR must include its own acceptance criteria and validation evidence.
8. If `main` advances while a remediation PR is open, the PR must be rechecked against the new `main` before merge.

## 3. PR-00 start baseline

Baseline captured when PR-00 began:

- repository: `badjoke-lab/xrpl-sell-impact-checker`
- default branch: `main`
- starting `main` SHA: `acc4f2138b4b1856a425400ccac25f476eddd521`
- latest merged PR observed: `#247` (`a7487b1c72022572da5d244dd81c544138896073`)
- pre-existing open PR observed: draft `#248`
- PR #248 changed files at the time of inspection:
  - `data/token-heatmap/README.md`
  - `scripts/probe_token_heatmap_exit_coverage.mjs`
- repository write permission: confirmed
- remediation progress before PR-00: `0 / 19 PR`
- remediation progress after PR-00 merge: `1 / 19 PR`

PR #248 is unrelated to PR-00. The remediation plan file must remain isolated from its changed files.

## 4. Required report after every merge

After every remediation PR is merged, report all of the following before starting the next PR:

1. the complete 19-PR schedule;
2. the current position and completed count;
3. the merged PR number and merge commit;
4. the exact files and behavior changed;
5. validation and CI results;
6. unresolved risks or conflicts;
7. the next PR and its bounded scope.

## 5. Fixed 19-PR schedule and 37 remediation items

### PR-00 — Freeze the remediation plan

**Scope:** documentation only.

- [x] **R-001** Add this fixed 19-PR / 37-item execution ledger, guardrails, dependencies, acceptance rules, and reporting gate.

**Acceptance:**

- only `docs/xsic-reliability-remediation-plan.md` changes;
- all 19 PRs and all 37 items are present;
- Cloudflare Cron prohibition is explicit;
- no code, configuration, data, workflow, or site behavior changes.

---

### PR-01 — Add remediation guardrails and runtime ownership map

- [ ] **R-002** Add an automated guard that fails if Cloudflare Cron Trigger configuration is introduced into deployment configuration.
- [ ] **R-003** Document the authoritative source, fallback source, update path, and owner for each runtime surface: Sell Impact, Liquidity Pulse, Flow Alert, Exit Coverage Map, Exposure Graph, Token Heatmap, watcher pages, and service health.

**Depends on:** PR-00.

---

### PR-02 — Establish the mandatory validation baseline

- [ ] **R-004** Consolidate the repository's deterministic validators and document the single required local/CI validation sequence.
- [ ] **R-005** Add a required smoke matrix for static routes, JSON API responses, schema checks, SEO audit, and critical cross-page links.

**Depends on:** PR-01.

---

### PR-03 — Standardize API input and error contracts

- [ ] **R-006** Introduce a shared JSON error envelope with stable error codes, HTTP status handling, source metadata, and request correlation fields where appropriate.
- [ ] **R-007** Apply strict validation and deterministic failure behavior to currency, issuer, amount, pair, window, preset, and identifier inputs without returning HTML shells from `/api/*` routes.

**Depends on:** PR-02.

---

### PR-04 — Harden upstream request behavior

- [ ] **R-008** Standardize upstream timeout, retry, abort, response-size, and content-type handling for XRPL RPC and external source requests.
- [ ] **R-009** Standardize partial-result and stale-fallback behavior, including explicit source attribution and no silent substitution of demo or cached data.

**Depends on:** PR-03.

---

### PR-05 — Unify cache keys and freshness semantics

- [ ] **R-010** Normalize pair/source cache keys and suppress duplicate in-flight requests without conflating different issuer, currency, amount, ledger, or mode inputs.
- [ ] **R-011** Provide one shared freshness model for `fresh`, `aging`, `stale`, `missing`, `partial`, and `degraded`, with consistent timestamps and last-success metadata.

**Depends on:** PR-04.

---

### PR-06 — Close Sell Impact correctness gaps

- [ ] **R-012** Enforce the priority order `live result > valid matching precompute > stale fallback`, including amount-seed and pair mismatch protection.
- [ ] **R-013** Add regression coverage for route selection, Route A/B/C explanations, zero/no-liquidity cases, partial routes, rounding, and source/freshness labels.

**Depends on:** PR-05.

---

### PR-07 — Make Liquidity Pulse stateful and failure-safe

- [ ] **R-014** Fix the current / 1h / 6h / 24h response contract so displayed comparisons identify their source, observation time, and comparable baseline.
- [ ] **R-015** Make loading, empty, missing, stale, partial, and degraded states explicit in both API and UI, with deterministic fallback behavior.

**Depends on:** PR-05.

---

### PR-08 — Stabilize Flow Alert history and presentation

- [ ] **R-016** Validate repo-managed Flow Alert history snapshots before commit/use, preserve bounded history, and reject malformed or non-monotonic updates.
- [ ] **R-017** Keep API and UI history, latest, previous, delta, stale reason, and source mode consistent, including fallback behavior when repository JSON is unavailable.

**Depends on:** PR-05.

---

### PR-09 — Enforce the Exit Coverage Map contract

- [ ] **R-018** Enforce the fixed four-state mapping: `dual`, `book-only`, `amm-only`, and `none`, with summary counts derived from rows.
- [ ] **R-019** Add regression coverage for invalid issuer behavior, candidate rows, detail binding, observed ledger/freshness, and Sell Impact deep links on every row.

**Depends on:** PR-03, PR-04, PR-05.

---

### PR-10 — Harden Exposure Graph and Token Heatmap truthfulness

- [ ] **R-020** Remove or clearly label inferred, demo, pending, unknown, or unverified exposure/exit values so they cannot be read as confirmed live facts.
- [ ] **R-021** Validate snapshot schema, XRPL currency display/canonical values, selection stability, empty states, and layout behavior for long identifiers and partial records.

**Depends on:** PR-02, PR-05.

---

### PR-11 — Connect Privacy / ZK Watch to reliable source-state data

- [ ] **R-022** Normalize watcher outputs for primary/secondary groups, HTTP state, normalized change detection, last checked time, and stable/low-change/active/volatile classification.
- [ ] **R-023** Enforce maturity, role, network, source-quality, confirmed/not-confirmed, and volatile-source exclusion rules in watchlist, detail, and timeline displays.

**Depends on:** PR-04, PR-05.

---

### PR-12 — Make Proof Anchor Checker an evidence-separation tool

- [ ] **R-024** Keep chain registry, proof-side, verifier, and linkage evidence separate, with strong/medium/unresolved source labels and freshness data.
- [ ] **R-025** Add tests that prohibit unsupported `Verified`/`Matched` conclusions and preserve `Verifier Endpoint Unresolved` and `No Strong Link Between Proof And XRPL Tx` as valid outcomes.

**Depends on:** PR-04, PR-05.

---

### PR-13 — Stabilize Institutional Readiness Radar

- [ ] **R-026** Enforce the fixed eight-axis model, the reviewed DNA Protocol baseline, strongest/weakest grouping, and the ban on a definitive institutional-ready verdict.
- [ ] **R-027** Connect primary/volatile source freshness without auto-promoting readiness scores from source activity alone.

**Depends on:** PR-11, PR-12.

---

### PR-14 — Unify health, observability, and degraded mode

- [ ] **R-028** Extend service health to report upstream reachability, latency, last success, cache/precompute/materialized freshness, history freshness, and feature-level status.
- [ ] **R-029** Define deterministic degraded-mode triggers and user-visible consequences, including stale serving, heavy-operation suppression, and recovery visibility.

**Depends on:** PR-06 through PR-13.

---

### PR-15 — Enforce bounded retention and operational security

- [ ] **R-030** Enforce bounded retention/current-row rules and verify that raw upstream bodies, secrets, and unnecessary debug payloads are not persisted.
- [ ] **R-031** Harden security headers, secret handling, log redaction, external-link behavior, dependency exposure, and failure responses without weakening required app functionality.

**Depends on:** PR-14.

---

### PR-16 — Repair accessibility, navigation, and mobile resilience

- [ ] **R-032** Standardize unique page headings, landmarks, keyboard operation, focus states, table/card semantics, status announcements, and shared navigation/footer behavior.
- [ ] **R-033** Verify 360px mobile layout, long XRPL identifiers, overflow, touch targets, reduced motion, canvas fallbacks, and no critical information conveyed by color alone.

**Depends on:** PR-06 through PR-13.

---

### PR-17 — Align SEO, documentation, and deployment runbooks

- [ ] **R-034** Make title, description, canonical, Open Graph, Twitter metadata, structured data, sitemap coverage, and internal links consistent with the actual XSIC app surface.
- [ ] **R-035** Update README, methods, troubleshooting, post-deploy checks, source-of-truth notes, and operational runbooks to match the implemented runtime and no-Cloudflare-Cron policy.

**Depends on:** PR-14, PR-15, PR-16.

---

### PR-18 — Run the final reliability gate and close the remediation

- [ ] **R-036** Run the complete repository regression suite and production smoke matrix across static routes, APIs, live/fallback states, critical links, mobile behavior, and health reporting.
- [ ] **R-037** Publish the closeout report with final SHA, merged PR list, validation evidence, remaining accepted risks, rollback notes, and post-remediation operating rules.

**Depends on:** all prior remediation PRs.

## 6. Execution phases

### Phase A — Governance and test foundation

- PR-00 through PR-02
- freezes scope, prevents forbidden infrastructure regression, and establishes the required validation gate.

### Phase B — Shared runtime reliability

- PR-03 through PR-05
- standardizes API contracts, upstream handling, cache identity, and freshness semantics.

### Phase C — Core tool correctness

- PR-06 through PR-10
- repairs Sell Impact, Liquidity Pulse, Flow Alert, Exit Coverage Map, Exposure Graph, and Token Heatmap.

### Phase D — Watcher and evidence integrity

- PR-11 through PR-13
- connects watcher state while preserving source quality, unresolved evidence, and caution rules.

### Phase E — Operations and public hardening

- PR-14 through PR-17
- unifies health, retention, security, accessibility, mobile behavior, SEO, and runbooks.

### Phase F — Final gate

- PR-18
- proves the integrated result and closes the remediation with explicit residual risks.

## 7. Definition of done for every remediation PR

A remediation PR is not complete until all applicable conditions are met:

- scope matches the scheduled PR and does not pull later work forward;
- changed files are reviewed for unintended runtime or data effects;
- deterministic tests/validators pass;
- affected route/API behavior is manually or contractually verified;
- stale, partial, missing, and degraded behavior is checked where relevant;
- no Cloudflare Cron Trigger is added or proposed;
- PR discussion contains no unresolved blocking review thread;
- merge SHA is recorded;
- the required post-merge report is delivered before the next PR starts.

## 8. Current position

```text
Total remediation PRs: 19
Completed before PR-00: 0
PR-00: documentation plan
Next after PR-00 merge: PR-01 — remediation guardrails and runtime ownership map
```
