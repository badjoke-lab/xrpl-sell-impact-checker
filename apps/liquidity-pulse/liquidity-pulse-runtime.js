const POOL = 'xrp-rlusd';
const WINDOW_KEY = 'xsic.liquidityPulse.window';
const LITE_KEY = 'xsic.liquidityPulse.liteMode';
const DEMO_KEY = 'xsic.liquidityPulse.demoMode';
const LIVE_REFRESH_MS = 60_000;
const LITE_REFRESH_MS = 120_000;
const FETCH_TIMEOUT_MS = 7_000;

const WINDOW_LIMITS = {
  blend: 289,
  '1h': 13,
  '6h': 73,
  '24h': 289,
};

const HORIZONS = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

const STATE_COPY = {
  fresh: ['FRESH', 'Live snapshot is fresh.', 'Current and materialized sources are available.'],
  aging: ['AGING', 'Snapshot is aging.', 'The latest known values remain visible while refresh continues.'],
  stale: ['STALE', 'Snapshot is stale.', 'Treat the retained values and trends as delayed context.'],
  partial: ['PARTIAL', 'Partial snapshot shown.', 'One or more core metrics or history horizons are unavailable.'],
  degraded: ['DEGRADED', 'Live source is degraded.', 'A materialized current or history fallback is being shown.'],
  missing: ['MISSING', 'No usable liquidity snapshot is available.', 'Retry or use Demo only for a labelled sample view.'],
  demo: ['DEMO', 'Demo source is active.', 'Fixed sample data is shown intentionally and is not live.'],
  loading: ['LOADING', 'Loading liquidity data…', 'Checking current, live, and bounded history sources.'],
};

function q(selector) {
  return document.querySelector(selector);
}

function qa(selector) {
  return [...document.querySelectorAll(selector)];
}

function text(node, value) {
  if (node) node.textContent = value ?? '';
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function loadBool(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function saveBool(key, value) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {}
}

function loadWindow() {
  try {
    const value = localStorage.getItem(WINDOW_KEY);
    if (Object.hasOwn(WINDOW_LIMITS, value)) return value;
  } catch {}
  return 'blend';
}

function saveWindow(value) {
  try {
    localStorage.setItem(WINDOW_KEY, value);
  } catch {}
}

function ageMs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : null;
}

function formatAge(value) {
  const age = Number(value);
  if (!Number.isFinite(age)) return 'unknown age';
  const minutes = Math.round(age / 60_000);
  if (minutes < 60) return `${minutes}m old`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m old`;
}

function formatNumber(value, digits = 2) {
  const number = finite(value);
  if (number === null) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(number);
}

function normalizeFreshness(raw, observedAt) {
  const state = raw?.state || raw?.status;
  const age = finite(raw?.ageMs) ?? ageMs(observedAt);
  if (['fresh', 'aging', 'stale', 'missing'].includes(state)) {
    return { ...raw, state, ageMs: age, observedAt: raw?.observedAt || observedAt || null };
  }
  if (!observedAt) return { state: 'missing', ageMs: null, observedAt: null };
  if (age >= 45 * 60_000) return { state: 'stale', ageMs: age, observedAt };
  if (age >= 20 * 60_000) return { state: 'aging', ageMs: age, observedAt };
  return { state: 'fresh', ageMs: age, observedAt };
}

async function fetchJson(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) throw new Error('non_json_response');
    const payload = await response.json();
    if (!response.ok || payload?.error) throw new Error(payload?.error || `http_${response.status}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSnapshot(raw, sourceMode) {
  if (!raw) return null;
  const observedAt = raw.ts || raw.observedAt || raw.freshness?.observedAt || null;
  return {
    observedAt,
    pool: raw.poolLabel || raw.pool || 'XRP / RLUSD',
    price: finite(raw.price),
    liquidityUsd: finite(raw.liquidityUsd),
    swaps5m: finite(raw.swaps5m),
    deviationBps: finite(raw.deviationBps),
    reserves: raw.reserves || null,
    source: raw.source || 'unknown',
    sourceMode,
    freshness: normalizeFreshness(raw.freshness, observedAt),
    stale: Boolean(raw.stale || raw.freshness?.isStale),
  };
}

function historyRows(payload) {
  return (Array.isArray(payload?.recent) ? payload.recent : [])
    .map((row) => normalizeSnapshot(row, 'history'))
    .filter((row) => row?.observedAt && row.liquidityUsd !== null)
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
}

function deriveTrend(rows, horizonMs, nowTs) {
  const relevant = rows.filter((row) => {
    const ts = Date.parse(row.observedAt);
    return Number.isFinite(ts) && nowTs - ts <= horizonMs;
  });
  if (relevant.length < 2) return { available: false, samples: relevant.length, deltaPct: null };
  const first = relevant[0].liquidityUsd;
  const last = relevant.at(-1).liquidityUsd;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) {
    return { available: false, samples: relevant.length, deltaPct: null };
  }
  return {
    available: true,
    samples: relevant.length,
    deltaPct: ((last - first) / first) * 100,
  };
}

