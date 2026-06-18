# XRPL Sell Impact Checker (XSIC)

XSIC is a lightweight web tool that estimates the impact of selling XRPL IOUs against XRP using
order book depth (CLOB) and AMM pool data. It is maintained by BadJoke-Lab.

## Active roadmap and recovery point

The current product-development schedule and recovery procedure are maintained in:

- `docs/xsic-growth-productization-roadmap.md`

After an interrupted work session, read that file first and compare its current-position block with the latest `main` SHA, merged PRs, open branches, and workflow results.

The completed reliability-remediation phase is recorded in:

- `docs/xsic-remediation-closeout.md`

## Runbook

### Local development

```bash
pnpm install
pnpm run dev
```

> [!IMPORTANT]
> Do **not** use `python -m http.server` for local verification. It only serves static files and will return HTML for `/api/*` instead of running Cloudflare Pages Functions.
> Always run local development with `wrangler pages dev` (via `pnpm run dev`) so `/api/*` behaves like production.

Production: https://xsic.badjoke-lab.com/

Dev: Open `http://0.0.0.0:5173` in your browser.

### Deploy (Cloudflare Pages)

1. Install dependencies.

   ```bash
   pnpm install
   ```

2. Preview locally with Pages Workers routing.

   ```bash
   pnpm run pages:dev
   ```

3. Deploy to Cloudflare Pages (requires your project configured in Cloudflare).

   ```bash
   npx wrangler pages deploy .
   ```


### Flow Alert history persistence

- See `docs/flow-alert-history.md` for the GitHub Actions + repo JSON based history design.
- Production source of truth is `data/flow-history/*.json` updated by workflow.

### Troubleshooting checklist

- Confirm the static site is reachable: `/` loads without 404s.
- Verify API endpoints return JSON: `/api/ping`, `/api/book-offers`, `/api/amm-info`.
- Check client console for CORS or network errors.
- If XRPL endpoints are slow, retry or inspect Cloudflare logs for upstream timeouts.

### Post-deploy verification

Copy/paste the following commands (replace `https://your-domain.example`):

```bash
curl -s https://your-domain.example/api/ping
curl -s -X POST https://your-domain.example/api/book-offers \
  -H 'content-type: application/json' \
  -d '{"currency":"USD","issuer":"rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq","amount":100,"limit":20}'
curl -s -X POST https://your-domain.example/api/amm-info \
  -H 'content-type: application/json' \
  -d '{"currency":"USD","issuer":"rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq"}'
```

UI checklist:
- Load the homepage, submit an estimate, and confirm results render.
- Open `/methods`, `/faq`, `/disclaimer`, `/credits`, and `/donate` (no 404s).
- On `/donate`, click **Copy address** and verify the address is copied.
