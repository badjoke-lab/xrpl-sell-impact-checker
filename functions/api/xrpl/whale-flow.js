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

function emptyPayload(window = '5m') {
  return {
    ok: false,
    ts: Date.now(),
    source: 'demo',
    stale: true,
    window,
    priceXrpUsd: null,
    summary: {
      inflowXrp: 0,
      outflowXrp: 0,
      netXrp: 0,
      inflowUsd: null,
      outflowUsd: null,
      netUsd: null,
    },
    heatmap: {
      labels: ['Binance', 'Coinbase', 'Bitstamp', 'Kraken', 'Bybit', 'Unknown'],
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
      warnings: [],
    },
  };
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

function scoreByAmount(amountXrp) {
  if (amountXrp >= 1_000_000) return 'HIGH';
  if (amountXrp >= 250_000) return 'MED';
  return 'LOW';
}

function toXrpAmount(amount) {
  if (typeof amount === 'string') {
    const drops = Number(amount);
    return Number.isFinite(drops) ? drops / 1_000_000 : null;
  }
  return null;
}

async function rpcFetch(endpoint, payload) {
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

function processLedgerTransactions(transactions, presetMap, labels, bucketIndex, stats) {
  const bucketTotals = new Map();
  const events = [];

  for (const entry of transactions || []) {
    const tx = entry?.tx || entry;
    if (!tx || tx.TransactionType !== 'Payment') continue;
    if (tx.metaData?.TransactionResult && tx.metaData.TransactionResult !== 'tesSUCCESS') continue;

    const amountXrp = toXrpAmount(tx.Amount);
    if (!amountXrp || amountXrp <= 0) continue;

    stats.paymentsCount += 1;

    const fromLabel = presetMap.get(tx.Account);
    const toLabel = presetMap.get(tx.Destination);

    let dir = null;
    let label = null;
    if (toLabel) {
      dir = 'IN';
      label = toLabel;
    } else if (fromLabel) {
      dir = 'OUT';
      label = fromLabel;
    } else {
      continue;
    }

    const signed = dir === 'IN' ? amountXrp : -amountXrp;
    bucketTotals.set(label, (bucketTotals.get(label) || 0) + signed);

    events.push({
      time: tx.date || tx.hash || String(Date.now()),
      from: tx.Account || '',
      to: tx.Destination || '',
      dir,
      label,
      amountXrp,
      score: scoreByAmount(amountXrp),
      reason: `${dir === 'IN' ? 'to' : 'from'} exchange preset match (${label}) @bucket:${bucketIndex}`,
    });
  }

  labels.forEach((label) => {
    if (!bucketTotals.has(label)) bucketTotals.set(label, 0);
  });

  return { bucketTotals, events };
}

async function buildFreshFlow({ preset, window, ledgersToScan }) {
  const debug = {
    endpointsTried: [],
    ledgersScanned: 0,
    paymentsCount: 0,
    cacheHit: false,
    warnings: [],
  };

  const info = await fetchValidatedLedgerIndex(debug);
  const labels = preset.labels;
  const presetMap = new Map(preset.addresses.map((entry) => [entry.address, entry.label]));
  const startLedger = Math.max(1, info.ledgerIndex - ledgersToScan + 1);

  const matrix = labels.map(() => []);
  const buckets = [];
  let inflowXrp = 0;
  let outflowXrp = 0;
  const allEvents = [];

  for (let ledgerIndex = startLedger; ledgerIndex <= info.ledgerIndex; ledgerIndex += 1) {
    buckets.push(String(ledgerIndex));
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
      labels.forEach((_, idx) => matrix[idx].push(0));
      continue;
    }

    const txs = ledgerResponse?.result?.ledger?.transactions || [];
    debug.ledgersScanned += 1;
    const { bucketTotals, events } = processLedgerTransactions(txs, presetMap, labels, buckets.length - 1, debug);

    labels.forEach((label, rowIndex) => {
      const signed = bucketTotals.get(label) || 0;
      matrix[rowIndex].push(signed);
      if (signed > 0) inflowXrp += signed;
      if (signed < 0) outflowXrp += Math.abs(signed);
    });

    allEvents.push(...events);
  }

  const priceXrpUsd = await fetchXrpUsd(debug);
  const eventsSorted = allEvents
    .sort((a, b) => b.amountXrp - a.amountXrp)
    .slice(0, 60)
    .map((event) => ({
      ...event,
      amountUsd: priceXrpUsd ? event.amountXrp * priceXrpUsd : null,
    }));

  const netXrp = inflowXrp - outflowXrp;

  return {
    ok: true,
    ts: Date.now(),
    source: 'xrpl:rpc',
    stale: false,
    window,
    priceXrpUsd,
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
    events: eventsSorted,
    debug,
  };
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const presetKey = url.searchParams.get('preset') || 'exchanges';
  const window = normalizeWindow(url.searchParams.get('window') || '5m');
  const preset = presetsData[presetKey] || presetsData.exchanges;
  const ledgersToScan = resolveLedgersCount(window, url.searchParams.get('max_ledgers'));
  const cacheKey = `${preset.id}:${window}`;

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

    const fallback = emptyPayload(window);
    fallback.debug.warnings.push(`fatal:${error instanceof Error ? error.message : 'unknown'}`);
    return json(fallback, 200);
  }
}
