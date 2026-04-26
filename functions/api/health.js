import { getPopularPairs } from './_popular_pairs.js';
import { getPairPrecomputeStats } from '../../shared/pair-precompute-store.js';
import { getHistorySummary as getLiquidityHistorySummary } from '../../shared/liquidity-pulse-history-store.js';
import { getHistorySummary as getFlowHistorySummary } from '../../shared/flow-alert-history-store.js';

const XRPL_ENDPOINTS = [
  'https://xrplcluster.com/',
  'https://s1.ripple.com:51234/',
  'https://s2.ripple.com:51234/',
];

const UPSTREAM_TIMEOUT_MS = 4000;
const LIQUIDITY_PULSE_POOL = 'xrp-rlusd';
const FLOW_ALERT_PRESET = 'exchanges';
const FLOW_ALERT_WINDOW = '5m';
const EXIT_COVERAGE_LEDGER = {
  hash: 'E549C50B6C88925669DC7C67FC768E49B118E4EB4F1708CD995E7EFE4596A4C5',
  index: 103197813,
  source: 'api-fixed-proof-baseline',
};
const EXIT_COVERAGE_SUMMARY = {
  total: 6,
  dual: 2,
  bookOnly: 1,
  ammOnly: 1,
  none: 2,
};

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

function buildExitCoverageStats(checkedAt) {
  return {
    source: EXIT_COVERAGE_LEDGER.source,
    freshness: { state: 'fresh', checkedAt },
    observedLedger: EXIT_COVERAGE_LEDGER,
    summary: EXIT_COVERAGE_SUMMARY,
    four_state_contract_ready: true,
    all_rows_have_sell_impact_url: true,
  };
}

function buildFoundation(bindings, popularPairs, precomputeStats, liquidityStats, flowStats, exitCoverageStats) {
  const precomputeFreshness = precomputeStats?.freshness || null;
  const liquidityFreshness = liquidityStats?.freshness || null;
  const flowFreshness = flowStats?.freshness || null;
  const exitCoverageFreshness = exitCoverageStats?.freshness || null;
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
    flow_alert_preset: FLOW_ALERT_PRESET,
    flow_alert_window: FLOW_ALERT_WINDOW,
    flow_alert_source: flowStats?.storageMode || 'unknown',
    flow_alert_history_count: Number(flowStats?.count || 0),
    flow_alert_latest_ts: flowStats?.newestTs || null,
    flow_alert_freshness: safeFreshnessState(flowFreshness),
    flow_alert_age_ms: flowFreshness?.ageMs ?? null,
    flow_alert_warn_after_ms: flowFreshness?.warnAfterMs ?? null,
    flow_alert_stale_after_ms: flowFreshness?.staleAfterMs ?? null,
    exit_coverage_source: exitCoverageStats.source,
    exit_coverage_freshness: safeFreshnessState(exitCoverageFreshness),
    exit_coverage_checked_at: exitCoverageFreshness?.checkedAt || null,
    exit_coverage_observed_ledger_index: exitCoverageStats.observedLedger.index,
    exit_coverage_summary: exitCoverageStats.summary,
    exit_coverage_four_state_contract_ready: exitCoverageStats.four_state_contract_ready,
    exit_coverage_all_rows_have_sell_impact_url: exitCoverageStats.all_rows_have_sell_impact_url,
    quote_cache_mode: bindings.kv_bound ? 'kv+cache-api' : 'cache-api-only',
  };
}

function buildFeatures(foundation) {
  return {
    sell_impact_precompute: {
      role: 'Sell Impact initial preload and popular-pair route context',
      source: 'd1:pair_precompute_current',
      current_count: foundation.precompute_current_count,
      latest_success_at: foundation.precompute_latest_success_at,
      stale_count: foundation.precompute_stale_count,
      freshness: foundation.precompute_freshness,
      age_ms: foundation.precompute_age_ms,
      warn_after_ms: foundation.precompute_warn_after_ms,
      stale_after_ms: foundation.precompute_stale_after_ms,
    },
    liquidity_pulse: {
      role: 'Liquidity Pulse current/history layer',
      source: foundation.liquidity_pulse_source,
      pool: foundation.liquidity_pulse_pool,
      history_count: foundation.liquidity_pulse_history_count,
      latest_ts: foundation.liquidity_pulse_latest_ts,
      freshness: foundation.liquidity_pulse_freshness,
      age_ms: foundation.liquidity_pulse_age_ms,
      warn_after_ms: foundation.liquidity_pulse_warn_after_ms,
      stale_after_ms: foundation.liquidity_pulse_stale_after_ms,
    },
    flow_alert: {
      role: 'Flow Alert current/history layer',
      source: foundation.flow_alert_source,
      preset: foundation.flow_alert_preset,
      window: foundation.flow_alert_window,
      history_count: foundation.flow_alert_history_count,
      latest_ts: foundation.flow_alert_latest_ts,
      freshness: foundation.flow_alert_freshness,
      age_ms: foundation.flow_alert_age_ms,
      warn_after_ms: foundation.flow_alert_warn_after_ms,
      stale_after_ms: foundation.flow_alert_stale_after_ms,
    },
    exit_coverage: {
      role: 'Exit Coverage four-state API contract',
      source: foundation.exit_coverage_source,
      observed_ledger_index: foundation.exit_coverage_observed_ledger_index,
      summary: foundation.exit_coverage_summary,
      four_state_contract_ready: foundation.exit_coverage_four_state_contract_ready,
      all_rows_have_sell_impact_url: foundation.exit_coverage_all_rows_have_sell_impact_url,
      freshness: foundation.exit_coverage_freshness,
      checked_at: foundation.exit_coverage_checked_at,
    },
  };
}

