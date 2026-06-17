import checkerModule from './proof_anchor_checker.cjs';

const checker = checkerModule.default || checkerModule;

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

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const input = url.searchParams.get('input') || '67fe39b1';
  const result = await checker.check(input);
  return json(result, result.ok ? 200 : 503);
}