function classify(snapshot, trends, fallbackUsed, demo) {
  if (demo) return 'demo';
  if (!snapshot) return 'missing';
  if (fallbackUsed) return 'degraded';
  if (snapshot.stale || snapshot.freshness.state === 'stale') return 'stale';
  const coreCount = [snapshot.price, snapshot.liquidityUsd].filter((value) => value !== null).length;
  if (coreCount === 0) return 'missing';
  if (coreCount < 2 || Object.values(trends).some((trend) => !trend.available)) return 'partial';
  if (snapshot.freshness.state === 'aging') return 'aging';
  return 'fresh';
}

function setState(state, note) {
  const copy = STATE_COPY[state] || STATE_COPY.missing;
  text(q('[data-snapshot="stateBadge"]'), copy[0]);
  text(q('#lpStatus'), `Status: ${copy[1]}`);
  text(q('[data-snapshot="stateHelper"]'), copy[2]);
  const noteNode = q('[data-snapshot="stateNote"]');
  if (noteNode) {
    noteNode.hidden = !note;
    if (note) text(noteNode, note);
  }
  document.documentElement.dataset.liquidityState = state;
  qa('[data-state-overlay]').forEach((node) => {
    const overlay = node.dataset.stateOverlay;
    node.hidden = !((state === 'loading' && overlay === 'loading') || (state === 'missing' && overlay === 'empty'));
  });
}

function renderTrend(label, trend, historyState) {
  const bar = q(`[data-trend="${label}"]`);
  const meta = q(`[data-trend-meta="${label}"]`);
  if (!trend.available) {
    if (bar) bar.style.height = '0%';
    text(meta, `${label} change unavailable · ${trend.samples} sample${trend.samples === 1 ? '' : 's'} · history ${historyState}`);
    return;
  }
  const magnitude = Math.min(100, Math.abs(trend.deltaPct));
  if (bar) bar.style.height = `${magnitude}%`;
  const direction = trend.deltaPct > 0 ? '+' : '';
  text(meta, `${direction}${formatNumber(trend.deltaPct, 3)}% liquidity change · ${trend.samples} samples · history ${historyState}`);
}

function replaceList(node, items) {
  if (!node) return;
  node.replaceChildren();
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    node.appendChild(li);
  });
}

