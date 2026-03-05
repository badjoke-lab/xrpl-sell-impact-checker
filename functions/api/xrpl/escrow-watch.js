const XRPL_ENDPOINTS = [
  'https://s1.ripple.com:51234/',
  'https://s2.ripple.com:51234/',
];

const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 120_000;
const HARD_MAX_LEDGERS = 200;
const HARD_MAX_LIMIT = 40;
const DEFAULT_LIMIT = 12;

const WINDOW_CONFIG = {
  '24h': { ms: 24 * 60 * 60 * 1000, ledgers: 80 },
  '7d': { ms: 7 * 24 * 60 * 60 * 1000, ledgers: 140 },
  '30d': { ms: 30 * 24 * 60 * 60 * 1000, ledgers: 200 },
};

const escrowCache = globalThis.__xsicEscrowWatchCache || new Map();
globalThis.__xsicEscrowWatchCache = escrowCache;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function normalizeWindow(rawWindow) {
  if (rawWindow === '24h' || rawWindow === '30d') return rawWindow;
  return '7d';
}

function resolveLimit(rawLimit) {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.max(3, Math.min(HARD_MAX_LIMIT, Math.floor(parsed)));
}

function rippleToUnixMs(rippleSeconds) {
  const sec = Number(rippleSeconds);
  if (!Number.isFinite(sec)) return null;
  return (sec + 946684800) * 1000;
}

function dropsToXrp(value) {
  const drops = Number(value);
  if (!Number.isFinite(drops)) return null;
  return drops / 1_000_000;
}

function emptyPayload(window) {
  return {
    ok: false,
    ts: Date.now(),
    source: 'xrpl:rpc',
    stale: false,
    window,
    next: null,
    recent: [],
    stats: { sumXrp: 0, count: 0, avgXrp: 0, maxXrp: 0 },
    pattern: [],
    debug: {
      endpointsTried: [],
      ledgersScanned: 0,
      txCount: 0,
      cacheHit: false,
      warnings: [],
    },
  };
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
    if (!response.ok) throw new Error(`http_${response.status}`);
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
      const response = await rpcFetch(endpoint, { method: 'server_info', params: [{}] });
      const seq = Number(response?.result?.info?.validated_ledger?.seq);
      if (Number.isFinite(seq) && seq > 0) return { endpoint, ledgerIndex: seq };
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

function extractEscrowAmount(tx, meta) {
  if (typeof tx?.Amount === 'string') {
    const amount = dropsToXrp(tx.Amount);
    if (amount && amount > 0) return amount;
  }

  const nodes = meta?.AffectedNodes || [];
  for (const node of nodes) {
    const escrowNode = node?.DeletedNode || node?.ModifiedNode || node?.CreatedNode;
    if (escrowNode?.LedgerEntryType !== 'Escrow') continue;
    const amountDrops = escrowNode?.FinalFields?.Amount || escrowNode?.NewFields?.Amount || escrowNode?.PreviousFields?.Amount;
    const amount = dropsToXrp(amountDrops);
    if (amount && amount > 0) return amount;
  }

  return null;
}

function buildPatternNotes(recent) {
  const notes = [];
  if (!recent.length) return notes;

  const finishEvents = recent
    .filter((row) => row.type === 'finish')
    .sort((a, b) => a.time - b.time);

  if (finishEvents.length >= 2) {
    const deltas = [];
    for (let i = 1; i < finishEvents.length; i += 1) {
      deltas.push(finishEvents[i].time - finishEvents[i - 1].time);
    }
    const avgDeltaDays = deltas.reduce((sum, value) => sum + value, 0) / deltas.length / (24 * 60 * 60 * 1000);
    if (avgDeltaDays >= 20 && avgDeltaDays <= 40) {
      notes.push({ label: 'monthly-ish', note: `Unlock cadence appears monthly-ish (~${avgDeltaDays.toFixed(1)}d interval).` });
    }
  }

  const sorted = [...recent].sort((a, b) => b.time - a.time);
  let clusterCount = 1;
  let hasCluster = false;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i - 1].time - sorted[i].time <= 12 * 60 * 60 * 1000) {
      clusterCount += 1;
      if (clusterCount >= 3) {
        hasCluster = true;
        break;
      }
    } else {
      clusterCount = 1;
    }
  }
  if (hasCluster) {
    notes.push({ label: 'clustered unlocks', note: 'Multiple escrow events landed in a short time cluster (<12h).' });
  }

  const maxXrp = Math.max(...recent.map((row) => row.amountXrp || 0), 0);
  if (maxXrp >= 50_000_000) {
    notes.push({ label: 'large unlock', note: `Large escrow amount observed (${Math.round(maxXrp).toLocaleString()} XRP).` });
  }

  return notes;
}

