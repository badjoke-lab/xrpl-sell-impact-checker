# XSIC Reliability Validation

## Required command

Run the deterministic repository gate before opening or merging a remediation PR:

```bash
pnpm run check:reliability
```

This command is also executed by `.github/workflows/reliability-guardrails.yml` on every pull request and on pushes to `main`.

## What the gate checks

1. Required public routes exist.
2. Critical Pages Function entry files exist and pass `node --check`.
3. Flow Alert history JSON files parse, contain the required top-level contract, have matching counts, and remain strictly time ordered.
4. Token Heatmap snapshot JSON parses and contains its required contract fields.
5. Local links from required public routes resolve to repository files.
6. The existing SEO audit passes.
7. The separate scheduled-trigger guard confirms that Wrangler configuration has no Cloudflare scheduled-trigger configuration.

## Required smoke matrix

The deterministic gate does not replace production smoke testing. For any PR touching an affected surface, run the applicable rows below.

| Area | Local / contract check | Production check | Required result |
|---|---|---|---|
| Static shell | Open `/`, `/apps/`, `/methods/`, `/faq/`, `/disclaimer/`, `/credits/`, `/donate/` | Same routes on `https://xsic.badjoke-lab.com` | HTTP 200, shared navigation/footer render, one page-specific heading |
| App routes | Open Sell Impact, Liquidity Pulse, Flow Alert, Exit Coverage Map, Exposure Graph, Token Heatmap | Same routes in production | HTTP 200, no uncaught initialization error, mobile layout remains usable |
| Core JSON APIs | Call `/api/ping`, `/api/book-offers`, `/api/amm-info` through `wrangler pages dev` | Repeat against production | JSON content type; no HTML shell; validation failures use an intentional status |
| Liquidity APIs | Call `/api/xrpl/amm-snapshot` and `/api/xrpl/liquidity-history` | Repeat against production | Source and observation/freshness metadata are present; stale fallback is labelled |
| Flow APIs | Call `/api/xrpl/flow-snapshot` and `/api/xrpl/flow-history` | Repeat against production | `latest`, `previous`, `recent`, `deltaSummary`, `historyMeta` remain coherent |
| Exit coverage | Valid issuer, invalid issuer, no candidates, and representative four-state fixtures | One valid and one invalid production request | `dual`, `book-only`, `amm-only`, `none` remain distinct; every row has Sell Impact link |
| Data contracts | Run the reliability gate and any feature-specific validator | Inspect latest generated snapshot/history metadata | JSON parses, counts match, timestamps are ordered, bounded retention is respected |
| SEO | Run `pnpm run audit:seo` | Inspect canonical/title/description on touched public pages | Canonical and sitemap mapping remain correct |
| Critical links | Run reliability gate local-link check | Click primary tool, methods, disclaimer, and support links | No broken internal route or accidental `.html` regression |
| Failure states | Simulate timeout, malformed input, missing history, stale cache | Observe one controlled degraded response where practical | Loading, empty, stale, partial, degraded, and error are not conflated |

## Local runtime rule

Use `pnpm run dev` / `wrangler pages dev`. Do not use a plain static HTTP server for API verification because `/api/*` would not execute Pages Functions.

## Merge evidence

Each remediation PR description must record:

- command(s) run;
- result;
- affected smoke-matrix rows;
- any production-only check that could not be executed;
- accepted residual risk.
