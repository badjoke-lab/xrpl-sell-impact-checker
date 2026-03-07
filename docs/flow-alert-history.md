# Flow Alert History Persistence

## Overview

Flow Alert history persistence uses **repo-managed JSON snapshots** under `data/flow-history/`.
The source of truth in production is these committed JSON files, updated by GitHub Actions.

- Runtime memory / filesystem storage in Pages Functions is treated as fallback only.
- UI/API should prioritize repository JSON history when available.

## Storage layout

Current required targets:

- `data/flow-history/exchanges-1h.json`
- `data/flow-history/exchanges-24h.json`
- `data/flow-history/exchanges-7d.json`

Optional future targets (supported by update script):

- `data/flow-history/whales-1h.json`
- `data/flow-history/ripple-1h.json`

## JSON schema

Each file stores:

- `latest`
- `previous`
- `recent` (time-ordered array)
- `deltaSummary`
- `historyMeta`
  - `count`
  - `oldestTs`
  - `newestTs`
  - `preset`
  - `window`
  - `updatedAt`

`deltaSummary` is recalculated from `latest` and `previous`.

## Update flow

Updater script: `scripts/update_flow_history.mjs`

1. Calls production snapshot endpoint:
   - `/api/xrpl/flow-snapshot?preset=...&window=...`
2. Loads existing `data/flow-history/*.json`.
3. Prevents duplicate append by checking:
   - same timestamp (`ts`), or
   - same snapshot content fingerprint.
4. Rebuilds `latest/previous/recent/deltaSummary/historyMeta`.
5. Writes only when content changes.

Default `recent` cap is 168 entries (`FLOW_HISTORY_MAX_RECENT` override available).

## GitHub Actions

Workflow: `.github/workflows/update-flow-history.yml`

- `workflow_dispatch` (manual)
- hourly `schedule`
- commits only `data/flow-history` changes on `main`
- commit message:
  - `chore(flow): update flow history snapshots`

## API/UI behavior

`/api/xrpl/flow-history` behavior:

1. Reads static JSON from `/data/flow-history/<preset>-<window>.json`.
2. If unavailable, falls back to runtime store (memory/fs fallback).

Flow Alert UI consumes `/api/xrpl/flow-history`, so it naturally prefers accumulated JSON history.

## Migration note (D1/KV)

If migrating to Cloudflare D1/KV:

- Replace `scripts/update_flow_history.mjs` write target (file output) with DB/KV writes.
- Replace static JSON read path in `functions/api/xrpl/flow-history.js` with D1/KV lookup.
- Keep response shape unchanged so UI does not require major changes.
