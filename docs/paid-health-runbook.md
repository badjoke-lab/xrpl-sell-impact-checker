# XSIC paid feature health runbook

This runbook covers the paid-plan current/history layers currently surfaced by `/api/health`.

## Health fields

`/api/health` returns three paid feature blocks under `features`:

- `sell_impact_precompute`
- `liquidity_pulse`
- `flow_alert`

Each block has the same core freshness shape:

- `freshness`: `fresh`, `aging`, `stale`, or `missing`
- `age_ms`: age of the latest successful current/history row
- `warn_after_ms`: threshold where the feature becomes `aging`
- `stale_after_ms`: threshold where the feature becomes `stale`

`ops_summary` gives a compact operator view:

- `status`: `ok` or `attention`
- `degraded_features`: feature keys that are stale or missing
- `warnings`: human-readable warnings
- `next_check`: first response action

## Expected steady state

- `foundation.bindings.d1_bound` should be `true`
- `foundation.bindings.kv_bound` should be `true`
- `features.sell_impact_precompute.freshness` should normally be `fresh` or `aging`
- `features.liquidity_pulse.freshness` should normally be `fresh`
- `features.flow_alert.freshness` should normally be `fresh` or `aging`

## If Sell Impact precompute is stale or missing

Check the popular pair precompute workflow:

- `.github/workflows/precompute-popular-pairs-refresh.yml`

Then check:

- `/api/precompute-popular-pairs?persist=1&amount=1000&limit=60`
- `/api/precompute-current?limit=10`
- `/api/precompute-pair?currency=USD&issuer=rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq`

Expected recovery:

- rows exist in `pair_precompute_current`
- `/api/health` shows `sell_impact_precompute.freshness` as `fresh` or `aging`

## If Liquidity Pulse is stale or missing

Check the Liquidity Pulse refresh workflow:

- `.github/workflows/liquidity-pulse-refresh.yml`

Then check:

- `/api/xrpl/amm-snapshot?pool=xrp-rlusd`
- `/api/xrpl/liquidity-current?pool=xrp-rlusd`
- `/api/xrpl/liquidity-history?pool=xrp-rlusd&limit=5`

Expected recovery:

- `historyMeta.count` is greater than `0`
- `source` is `d1` in production
- `/api/health` shows `liquidity_pulse.freshness` as `fresh`

## If Flow Alert is stale or missing

Check the Flow Alert refresh workflow:

- `.github/workflows/flow-alert-refresh.yml`

Then check:

- `/api/xrpl/flow-snapshot?preset=exchanges&window=5m&persist=1`
- `/api/xrpl/flow-history?preset=exchanges&window=5m&limit=5`

Expected recovery:

- `historyMeta.count` is greater than `0`
- `source` is `d1`, `repo-json`, or another known fallback mode
- `/api/health` shows `flow_alert.freshness` as `fresh` or `aging`

## If D1 or KV is unbound

Check Cloudflare Pages production bindings.

Expected bindings:

- D1 binding: `XSIC_DB`
- KV binding: `XSIC_CACHE`

After fixing bindings, trigger a Pages deploy and recheck `/api/health`.

## Storage policy

Do not switch these layers to unbounded append-only storage.

Current intended storage model:

- Sell Impact: current rows in `pair_precompute_current`
- Liquidity Pulse: bounded `metric_hourly` rows per metric key
- Flow Alert: bounded / limited history for selected preset-window combinations

## Operator rule

If a feature is `stale` or `missing`, the page should still render a readable fallback, but it must not present cached or materialized values as live current truth.
