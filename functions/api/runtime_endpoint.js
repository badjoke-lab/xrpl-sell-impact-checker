import freshnessModule from './runtime_freshness.cjs';
import requestModule from './runtime_request.cjs';

const freshness = freshnessModule.default || freshnessModule;
const requestRuntime = requestModule.default || requestModule;

function responseSnapshot(response) {
  return response.text().then((body) => ({
    body,
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers.entries()],
  }));
}

function restoreResponse(snapshot) {
  return new Response(snapshot.body, {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers: new Headers(snapshot.headers),
  });
}

export function normalizedContext(context, values) {
  const url = new URL(context.request.url);
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, requestRuntime.normalizeField(key, value));
  }
  const request = new Request(url.toString(), {
    method: 'GET',
    headers: context.request.headers,
  });
  return {
    ...context,
    request,
  };
}

export async function normalizeRuntimeResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return response;

  const payload = await response.clone().json().catch(() => null);
  if (!payload || typeof payload !== 'object' || !Object.hasOwn(payload, 'ok')) return response;

  const observedAt = payload.observedAt || payload.freshness?.observedAt || null;
  const ok = Boolean(payload.ok);
  const partial = Boolean(payload.partial);
  const isStale = Boolean(payload.isStale || payload.freshness?.isStale);
  const state = freshness.classifyFreshness({
    observedAt,
    lastSuccessAt: payload.freshness?.lastSuccessAt || (ok ? observedAt : null),
    ok,
    partial,
    isStale,
    missing: !observedAt,
    freshForMs: Number(payload.freshness?.freshForMs || 30_000),
    staleAfterMs: Number(payload.freshness?.staleAfterMs || 120_000),
  });

  const normalized = {
    ...payload,
    partial,
    state: payload.state || state.status,
    sourceMode: payload.sourceMode || (isStale ? 'cache-fallback' : payload.cached ? 'cache' : payload.endpointUsed ? 'live' : 'none'),
    freshness: {
      ...(payload.freshness || {}),
      ...state,
      source: payload.freshness?.source || payload.endpointUsed || payload.sourceMode || 'runtime',
    },
  };

  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  if (normalized.state !== 'fresh' && normalized.state !== 'aging') headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(normalized), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function executeShared(context, factory) {
  const key = requestRuntime.canonicalRequestKey(context.request);
  const snapshot = await requestRuntime.shareRequest(key, async () => {
    const response = await factory();
    const normalized = await normalizeRuntimeResponse(response);
    return responseSnapshot(normalized);
  });
  return restoreResponse(snapshot);
}