function renderCanvas(snapshot, state) {
  const canvas = q('#lpCanvas');
  if (!canvas) return;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, canvas.clientWidth || 720);
  const height = Math.max(180, canvas.clientHeight || 260);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.lineWidth = 2;
  context.strokeStyle = 'rgba(111, 99, 194, 0.9)';
  context.beginPath();
  const deviation = Math.min(40, Math.max(2, finite(snapshot?.deviationBps) || 2));
  for (let x = 0; x <= width; x += 8) {
    const phase = (x / width) * Math.PI * 4;
    const y = height / 2 + Math.sin(phase) * deviation;
    if (x === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.fillStyle = 'rgba(76, 29, 149, 0.9)';
  context.font = '13px system-ui';
  context.fillText(`${snapshot?.pool || 'No pool'} · ${state}`, 14, 24);
}

function render(snapshot, history, fallbackUsed, demo) {
  const rows = historyRows(history);
  const nowTs = Date.parse(snapshot?.observedAt || '') || Date.now();
  const trends = {
    '1h': deriveTrend(rows, HORIZONS['1h'], nowTs),
    '6h': deriveTrend(rows, HORIZONS['6h'], nowTs),
    '24h': deriveTrend(rows, HORIZONS['24h'], nowTs),
  };
  const historyFreshness = normalizeFreshness(history?.historyMeta?.freshness, history?.historyMeta?.newestTs);
  const state = classify(snapshot, trends, fallbackUsed, demo);
  const age = formatAge(snapshot?.freshness?.ageMs);
  const source = snapshot?.sourceMode || 'none';
  const note = state === 'fresh' || state === 'demo'
    ? null
    : `${STATE_COPY[state][1]} Source ${source}; snapshot ${age}; history ${historyFreshness.state}.`;

  setState(state, note);
  text(q('[data-snapshot="pool"]'), snapshot?.pool || '—');
  text(q('[data-snapshot="price"]'), snapshot?.price === null || !snapshot ? '—' : formatNumber(snapshot.price, 8));
  text(q('[data-snapshot="liquidityUsd"]'), snapshot?.liquidityUsd === null || !snapshot ? '—' : `$${formatNumber(snapshot.liquidityUsd, 0)}`);
  text(q('[data-snapshot="swaps5m"]'), snapshot?.swaps5m === null || !snapshot ? '—' : formatNumber(snapshot.swaps5m, 0));
  text(q('[data-snapshot="deviationBps"]'), snapshot?.deviationBps === null || !snapshot ? '—' : `${formatNumber(snapshot.deviationBps, 0)} bps`);
  text(q('[data-snapshot="source"]'), snapshot ? `${source} · ${snapshot.freshness.state} · ${age}` : 'none · missing');

  Object.entries(trends).forEach(([label, trend]) => renderTrend(label, trend, historyFreshness.state));

  const availableHorizons = Object.values(trends).filter((trend) => trend.available).length;
  text(q('[data-reason="title"]'), state === 'fresh' ? 'Current and history layers agree' : 'Liquidity context requires caution');
  text(q('[data-reason="copy"]'), snapshot
    ? `The page is using ${source}. ${availableHorizons}/3 trend horizons have enough bounded history for an observed change.`
    : 'No live or materialized snapshot could be loaded.');
  replaceList(q('[data-reason="list"]'), [
    `Snapshot freshness: ${snapshot?.freshness?.state || 'missing'} (${age}).`,
    `History source: ${history?.source || history?.historyMeta?.source || 'none'} · ${rows.length} bounded samples.`,
    fallbackUsed ? 'Live fetch failed; materialized data is a labelled fallback.' : 'Live fetch is the current source of truth.',
  ]);

  const viz = q('#lpVizSnapshot');
  text(viz, snapshot
    ? `${snapshot.pool} · liquidity ${snapshot.liquidityUsd === null ? 'unavailable' : `$${formatNumber(snapshot.liquidityUsd, 0)}`} · ${state}`
    : 'No liquidity snapshot available.');
  renderCanvas(snapshot, state);
  window.dispatchEvent(new CustomEvent('xsic:liquidity-rendered', { detail: { state, snapshot, historyFreshness, trends } }));
}

function demoSnapshot() {
  const observedAt = new Date().toISOString();
  return {
    observedAt,
    pool: 'XRP / RLUSD Demo',
    price: 0.52,
    liquidityUsd: 900000,
    swaps5m: 12,
    deviationBps: 8,
    source: 'fixed-demo',
    sourceMode: 'demo',
    freshness: { state: 'fresh', ageMs: 0, observedAt },
    stale: false,
  };
}

function demoHistory() {
  const now = Date.now();
  return {
    source: 'fixed-demo',
    historyMeta: { count: 4, newestTs: new Date(now).toISOString(), freshness: { state: 'fresh', ageMs: 0 } },
    recent: [0, 1, 2, 3].map((index) => ({
      ts: new Date(now - (3 - index) * 30 * 60_000).toISOString(),
      pool: POOL,
      liquidityUsd: 870000 + index * 10000,
      price: 0.52,
      source: 'fixed-demo',
    })),
  };
}

function boot() {
  const windowSelect = q('#lp-window-select');
  const liteToggle = q('#lite-mode-toggle');
  const demoToggle = q('#demo-mode-toggle');
  const retry = q('#retry-button');
  let windowMode = loadWindow();
  let lite = loadBool(LITE_KEY);
  let demo = loadBool(DEMO_KEY);
  let requestGeneration = 0;
  let timer = null;

  if (windowSelect) windowSelect.value = windowMode;
  if (liteToggle) liteToggle.checked = lite;
  if (demoToggle) demoToggle.checked = demo;

  async function refresh() {
    const generation = ++requestGeneration;
    setState('loading', null);

    if (demo) {
      render(demoSnapshot(), demoHistory(), false, true);
      schedule();
      return;
    }

    const limit = WINDOW_LIMITS[windowMode] || WINDOW_LIMITS.blend;
    const currentPromise = fetchJson(`/api/xrpl/liquidity-current?pool=${encodeURIComponent(POOL)}`).catch(() => null);
    const historyPromise = fetchJson(`/api/xrpl/liquidity-history?pool=${encodeURIComponent(POOL)}&limit=${limit}`).catch(() => null);
    const livePromise = fetchJson(`/api/xrpl/amm-snapshot?pool=${encodeURIComponent(POOL)}`).catch(() => null);
    const [current, history, live] = await Promise.all([currentPromise, historyPromise, livePromise]);
    if (generation !== requestGeneration) return;

    let snapshot = normalizeSnapshot(live, 'live');
    let fallbackUsed = false;
    if (!snapshot || (snapshot.price === null && snapshot.liquidityUsd === null)) {
      snapshot = normalizeSnapshot(current?.latest || history?.latest, current?.latest ? 'materialized-current' : 'history-fallback');
      fallbackUsed = Boolean(snapshot);
    }

    render(snapshot, history || { recent: [], historyMeta: { freshness: { state: 'missing' } }, source: 'none' }, fallbackUsed, false);
    schedule();
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    if (document.hidden) return;
    timer = setTimeout(refresh, lite ? LITE_REFRESH_MS : LIVE_REFRESH_MS);
  }

  windowSelect?.addEventListener('change', () => {
    windowMode = Object.hasOwn(WINDOW_LIMITS, windowSelect.value) ? windowSelect.value : 'blend';
    saveWindow(windowMode);
    void refresh();
  });
  liteToggle?.addEventListener('change', () => {
    lite = Boolean(liteToggle.checked);
    saveBool(LITE_KEY, lite);
    schedule();
  });
  demoToggle?.addEventListener('change', () => {
    demo = Boolean(demoToggle.checked);
    saveBool(DEMO_KEY, demo);
    void refresh();
  });
  retry?.addEventListener('click', () => void refresh());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (timer) clearTimeout(timer);
      timer = null;
    } else {
      void refresh();
    }
  });
  window.addEventListener('resize', () => renderCanvas(null, document.documentElement.dataset.liquidityState || 'loading'));

  void refresh();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
