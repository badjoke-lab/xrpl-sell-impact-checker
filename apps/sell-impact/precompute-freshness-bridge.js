function allResults(name) {
  return [...document.querySelectorAll(`[data-result="${name}"]`)];
}

function setText(name, value) {
  allResults(name).forEach((target) => {
    target.textContent = value ?? '';
  });
}

function formatAgeLabel(ageMs) {
  const age = Number(ageMs);
  if (!Number.isFinite(age) || age < 0) return 'unknown age';
  const minutes = Math.round(age / 60_000);
  if (minutes < 60) return `${minutes}m old`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h old` : `${hours}h ${remainder}m old`;
}

function freshnessMessage(freshness) {
  const state = freshness?.state || freshness?.status || 'missing';
  if (state === 'fresh') return null;
  if (state === 'aging') {
    return `Aging precompute snapshot (${formatAgeLabel(freshness.ageMs)}). Run Estimate for current route and output.`;
  }
  if (state === 'stale') {
    return `Stale precompute snapshot (${formatAgeLabel(freshness.ageMs)}). Treat it as context only until Estimate runs.`;
  }
  if (state === 'partial') {
    return 'Partial precompute snapshot. Some route context is unavailable; run Estimate for current execution values.';
  }
  if (state === 'degraded') {
    return 'Precompute refresh is degraded. The latest preview may be incomplete; run Estimate for live values.';
  }
  return 'No recent precompute snapshot is available. Run Estimate for live values.';
}

function applyFreshness(freshness) {
  const endpoint = String(document.querySelector('[data-result="endpoint"]')?.textContent || '');
  if (!/precompute/i.test(endpoint)) return;

  const state = freshness?.state || freshness?.status || 'missing';
  document.documentElement.dataset.precomputeFreshness = state;
  const message = freshnessMessage(freshness);
  if (!message) return;

  setText('warning', message);
  setText('used-venue-note', message);
  setText('route-confidence-summary', message);
  setText('data-fetched', `precompute ${state} · ${formatAgeLabel(freshness?.ageMs)}`);
}

window.addEventListener('xsic:precompute-applied', (event) => {
  applyFreshness(event.detail?.freshness || null);
});
