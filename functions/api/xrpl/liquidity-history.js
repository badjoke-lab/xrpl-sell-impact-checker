import {
  getLatestSnapshot,
  getRecentSnapshots,
  getHistorySummary,
} from '../../../shared/liquidity-pulse-history-store.js';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function resolveLimit(rawLimit) {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) return 120;
  return Math.max(1, Math.min(1000, Math.floor(parsed)));
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const pool = url.searchParams.get('pool') || 'xrp-rlusd';
  const limit = resolveLimit(url.searchParams.get('limit'));

  const [latest, recent, historyMeta] = await Promise.all([
    getLatestSnapshot(pool, env),
    getRecentSnapshots(pool, limit, env),
    getHistorySummary(pool, env),
  ]);

  return json({
    ok: true,
    pool,
    latest,
    recent,
    historyMeta: {
      ...historyMeta,
      pool,
    },
    source: historyMeta?.source || 'runtime-fallback',
  });
}
