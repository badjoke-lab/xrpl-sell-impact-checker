const XRPL_ENDPOINTS = [
  'https://s1.ripple.com:51234/',
  'https://s2.ripple.com:51234/',
];

const CACHE_TTL_MS = 120_000;
const HARD_MAX_LIMIT = 40;
const DEFAULT_LIMIT = 12;

const WINDOW_STRATEGIES = {
  '5m': { name: '5m_small', ms: 5 * 60 * 1000, maxLedgers: 24, eventLimit: 8, timeoutBudget: 4_000, sampled: false, sampleStride: 1 },
  '1h': { name: '1h_medium', ms: 60 * 60 * 1000, maxLedgers: 60, eventLimit: 12, timeoutBudget: 6_000, sampled: false, sampleStride: 1 },
  '24h': { name: '24h_sampled', ms: 24 * 60 * 60 * 1000, maxLedgers: 100, eventLimit: 16, timeoutBudget: 7_500, sampled: true, sampleStride: 2 },
  '7d': { name: '7d_sampled', ms: 7 * 24 * 60 * 60 * 1000, maxLedgers: 180, eventLimit: 20, timeoutBudget: 9_000, sampled: true, sampleStride: 5 },
};

const escrowCache = globalThis.__xsicEscrowWatchCache || new Map();
globalThis.__xsicEscrowWatchCache = escrowCache;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function normalizeWindow(rawWindow) {
  if (rawWindow === '5m' || rawWindow === '1h' || rawWindow === '24h' || rawWindow === '7d') return rawWindow;
  return '7d';
}

function resolveLimit(rawLimit) {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.max(3, Math.min(HARD_MAX_LIMIT, Math.floor(parsed)));
}

function rippleToUnixMs(rippleSeconds) { const sec = Number(rippleSeconds); return Number.isFinite(sec) ? (sec + 946684800) * 1000 : null; }
function dropsToXrp(value) { const drops = Number(value); return Number.isFinite(drops) ? drops / 1_000_000 : null; }

function emptyPayload(window) {
  return {
    ok: false, ts: Date.now(), source: 'xrpl:rpc', stale: true, staleReason: 'cached', window,
    next: null, recent: [], stats: { sumXrp: 0, count: 0, avgXrp: 0, maxXrp: 0 }, pattern: [],
    debug: { endpointsTried: [], ledgersScanned: 0, txCount: 0, cacheHit: false, warnings: [], durationMs: 0, rpcCalls: 0, lastValidatedLedger: null, degradeLevel: 'D', strategy: WINDOW_STRATEGIES[window]?.name || 'unknown' },
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
  } finally { clearTimeout(timeout); }
}

async function fetchValidatedLedgerIndex(debug, timeoutMs) {
  let timeoutSeen = false;
  let lastError = null;
  for (const endpoint of XRPL_ENDPOINTS) {
    debug.endpointsTried.push(`${endpoint}#server_info`);
    try {
      const response = await rpcFetch(endpoint, { method: 'server_info', params: [{}] }, timeoutMs, debug);
      const seq = Number(response?.result?.info?.validated_ledger?.seq);
      if (Number.isFinite(seq) && seq > 0) return { endpoint, ledgerIndex: seq };
      throw new Error('invalid_server_info');
    } catch (error) {
      if (error?.name === 'AbortError') timeoutSeen = true;
      lastError = error;
    }
  }
  if (timeoutSeen) throw new Error('upstream_timeout');
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
    const amount = dropsToXrp(escrowNode?.FinalFields?.Amount || escrowNode?.NewFields?.Amount || escrowNode?.PreviousFields?.Amount);
    if (amount && amount > 0) return amount;
  }
  return null;
}

function buildPatternNotes(recent) {
  const notes = [];
  if (!recent.length) return notes;
  const finishEvents = recent.filter((row) => row.type === 'finish').sort((a, b) => a.time - b.time);
  if (finishEvents.length >= 2) {
    const deltas = [];
    for (let i = 1; i < finishEvents.length; i += 1) deltas.push(finishEvents[i].time - finishEvents[i - 1].time);
    const avgDeltaDays = deltas.reduce((sum, v) => sum + v, 0) / deltas.length / (24 * 60 * 60 * 1000);
    if (avgDeltaDays >= 20 && avgDeltaDays <= 40) notes.push({ label: 'monthly-ish', note: `Unlock cadence appears monthly-ish (~${avgDeltaDays.toFixed(1)}d interval).` });
  }
  return notes;
}

