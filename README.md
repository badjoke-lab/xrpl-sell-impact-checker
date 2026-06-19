# XRPL Signal & Insight Console (XSIC)

XSIC is a reliability-first collection of XRPL decision-support and research tools maintained by BadJoke-Lab. It combines live XRPL checks, bounded materialized history, explicit freshness states, and source-labelled research surfaces. XSIC does not provide investment advice, a Buy/Sell recommendation, a token safety certification, or a composite institutional-readiness verdict.

Production: https://xsic.badjoke-lab.com/

## Product surface

### Core decision tools

- **Sell Impact** — estimates order-book and AMM execution impact for an XRPL IOU sale.
- **Liquidity Pulse** — compares current liquidity with bounded materialized history.
- **Flow Alert** — presents current and historical flow observations with explicit source mode and freshness.
- **Exit Coverage Map** — distinguishes `dual`, `book-only`, `amm-only`, and `none` routes without turning upstream failure into route absence.
- **Exposure Graph** — shows source-labelled issuer and market exposure; inferred output remains explicitly heuristic.
- **Token Heatmap** — presents validated token snapshots; exit-route colouring remains disabled until route data is connected.

### Labs and research tools

- **Privacy / ZK Watch** — follows reviewed privacy and zero-knowledge sources without treating volatile activity as confirmed maturity.
- **Proof Anchor Checker** — separates chain, proof, verifier, and linkage evidence and preserves unresolved outcomes.
- **Institutional Readiness Radar** — presents eight reviewed axes without a composite institutional-ready verdict.

The next central product is **XSIC Pair Brief**, which will combine Core results for one currency, issuer, and amount while preserving section-level source and freshness states.

## Active roadmap and recovery point

The fixed development schedule is maintained in:

- `docs/xsic-growth-productization-roadmap.md`

The compact current-position checkpoint is maintained in:

- `docs/xsic-growth-productization-state.md`

After an interrupted work session, read both files first. The state file is authoritative for the active PR and next action. The roadmap is authoritative for scope, order, completion conditions, privacy, retention, and monetization gates.

The completed reliability-remediation phase is recorded in:

- `docs/xsic-remediation-closeout.md`

Supporting runtime documentation:

- `docs/architecture.md`
- `docs/data-source-map.md`
- `docs/runtime-ownership-map.md`
- `docs/flow-alert-history.md`
- `docs/final-gate.md`

## Local development

```bash
pnpm install
pnpm run dev
```

> [!IMPORTANT]
> Do **not** use `python -m http.server` for verification. It serves static files only and returns HTML for `/api/*`. Use `wrangler pages dev` through the package scripts so Pages Functions behave like production.

Default local URL: `http://0.0.0.0:5173`

## Validation

```bash
pnpm run check:reliability
pnpm run audit:seo
pnpm run check:release
pnpm run smoke:production
```

`pnpm run check:all` is the mandatory repository release command. Pull requests also run feature-specific contracts, the Final Release Gate, and the public production smoke workflow.

## Deployment

XSIC is deployed to Cloudflare Pages. Cloudflare Cron Triggers are prohibited. Recurring refresh work uses reviewed GitHub Actions `schedule` / `workflow_dispatch` workflows.

```bash
pnpm install
pnpm run pages:dev
npx wrangler pages deploy .
```

## Runtime source rules

- Successful matching live XRPL results remain authoritative for user-triggered checks.
- Materialized current rows, bounded history, repository JSON, and precompute rows are preload or fallback layers only unless a surface explicitly defines committed history as its history source.
- Every fallback exposes source mode, observation time, and freshness.
- Current records use stable-key upsert; history is bounded.
- Raw upstream bodies, secrets, personal identifiers, and unrestricted debug dumps are not retained.
- `fresh`, `aging`, `stale`, `missing`, `partial`, and `degraded` are distinct states.

Flow Alert history is described in `docs/flow-alert-history.md`. Committed `data/flow-history/*.json` is authoritative for accumulated history; live/current observations and fallback state remain separately labelled.

## Troubleshooting

- Confirm `/` and `/apps/` load without a 404.
- Confirm `/api/ping`, `/api/health`, and `/api/health-watchers` return JSON.
- Inspect browser console output for network, CORS, or rendering errors.
- Inspect GitHub Actions for materialized-history or watcher failures.
- Inspect Cloudflare logs for request-time upstream timeout or binding errors.
- Do not restore Cloudflare Cron as a recovery action.

## Post-deploy verification

Run the maintained smoke script rather than a handwritten partial checklist:

```bash
XSIC_BASE_URL=https://xsic.badjoke-lab.com pnpm run smoke:production
```

The smoke matrix checks the public app routes, health endpoints, watcher sources, Exit Coverage four-state rows and Sell Impact links, and Proof Anchor evidence structure.
