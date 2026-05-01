# Token Heatmap Snapshot Contract

This file documents the static contract used by `/apps/token-heatmap/` before D1 / KV / cron are connected.

## Current loader path

```txt
/apps/token-heatmap/token-heatmap-snapshot.demo.json
```

If the JSON file is missing, invalid, empty, or has no usable tokens, the page falls back to inline synthetic demo data.

## Top-level shape

```json
{
  "snapshotVersion": 1,
  "generatedAt": "demo",
  "source": "static-demo-json",
  "status": "demo",
  "topLimit": 100,
  "note": "Synthetic data for layout and interaction preview only.",
  "tokens": []
}
```

## Required token fields

Each token object must include:

```json
{
  "currency": "SOLO",
  "issuer": "r...",
  "marketCap": 1000000,
  "liquidity": 250000,
  "volume24h": 50000,
  "priceChange24h": 2.5,
  "liquidityChange24h": -1.2,
  "exitCoverage": "dual",
  "updatedAt": "2026-04-30T00:00:00Z"
}
```

## Allowed status values

```txt
demo
fresh
stale
degraded
partial
```

The current implementation accepts any string but UI copy should use the values above.

## Allowed exitCoverage values

```txt
dual
book-only
amm-only
none
unknown
```

Meanings:

- `dual`: book and AMM exit route observed
- `book-only`: book route observed, AMM not observed
- `amm-only`: AMM route observed, book not observed
- `none`: XRP exit route not observed
- `unknown`: not checked or invalid input

## Normalization rules

- Missing `currency` or `issuer` drops the token.
- Tokens with no positive `marketCap`, `liquidity`, or `volume24h` are dropped.
- Invalid numeric values become `0`.
- Invalid `exitCoverage` becomes `unknown`.
- The loader caps the active payload to Top 100 for now.

## Future replacement

The static loader can later be replaced by:

```txt
/api/token-heatmap-snapshot
```

or by a KV-backed static snapshot endpoint. The page should keep the same normalized shape so the Canvas renderer does not change.
