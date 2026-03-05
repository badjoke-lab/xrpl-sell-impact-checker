import presetsData from '../../../data/flow-presets.json';

const XRPL_ENDPOINTS = [
  'https://s1.ripple.com:51234/',
  'https://s2.ripple.com:51234/',
];

const FLOW_CACHE_TTL_MS = 45_000;
const PRICE_CACHE_TTL_MS = 5 * 60_000;
const MIN_RPC_GRACE_MS = 1_200;

const WINDOW_STRATEGIES = {
  '5m': { name: '5m_small', maxLedgers: 26, bucketCount: 10, eventLimit: 24, timeoutBudget: 4_000, sampled: false, sampleStride: 1 },
  '1h': { name: '1h_medium', maxLedgers: 60, bucketCount: 14, eventLimit: 32, timeoutBudget: 6_000, sampled: false, sampleStride: 1 },
  '24h': { name: '24h_sampled', maxLedgers: 120, bucketCount: 16, eventLimit: 24, timeoutBudget: 7_500, sampled: true, sampleStride: 3 },
  '7d': { name: '7d_sampled', maxLedgers: 220, bucketCount: 18, eventLimit: 20, timeoutBudget: 9_000, sampled: true, sampleStride: 8 },
};

const EVENT_MIN_XRP_BY_WINDOW = {
  '5m': 60_000,
  '1h': 150_000,
  '24h': 350_000,
  '7d': 500_000,
};

const flowCache = globalThis.__xsicWhaleFlowCache || new Map();
globalThis.__xsicWhaleFlowCache = flowCache;

const priceCache = globalThis.__xsicPriceCache || { value: null, fetchedAt: 0 };
globalThis.__xsicPriceCache = priceCache;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function getPresetsCatalog() {
  return presetsData?.presets || presetsData || {};
}

function getPreset(presetKey = 'exchanges') {
  const catalog = getPresetsCatalog();
  return catalog[presetKey] || catalog.exchanges || { id: presetKey, entities: [], rules: {} };
}

function normalizeWindow(rawWindow) {
  if (rawWindow === '1h' || rawWindow === '24h' || rawWindow === '7d') return rawWindow;
  return '5m';
}

function resolveStrategy(window) {
  const resolvedWindow = WINDOW_STRATEGIES[window] ? window : '5m';
  const base = WINDOW_STRATEGIES[resolvedWindow];
  const budgetBounds = {
    '5m': { min: 2_500, max: 4_000 },
    '1h': { min: 3_500, max: 6_000 },
    '24h': { min: 4_500, max: 7_500 },
    '7d': { min: 5_000, max: 9_000 },
  };
  const bounds = budgetBounds[resolvedWindow] || budgetBounds['5m'];
  return {
    ...base,
    timeoutBudget: Math.max(bounds.min, Math.min(bounds.max, Number(base.timeoutBudget) || bounds.min)),
  };
}

function toXrpAmount(amount) {
  if (typeof amount === 'string') {
    const drops = Number(amount);
    return Number.isFinite(drops) ? drops / 1_000_000 : null;
  }
  return null;
}

function getMinEventAmount(window) {
  return EVENT_MIN_XRP_BY_WINDOW[window] || EVENT_MIN_XRP_BY_WINDOW['5m'];
}

function resolveWhaleThreshold(preset, window) {
  const thresholds = preset?.rules?.minAmountXrp || {};
  return Number(thresholds[window] || thresholds.default || 500_000);
}

function sortLabelsWithUnknownLast(labels = []) {
  const uniq = Array.from(new Set(labels.filter(Boolean)));
  const unknowns = uniq.filter((l) => l === 'Unknown');
  const normal = uniq.filter((l) => l !== 'Unknown');
  return [...normal, ...unknowns];
}

function buildEntityMap(preset) {
  const map = new Map();
  (preset.entities || []).forEach((entity) => {
    (entity.addrs || []).forEach((address) => {
      map.set(address, {
        label: entity.label,
        type: entity.type || 'unknown',
        tag: entity.tag || entity.id || entity.label,
      });
    });
  });
  return map;
}

function buildSummaryReason(netXrp, events) {
  const leader = events[0];
  if (!leader) return 'No qualifying payments in window.';
  const direction = netXrp >= 0 ? 'net inflow bias' : 'net outflow bias';
  return `${direction}; top flow: ${leader.reason}`;
}

