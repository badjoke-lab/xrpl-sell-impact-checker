(() => {
  const HISTORY_API = '/api/xrpl/liquidity-history?pool=xrp-rlusd&limit=1';
  const REFRESH_MS = 60_000;

  function q(selector) {
    return document.querySelector(selector);
  }

  function setText(node, value) {
    if (node) node.textContent = value ?? '';
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

  async function refresh() {
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
