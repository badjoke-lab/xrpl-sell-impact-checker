# Token list seed

The token suggestions are stored in two offline seed files:

- `data/tokenlist.seed.json`
- `public/data/tokenlist.seed.json`

## Regenerate

Run the seed generator to refresh both files from the curated list:

```bash
pnpm seed:generate
```

The script lives at `scripts/generate-tokenlist-seed.mjs` and writes a consistent list to both locations.
