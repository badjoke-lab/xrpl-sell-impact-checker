import { getPopularPairs } from './_popular_pairs.js';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*',
    },
  });
}

export async function onRequestGet() {
  const checkedAt = new Date().toISOString();
  const pairs = getPopularPairs();

  return json({
    ok: true,
    checked_at: checkedAt,
    source: 'static-seed',
    count: pairs.length,
    pairs,
  });
}
