import presetsData from '../../../data/flow-presets.json';

const XRPL_ENDPOINTS = [
  'https://s1.ripple.com:51234/',
  'https://s2.ripple.com:51234/',
];

const REQUEST_TIMEOUT_MS = 4_500;
const FLOW_CACHE_TTL_MS = 45_000;
const PRICE_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_MAX_LEDGERS = 30;
const HARD_MAX_LEDGERS = 60;

const EVENT_MIN_XRP_BY_WINDOW = {
  '5m': 60_000,
  '1h': 150_000,
  '24h': 350_000,
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
  if (rawWindow === '1h' || rawWindow === '24h') return rawWindow;
  return '5m';
}

function resolveLedgersCount(window, rawMax) {
  const parsed = Number(rawMax);
  const perWindowDefault = window === '24h' ? 60 : window === '1h' ? 40 : DEFAULT_MAX_LEDGERS;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return perWindowDefault;
  }
  return Math.max(10, Math.min(HARD_MAX_LEDGERS, Math.floor(parsed)));
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
  if (!leader) return 'No notable events above noise threshold.';
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
    return {
      dir: 'XFER',
      label: toEntity.label,
      reason: `exchange-to-exchange transfer (${fromEntity.label} → ${toEntity.label}) → internal movement candidate`,
      labelSource: `matched preset: ${fromEntity.label}, ${toEntity.label}`,
      scoreCap: 'MED',
      include: true,
    };
  }

  if (toExchange) {
    return {
      dir: 'IN',
      label: toEntity.label,
      reason: `to exchange address (${toEntity.label}) → potential sell pressure`,
      labelSource: `matched preset: ${toEntity.label}`,
      scoreCap: 'HIGH',
      include: true,
    };
  }

  if (fromExchange) {
    return {
      dir: 'OUT',
      label: fromEntity.label,
      reason: `from exchange address (${fromEntity.label}) → potential withdrawal`,
      labelSource: `matched preset: ${fromEntity.label}`,
      scoreCap: 'HIGH',
      include: true,
    };
  }

  if (isWhalePreset && meetsWhale) {
    return {
      dir: 'XFER',
      label: 'Whale',
      reason: `large transfer (${Math.round(amountXrp).toLocaleString()} XRP) above whale threshold`,
      labelSource: 'matched preset rule: whale threshold',
      scoreCap: 'HIGH',
      include: true,
    };
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
  const capValue = order[cap] || 3;
  raw = Math.min(raw, capValue);
  const score = Object.keys(order).find((key) => order[key] === raw) || 'LOW';
  const scoreBasis = amountScore === rankScore ? 'both' : raw === (order[amountScore] || 1) ? 'amount' : 'rank';
  return { score, scoreBasis };
}

function emptyPayload(window = '5m', preset = getPreset('exchanges')) {
  const labels = sortLabelsWithUnknownLast((preset.entities || []).map((entity) => entity.label).concat('Unknown'));
  return {
    ok: false,
    ts: Date.now(),
    source: 'demo',
    stale: true,
    window,
    priceXrpUsd: null,
    summaryReason: 'No data available.',
    summary: {
      inflowXrp: 0,
      outflowXrp: 0,
      netXrp: 0,
      inflowUsd: null,
      outflowUsd: null,
      netUsd: null,
    },
    heatmap: {
      labels,
      buckets: [],
      matrix: [],
      unit: 'xrp',
    },
    events: [],
    debug: {
      endpointsTried: [],
      ledgersScanned: 0,
      paymentsCount: 0,
      cacheHit: false,
      scoreBasis: 'amount',
      warnings: [],
    },
  };
}

async function rpcFetch(endpoint, payload) { /* unchanged */
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchValidatedLedgerIndex(debug) {
  let timeoutSeen = false;
  let lastError = null;

  for (const endpoint of XRPL_ENDPOINTS) {
    debug.endpointsTried.push(`${endpoint}#server_info`);
    try {
      const response = await rpcFetch(endpoint, {
        method: 'server_info',
        params: [{}],
      });
      const seq = response?.result?.info?.validated_ledger?.seq;
      const idx = Number(seq);
      if (Number.isFinite(idx) && idx > 0) {
        return { endpoint, ledgerIndex: idx };
      }
      throw new Error('invalid_server_info');
    } catch (error) {
      if (error?.name === 'AbortError') timeoutSeen = true;
      lastError = error;
    }
  }

  if (timeoutSeen) {
    const err = new Error('upstream_timeout');
    err.isTimeout = true;
    throw err;
  }

  throw new Error(lastError?.message || 'upstream_unreachable');
}

async function fetchXrpUsd(debug) {
  const now = Date.now();
  if (priceCache.fetchedAt && now - priceCache.fetchedAt <= PRICE_CACHE_TTL_MS) {
    return priceCache.value;
  }

  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd', {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`coingecko_http_${response.status}`);
    const payload = await response.json();
    const price = Number(payload?.ripple?.usd);
    if (!Number.isFinite(price) || price <= 0) throw new Error('coingecko_invalid_price');
    priceCache.value = price;
    priceCache.fetchedAt = now;
    return price;
  } catch (error) {
    debug.warnings.push(`price_unavailable:${error instanceof Error ? error.message : 'unknown'}`);
    return null;
  }
}

