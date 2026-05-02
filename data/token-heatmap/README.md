# Token Heatmap Seed and Snapshot Generation

This directory stores seed input for the XRPL Token Heatmap snapshot generator.

## Current seed file

`data/token-heatmap/seed.tokens.json`

The current seed is synthetic demo data. It is not market data.

## Generate demo snapshot

Run this from the repository root:

`node scripts/generate_token_heatmap_snapshot.mjs`

Default input:

`data/token-heatmap/seed.tokens.json`

Default output:

`apps/token-heatmap/token-heatmap-snapshot.demo.json`

## Generate static XRPL.to snapshot

Run this from the repository root:

`node scripts/update_token_heatmap_snapshot_from_xrplto.mjs`

Default output:

`apps/token-heatmap/token-heatmap-snapshot.json`

The page reads snapshots in this order:

1. `apps/token-heatmap/token-heatmap-snapshot.json`
2. `apps/token-heatmap/token-heatmap-snapshot.demo.json`
3. inline synthetic fallback

This path still does not use D1, KV, or cron.

## Probe Top20 exit coverage

Run this from the repository root after a real snapshot exists:

`node scripts/probe_token_heatmap_exit_coverage.mjs`

Default input:

`apps/token-heatmap/token-heatmap-snapshot.json`

Default output directory:

`data/token-heatmap/probe/`

Probe output files:

- `exit-coverage-top20-report.json`
- `exit-coverage-top20-patch.json`

The probe checks only Top20 by default. It calls XRPL RPC `book_offers` and `amm_info` against XRP and classifies each token as:

- `dual`
- `book-only`
- `amm-only`
- `none`

This probe output is not used by the page automatically. Review the report before mixing exit coverage into the generated snapshot.

## Exit coverage rollout plan

1. Probe Top20 and inspect runtime, errors, and distribution.
2. If stable, merge Top20 exitCoverage into the static snapshot generator.
3. Keep Top21-100 as `unknown` / `Exit check pending`.
4. Add UI distinction for `checked Top20` vs `pending others`.
5. Only after that consider Top50, then Top100.

The final UI pass is required after data mixing. It should make the checked/pending split obvious in the status strip, detail card, legend, and fallback list.

## Source selection rule

For the production-like static snapshot, prefer the market cap sorted XRPL.to response when it has enough usable rows. This keeps the default Market Mode aligned with normal heatmap expectations.

The probe may still select a volume-sorted endpoint for diagnostics if it has better field coverage.

## Currency display rule

XRPL issued currency codes can appear as 40-character hex values. The generator keeps the canonical `currency` field for links and API use, and adds `displayCurrency` for human-readable labels when the hex value decodes to printable ASCII.

Example:

`524C555344000000000000000000000000000000` becomes `RLUSD` for display.

## Probe source candidates

Run this from the repository root:

`node scripts/probe_token_heatmap_sources.mjs`

By default the probe checks multiple XRPL.to token-list sorts and chooses the best normalized result:

- marketcap descending
- vol24h descending
- vol24hxrp descending

Default output directory:

`data/token-heatmap/probe/`

Probe output files:

- `xrplto-raw.sample.json`
- `xrplto-candidates.json`
- `xrplto-report.json`

The probe output is not used by the page automatically. Inspect the report before promoting any candidate data into the snapshot generator input.

## Optional arguments

For demo snapshot generation:

`--input` sets the seed file path.

`--output` sets the snapshot output path.

`--top-limit` caps the generated token count. The current maximum is 100.

For static XRPL.to snapshot generation:

`--url` checks a single source endpoint instead of the default multi-endpoint updater.

`--output` sets the output path.

`--limit` caps normalized output. The current maximum is 100.

For exit coverage probing:

`--input` sets the snapshot input path.

`--output-dir` sets the probe output directory.

`--limit` caps checked tokens. The current maximum is 20.

`--delay-ms` adds delay between token checks.

For source probing:

`--url` checks a single source endpoint instead of the default multi-endpoint probe.

`--output-dir` sets the probe output directory.

`--limit` caps normalized probe output. The current maximum is 100.

## Future real-data step

The next implementation phase should replace static snapshot generation with a scheduled Top100 source pipeline.

The generated snapshot must keep the same contract documented in `apps/token-heatmap/SNAPSHOT_CONTRACT.md`.

Do not add D1, KV, or cron in this seed-generation phase.
