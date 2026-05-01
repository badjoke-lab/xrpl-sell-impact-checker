# Token Heatmap Seed and Snapshot Generation

This directory stores seed input for the XRPL Token Heatmap snapshot generator.

## Current seed file

`data/token-heatmap/seed.tokens.json`

The current seed is synthetic demo data. It is not market data.

## Generate snapshot

Run this from the repository root:

`node scripts/generate_token_heatmap_snapshot.mjs`

Default input:

`data/token-heatmap/seed.tokens.json`

Default output:

`apps/token-heatmap/token-heatmap-snapshot.demo.json`

## Optional arguments

`--input` sets the seed file path.

`--output` sets the snapshot output path.

`--top-limit` caps the generated token count. The current maximum is 100.

## Future real-data step

The next implementation phase should replace or augment `seed.tokens.json` with a real Top100 source pipeline.

The generated snapshot must keep the same contract documented in `apps/token-heatmap/SNAPSHOT_CONTRACT.md`.

Do not add D1, KV, or cron in this seed-generation phase.
