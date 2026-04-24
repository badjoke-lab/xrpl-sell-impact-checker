import {
  getLatestSnapshot,
  getHistorySummary,
} from '../../../shared/liquidity-pulse-history-store.js';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const pool = url.searchParams.get('pool') || 'xrp-rlusd';

  const [latest, historyMeta] = await Promise.all([
    getLatestSnapshot(pool, env),
    getHistorySummary(pool, env),
  ]);

  const freshness = latest?.freshness || historyMeta?.freshness || null;

  return json({
    ok: true,
    pool,
    found: Boolean(latest),
    source: historyMeta?.source || 'runtime-fallback',
    latest,
    freshness,
    historyMeta: {
      ...historyMeta,
      pool,
    },
  });
}
