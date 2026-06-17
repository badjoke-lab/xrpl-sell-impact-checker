# Proof Anchor Checker source contract

The first release is an evidence split viewer, not a cryptographic verifier.

- `dna-anchors.json` is the strong chain-registry source.
- zkBridge dashboard and transactions are medium proof-side sources.
- the public verifier endpoint is an unresolved source while it returns an HTML shell instead of structured JSON.
- a proof-side record and chain record may both exist without a strong public join key.
- the UI must not emit `Verified`, `Matched`, `Chain-confirmed proof`, or an equivalent verdict.

The allowed conclusions are record found, verifier unresolved, no strong public link, source unavailable, or not enough evidence.
