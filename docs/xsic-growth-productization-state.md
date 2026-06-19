# XSIC Growth & Productization State

This is the compact mutable checkpoint for `docs/xsic-growth-productization-roadmap.md`.

```text
Roadmap: docs/xsic-growth-productization-roadmap.md
Phase: Growth & Productization
State: IN_PROGRESS
Current PR: NX-01 Repository truth alignment
GitHub PR: pending
Branch: nx01-repository-truth
Last verified main: 8be5892efcc0312e2251f7a7f28f330343430b67
Completed NX PRs: 1 / 15
Next PR after merge: NX-02 Usage metrics schema and privacy contract
Conditional paid phase: NOT AUTHORIZED
Last updated: 2026-06-20 UTC
```

## Recovery check

1. Read this file and `docs/xsic-growth-productization-roadmap.md`.
2. Fetch current `main` SHA and compare it with `Last verified main`.
3. Inspect branch `nx01-repository-truth` and the NX-01 PR if present.
4. Resume from the first unchecked NX-01 completion condition.
5. Begin NX-02 only after NX-01 is merged and its merge SHA is recorded.

## Completed checkpoints

- Reliability remediation and production closeout: `c634aaadf068f6c8e1fba0fd3675e2f9101a0306`
- NX-00 roadmap and recovery checkpoint: PR #269 / `8be5892efcc0312e2251f7a7f28f330343430b67`

## NX-01 completion checklist

- [ ] README describes the current XSIC app surface
- [ ] Core and Labs are explicitly separated
- [ ] Architecture and data-source documents match runtime ownership
- [ ] Flow Alert current/history/fallback wording is aligned
- [ ] `check:release`, `smoke:production`, and `check:all` commands exist
- [ ] Final Release Gate passes
- [ ] Roadmap and state record the merged PR and SHA
