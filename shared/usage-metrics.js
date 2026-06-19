import { hashPair, validateUsagePayload } from '/shared/usage-metrics-policy.js';

const endpoint = '/api/usage-event';
const recent = new Map();
const featurePaths = {
  '/': 'home', '/apps/': 'apps', '/apps/sell-impact/': 'sell-impact',
  '/apps/liquidity-pulse/': 'liquidity-pulse', '/apps/flow-alert/': 'flow-alert',
  '/apps/exit-coverage-map/': 'exit-coverage-map', '/apps/exposure-graph/': 'exposure-graph',
  '/apps/token-heatmap/': 'token-heatmap', '/apps/pair-brief/': 'pair-brief', '/donate/': 'donate',
};
const linkEvents = {
  '/apps/liquidity-pulse/': 'open_liquidity', '/apps/flow-alert/': 'open_flow',
  '/apps/exit-coverage-map/': 'open_exit_coverage', '/apps/exposure-graph/': 'open_exposure',
  '/donate/': 'support_clicked',
};

function pathKey(pathname = location.pathname) {
  return pathname === '/' ? '/' : `${pathname.replace(/\/+$/, '')}/`;
}

export function currentFeature() {
  return featurePaths[pathKey()] || '';
}

export function isSynthetic() {
  return window.__XSIC_SYNTHETIC__ === true
    || navigator.webdriver
    || new URLSearchParams(location.search).get('xsic_synthetic') === '1';
}

export async function emit(eventName, options = {}) {
  const featureName = options.featureName || currentFeature();
  const pairKeyHash = options.pairKeyHash
    || (options.currency && options.issuer ? await hashPair(options.currency, options.issuer) : '');
  const payload = {
    eventName, featureName, pairKeyHash,
    outcome: options.outcome || 'neutral', synthetic: isSynthetic(),
  };
  const checked = validateUsagePayload(payload);
  if (!checked.ok) return { ok: false, reason: checked.error };
  const key = `${eventName}:${featureName}:${pairKeyHash}:${payload.outcome}`;
  const now = Date.now();
  if (now - (recent.get(key) || 0) < 1500) return { ok: true, reason: 'deduped' };
  recent.set(key, now);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(payload.synthetic ? { 'x-xsic-synthetic': '1' } : {}) },
      body: JSON.stringify(payload), keepalive: true, credentials: 'same-origin',
    });
    return { ok: response.ok };
  } catch {
    return { ok: true, reason: 'metrics_unavailable' };
  }
}

function instrumentLinks() {
  document.addEventListener('click', (event) => {
    const link = event.target?.closest?.('a[href]');
    if (!link) return;
    try {
      const target = new URL(link.href, location.origin);
      if (target.origin !== location.origin) return;
      const eventName = link.dataset.usageEvent || linkEvents[pathKey(target.pathname)];
      if (eventName) void emit(eventName);
    } catch {}
  }, { capture: true });
}

function init() {
  const feature = currentFeature();
  if (!feature) return;
  void emit(feature === 'pair-brief' ? 'pair_brief_opened' : 'page_view');
  instrumentLinks();
  if (feature === 'sell-impact') void import('/shared/usage-sell-impact.js');
}

window.XSICUsage = Object.freeze({ emit, currentFeature, isSynthetic });
init();
