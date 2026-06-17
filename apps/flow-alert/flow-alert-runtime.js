const FLOW_REFRESH_MS = 60_000;
const FLOW_LITE_REFRESH_MS = 120_000;
const FLOW_TIMEOUT_MS = 7_000;
const LITE_KEY = 'xsic.flowAlert.liteMode';
const DEMO_KEY = 'xsic.flowAlert.demoOnly.v2';
const PRESET_KEY = 'xsic.flowAlert.targetPreset';
const WINDOW_KEY = 'xsic.flowAlert.window';

function q(selector) { return document.querySelector(selector); }
function qa(selector) { return [...document.querySelectorAll(selector)]; }
function setText(node, value) { if (node) node.textContent = value ?? ''; }
function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function readValue(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function writeValue(key, value) { try { localStorage.setItem(key, value); } catch {} }
function readBool(key) { return readValue(key, '0') === '1'; }
function writeBool(key, value) { writeValue(key, value ? '1' : '0'); }
function formatXrp(value) { const number = finite(value); return number === null ? '—' : `${Math.round(number).toLocaleString()} XRP`; }
function formatTime(value) { const parsed = Number(value) || Date.parse(value || ''); return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toLocaleString() : '—'; }
function ageMs(value) { const parsed = Number(value) || Date.parse(value || ''); return Number.isFinite(parsed) && parsed > 0 ? Math.max(0, Date.now() - parsed) : null; }
function formatAge(value) { const age = finite(value); if (age === null) return 'unknown age'; const minutes = Math.round(age / 60000); return minutes < 60 ? `${minutes}m old` : `${Math.floor(minutes / 60)}h ${minutes % 60}m old`; }

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FLOW_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' }, signal: controller.signal });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) throw new Error('non_json_response');
    const payload = await response.json();
    if (!response.ok || payload?.error) throw new Error(payload?.error || `http_${response.status}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function freshnessFor(payload, history) {
  const observedAt = payload?.observedAt || payload?.ts || history?.latest?.ts || history?.historyMeta?.newestTs || null;
  const raw = payload?.freshness || history?.freshness || history?.historyMeta?.freshness || null;
  const age = finite(raw?.ageMs) ?? ageMs(observedAt);
  const state = raw?.state || raw?.status || (payload?.stale ? 'stale' : age === null ? 'missing' : age >= 45 * 60_000 ? 'stale' : age >= 20 * 60_000 ? 'aging' : 'fresh');
  return { state, ageMs: age, observedAt };
}

function fixedDemo(windowKey) {
  const ts = Date.now();
  const flow = {
    ok: true,
    ts,
    source: 'fixed-demo',
    sourceMode: 'demo',
    window: windowKey,
    stale: false,
    summary: { inflowXrp: 880000, outflowXrp: 610000, netXrp: 270000 },
    events: [
      { time: new Date(ts - 60000).toISOString(), dir: 'IN', label: 'Demo Exchange A', amountXrp: 420000, reason: 'Fixed demo inflow example.' },
      { time: new Date(ts - 180000).toISOString(), dir: 'OUT', label: 'Demo Exchange B', amountXrp: 310000, reason: 'Fixed demo outflow example.' },
    ],
    debug: { ledgersScanned: 12, paymentsCount: 2, lastValidatedLedger: 'demo' },
  };
  const history = {
    ok: true,
    source: 'fixed-demo',
    latest: { ts, summary: flow.summary },
    previous: { ts: ts - 3600000, summary: { netXrp: 140000 } },
    recent: [
      { ts: ts - 7200000, summary: { netXrp: -90000 }, events: [] },
      { ts: ts - 3600000, summary: { netXrp: 140000 }, events: [] },
      { ts, summary: flow.summary, events: flow.events },
    ],
    deltaSummary: { netXrpDelta: 130000 },
    historyMeta: { count: 3, newestTs: new Date(ts).toISOString(), freshness: { state: 'fresh', ageMs: 0 } },
  };
  const escrow = { ok: true, ts, source: 'fixed-demo', stale: false, next: null, recent: [], stats: { sumXrp: 0, count: 0, avgXrp: 0, maxXrp: 0 }, pattern: [] };
  return { flow, history, escrow };
}

function historyFallback(history, windowKey) {
  const latest = history?.latest;
  if (!latest) return null;
  return {
    ok: true,
    ts: latest.ts || history?.historyMeta?.newestTs || Date.now(),
    source: history?.source || 'history-fallback',
    sourceMode: 'history-fallback',
    stale: true,
    window: windowKey,
    summary: latest.summary || { inflowXrp: latest.inflowXrp || 0, outflowXrp: latest.outflowXrp || 0, netXrp: latest.netXrp || 0 },
    events: Array.isArray(latest.events) ? latest.events : [],
    debug: latest.debug || {},
  };
}

function resolveMode(flow, history, liveFailed, demo) {
  if (demo) return 'demo';
  if (!flow) return 'missing';
  const freshness = freshnessFor(flow, history);
  if (liveFailed) return 'degraded';
  if (!flow.ok && !flow.stale) return 'error';
  if (flow.stale || freshness.state === 'stale') return 'stale';
  if (!flow.summary) return 'partial';
  if (freshness.state === 'aging') return 'aging';
  return 'fresh';
}

function setState(mode, freshness, sourceMode) {
  const copy = {
    loading: ['LOADING', 'Loading flow sources…'], fresh: ['FRESH', 'Live flow and materialized history are current.'], aging: ['AGING', 'Flow data is aging; refresh is in progress.'], stale: ['STALE', 'Latest known flow is retained as delayed context.'], partial: ['PARTIAL', 'Only part of the requested flow context is available.'], degraded: ['DEGRADED', 'Live flow failed; materialized history fallback is shown.'], missing: ['MISSING', 'No usable live or materialized flow record is available.'], error: ['ERROR', 'Flow sources failed.'], demo: ['DEMO', 'Fixed sample flow is shown intentionally.'],
  }[mode] || ['UNKNOWN', 'Unknown flow state.'];
  setText(q('[data-flow-meta="status"]'), copy[0]);
  setText(q('[data-flow-meta="refresh"]'), freshness?.observedAt ? `${sourceMode} · ${formatAge(freshness.ageMs)}` : sourceMode);
  setText(q('[data-flow-signal="status-pill"]'), copy[0]);
  const note = q('#flowStaleNote');
  if (note) { note.hidden = ['fresh', 'demo'].includes(mode); setText(note, copy[1]); }
  document.documentElement.dataset.flowState = mode;
  qa('[data-flow-state]').forEach((node) => {
    const state = node.dataset.flowState;
    node.hidden = !((mode === 'loading' && state === 'loading') || (['error', 'degraded'].includes(mode) && state === 'error') || (mode === 'missing' && state === 'empty'));
  });
}

function replaceList(node, items, emptyText) {
  if (!node) return;
  node.replaceChildren();
  if (!items.length) { const li = document.createElement('li'); li.textContent = emptyText; node.appendChild(li); return; }
  items.forEach((item) => { const li = document.createElement('li'); li.textContent = item; node.appendChild(li); });
}

function renderCanvas(flow, mode) {
  const canvas = q('#flowCanvas');
  if (!canvas) return;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, canvas.clientWidth || 720);
  const height = Math.max(180, canvas.clientHeight || 280);
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d'); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
  const events = Array.isArray(flow?.events) ? flow.events.slice(0, 16) : [];
  const max = Math.max(1, ...events.map((event) => Math.abs(finite(event.amountXrp) || 0)));
  events.forEach((event, index) => {
    const amount = Math.abs(finite(event.amountXrp) || 0);
    const barWidth = width / Math.max(1, events.length) - 4;
    const barHeight = Math.max(2, amount / max * (height - 50));
    context.fillStyle = event.dir === 'OUT' ? 'rgba(126, 34, 206, 0.75)' : 'rgba(37, 99, 235, 0.75)';
    context.fillRect(index * (barWidth + 4), height - barHeight - 24, barWidth, barHeight);
  });
  context.fillStyle = 'rgba(30, 41, 59, 0.9)'; context.font = '13px system-ui'; context.fillText(`Flow Alert · ${mode}`, 12, 18);
}

function render(flow, history, escrow, liveFailed, demo) {
  const freshness = freshnessFor(flow, history);
  const sourceMode = flow?.sourceMode || (demo ? 'demo' : liveFailed ? 'history-fallback' : 'live');
  const mode = resolveMode(flow, history, liveFailed, demo);
  const summary = flow?.summary || {};
  const net = finite(summary.netXrp);
  const events = Array.isArray(flow?.events) ? flow.events : [];
  const historyRows = Array.isArray(history?.recent) ? history.recent : [];
  const historyCount = finite(history?.historyMeta?.count) ?? historyRows.length;
  const delta = finite(history?.deltaSummary?.netXrpDelta);

  setState(mode, freshness, sourceMode);
  setText(q('[data-flow-signal="severity"]'), net === null ? 'Unavailable' : Math.abs(net) >= 1_000_000 ? 'High' : Math.abs(net) >= 250_000 ? 'Medium' : 'Low');
  setText(q('[data-flow-signal="impact"]'), net === null ? 'No current net-flow estimate.' : net > 0 ? 'Observed exchange inflow pressure.' : net < 0 ? 'Observed exchange outflow pressure.' : 'Observed flow is balanced.');
  setText(q('[data-flow-signal="why"]'), mode === 'degraded' ? 'Live source failed; the latest materialized history row is shown.' : flow?.summaryReason || 'Derived from labelled XRPL flow observations.');
  setText(q('[data-flow-signal="observed"]'), freshness.observedAt ? formatTime(freshness.observedAt) : '—');
  setText(q('[data-flow-signal="context"]'), `${sourceMode} · ${freshness.state} · ${formatAge(freshness.ageMs)}`);
  setText(q('[data-flow-signal="ctx-preset"]'), q('#flow-target-preset')?.value || 'exchanges');
  setText(q('[data-flow-signal="ctx-window"]'), q('#flow-window')?.value || '1h');
  setText(q('[data-flow-signal="ctx-source"]'), flow?.source || sourceMode);

  setText(q('[data-flow-snapshot="inflow"]'), formatXrp(summary.inflowXrp));
  setText(q('[data-flow-snapshot="outflow"]'), formatXrp(summary.outflowXrp));
  setText(q('[data-flow-snapshot="net"]'), formatXrp(summary.netXrp));
  setText(q('[data-flow-snapshot="payments"]'), finite(flow?.debug?.paymentsCount) ?? events.length);
  setText(q('[data-flow-snapshot="ledgers"]'), finite(flow?.debug?.ledgersScanned) ?? '—');
  setText(q('[data-flow-snapshot="matched"]'), events.length);
  setText(q('[data-flow-snapshot="source"]'), `${flow?.source || sourceMode} · ${sourceMode}`);
  setText(q('[data-flow-snapshot="updated"]'), freshness.observedAt ? formatTime(freshness.observedAt) : '—');
  setText(q('[data-flow-snapshot-sub="net"]'), delta === null ? 'No comparable history delta.' : `History delta ${formatXrp(delta)}`);
  setText(q('[data-flow-snapshot-sub="matched"]'), `${events.length} current events`);
  setText(q('[data-flow-snapshot-sub="updated"]'), `${freshness.state} · ${formatAge(freshness.ageMs)}`);

  setText(q('#flowReasonTitle'), mode === 'fresh' ? 'Current flow signal' : 'Flow context requires caution');
  setText(q('#flowReasonCopy'), `${sourceMode} provides the displayed snapshot; history contains ${historyCount} bounded rows.`);
  replaceList(q('#flowReasonList'), [
    `Current source: ${flow?.source || sourceMode}.`,
    `Freshness: ${freshness.state} (${formatAge(freshness.ageMs)}).`,
    liveFailed ? 'Live request failed; retained history is not presented as a live observation.' : 'Live request completed for this refresh.',
  ], 'No reason details available.');

  replaceList(q('#flowRecentFlows'), events.slice(0, 12).map((event) => `${event.dir || 'FLOW'} · ${event.label || 'Unknown'} · ${formatXrp(event.amountXrp)} · ${formatTime(event.time)}`), 'No labelled flow events in this window.');
  const empty = q('#flowEventsEmptyState'); if (empty) empty.hidden = events.length > 0;

  setText(q('#flowEscrowNext'), escrow?.next ? formatTime(escrow.next.time || escrow.next.finishAfter) : 'No next escrow event observed.');
  setText(q('#flowEscrowRecent'), Array.isArray(escrow?.recent) && escrow.recent.length ? `${escrow.recent.length} recent escrow records` : 'No recent escrow records.');
  setText(q('#flowEscrowPattern'), Array.isArray(escrow?.pattern) && escrow.pattern.length ? escrow.pattern.map((item) => item.label || item.note).join(' · ') : 'No escrow pattern available.');
  setText(q('#flowEscrowStats'), `${finite(escrow?.stats?.count) ?? 0} records · ${formatXrp(escrow?.stats?.sumXrp || 0)}`);

  setText(q('#flowHistoryLatestTs'), history?.latest?.ts ? formatTime(history.latest.ts) : '—');
  setText(q('#flowHistoryNetDelta'), delta === null ? 'Unavailable' : formatXrp(delta));
  setText(q('#flowHistoryRecentCount'), historyCount);
  const latestEvent = historyRows.flatMap((row) => Array.isArray(row.events) ? row.events : []).at(-1);
  setText(q('#flowHistoryLastEvent'), latestEvent ? `${latestEvent.label || 'Unknown'} · ${formatXrp(latestEvent.amountXrp)}` : 'No materialized event.');
  setText(q('[data-flow-history="net-compare"]'), delta === null ? 'No comparable net-flow pair.' : `Latest vs previous: ${formatXrp(delta)}`);
  setText(q('[data-flow-history="matched-compare"]'), `${historyCount} bounded history rows`);
  setText(q('[data-flow-history="status"]'), `${history?.source || 'none'} · ${history?.historyMeta?.freshness?.state || freshness.state}`);

  renderCanvas(flow, mode);
  window.dispatchEvent(new CustomEvent('xsic:flow-rendered', { detail: { mode, sourceMode, freshness, historyCount } }));
}

function boot() {
  const liteToggle = q('#flow-lite-toggle');
  const demoToggle = q('#flow-demo-toggle');
  const presetSelect = q('#flow-target-preset');
  const windowSelect = q('#flow-window');
  const refreshButton = q('#flow-refresh-button');
  const retryButton = q('#flow-retry-button');
  let lite = readBool(LITE_KEY);
  let demo = readBool(DEMO_KEY);
  let preset = readValue(PRESET_KEY, 'exchanges');
  let windowKey = readValue(WINDOW_KEY, '1h');
  let generation = 0;
  let timer = null;

  if (liteToggle) liteToggle.checked = lite;
  if (demoToggle) demoToggle.checked = demo;
  if (presetSelect) presetSelect.value = preset;
  if (windowSelect) windowSelect.value = windowKey;

  async function refresh() {
    const currentGeneration = ++generation;
    setState('loading', null, 'loading');
    if (demo) {
      const fixture = fixedDemo(windowKey);
      render(fixture.flow, fixture.history, fixture.escrow, false, true);
      schedule();
      return;
    }

    const flowUrl = `/api/xrpl/whale-flow?preset=${encodeURIComponent(preset)}&window=${encodeURIComponent(windowKey)}`;
    const historyUrl = `/api/xrpl/flow-history?preset=${encodeURIComponent(preset)}&window=${encodeURIComponent(windowKey)}&limit=24`;
    const escrowUrl = `/api/xrpl/escrow-watch?window=${encodeURIComponent(windowKey)}&limit=${lite ? 5 : 10}`;
    const [flowResult, historyResult, escrowResult] = await Promise.allSettled([fetchJson(flowUrl), fetchJson(historyUrl), fetchJson(escrowUrl)]);
    if (currentGeneration !== generation) return;
    const history = historyResult.status === 'fulfilled' ? historyResult.value : { ok: false, source: 'unavailable', recent: [], historyMeta: { count: 0, freshness: { state: 'missing' } } };
    let liveFailed = flowResult.status !== 'fulfilled';
    let flow = liveFailed ? historyFallback(history, windowKey) : flowResult.value;
    if (!flow && history?.latest) { flow = historyFallback(history, windowKey); liveFailed = true; }
    const escrow = escrowResult.status === 'fulfilled' ? escrowResult.value : { ok: false, source: 'unavailable', stale: true, recent: [], stats: { count: 0, sumXrp: 0 }, pattern: [] };
    render(flow, history, escrow, liveFailed, false);
    schedule();
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    if (document.hidden) return;
    timer = setTimeout(refresh, lite ? FLOW_LITE_REFRESH_MS : FLOW_REFRESH_MS);
  }

  liteToggle?.addEventListener('change', () => { lite = Boolean(liteToggle.checked); writeBool(LITE_KEY, lite); schedule(); });
  demoToggle?.addEventListener('change', () => { demo = Boolean(demoToggle.checked); writeBool(DEMO_KEY, demo); void refresh(); });
  presetSelect?.addEventListener('change', () => { preset = presetSelect.value || 'exchanges'; writeValue(PRESET_KEY, preset); void refresh(); });
  windowSelect?.addEventListener('change', () => { windowKey = windowSelect.value || '1h'; writeValue(WINDOW_KEY, windowKey); void refresh(); });
  refreshButton?.addEventListener('click', () => void refresh());
  retryButton?.addEventListener('click', () => void refresh());
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (timer) clearTimeout(timer); timer = null; } else { void refresh(); } });
  window.addEventListener('resize', () => renderCanvas(null, document.documentElement.dataset.flowState || 'loading'));
  void refresh();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
