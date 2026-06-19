# Flow Alert Current and History Persistence

## Overview

Flow Alert separates the **current observation** from **accumulated history**.

- Current/live state comes from the current Flow observation path and is labelled with its source mode and freshness.
- Accumulated production history uses repo-managed JSON snapshots under `data/flow-history/`.
- Runtime memory/filesystem history is fallback only.
- A history fallback must never be presented as an unlabelled live/current observation.

## Storage layout

Current required history targets:

- `data/flow-history/exchanges-1h.json`
- `data/flow-history/exchanges-24h.json`
- `data/flow-history/exchanges-7d.json`

Optional targets supported by the update script:

- `data/flow-history/whales-1h.json`
- `data/flow-history/ripple-1h.json`

## JSON schema

Each history file stores:

- `latest`
- `previous`
- `recent` as a time-ordered bounded array
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

1. Calls `/api/xrpl/flow-snapshot?preset=...&window=...`.
2. Loads the matching `data/flow-history/*.json` file.
3. Rejects malformed or non-monotonic input.
4. Prevents duplicate append by timestamp and snapshot-content fingerprint.
5. Rebuilds `latest`, `previous`, `recent`, `deltaSummary`, and `historyMeta`.
6. Writes only when validated content changes.

Default `recent` cap is 168 entries. `FLOW_HISTORY_MAX_RECENT` may reduce or explicitly adjust the bounded cap.

## GitHub Actions

Workflow: `.github/workflows/update-flow-history.yml`

- supports `workflow_dispatch`;
- uses GitHub Actions `schedule` for recurring refresh;
- commits only validated `data/flow-history` changes;
- does not use Cloudflare Cron Triggers;
- uses commit message `chore(flow): update flow history snapshots`.

## API and UI behavior

`/api/xrpl/flow-history`:

1. reads `/data/flow-history/<preset>-<window>.json`;
2. returns committed history with source and freshness metadata;
3. if unavailable, uses the runtime fallback with an explicit fallback mode and stale/degraded reason;
4. does not claim that fallback history is a fresh current observation.

Flow Alert UI keeps these concepts separate:

- current observation;
- latest accumulated history item;
- previous history item;
- delta;
- history source mode;
- current freshness;
- history freshness;
- stale/degraded reason.

## Future D1/KV migration

A migration may replace the history write/read target while preserving the public response contract:

- current rows remain stable-key upserts;
- history remains bounded;
- raw upstream bodies remain forbidden;
- source mode and freshness remain explicit;
- the migration must not require Cloudflare Cron.

See also:

- `docs/architecture.md`
- `docs/data-source-map.md`
- `docs/runtime-ownership-map.md`