function classifyTx({ tx, amountXrp, preset, entityMap, whaleThreshold }) {
  const fromEntity = entityMap.get(tx.Account);
  const toEntity = entityMap.get(tx.Destination);
  const fromExchange = fromEntity?.type === 'exchange';
  const toExchange = toEntity?.type === 'exchange';

  const isWhalePreset = preset.id === 'whales';
  const meetsWhale = amountXrp >= whaleThreshold;

  if (toExchange && fromExchange) {
    return { dir: 'XFER', label: toEntity.label, reason: `exchange-to-exchange transfer (${fromEntity.label} → ${toEntity.label}) → internal movement candidate`, labelSource: `matched preset: ${fromEntity.label}, ${toEntity.label}`, scoreCap: 'MED', include: true };
  }
  if (toExchange) {
    return { dir: 'IN', label: toEntity.label, reason: `to exchange address (${toEntity.label}) → potential sell pressure`, labelSource: `matched preset: ${toEntity.label}`, scoreCap: 'HIGH', include: true };
  }
  if (fromExchange) {
    return { dir: 'OUT', label: fromEntity.label, reason: `from exchange address (${fromEntity.label}) → potential withdrawal`, labelSource: `matched preset: ${fromEntity.label}`, scoreCap: 'HIGH', include: true };
  }
  if (isWhalePreset && meetsWhale) {
    return { dir: 'XFER', label: 'Whale', reason: `large transfer (${Math.round(amountXrp).toLocaleString()} XRP) above whale threshold`, labelSource: 'matched preset rule: whale threshold', scoreCap: 'HIGH', include: true };
  }
  return { include: false };
}

function scoreByAmount(amountXrp) {
  if (amountXrp >= 1_000_000) return 'HIGH';
  if (amountXrp >= 250_000) return 'MED';
  return 'LOW';
}

function scoreByRank(rankIndex, total) {
  if (!total) return 'LOW';
  const percentile = (rankIndex + 1) / total;
  if (percentile <= 0.1) return 'HIGH';
  if (percentile <= 0.3) return 'MED';
  return 'LOW';
}

function mergeScore(amountScore, rankScore, cap = 'HIGH') {
  const order = { LOW: 1, MED: 2, HIGH: 3 };
  let raw = Math.max(order[amountScore] || 1, order[rankScore] || 1);
  raw = Math.min(raw, order[cap] || 3);
  const score = Object.keys(order).find((key) => order[key] === raw) || 'LOW';
  const scoreBasis = amountScore === rankScore ? 'both' : raw === (order[amountScore] || 1) ? 'amount' : 'rank';
  return { score, scoreBasis };
}

function emptyPayload(window = '5m', preset = getPreset('exchanges'), source = 'xrpl:rpc') {
  const labels = sortLabelsWithUnknownLast((preset.entities || []).map((entity) => entity.label).concat('Unknown'));
  return {
    ok: false,
    ts: Date.now(),
    source,
    stale: true,
    staleReason: 'error',
    window,
    priceXrpUsd: null,
    summaryReason: 'No data available.',
    summary: { inflowXrp: 0, outflowXrp: 0, netXrp: 0, inflowUsd: null, outflowUsd: null, netUsd: null },
    heatmap: { labels, buckets: [], matrix: [], unit: 'xrp' },
    events: [],
    debug: { endpointsTried: [], ledgersScanned: 0, paymentsCount: 0, cacheHit: false, scoreBasis: 'amount', warnings: [], durationMs: 0, rpcCalls: 0, lastValidatedLedger: null, degradeLevel: 'D', strategy: resolveStrategy(window).name, lastError: null },
  };
}

async function rpcFetch(endpoint, payload, timeoutMs, debug) {
  debug.rpcCalls += 1;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    if (!response.ok) throw new Error(`http_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchValidatedLedgerIndex(debug, timeoutMs) {
  let timeoutSeen = false;
  let lastError = null;
  for (const endpoint of XRPL_ENDPOINTS) {
    debug.endpointsTried.push(`${endpoint}#server_info`);
    try {
      const response = await rpcFetch(endpoint, { method: 'server_info', params: [{}] }, timeoutMs, debug);
      const idx = Number(response?.result?.info?.validated_ledger?.seq);
      if (Number.isFinite(idx) && idx > 0) return { endpoint, ledgerIndex: idx };
      throw new Error('invalid_server_info');
    } catch (error) {
      if (error?.name === 'AbortError') timeoutSeen = true;
      lastError = error;
    }
  }
  if (timeoutSeen) throw new Error('upstream_timeout');
  throw new Error(lastError?.message || 'upstream_unreachable');
}

