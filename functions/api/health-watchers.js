import watcherModule from './watch_sources.cjs';

const watcher = watcherModule.default || watcherModule;
const SOURCE_NAMES = Object.keys(watcher.SOURCE_REGISTRY || {});

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

export async function onRequestGet() {
  const result = await watcher.checkSources(SOURCE_NAMES);
  const sources = result.sources || [];
  const primary = sources.filter((source) => source.sourceGroup === 'primary');
  const secondary = sources.filter((source) => source.sourceGroup === 'secondary');
  const failedPrimary = primary.filter((source) => !source.httpOk).map((source) => source.name);
  const unresolved = sources.filter((source) => source.unresolved).map((source) => source.name);
  const volatileExcluded = secondary.filter((source) => source.excludedFromPrimary).map((source) => source.name);
  const status = failedPrimary.length ? 'degraded' : 'ok';

  return json({
    status,
    checked_at: result.checkedAt,
    degraded_mode: status !== 'ok',
    primary_all_ok: failedPrimary.length === 0,
    primary_failed: failedPrimary,
    unresolved_sources: unresolved,
    volatile_sources_excluded_from_primary: volatileExcluded,
    source_freshness: Object.fromEntries(sources.map((source) => [source.name, {
      http_ok: source.httpOk,
      checked_at: source.checkedAt,
      changed: source.changed,
      stability: source.stability,
      source_group: source.sourceGroup,
      quality: source.quality,
      unresolved: source.unresolved,
    }])),
    next_check: failedPrimary.length
      ? 'Check the affected public source and retain the latest labelled page state.'
      : 'No immediate watcher action needed.',
  }, status === 'ok' ? 200 : 207);
}