async function buildFreshEscrow(window, limit) {
  const debug = {
    endpointsTried: [],
    ledgersScanned: 0,
    txCount: 0,
    cacheHit: false,
    warnings: [],
  };

  const info = await fetchValidatedLedgerIndex(debug);
  const config = WINDOW_CONFIG[window] || WINDOW_CONFIG['7d'];
  const ledgersToScan = Math.min(HARD_MAX_LEDGERS, config.ledgers);
  const minTime = Date.now() - config.ms;
  const startLedger = Math.max(1, info.ledgerIndex - ledgersToScan + 1);

  const recent = [];
  const nextCandidates = [];

  for (let ledgerIndex = info.ledgerIndex; ledgerIndex >= startLedger; ledgerIndex -= 1) {
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
      continue;
    }

    debug.ledgersScanned += 1;
    const txs = ledgerResponse?.result?.ledger?.transactions || [];

    for (const entry of txs) {
      const tx = entry?.tx || entry;
      const meta = entry?.meta || tx?.metaData;
      if (!tx) continue;
      if (!['EscrowFinish', 'EscrowCreate', 'EscrowCancel'].includes(tx.TransactionType)) continue;
      if (meta?.TransactionResult && meta.TransactionResult !== 'tesSUCCESS') continue;

      debug.txCount += 1;
      const time = rippleToUnixMs(tx.date);
      const type = tx.TransactionType === 'EscrowFinish' ? 'finish' : tx.TransactionType === 'EscrowCancel' ? 'cancel' : 'create';
      const amountXrp = extractEscrowAmount(tx, meta);
      const account = tx.Account || tx.Owner || null;
      const txHash = tx.hash || null;
      const event = {
        time: time || Date.now(),
        amountXrp: amountXrp || 0,
        txHash,
        type,
        account,
        note: type === 'create' ? 'EscrowCreate observed' : type === 'finish' ? 'Escrow unlocked via EscrowFinish' : 'Escrow canceled',
      };

      if (time && time >= minTime) recent.push(event);

      if (type === 'create') {
        const unlockTime = rippleToUnixMs(tx.FinishAfter);
        const createAmountXrp = dropsToXrp(tx.Amount);
        if (unlockTime && unlockTime > Date.now()) {
          nextCandidates.push({
            time: unlockTime,
            amountXrp: createAmountXrp || amountXrp || 0,
            txHash,
            account,
            note: 'Upcoming escrow finish window from EscrowCreate.FinishAfter',
          });
        }
      }
    }
  }

  recent.sort((a, b) => b.time - a.time);
  const limitedRecent = recent.slice(0, Math.max(limit, 10));
  const amounts = limitedRecent.map((row) => Number(row.amountXrp || 0)).filter((value) => value > 0);
  const sumXrp = amounts.reduce((sum, value) => sum + value, 0);
  const count = limitedRecent.length;
  const avgXrp = count ? sumXrp / count : 0;
  const maxXrp = amounts.length ? Math.max(...amounts) : 0;

  nextCandidates.sort((a, b) => a.time - b.time);
  const next = nextCandidates[0] || null;

  return {
    ok: true,
    ts: Date.now(),
    source: 'xrpl:rpc',
    stale: false,
    window,
    next,
    recent: limitedRecent,
    stats: { sumXrp, count, avgXrp, maxXrp },
    pattern: buildPatternNotes(limitedRecent),
    debug,
  };
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const window = normalizeWindow(url.searchParams.get('window'));
  const limit = resolveLimit(url.searchParams.get('limit'));
  const cacheKey = window;

  const now = Date.now();
  const cached = escrowCache.get(cacheKey);
  if (cached && now - cached.fetchedAt <= CACHE_TTL_MS) {
    return json({
      ...cached.data,
      source: 'cache',
      stale: false,
      ts: now,
      recent: (cached.data.recent || []).slice(0, limit),
      debug: {
        ...cached.data.debug,
        cacheHit: true,
      },
    });
  }

  try {
    const fresh = await buildFreshEscrow(window, limit);
    escrowCache.set(cacheKey, { data: fresh, fetchedAt: now });
    return json(fresh);
  } catch (error) {
    if (cached?.data) {
      return json({
        ...cached.data,
        source: 'cache',
        stale: true,
        ts: now,
        recent: (cached.data.recent || []).slice(0, limit),
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
    return json(fallback);
  }
}
