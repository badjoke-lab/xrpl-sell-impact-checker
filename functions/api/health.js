import { getPopularPairs } from './_popular_pairs.js';
import { getPairPrecomputeStats } from '../../shared/pair-precompute-store.js';
import { getHistorySummary as getLiquidityHistorySummary } from '../../shared/liquidity-pulse-history-store.js';

const XRPL_ENDPOINTS = [
  'https://xrplcluster.com/',
  'https://s1.ripple.com:51234/',
  'https://s2.ripple.com:51234/',
];

const UPSTREAM_TIMEOUT_MS = 4000;
const LIQUIDITY_PULSE_POOL = 'xrp-rlusd';

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

function detectBindings(env) {
  return {
    d1_bound: Boolean(env?.XSIC_DB || env?.DB),
    kv_bound: Boolean(env?.XSIC_CACHE || env?.CACHE_KV || env?.KV),
  };
}

function safeFreshnessState(freshness) {
  return freshness?.state || 'missing';
}

function buildFoundation(bindings, popularPairs, precomputeStats, liquidityStats) {
  const precomputeFreshness = precomputeStats?.freshness || null;
  const liquidityFreshness = liquidityStats?.freshness || null;
  return {
    bindings,
    popular_pairs_count: popularPairs.length,
    precompute_registry_ready: popularPairs.length > 0,
    precompute_current_count: precomputeStats.count,
    precompute_latest_success_at: precomputeStats.latestSuccessAt,
    precompute_stale_count: precomputeStats.staleCount,
    precompute_freshness: safeFreshnessState(precomputeFreshness),
    precompute_age_ms: precomputeFreshness?.ageMs ?? null,
    precompute_warn_after_ms: precomputeFreshness?.warnAfterMs ?? null,
    precompute_stale_after_ms: precomputeFreshness?.staleAfterMs ?? null,
    liquidity_pulse_pool: LIQUIDITY_PULSE_POOL,
    liquidity_pulse_source: liquidityStats?.source || 'unknown',
    liquidity_pulse_history_count: Number(liquidityStats?.count || 0),
    liquidity_pulse_latest_ts: liquidityStats?.newestTs || null,
    liquidity_pulse_freshness: safeFreshnessState(liquidityFreshness),
    liquidity_pulse_age_ms: liquidityFreshness?.ageMs ?? null,
    liquidity_pulse_warn_after_ms: liquidityFreshness?.warnAfterMs ?? null,
    liquidity_pulse_stale_after_ms: liquidityFreshness?.staleAfterMs ?? null,
    quote_cache_mode: bindings.kv_bound ? 'kv+cache-api' : 'cache-api-only',
  };
}

async function fetchRpcHealth(endpoint) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'server_info', params: [{}] }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    const info = parsed?.result?.info ?? null;
    const complete = Boolean(
      response.ok &&
        info &&
        typeof info.server_state === 'string' &&
        typeof info.validated_ledger?.seq === 'number'
    );

    return {
      endpoint,
      httpStatus: response.status,
      latencyMs,
      complete,
      hasResult: Boolean(parsed?.result),
      isJson: Boolean(parsed),
      ledgerIndex: info?.validated_ledger?.seq ?? null,
      serverState: info?.server_state ?? null,
    };
  } catch (error) {
    return {
      endpoint,
      httpStatus: 0,
      latencyMs: Date.now() - startedAt,
      complete: false,
      hasResult: false,
      isJson: false,
      ledgerIndex: null,
      serverState: null,
      error: error instanceof Error ? error.message : 'fetch_failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function onRequestGet({ env }) {
  const checkedAt = new Date().toISOString();
  const bindings = detectBindings(env);
  const popularPairs = getPopularPairs();
  const [precomputeStats, liquidityStats] = await Promise.all([
    getPairPrecomputeStats(env),
    getLiquidityHistorySummary(LIQUIDITY_PULSE_POOL, env),
  ]);
  const foundation = buildFoundation(bindings, popularPairs, precomputeStats, liquidityStats);

  try {
    let sawPartial = false;
    const attempts = [];

    for (const endpoint of XRPL_ENDPOINTS) {
      const attempt = await fetchRpcHealth(endpoint);
      attempts.push({
        endpoint: attempt.endpoint,
        http_status: attempt.httpStatus,
        latency_ms: attempt.latencyMs,
        ledger_index: attempt.ledgerIndex,
        server_state: attempt.serverState,
        error: attempt.error || null,
      });

      if (attempt.complete) {
        return jsonResponse({
          status: 'ok',
          checked_at: checkedAt,
          details: {
            endpoint: attempt.endpoint,
            latency_ms: attempt.latencyMs,
            http_status: attempt.httpStatus,
            ledger_index: attempt.ledgerIndex,
            server_state: attempt.serverState,
          },
          service_health: {
            upstream_latency_ms: attempt.latencyMs,
            last_successful_quote_age_ms: null,
            cache_freshness: bindings.kv_bound ? 'kv-ready' : 'cache-api-only',
            precompute_freshness: foundation.precompute_freshness,
            precompute_age_ms: foundation.precompute_age_ms,
            liquidity_pulse_freshness: foundation.liquidity_pulse_freshness,
            liquidity_pulse_age_ms: foundation.liquidity_pulse_age_ms,
            degraded_mode: false,
          },
          foundation,
        });
      }

      if (attempt.httpStatus > 0 && (attempt.hasResult || attempt.isJson)) {
        sawPartial = true;
      }
    }

    return jsonResponse({
      status: sawPartial ? 'stale' : 'down',
      checked_at: checkedAt,
      details: {
        reason: sawPartial ? 'partial_upstream_response' : 'upstream_unreachable',
        timeout_ms: UPSTREAM_TIMEOUT_MS,
        attempts,
      },
      service_health: {
        upstream_latency_ms: null,
        last_successful_quote_age_ms: null,
        cache_freshness: bindings.kv_bound ? 'kv-ready' : 'cache-api-only',
        precompute_freshness: foundation.precompute_freshness,
        precompute_age_ms: foundation.precompute_age_ms,
        liquidity_pulse_freshness: foundation.liquidity_pulse_freshness,
        liquidity_pulse_age_ms: foundation.liquidity_pulse_age_ms,
        degraded_mode: true,
      },
      foundation,
    });
  } catch {
    return jsonResponse({
      status: 'down',
      checked_at: checkedAt,
      details: {
        reason: 'health_check_failed',
        timeout_ms: UPSTREAM_TIMEOUT_MS,
      },
      service_health: {
        upstream_latency_ms: null,
        last_successful_quote_age_ms: null,
        cache_freshness: bindings.kv_bound ? 'kv-ready' : 'cache-api-only',
        precompute_freshness: foundation.precompute_freshness,
        precompute_age_ms: foundation.precompute_age_ms,
        liquidity_pulse_freshness: foundation.liquidity_pulse_freshness,
        liquidity_pulse_age_ms: foundation.liquidity_pulse_age_ms,
        degraded_mode: true,
      },
      foundation,
    });
  }
}
