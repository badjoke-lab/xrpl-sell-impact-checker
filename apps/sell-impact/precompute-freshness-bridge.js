const PRECOMPUTE_API = '/api/precompute-pair';
const DEBOUNCE_MS = 240;

function byResult(name) {
  return document.querySelector(`[data-result="${name}"]`);
}

function setText(target, value) {
  if (target) target.textContent = value ?? '';
}

function formatAgeLabel(ageMs) {
  const age = Number(ageMs);
  if (!Number.isFinite(age) || age < 0) return 'unknown age';
  const minutes = Math.round(age / 60000);
  if (minutes < 60) return `${minutes}m old`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h old` : `${hours}h ${rem}m old`;
}

function buildPairKey(rawCurrency, issuer) {
  const currency = String(rawCurrency || '').trim().toUpperCase();
  const normalizedIssuer = String(issuer || '').trim();
  if (!currency || !normalizedIssuer) return '';
  return `${currency}|${normalizedIssuer}`;
}

function buildFreshnessText(freshness) {
  if (!freshness || freshness.state === 'fresh') return null;
  if (freshness.state === 'aging') {
    return `Aging precompute snapshot (${formatAgeLabel(freshness.ageMs)}). Run Estimate for the latest route and output.`;
  }
  if (freshness.state === 'stale') {
    return `Stale precompute snapshot (${formatAgeLabel(freshness.ageMs)}). Treat this as route context only until Estimate runs.`;
  }
  return 'No recent precompute snapshot is available. Run Estimate for live values.';
}

function applyFreshness(freshness) {
  const message = buildFreshnessText(freshness);
  if (!message) return;
  setText(byResult('warning'), message);
  setText(byResult('used-venue-note'), message);
  setText(byResult('route-confidence-summary'), message);
  setText(byResult('data-fetched'), `precompute ${freshness.state} · ${formatAgeLabel(freshness.ageMs)}`);
}

function createHydrator() {
  const currencyInput = document.getElementById('currency-input');
  const issuerInput = document.getElementById('issuer-input');
  const amountInput = document.getElementById('sell-amount-input');
  const estimateButton = document.querySelector('.primary-button');
  if (!currencyInput || !issuerInput || !estimateButton) return null;

  let timer = null;
  let seq = 0;

  async function run() {
    const rawCurrency = currencyInput.dataset.currencyRaw || currencyInput.value || '';
    const issuer = issuerInput.value || '';
    const pairKey = buildPairKey(rawCurrency, issuer);
    if (!pairKey) return;
    if (estimateButton.disabled) return;
    const requestSeq = ++seq;
    try {
      const url = `${PRECOMPUTE_API}?currency=${encodeURIComponent(rawCurrency)}&issuer=${encodeURIComponent(issuer)}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (requestSeq !== seq) return;
      if (!data?.ok) return;
      applyFreshness(data.freshness || data.row?.freshness || null);
    } catch {
      // ignore freshness warning failures
    }
  }

  function schedule(immediate = false) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (immediate) {
      void run();
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, DEBOUNCE_MS);
  }

  return { schedule, amountInput };
}

function mount() {
  const hydrator = createHydrator();
  if (!hydrator) return;
  const currencyInput = document.getElementById('currency-input');
  const issuerInput = document.getElementById('issuer-input');
  const amountInput = hydrator.amountInput;
  currencyInput?.addEventListener('input', () => hydrator.schedule(false));
  issuerInput?.addEventListener('input', () => hydrator.schedule(false));
  amountInput?.addEventListener('input', () => hydrator.schedule(false));
  currencyInput?.addEventListener('blur', () => hydrator.schedule(true));
  issuerInput?.addEventListener('blur', () => hydrator.schedule(true));
  amountInput?.addEventListener('blur', () => hydrator.schedule(true));
  window.addEventListener('pageshow', () => hydrator.schedule(true));
  hydrator.schedule(true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
