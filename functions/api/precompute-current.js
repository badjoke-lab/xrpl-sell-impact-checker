import { listPairPrecomputes, getPairPrecomputeStats } from '../../shared/pair-precompute-store.js';

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
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)));
  const [stats, rows] = await Promise.all([
    getPairPrecomputeStats(env),
    listPairPrecomputes(env, limit),
  ]);

  return json({
    ok: true,
    limit,
    stats,
    rows,
  });
}