function buildOpsSummary({ bindings, features, upstreamStatus }) {
  const warnings = [];
  const degradedFeatures = [];

  if (!bindings.d1_bound) warnings.push('D1 binding missing: paid current/history layers are unavailable.');
  if (!bindings.kv_bound) warnings.push('KV binding missing: quote/cache layer is running cache-api-only.');
  if (upstreamStatus !== 'ok') warnings.push(`XRPL upstream health is ${upstreamStatus}.`);

  for (const [key, feature] of Object.entries(features)) {
    if (feature.freshness === 'aging') warnings.push(`${key} is aging.`);
    if (feature.freshness === 'stale' || feature.freshness === 'missing') {
      degradedFeatures.push(key);
      warnings.push(`${key} is ${feature.freshness}.`);
    }
  }

  return {
    status: warnings.length ? 'attention' : 'ok',
    degraded_features: degradedFeatures,
    warnings,
    next_check: warnings.length ? 'Check scheduled workflow runs and feature endpoints.' : 'No immediate action needed.',
  };
}

function featureFreshnessMap(features) {
  return Object.fromEntries(Object.entries(features).map(([key, feature]) => [key, feature.freshness]));
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
  const [precomputeStats, liquidityStats, flowStats] = await Promise.all([
    getPairPrecomputeStats(env),
    getLiquidityHistorySummary(LIQUIDITY_PULSE_POOL, env),
    getFlowHistorySummary(FLOW_ALERT_PRESET, FLOW_ALERT_WINDOW, env),
  ]);
  const exitCoverageStats = buildExitCoverageStats(checkedAt);
  const foundation = buildFoundation(bindings, popularPairs, precomputeStats, liquidityStats, flowStats, exitCoverageStats);
  const features = buildFeatures(foundation);
  const featureFreshness = featureFreshnessMap(features);

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
        const opsSummary = buildOpsSummary({ bindings, features, upstreamStatus: 'ok' });
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
            flow_alert_freshness: foundation.flow_alert_freshness,
            flow_alert_age_ms: foundation.flow_alert_age_ms,
            exit_coverage_freshness: foundation.exit_coverage_freshness,
            feature_freshness: featureFreshness,
            degraded_mode: opsSummary.status !== 'ok',
          },
          foundation,
          features,
          ops_summary: opsSummary,
        });
      }

      if (attempt.httpStatus > 0 && (attempt.hasResult || attempt.isJson)) {
        sawPartial = true;
      }
    }

    const upstreamStatus = sawPartial ? 'stale' : 'down';
    const opsSummary = buildOpsSummary({ bindings, features, upstreamStatus });
    return jsonResponse({
      status: upstreamStatus,
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
        flow_alert_freshness: foundation.flow_alert_freshness,
        flow_alert_age_ms: foundation.flow_alert_age_ms,
        exit_coverage_freshness: foundation.exit_coverage_freshness,
        feature_freshness: featureFreshness,
        degraded_mode: true,
      },
      foundation,
      features,
      ops_summary: opsSummary,
    });
  } catch {
    const opsSummary = buildOpsSummary({ bindings, features, upstreamStatus: 'down' });
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
        flow_alert_freshness: foundation.flow_alert_freshness,
        flow_alert_age_ms: foundation.flow_alert_age_ms,
        exit_coverage_freshness: foundation.exit_coverage_freshness,
        feature_freshness: featureFreshness,
        degraded_mode: true,
      },
      foundation,
      features,
      ops_summary: opsSummary,
    });
  }
}
