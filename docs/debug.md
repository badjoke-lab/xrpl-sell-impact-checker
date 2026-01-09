# Terminal sanity checks (curl)

Use the following curl commands to verify that the upstream XRPL RPC and the Pages Function proxy are responding without relying on the browser.

> **Note:** The XRPL RPC endpoint defaults to `https://s1.ripple.com:51234/` in this repo.

## 1) Direct XRPL RPC — `server_info`

```bash
curl -sS -X POST https://s1.ripple.com:51234/ \
  -H 'Content-Type: application/json' \
  -d '{"method":"server_info"}'
```

**Success indicators:**
- Top-level `status` is `success`.
- `result.info` is present (server metadata).

## 2) Direct XRPL RPC — `book_offers`

```bash
curl -sS -X POST https://s1.ripple.com:51234/ \
  -H 'Content-Type: application/json' \
  -d '{"method":"book_offers","params":[{"taker_gets":{"currency":"USD","issuer":"rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq"},"taker_pays":{"currency":"XRP"},"limit":5}]}'
```

**Success indicators:**
- Top-level `status` is `success`.
- `result.offers` is an array with a non-zero length (if the market is active).

## 3) Pages Function proxy — `POST /api/book_offers`

> Run this against your deployed Pages site (or local dev server), replacing `<YOUR_SITE>` with the base URL.

```bash
curl -sS -X POST https://<YOUR_SITE>/api/book_offers \
  -H 'Content-Type: application/json' \
  -d '{"currency":"USD","issuer":"rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq","limit":5}'
```

**Success indicators:**
- HTTP status is `200`.
- Top-level `status` is `success`.
- `result.offers` is an array with a non-zero length (if the market is active).
