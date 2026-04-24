(() => {
  const CURRENT_API = '/api/xrpl/liquidity-current?pool=xrp-rlusd';

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
    const n = Number(ageMs);
    if (!Number.isFinite(n) || n < 0) return 'unknown age';
    const minutes = Math.round(n / 60000);
    if (minutes < 60) return `${minutes}m old`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m old` : `${hours}h old`;
  }

  function buildHelper(freshness, source) {
    const state = freshness?.state || 'missing';
    if (state === 'fresh') return `Current layer preload · ${source || 'unknown'} · fresh · ${formatAge(freshness.ageMs)}`;
    if (state === 'aging') return `Current layer preload · ${source || 'unknown'} · aging · ${formatAge(freshness.ageMs)}. Retry for live refresh.`;
    if (state === 'stale') return `Current layer preload · ${source || 'unknown'} · stale · ${formatAge(freshness.ageMs)}. Treat as delayed context.`;
    return `Current layer preload · ${source || 'unknown'} · waiting for first snapshot.`;
  }

  function applyPayload(payload) {
    const latest = payload?.latest;
    if (!payload?.ok || !payload?.found || !latest) return;

    const freshness = payload.freshness || latest.freshness || payload.historyMeta?.freshness || null;
    const source = payload.source || payload.historyMeta?.source || 'runtime-fallback';
    const freshnessState = freshness?.state || 'missing';
    const helper = buildHelper(freshness, source);

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

  async function preload() {
    try {
      const res = await fetch(CURRENT_API, { cache: 'no-store', headers: { accept: 'application/json' } });
      const payload = await res.json().catch(() => null);
      applyPayload(payload);
    } catch {
      // ignore preload failures; core Liquidity Pulse renderer remains responsible for live reads
    }
  }

  function mount() {
    void preload();
    window.addEventListener('pageshow', () => void preload());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
