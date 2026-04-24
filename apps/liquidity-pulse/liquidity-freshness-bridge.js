(() => {
  const HISTORY_API = '/api/xrpl/liquidity-history?pool=xrp-rlusd&limit=1';
  const CURRENT_API = '/api/xrpl/liquidity-current?pool=xrp-rlusd';
  const REFRESH_MS = 60_000;

  function q(selector) {
    return document.querySelector(selector);
  }

  function setText(node, value) {
    if (node) node.textContent = value ?? '';
  }

  function isEmpty(node) {
    const text = String(node?.textContent || '').trim();
    return !text || text === '—' || /waiting|initialization|loading|placeholder/i.test(text);
  }

  function formatUsd(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `$${Math.round(n).toLocaleString()}`;
  }

  function formatPrice(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(6);
  }

  function formatAge(ageMs) {
    const age = Number(ageMs);
    if (!Number.isFinite(age) || age < 0) return 'unknown age';
    const minutes = Math.round(age / 60_000);
    if (minutes < 60) return `${minutes}m old`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m old` : `${hours}h old`;
  }

  function stateLabel(state) {
    if (state === 'fresh') return 'fresh';
    if (state === 'aging') return 'aging';
    if (state === 'stale') return 'stale';
    return 'missing';
  }

  function buildMessage(freshness, source, count) {
    const state = stateLabel(freshness?.state);
    const age = formatAge(freshness?.ageMs);
    if (state === 'fresh') {
      return `History source ${source || 'unknown'} · fresh · ${age} · ${count || 0} samples.`;
    }
    if (state === 'aging') {
      return `History source ${source || 'unknown'} · aging · ${age}. Retry or wait for the next refresh before treating trend bars as current.`;
    }
    if (state === 'stale') {
      return `History source ${source || 'unknown'} · stale · ${age}. Treat trend bars as delayed context until refresh succeeds.`;
    }
    return `History source ${source || 'unknown'} · missing. Waiting for the first materialized Liquidity Pulse snapshot.`;
  }

  function applyCurrent(payload) {
    const latest = payload?.latest;
    if (!payload?.ok || !payload?.found || !latest) return;

    const freshness = payload.freshness || latest.freshness || payload.historyMeta?.freshness || null;
    const source = payload.source || payload.historyMeta?.source || 'runtime-fallback';
    const freshnessState = stateLabel(freshness?.state);
    const helper = `Current layer preload · ${source} · ${freshnessState} · ${formatAge(freshness?.ageMs)}`;

    const pool = q('[data-snapshot="pool"]');
    const price = q('[data-snapshot="price"]');
    const liquidityUsd = q('[data-snapshot="liquidityUsd"]');
    const swaps5m = q('[data-snapshot="swaps5m"]');
    const deviationBps = q('[data-snapshot="deviationBps"]');
    const sourceNode = q('[data-snapshot="source"]');
    const badge = q('[data-snapshot="stateBadge"]');
    const status = q('#lpStatus');
    const helperNode = q('[data-snapshot="stateHelper"]');
    const note = q('[data-snapshot="stateNote"]');

    if (isEmpty(pool)) setText(pool, latest.poolLabel || latest.pool || 'XRP / RLUSD');
    if (isEmpty(price)) setText(price, formatPrice(latest.price));
    if (isEmpty(liquidityUsd)) setText(liquidityUsd, formatUsd(latest.liquidityUsd));
    if (isEmpty(swaps5m)) setText(swaps5m, latest.swaps5m == null ? '—' : String(latest.swaps5m));
    if (isEmpty(deviationBps)) setText(deviationBps, latest.deviationBps == null ? '—' : `${latest.deviationBps} bps`);
    if (isEmpty(sourceNode)) setText(sourceNode, `${source} / ${freshnessState}`);
    if (isEmpty(badge)) setText(badge, freshnessState === 'fresh' ? 'CURRENT' : freshnessState.toUpperCase());
    if (isEmpty(status)) setText(status, `Status: ${helper}`);
    if (isEmpty(helperNode)) setText(helperNode, helper);

    if (note && freshnessState !== 'fresh') {
      note.hidden = false;
      setText(note, helper);
    }
  }

  function applyFreshness(payload) {
    const meta = payload?.historyMeta || {};
    const freshness = meta.freshness || payload?.latest?.freshness || null;
    const source = payload?.source || meta.source || 'runtime-fallback';
    const count = Number(meta.count || 0);
    const state = stateLabel(freshness?.state);
    const message = buildMessage(freshness, source, count);

    const note = q('[data-snapshot="stateNote"]');
    const helper = q('[data-snapshot="stateHelper"]');
    const sourceNode = q('[data-snapshot="source"]');
    const status = q('#lpStatus');
    const trend1 = q('[data-trend-meta="1h"]');
    const trend6 = q('[data-trend-meta="6h"]');
    const trend24 = q('[data-trend-meta="24h"]');

    if (note) {
      note.hidden = state === 'fresh';
      if (state !== 'fresh') setText(note, message);
    }

    setText(helper, message);

    if (sourceNode && sourceNode.textContent.trim() === '—') {
      setText(sourceNode, `${source} / ${state}`);
    }

    if (status && /waiting|initialization|loading/i.test(status.textContent || '')) {
      setText(status, `Status: ${message}`);
    }

    const trendSuffix = `history ${state} · ${count || 0} samples`;
    if (trend1 && /placeholder|warming|collecting|unavailable/i.test(trend1.textContent || '')) setText(trend1, `1h pulse · ${trendSuffix}`);
    if (trend6 && /placeholder|warming|collecting|unavailable/i.test(trend6.textContent || '')) setText(trend6, `6h pulse · ${trendSuffix}`);
    if (trend24 && /placeholder|warming|collecting|unavailable/i.test(trend24.textContent || '')) setText(trend24, `24h pulse · ${trendSuffix}`);
  }

  async function refreshCurrent() {
    try {
      const res = await fetch(CURRENT_API, { cache: 'no-store', headers: { accept: 'application/json' } });
      const payload = await res.json().catch(() => null);
      applyCurrent(payload);
    } catch {
      // ignore current preload failure; core Liquidity Pulse renderer remains responsible for live reads
    }
  }

  async function refresh() {
    await refreshCurrent();
    try {
      const res = await fetch(HISTORY_API, { cache: 'no-store', headers: { accept: 'application/json' } });
      const payload = await res.json().catch(() => null);
      if (!payload?.ok) return;
      applyFreshness(payload);
    } catch {
      // ignore bridge failure; core Liquidity Pulse UI remains responsible for primary rendering
    }
  }

  function mount() {
    void refresh();
    window.setInterval(() => void refresh(), REFRESH_MS);
    window.addEventListener('pageshow', () => void refresh());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