async function fetchXrpUsd(debug, skipPrice = false) {
  if (skipPrice) {
    debug.warnings.push('degrade:C:price_skipped');
    return null;
  }
  const now = Date.now();
  if (priceCache.fetchedAt && now - priceCache.fetchedAt <= PRICE_CACHE_TTL_MS) return priceCache.value;
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`coingecko_http_${response.status}`);
    const price = Number((await response.json())?.ripple?.usd);
    if (!Number.isFinite(price) || price <= 0) throw new Error('coingecko_invalid_price');
    priceCache.value = price;
    priceCache.fetchedAt = now;
    return price;
  } catch (error) {
    debug.warnings.push(`price_unavailable:${error instanceof Error ? error.message : 'unknown'}`);
    return null;
  }
}

function aggregateBuckets(rawBuckets, startLedger, endLedger, bucketCount) {
  if (!rawBuckets.length) return { buckets: [], totals: [] };
  const count = Math.max(1, Math.min(bucketCount, rawBuckets.length));
  const span = endLedger - startLedger + 1;
  const chunk = Math.max(1, Math.ceil(span / count));
  const grouped = [];
  for (let i = 0; i < count; i += 1) grouped.push({ label: '', bucket: new Map() });
  for (let ledger = startLedger; ledger <= endLedger; ledger += 1) {
    const idx = Math.min(count - 1, Math.floor((ledger - startLedger) / chunk));
    const slot = grouped[idx];
    if (!slot.label) {
      const end = Math.min(endLedger, startLedger + ((idx + 1) * chunk) - 1);
      slot.label = `${startLedger + (idx * chunk)}-${end}`;
    }
    const row = rawBuckets[ledger - startLedger] || new Map();
    row.forEach((value, label) => slot.bucket.set(label, (slot.bucket.get(label) || 0) + value));
  }
  return { buckets: grouped.map((row) => row.label || '?'), totals: grouped.map((row) => row.bucket) };
}