async function buildFreshFlow({ preset, window, ledgersToScan }) {
  const debug = {
    endpointsTried: [],
    ledgersScanned: 0,
    paymentsCount: 0,
    cacheHit: false,
    scoreBasis: 'amount',
    warnings: [],
  };

  const info = await fetchValidatedLedgerIndex(debug);
  const entityMap = buildEntityMap(preset);
  const labelsSet = new Set((preset.entities || []).map((entity) => entity.label));
  if (preset.id === 'whales') labelsSet.add('Whale');
  if (!labelsSet.size) labelsSet.add('Unknown');
  const startLedger = Math.max(1, info.ledgerIndex - ledgersToScan + 1);

  const buckets = [];
  let inflowXrp = 0;
  let outflowXrp = 0;
  const allEvents = [];
  const bucketLabelTotals = [];
  const whaleThreshold = resolveWhaleThreshold(preset, window);

  for (let ledgerIndex = startLedger; ledgerIndex <= info.ledgerIndex; ledgerIndex += 1) {
    buckets.push(String(ledgerIndex));
    const ledgerBucket = new Map();
    debug.endpointsTried.push(`${info.endpoint}#ledger:${ledgerIndex}`);
    let ledgerResponse;
    try {
      ledgerResponse = await rpcFetch(info.endpoint, {
        method: 'ledger',
        params: [{
          ledger_index: ledgerIndex,
          transactions: true,
          expand: true,
          owner_funds: false,
        }],
      });
    } catch (error) {
      debug.warnings.push(`ledger_fetch_failed:${ledgerIndex}:${error instanceof Error ? error.message : 'unknown'}`);
      bucketLabelTotals.push(ledgerBucket);
      continue;
    }

    const txs = ledgerResponse?.result?.ledger?.transactions || [];
    debug.ledgersScanned += 1;

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
        allEvents.push({
          time: tx.date || tx.hash || String(Date.now()),
          from: tx.Account || '',
          to: tx.Destination || '',
          dir: classified.dir,
          label: classified.label || 'Unknown',
          amountXrp,
          txHash: tx.hash || null,
          timeBucket: String(ledgerIndex),
          reason: classified.reason,
          labelSource: classified.labelSource,
          scoreCap: classified.scoreCap,
        });
      }
    }

    bucketLabelTotals.push(ledgerBucket);
  }

  const labels = sortLabelsWithUnknownLast(Array.from(labelsSet));
  const matrix = labels.map((label) => bucketLabelTotals.map((bucket) => Number(bucket.get(label) || 0)));
  const priceXrpUsd = await fetchXrpUsd(debug);

  const sortedEvents = allEvents.sort((a, b) => b.amountXrp - a.amountXrp);
  const scoredEvents = sortedEvents.slice(0, 60).map((event, index) => {
    const amountScore = scoreByAmount(event.amountXrp);
    const rankScore = scoreByRank(index, sortedEvents.length);
    const merged = mergeScore(amountScore, rankScore, event.scoreCap);
    return {
      ...event,
      score: merged.score,
      scoreBasis: merged.scoreBasis,
      amountUsd: priceXrpUsd ? event.amountXrp * priceXrpUsd : null,
    };
  });

  debug.scoreBasis = scoredEvents[0]?.scoreBasis || 'amount';
  const netXrp = inflowXrp - outflowXrp;

  return {
    ok: true,
    ts: Date.now(),
    source: 'xrpl:rpc',
    stale: false,
    window,
    priceXrpUsd,
    summaryReason: buildSummaryReason(netXrp, scoredEvents),
    summary: {
      inflowXrp,
      outflowXrp,
      netXrp,
      inflowUsd: priceXrpUsd ? inflowXrp * priceXrpUsd : null,
      outflowUsd: priceXrpUsd ? outflowXrp * priceXrpUsd : null,
      netUsd: priceXrpUsd ? netXrp * priceXrpUsd : null,
    },
    heatmap: {
      labels,
      buckets,
      matrix,
      unit: priceXrpUsd ? 'usd' : 'xrp',
    },
    events: scoredEvents,
    debug,
  };
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const presetKey = url.searchParams.get('preset') || 'exchanges';
  const window = normalizeWindow(url.searchParams.get('window') || '5m');
  const preset = getPreset(presetKey);
  const ledgersToScan = resolveLedgersCount(window, url.searchParams.get('max_ledgers'));
  const cacheKey = `${preset.id || presetKey}:${window}`;

  const now = Date.now();
  const cached = flowCache.get(cacheKey);
  if (cached && now - cached.fetchedAt <= FLOW_CACHE_TTL_MS) {
    return json({
      ...cached.data,
      source: 'cache',
      stale: false,
      ts: now,
      debug: {
        ...cached.data.debug,
        cacheHit: true,
      },
    });
  }

  try {
    const fresh = await buildFreshFlow({ preset, window, ledgersToScan });
    flowCache.set(cacheKey, { data: fresh, fetchedAt: now });
    return json(fresh);
  } catch (error) {
    if (cached) {
      return json({
        ...cached.data,
        source: 'cache',
        stale: true,
        ts: now,
        debug: {
          ...cached.data.debug,
          cacheHit: true,
          warnings: [
            ...(cached.data.debug?.warnings || []),
            `fallback:${error instanceof Error ? error.message : 'unknown'}`,
          ],
        },
      });
    }

    const fallback = emptyPayload(window, preset);
    fallback.debug.warnings.push(`fatal:${error instanceof Error ? error.message : 'unknown'}`);
    return json(fallback, 200);
  }
}
