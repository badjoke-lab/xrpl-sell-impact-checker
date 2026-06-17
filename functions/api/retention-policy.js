import policyModule from '../../shared/retention-policy.cjs';

const policy = policyModule.default || policyModule;

export async function onRequestGet() {
  return new Response(JSON.stringify({
    ok: true,
    checkedAt: new Date().toISOString(),
    source: 'shared-retention-policy',
    policy: policy.policySummary(),
    enforcement: {
      dryRunEndpoint: '/api/retention-prune',
      applyEndpoint: '/api/retention-prune?apply=1',
      currentTablesAreUpsertOnly: true,
      rawUpstreamBodiesStored: false,
    },
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}