async function buildFreshFlowAttempt({ preset, window, strategy, whaleThreshold, degradeLevel }) {
  const startedAt = Date.now();
  const debug = { endpointsTried: [], ledgersScanned: 0, paymentsCount: 0, cacheHit: false, scoreBasis: 'amount', warnings: [], durationMs: 0, rpcCalls: 0, lastValidatedLedger: null, degradeLevel, strategy: strategy.name, lastError: null };

  const requestedBudget = Number(strategy?.timeoutBudget);
  const safeBudget = Number.isFinite(requestedBudget) && requestedBudget > 0 ? requestedBudget : 4_000;
  const effectiveBudget = Math.max(MIN_RPC_GRACE_MS, safeBudget);
  const deadline = startedAt + effectiveBudget;
  const remainingBudget = () => deadline - Date.now();
  const timeoutFor = (floorMs = 1_000) => {
    const remaining = remainingBudget();
    const dynamicFloor = Math.max(300, floorMs);
    return Math.max(dynamicFloor, Math.min(4_500, remaining));
  };

  const probeRpcOnceBeforeFatal = async () => {
    if (debug.rpcCalls > 0) return false;
    let attempted = false;
    for (const endpoint of XRPL_ENDPOINTS) {
      attempted = true;
      debug.endpointsTried.push(`${endpoint}#ledger_current`);
      try {
        await rpcFetch(endpoint, { method: 'ledger_current', params: [{}] }, timeoutFor(300), debug);
        return true;
      } catch (error) {
        debug.warnings.push(`probe_failed:${endpoint}:${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
    if (!attempted) debug.warnings.push('probe_failed:no_endpoints');
    return false;
  };

  try {
    if (remainingBudget() <= 0) {
      await probeRpcOnceBeforeFatal();
      if (debug.rpcCalls <= 0) throw new Error('timeout_budget_exceeded');
      debug.warnings.push('budget_exceeded_after_initial_probe');
    }

    const info = await fetchValidatedLedgerIndex(debug, timeoutFor(800));
    debug.lastValidatedLedger = info.ledgerIndex;

    const entityMap = buildEntityMap(preset);
    const labelsSet = new Set((preset.entities || []).map((entity) => entity.label));
    if (preset.id === 'whales') labelsSet.add('Whale');
    if (!labelsSet.size) labelsSet.add('Unknown');

    const startLedger = Math.max(1, info.ledgerIndex - strategy.maxLedgers + 1);
    const rawBucketTotals = [];
    let inflowXrp = 0;
    let outflowXrp = 0;
    const allEvents = [];
    let attemptedLedgerRpc = false;

    for (let ledgerIndex = startLedger; ledgerIndex <= info.ledgerIndex; ledgerIndex += strategy.sampleStride) {
      const remaining = remainingBudget();
      if (remaining <= 0 && attemptedLedgerRpc) throw new Error('timeout_budget_exceeded');
      const ledgerBucket = new Map();
      debug.endpointsTried.push(`${info.endpoint}#ledger:${ledgerIndex}`);
      let ledgerResponse;
      try {
        attemptedLedgerRpc = true;
        ledgerResponse = await rpcFetch(info.endpoint, { method: 'ledger', params: [{ ledger_index: ledgerIndex, transactions: true, expand: true, owner_funds: false }] }, timeoutFor(remaining <= 0 ? 400 : 800), debug);
      } catch (error) {
        debug.warnings.push(`ledger_fetch_failed:${ledgerIndex}:${error instanceof Error ? error.message : 'unknown'}`);
        rawBucketTotals[ledgerIndex - startLedger] = ledgerBucket;
        continue;
      }

      debug.ledgersScanned += 1;
      const txs = ledgerResponse?.result?.ledger?.transactions || [];
      for (const entry of txs) {
        const tx = entry?.tx || entry;
        if (!tx || tx.TransactionType !== 'Payment') continue;
        if (tx.metaData?.TransactionResult && tx.metaData.TransactionResult !== 'tesSUCCESS') continue;
        const amountXrp = toXrpAmount(tx.Amount);
        if (!amountXrp || amountXrp <= 0) continue;
        debug.paymentsCount += 1;

        const classified = classifyTx({ tx, amountXrp, preset, entityMap, whaleThreshold });
        if (!classified.include) continue;
        labelsSet.add(classified.label || 'Unknown');
        const signed = classified.dir === 'IN' ? amountXrp : classified.dir === 'OUT' ? -amountXrp : 0;
        ledgerBucket.set(classified.label, (ledgerBucket.get(classified.label) || 0) + signed);
        if (signed > 0) inflowXrp += signed;
        if (signed < 0) outflowXrp += Math.abs(signed);

        if (amountXrp >= getMinEventAmount(window)) {
          allEvents.push({ time: tx.date || tx.hash || String(Date.now()), from: tx.Account || '', to: tx.Destination || '', dir: classified.dir, label: classified.label || 'Unknown', amountXrp, txHash: tx.hash || null, timeBucket: String(ledgerIndex), reason: classified.reason, labelSource: classified.labelSource, scoreCap: classified.scoreCap });
        }
      }
      rawBucketTotals[ledgerIndex - startLedger] = ledgerBucket;
    }

    const aggregated = aggregateBuckets(rawBucketTotals, startLedger, info.ledgerIndex, strategy.bucketCount);
    let labels = sortLabelsWithUnknownLast(Array.from(labelsSet));
    if (strategy.maxLabels && labels.length > strategy.maxLabels) {
      labels = labels.slice(0, strategy.maxLabels).concat(labels.includes('Unknown') ? [] : ['Unknown']);
      debug.warnings.push('degrade:B:labels_reduced');
    }
    const matrix = labels.map((label) => aggregated.totals.map((bucket) => Number(bucket?.get(label) || 0)));

    const priceXrpUsd = await fetchXrpUsd(debug, strategy.disablePrice);
    const sortedEvents = allEvents.sort((a, b) => b.amountXrp - a.amountXrp);
    const scoredEvents = sortedEvents.slice(0, strategy.eventLimit).map((event, index) => {
      const merged = mergeScore(scoreByAmount(event.amountXrp), scoreByRank(index, sortedEvents.length), event.scoreCap);
      return { ...event, score: merged.score, scoreBasis: merged.scoreBasis, amountUsd: priceXrpUsd ? event.amountXrp * priceXrpUsd : null };
    });

    debug.scoreBasis = scoredEvents[0]?.scoreBasis || 'amount';
    const netXrp = inflowXrp - outflowXrp;
    const sampled = Boolean(strategy.sampled || strategy.sampleStride > 1);

    return {
      ok: true,
      ts: Date.now(),
      source: 'xrpl:rpc',
      stale: sampled,
      staleReason: sampled ? 'sampled' : null,
      window,
      priceXrpUsd,
      summaryReason: buildSummaryReason(netXrp, scoredEvents),
      summary: { inflowXrp, outflowXrp, netXrp, inflowUsd: priceXrpUsd ? inflowXrp * priceXrpUsd : null, outflowUsd: priceXrpUsd ? outflowXrp * priceXrpUsd : null, netUsd: priceXrpUsd ? netXrp * priceXrpUsd : null },
      heatmap: { labels, buckets: aggregated.buckets, matrix, unit: priceXrpUsd ? 'usd' : 'xrp' },
      events: scoredEvents,
      debug,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error('unknown');
    debug.lastError = err.message;
    debug.warnings.push(`fatal:${err.message}`);
    err.debugSnapshot = { ...debug, endpointsTried: [...debug.endpointsTried], warnings: [...debug.warnings] };
    throw err;
  } finally {
    debug.durationMs = Math.max(1, Date.now() - startedAt);
  }
}

async function buildFreshFlow({ preset, window }) {
  const base = resolveStrategy(window);
  const whaleThreshold = resolveWhaleThreshold(preset, window);
  const attempts = [
    { ...base, degradeLevel: 'none' },
    { ...base, eventLimit: Math.max(8, Math.floor(base.eventLimit * 0.6)), maxLedgers: Math.max(20, Math.floor(base.maxLedgers * 0.75)), degradeLevel: 'A' },
    { ...base, eventLimit: Math.max(6, Math.floor(base.eventLimit * 0.45)), bucketCount: Math.max(8, Math.floor(base.bucketCount * 0.6)), maxLabels: 8, maxLedgers: Math.max(16, Math.floor(base.maxLedgers * 0.55)), degradeLevel: 'B' },
    { ...base, eventLimit: Math.max(4, Math.floor(base.eventLimit * 0.4)), bucketCount: Math.max(6, Math.floor(base.bucketCount * 0.45)), maxLabels: 6, maxLedgers: Math.max(12, Math.floor(base.maxLedgers * 0.4)), disablePrice: true, degradeLevel: 'C' },
  ];

  let lastError = null;
  let lastDebug = null;
  for (const attempt of attempts) {
    try {
      const payload = await buildFreshFlowAttempt({ preset, window, strategy: { ...attempt, name: `${base.name}_${attempt.degradeLevel}` }, whaleThreshold, degradeLevel: attempt.degradeLevel });
      if (attempt.degradeLevel !== 'none') payload.debug.warnings.push(`degrade:${attempt.degradeLevel}`);
      return payload;
    } catch (error) {
      lastError = error;
      lastDebug = error?.debugSnapshot || lastDebug;
    }
  }

  const fatal = new Error(lastError?.message || 'build_failed');
  fatal.debugSnapshot = lastDebug;
  throw fatal;
}

export async function onRequestGet({ request }) {
  const requestStartedAt = Date.now();
  const url = new URL(request.url);
  const presetKey = url.searchParams.get('preset') || 'exchanges';
  const window = normalizeWindow(url.searchParams.get('window') || '5m');
  const preset = getPreset(presetKey);
  const whaleThreshold = resolveWhaleThreshold(preset, window);
  const cacheKey = `${preset.id || presetKey}:${window}:thr=${whaleThreshold}`;

  const now = Date.now();
  const cached = flowCache.get(cacheKey);

  try {
    const fresh = await buildFreshFlow({ preset, window });
    flowCache.set(cacheKey, { data: fresh, fetchedAt: now });
    return json(fresh);
  } catch (error) {
    if (cached?.data) {
      return json({
        ...cached.data,
        source: 'cache',
        stale: true,
        staleReason: 'cached',
        ts: now,
        debug: {
          ...cached.data.debug,
          cacheHit: true,
          degradeLevel: 'D',
          durationMs: Math.max(1, Date.now() - requestStartedAt),
          lastError: error instanceof Error ? error.message : 'unknown',
          warnings: [...(cached.data.debug?.warnings || []), `fallback:${error instanceof Error ? error.message : 'unknown'}`, 'degrade:D:cache_fallback'],
        },
      });
    }

    const fallback = emptyPayload(window, preset, 'xrpl:rpc');
    if (error?.debugSnapshot) {
      fallback.debug = {
        ...fallback.debug,
        ...error.debugSnapshot,
        warnings: [...(error.debugSnapshot.warnings || []), `fatal:${error instanceof Error ? error.message : 'unknown'}`],
      };
    }
    fallback.debug.durationMs = Math.max(1, Date.now() - requestStartedAt);
    fallback.debug.lastError = error instanceof Error ? error.message : 'unknown';
    if (!fallback.debug.warnings.includes(`fatal:${fallback.debug.lastError}`)) {
      fallback.debug.warnings.push(`fatal:${fallback.debug.lastError}`);
    }
    return json(fallback, 200);
  }
}
