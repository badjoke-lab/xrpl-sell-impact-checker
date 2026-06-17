import watcherModule from './watch_sources.cjs';

const watcher = watcherModule.default || watcherModule;

const GROUPS = {
  privacy: [
    'dna_testnet_registry',
    'dna_verifier',
    'dna_zkbridge_dashboard',
    'dna_zkbridge_transactions',
    'ripple_zkp',
    'xls96',
    'dna_home_volatile',
  ],
  proof: [
    'dna_testnet_registry',
    'dna_verifier',
    'dna_zkbridge_dashboard',
    'dna_zkbridge_transactions',
  ],
  readiness: [
    'dna_testnet_registry',
    'dna_verifier',
    'dna_zkbridge_dashboard',
    'dna_zkbridge_transactions',
    'ripple_zkp',
    'xls96',
    'dna_home_volatile',
  ],
};

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
  const group = String(url.searchParams.get('group') || 'privacy').trim().toLowerCase();
  const names = GROUPS[group];
  if (!names) {
    return json({ ok: false, error: 'unknown_group', allowedGroups: Object.keys(GROUPS) }, 400);
  }
  const result = await watcher.checkSources(names);
  return json({ ...result, group }, result.summary?.primaryAllOk ? 200 : 207);
}
