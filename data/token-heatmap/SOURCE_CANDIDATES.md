# Token Heatmap Source Candidates

This note records the current source plan for XRPL Token Heatmap Top100 candidate generation.

## Goal

Before connecting D1, KV, cron, or production snapshots, verify that a source can provide enough fields for the existing snapshot contract:

- currency
- issuer
- marketCap
- liquidity or liquidity-like proxy
- volume24h
- priceChange24h
- liquidityChange24h or fallback value
- exitCoverage placeholder until XSIC route checks are connected
- updatedAt

## Current preferred source: XRPL.to API

Use XRPL.to token list API as the first candidate source.

Candidate endpoint:

`https://api.xrpl.to/v1/tokens?sortBy=marketcap&sortType=desc&limit=100`

Alternate endpoint:

`https://api.xrpl.to/v1/tokens?sortBy=vol24h&sortType=desc&limit=100`

Why preferred:

- Token-list endpoint is documented.
- It exposes XRPL token identifiers such as currency and issuer.
- It exposes market and activity fields such as price, 24h change, volume, and market cap.
- It can return a Top N list in one request.

Caution:

- Field names must be probed and normalized.
- Liquidity may not be present as a direct field on every token list row.
- API limits must be respected before adding cron.

## Secondary reference: XPMarket

XPMarket is useful as a human-facing comparison source for token rankings and heatmap expectations.

Current use:

- Compare visible ranking shape.
- Compare fields such as market cap, holders, trustlines, and 24h volume.

Do not treat XPMarket as the first automated source until a stable, documented machine endpoint is identified.

## Pair-level fallback: DEXScreener

DEXScreener may help with pair-level liquidity or volume fields, but it is not ideal as the primary token identity source because the heatmap needs issuer/currency token rows, not only pairs.

Current use:

- Fallback or enrichment candidate.
- Not primary Top100 source.

## Paid / later source: CoinGecko

CoinGecko may provide broad XRPL market data, but it may require an API key or paid plan for reliable use.

Current use:

- Later optional source, not free-ops first implementation.

## Next gate

Run the source probe script and inspect:

- HTTP success
- payload shape
- number of normalized tokens
- number of rows with currency and issuer
- marketCap coverage
- volume24h coverage
- direct liquidity coverage
- candidate snapshot rows produced

Only after that should we connect generated real snapshots to the UI.
