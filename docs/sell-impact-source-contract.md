# Sell Impact source contract

## Authority order

1. A live Estimate result for the current currency, issuer, amount, and mode is authoritative.
2. A matching precompute row may populate the initial view before Estimate runs.
3. A stale precompute row is context only and must be labelled stale.
4. A precompute row for a different amount is a seed preview, not an estimate for the current amount.

## Precompute limits

The precompute UI may display only values present in the returned row. It must not derive a synthetic fallback output, route confidence score, execution split, depth curve, or bottleneck score from route presence or offer count.

A third fallback route is shown only when the source explicitly returns it. Otherwise Route C is `Not materialized`.

## Ownership protection

A precompute response is applied only when its currency and issuer match the current inputs. Responses from superseded requests are discarded. Once a live Estimate has started for the current full input key, later hydration must not overwrite that live-owned view.

## Empty and failure states

`bestRoute: none`, or a row with neither book nor AMM availability, is displayed as no executable route in the precompute snapshot. The page still asks the user to run Estimate because live liquidity remains the source of truth.
