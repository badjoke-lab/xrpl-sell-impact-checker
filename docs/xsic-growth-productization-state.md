# XSIC Growth & Productization State

This is the compact mutable checkpoint for `docs/xsic-growth-productization-roadmap.md`.

```text
Roadmap: docs/xsic-growth-productization-roadmap.md
Phase: Growth & Productization
State: IN_PROGRESS
Current PR: NX-02 Usage metrics schema and privacy contract
GitHub PR: #271
Branch: nx02-usage-metrics-contract
Last verified product merge: 3dd3f1d4bd5a4f647ac2a85f9df5f45a969e7aec
Current branch base includes administrative no-op cleanup commits on main
Completed NX PRs: 2 / 15
Next PR after merge: NX-03 Core usage instrumentation
Conditional paid phase: NOT AUTHORIZED
Last updated: 2026-06-20 UTC
```

## Recovery check

1. Read this file and `docs/xsic-growth-productization-roadmap.md`.
2. Inspect PR #271 and branch `nx02-usage-metrics-contract`.
3. Compare the branch with current `main`; automated Flow history and administrative no-op cleanup may advance `main` independently.
4. Resume from the first unchecked NX-02 completion condition.
5. Begin NX-03 only after NX-02 is merged and its merge SHA is recorded here.

## Completed checkpoints

- Reliability remediation and production closeout: `c634aaadf068f6c8e1fba0fd3675e2f9101a0306`
- NX-00 roadmap and recovery checkpoint: PR #269 / `8be5892efcc0312e2251f7a7f28f330343430b67`
- NX-01 repository truth alignment: PR #270 / `3dd3f1d4bd5a4f647ac2a85f9df5f45a969e7aec`

## NX-02 completion checklist

- [x] Aggregate-only hourly and daily D1 migration added
- [x] No raw individual-event table exists
- [x] Event and feature allowlists are fixed
- [x] PII and raw-data prohibited fields are fixed
- [x] Pair dimension uses optional SHA-256 hash only
- [x] Hourly retention is 90 days and daily retention is 400 days
- [x] Shared retention policy and documentation are updated
- [x] Fail-open telemetry rule is documented
- [x] Contract checker and pull-request workflow are added
- [x] GitHub PR #271 is recorded
- [ ] Required workflows pass on latest head
- [ ] PR #271 is merged
- [ ] NX-02 merge SHA is recorded when NX-03 begins