async function buildFreshEscrowAttempt(window, limit, strategy, degradeLevel) {
  const startedAt = Date.now();
  const debug = { endpointsTried: [], ledgersScanned: 0, txCount: 0, cacheHit: false, warnings: [], durationMs: 0, rpcCalls: 0, lastValidatedLedger: null, degradeLevel, strategy: strategy.name };
  const deadline = startedAt + strategy.timeoutBudget;
  const timeoutFor = () => Math.max(1_000, Math.min(4_500, deadline - Date.now()));

  const info = await fetchValidatedLedgerIndex(debug, timeoutFor());
  debug.lastValidatedLedger = info.ledgerIndex;
  const minTime = Date.now() - strategy.ms;
  const startLedger = Math.max(1, info.ledgerIndex - strategy.maxLedgers + 1);

  const recent = [];
  const nextCandidates = [];

  for (let ledgerIndex = info.ledgerIndex; ledgerIndex >= startLedger; ledgerIndex -= strategy.sampleStride) {
    if (Date.now() > deadline) throw new Error('timeout_budget_exceeded');
    debug.endpointsTried.push(`${info.endpoint}#ledger:${ledgerIndex}`);
    let ledgerResponse;
    try {
      ledgerResponse = await rpcFetch(info.endpoint, { method: 'ledger', params: [{ ledger_index: ledgerIndex, transactions: true, expand: true, owner_funds: false }] }, timeoutFor(), debug);
    } catch (error) {
      debug.warnings.push(`ledger_fetch_failed:${ledgerIndex}:${error instanceof Error ? error.message : 'unknown'}`);
      continue;
    }
    debug.ledgersScanned += 1;
    const txs = ledgerResponse?.result?.ledger?.transactions || [];

    for (const entry of txs) {
      const tx = entry?.tx || entry;
      const meta = entry?.meta || tx?.metaData;
      if (!tx || !['EscrowFinish', 'EscrowCreate', 'EscrowCancel'].includes(tx.TransactionType)) continue;
      if (meta?.TransactionResult && meta.TransactionResult !== 'tesSUCCESS') continue;
      debug.txCount += 1;
      const time = rippleToUnixMs(tx.date);
      const type = tx.TransactionType === 'EscrowFinish' ? 'finish' : tx.TransactionType === 'EscrowCancel' ? 'cancel' : 'create';
      const amountXrp = extractEscrowAmount(tx, meta);
      const event = { time: time || Date.now(), amountXrp: amountXrp || 0, txHash: tx.hash || null, type, account: tx.Account || tx.Owner || null, note: type === 'create' ? 'EscrowCreate observed' : type === 'finish' ? 'Escrow unlocked via EscrowFinish' : 'Escrow canceled' };
      if (time && time >= minTime) recent.push(event);
      if (type === 'create') {
        const unlockTime = rippleToUnixMs(tx.FinishAfter);
        if (unlockTime && unlockTime > Date.now()) nextCandidates.push({ time: unlockTime, amountXrp: dropsToXrp(tx.Amount) || amountXrp || 0, txHash: tx.hash || null, account: tx.Account || null, note: 'Upcoming escrow finish window from EscrowCreate.FinishAfter' });
      }
    }
  }

  recent.sort((a, b) => b.time - a.time);
  const eventLimit = Math.min(limit, strategy.eventLimit);
  const limitedRecent = recent.slice(0, eventLimit);
  const amounts = limitedRecent.map((r) => Number(r.amountXrp || 0)).filter((v) => v > 0);
  const sumXrp = amounts.reduce((sum, v) => sum + v, 0);
  const count = limitedRecent.length;
  const avgXrp = count ? sumXrp / count : 0;
  const maxXrp = amounts.length ? Math.max(...amounts) : 0;
  nextCandidates.sort((a, b) => a.time - b.time);

  debug.durationMs = Date.now() - startedAt;
  const sampled = Boolean(strategy.sampled || strategy.sampleStride > 1);
  return {
    ok: true, ts: Date.now(), source: 'xrpl:rpc', stale: sampled, staleReason: sampled ? 'sampled' : null, window,
    next: nextCandidates[0] || null, recent: limitedRecent,
    stats: { sumXrp, count, avgXrp, maxXrp },
    pattern: buildPatternNotes(limitedRecent),
    debug,
  };
}

async function buildFreshEscrow(window, limit) {
  const base = WINDOW_STRATEGIES[window] || WINDOW_STRATEGIES['7d'];
  const attempts = [
    { ...base, degradeLevel: 'none' },
    { ...base, eventLimit: Math.max(6, Math.floor(base.eventLimit * 0.7)), maxLedgers: Math.max(20, Math.floor(base.maxLedgers * 0.75)), degradeLevel: 'A' },
    { ...base, eventLimit: Math.max(4, Math.floor(base.eventLimit * 0.5)), maxLedgers: Math.max(16, Math.floor(base.maxLedgers * 0.55)), sampleStride: Math.max(base.sampleStride, 3), degradeLevel: 'B' },
    { ...base, eventLimit: Math.max(3, Math.floor(base.eventLimit * 0.4)), maxLedgers: Math.max(12, Math.floor(base.maxLedgers * 0.4)), sampleStride: Math.max(base.sampleStride, 5), degradeLevel: 'C' },
  ];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const payload = await buildFreshEscrowAttempt(window, limit, { ...attempt, name: `${base.name}_${attempt.degradeLevel}` }, attempt.degradeLevel);
      if (attempt.degradeLevel !== 'none') payload.debug.warnings.push(`degrade:${attempt.degradeLevel}`);
      return payload;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(lastError?.message || 'build_failed');
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const window = normalizeWindow(url.searchParams.get('window'));
  const limit = resolveLimit(url.searchParams.get('limit'));
  const cacheKey = window;
  const now = Date.now();
  const cached = escrowCache.get(cacheKey);

  try {
    const fresh = await buildFreshEscrow(window, limit);
    escrowCache.set(cacheKey, { data: fresh, fetchedAt: now });
    return json(fresh);
  } catch (error) {
    if (cached?.data && now - cached.fetchedAt <= CACHE_TTL_MS) {
      return json({
        ...cached.data,
        source: 'cache',
        stale: true,
        staleReason: 'cached',
        ts: now,
        recent: (cached.data.recent || []).slice(0, limit),
        debug: {
          ...cached.data.debug,
          cacheHit: true,
          degradeLevel: 'D',
          warnings: [...(cached.data.debug?.warnings || []), `fallback:${error instanceof Error ? error.message : 'unknown'}`, 'degrade:D:cache_fallback'],
        },
      });
    }

    const fallback = emptyPayload(window);
    fallback.debug.warnings.push(`fatal:${error instanceof Error ? error.message : 'unknown'}`);
    return json(fallback);
  }
}
