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

For source probing:

`--url` checks a single source endpoint instead of the default multi-endpoint probe.

`--output-dir` sets the probe output directory.

`--limit` caps normalized probe output. The current maximum is 100.

## Future real-data step

The next implementation phase should replace static snapshot generation with a scheduled Top100 source pipeline.

The generated snapshot must keep the same contract documented in `apps/token-heatmap/SNAPSHOT_CONTRACT.md`.

Do not add D1, KV, or cron in this seed-generation phase.
