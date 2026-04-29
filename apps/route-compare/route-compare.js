(() => {
  const API = '/api/route-compare';

  function q(selector) {
    return document.querySelector(selector);
  }

  function setText(node, value) {
    if (node) node.textContent = value ?? '';
  }

  function fmtNumber(value, digits = 4) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    if (Math.abs(num) >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return num.toLocaleString(undefined, { maximumFractionDigits: digits });
  }

  function fmtPct(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${num.toFixed(2)}%`;
  }

  function statusLabel(route) {
    return route?.available ? 'Available' : 'Unavailable';
  }

  function renderRoute(route) {
    const card = document.querySelector(`[data-route-card="${route.id}"]`);
    if (!card) return;
    const badge = card.querySelector('[data-route-field="availability"]');
    if (badge) {
      badge.textContent = statusLabel(route);
      badge.classList.toggle('is-available', Boolean(route.available));
      badge.classList.toggle('is-unavailable', !route.available);
    }
    setText(card.querySelector('[data-route-field="receive"]'), route.available ? fmtNumber(route.receiveXrp, 6) : '—');
    setText(card.querySelector('[data-route-field="slippage"]'), fmtPct(route.slippagePct));
    setText(card.querySelector('[data-route-field="band"]'), route.impactBand || '—');
    setText(card.querySelector('[data-route-field="filled"]'), route.filledAmount != null ? fmtNumber(route.filledAmount, 4) : '—');
    const evidence = card.querySelector('[data-route-field="evidence"]');
    if (evidence) {
      evidence.innerHTML = (route.evidence || ['No evidence returned.']).map((item) => `<li>${item}</li>`).join('');
    }
  }

  function buildUrl() {
    const url = new URL(API, window.location.origin);
    url.searchParams.set('currency', q('#rc-currency')?.value?.trim() || 'USD');
    url.searchParams.set('issuer', q('#rc-issuer')?.value?.trim() || '');
    url.searchParams.set('amount', q('#rc-amount')?.value?.trim() || '1000');
    url.searchParams.set('limit', q('#rc-limit')?.value?.trim() || '60');
    return `${url.pathname}${url.search}`;
  }

  function render(payload) {
    setText(q('#rc-status'), payload.ok ? 'READY' : 'ERROR');
    setText(q('#rc-source-chip'), `source: ${payload.source || 'route compare'}`);
    setText(q('#rc-freshness-chip'), `freshness: ${payload.freshness?.state || 'unknown'}`);
    setText(q('#rc-limits-chip'), payload.limits?.allPairScanning === false ? 'all-pair scanning: off' : 'limits: unknown');
    setText(q('#rc-best-route'), payload.bestRoute || '—');
    setText(q('#rc-best-receive'), payload.bestReceiveXrp != null ? fmtNumber(payload.bestReceiveXrp, 6) : '—');
    setText(q('#rc-unavailable'), (payload.unavailableRoutes || []).join(', ') || 'none');
    setText(q('#rc-best-note'), payload.pairKey || '—');
    setText(q('#rc-advice'), payload.advice?.headline ? `${payload.advice.headline} ${payload.advice.detail || ''}` : 'No advice returned.');
    const link = q('#rc-sell-impact-link');
    if (link) link.href = payload.sellImpactUrl || '/apps/sell-impact/';
    for (const route of payload.routes || []) renderRoute(route);
  }

  async function run() {
    const error = q('#route-error');
    if (error) error.hidden = true;
    setText(q('#rc-status'), 'LOADING');
    try {
      const res = await fetch(buildUrl(), { cache: 'no-store', headers: { accept: 'application/json' } });
      const payload = await res.json().catch(() => null);
      if (!payload) throw new Error('invalid_json');
      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || payload.error || `http_${res.status}`);
      }
      render(payload);
    } catch (err) {
      setText(q('#rc-status'), 'ERROR');
      if (error) {
        error.textContent = `Route Compare failed: ${err instanceof Error ? err.message : 'unknown_error'}`;
        error.hidden = false;
      }
    }
  }

  function mount() {
    q('#rc-run')?.addEventListener('click', () => void run());
    ['#rc-currency', '#rc-issuer', '#rc-amount', '#rc-limit'].forEach((selector) => {
      q(selector)?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') void run();
      });
    });
    void run();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
