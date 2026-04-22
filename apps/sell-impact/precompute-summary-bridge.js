const PRECOMPUTE_API = '/api/precompute-pair';
const DEBOUNCE_MS = 240;

function byResult(name) {
  return document.querySelector(`[data-result="${name}"]`);
}

function setText(target, value) {
  if (target) target.textContent = value ?? '';
}

function setList(target, items) {
  if (!target) return;
  while (target.firstChild) target.removeChild(target.firstChild);
  const safeItems = Array.isArray(items) && items.length ? items : ['Unavailable in this snapshot.'];
  safeItems.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    target.appendChild(li);
  });
}

function setBar(target, pct) {
  if (!target) return;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  target.style.setProperty('--w', `${clamped}%`);
}

function setWidth(target, pct) {
  if (!target) return;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  target.style.width = `${clamped}%`;
}

function formatNumber(value, maximumFractionDigits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(n);
}

function formatPercent(value, maximumFractionDigits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits }).format(n)}%`;
}

function decodeCurrencyHexToAscii(hex) {
  const v = String(hex || '').trim();
  if (!/^[0-9A-Fa-f]{40}$/.test(v)) return v.toUpperCase();
  const bytes = v.match(/.{2}/g)?.map((b) => parseInt(b, 16)) || [];
  let out = '';
  for (const b of bytes) {
    if (b === 0x00) continue;
    if (b >= 0x20 && b <= 0x7e) out += String.fromCharCode(b);
  }
  return out.trim() ? out.trim().toUpperCase() : v.toUpperCase();
}

function formatCurrencyDisplay(code) {
  if (!code) return '';
  return /^[0-9A-Fa-f]{40}$/.test(String(code).trim())
    ? decodeCurrencyHexToAscii(code)
    : String(code).trim().toUpperCase();
}

function isPlaceholderText(text) {
  const value = String(text || '').trim();
  if (!value) return true;
  return value === '—' || value === '…' || /Unavailable/i.test(value) || /waiting/i.test(value);
}

function buildPairKey(rawCurrency, issuer) {
  const currency = String(rawCurrency || '').trim().toUpperCase();
  const normalizedIssuer = String(issuer || '').trim();
  if (!currency || !normalizedIssuer) return '';
  return `${currency}|${normalizedIssuer}`;
}

function normalizeRouteName(route) {
  if (route === 'book') return 'Orderbook';
  if (route === 'amm') return 'AMM';
  if (route === 'none') return 'No executable route';
  return 'Unavailable';
}

function computeConfidence(summary) {
  if (!summary) return 0;
  const bookAvail = Boolean(summary.book?.available);
  const ammAvail = Boolean(summary.amm?.available);
  if (bookAvail && ammAvail) return 82;
  if (bookAvail || ammAvail) return 68;
  return 18;
}

function computeShare(summary) {
  const book = Number(summary?.book?.receiveXrp || 0);
  const amm = Number(summary?.amm?.receiveXrp || 0);
  const total = book + amm;
  if (!Number.isFinite(total) || total <= 0) {
    return { bookPct: 0, ammPct: 0, bridgePct: 0 };
  }
  const bookPct = (book / total) * 100;
  const ammPct = (amm / total) * 100;
  return {
    bookPct,
    ammPct,
    bridgePct: Math.max(0, 100 - bookPct - ammPct),
  };
}

function computeDepth(summary) {
  const offersCount = Number(summary?.offersCount || 0);
  const bookAvailable = Boolean(summary?.book?.available);
  const ammAvailable = Boolean(summary?.amm?.available);
  const touchPct = bookAvailable ? Math.min(92, 48 + offersCount * 3) : 0;
  const innerPct = bookAvailable ? Math.min(86, 34 + offersCount * 2.4) : 0;
  const ammPct = ammAvailable ? 58 : 8;
  const bridgePct = summary?.bestRoute === 'none' ? 74 : 6;
  return { touchPct, innerPct, ammPct, bridgePct };
}

function resolveCurrentPairLabel() {
  return String(byResult('pair-label')?.textContent || '').trim();
}

function isPrecomputeOwnedView() {
  const endpoint = String(byResult('endpoint')?.textContent || '').trim();
  const venue = String(byResult('used-venue-summary')?.textContent || '').trim();
  return /precompute/i.test(endpoint) || /Precomputed/i.test(venue);
}

function shouldApplySummary(summary) {
  const orderCount = byResult('order-count');
  const usedVenue = byResult('used-venue-summary');
  const snapshotHeadline = byResult('snapshot-headline');
  const expectedPairLabel = `${formatCurrencyDisplay(summary?.currency)} / XRP`;
  const currentPairLabel = resolveCurrentPairLabel();
  if (currentPairLabel && expectedPairLabel && currentPairLabel !== expectedPairLabel) {
    return true;
  }
  return isPrecomputeOwnedView() || [orderCount, usedVenue, snapshotHeadline].some((el) => isPlaceholderText(el?.textContent));
}

function applyCandidate(prefix, config) {
  setText(byResult(`${prefix}-title`), config.title);
  setText(byResult(`${prefix}-role`), config.role);
  setText(byResult(`${prefix}-output`), config.output);
  setText(byResult(`${prefix}-impact`), config.impact);
  setText(byResult(`${prefix}-bottleneck`), config.bottleneck);
  setText(byResult(`${prefix}-reason`), config.reason);
  setText(byResult(`${prefix}-confidence`), `confidence ${formatPercent(config.confidence, 0)}`);
  setBar(byResult(`${prefix}-confidence-bar`), config.confidence);
}

function applyHeroCards(summary, routeLabel, checkedAt) {
  const selectedSlippage = summary.bestRoute === 'amm'
    ? summary.amm?.slippagePct ?? null
    : summary.book?.slippagePct ?? null;
  const bestReceive = summary.bestReceiveXrp;
  const receiveText = bestReceive != null ? `${formatNumber(bestReceive, 6)} XRP` : 'Unavailable';
  setText(byResult('receive'), receiveText);
  setText(byResult('slippage'), selectedSlippage != null ? formatPercent(selectedSlippage) : '—');
  setText(byResult('sellability'), summary.bestRoute === 'none' ? 'Unavailable' : 'Seeded');
  setText(byResult('filled-line'), `Seed row ${formatNumber(summary.sellAmount, 0)} / ${formatNumber(summary.sellAmount, 0)}`);
  setText(byResult('fiat-rate'), 'Precompute snapshot only · live fiat estimate pending.');
  setText(byResult('best-price'), summary.book?.bestPrice != null ? formatNumber(summary.book.bestPrice, 8) : '—');
  setText(byResult('worst-price'), summary.bestRoute === 'none' ? '—' : 'Tail worst price needs live depth.');
  setText(byResult('order-count'), formatNumber(summary.offersCount, 0));
  setText(byResult('data-fetched'), `precompute checked ${checkedAt}`);
  setText(byResult('max-sell-value'), summary.bestRoute === 'none' ? 'No route' : `${routeLabel} seeded`);
  setText(byResult('mix-summary'), `seed ${formatNumber(summary.sellAmount, 0)}`);
  setText(byResult('max-sell-note'), `Seeded proxy only. Run Estimate for live max-sell bounds.`);
  setText(byResult('slippage-help'), `Seed-size ${routeLabel.toLowerCase()} impact from current precompute row.`);
}

function applyMixAndDepth(summary, shares, routeLabel) {
  const depth = computeDepth(summary);
  setText(byResult('mix-book'), `Book ${formatPercent(shares.bookPct, 0)}`);
  setText(byResult('mix-amm'), `AMM ${formatPercent(shares.ammPct, 0)}`);
  setText(byResult('mix-bridge'), `Bridge ${formatPercent(shares.bridgePct, 0)}`);
  setWidth(byResult('mix-book-segment'), shares.bookPct);
  setWidth(byResult('mix-amm-segment'), shares.ammPct);
  setWidth(byResult('mix-bridge-segment'), shares.bridgePct);

  setText(byResult('depth-summary'), summary.bestRoute === 'none'
    ? 'Current precompute row does not show an executable XRP exit route.'
    : `${routeLabel} leads in the current precompute row with visible seeded depth.`);
  setText(byResult('depth-touch-label'), summary.book?.available ? 'Book-led' : 'Unavailable');
  setText(byResult('depth-inner-label'), summary.offersCount > 0 ? `${formatNumber(summary.offersCount, 0)} offers` : 'Unavailable');
  setText(byResult('depth-amm-label'), summary.amm?.available ? 'Available' : 'No path');
  setText(byResult('depth-bridge-label'), shares.bridgePct > 0 ? formatPercent(shares.bridgePct, 0) : 'None');
  setBar(byResult('depth-touch-bar'), depth.touchPct);
  setBar(byResult('depth-inner-bar'), depth.innerPct);
  setBar(byResult('depth-amm-bar'), depth.ammPct);
  setBar(byResult('depth-bridge-bar'), depth.bridgePct);
  setText(byResult('depth-caption'), summary.bestRoute === 'none'
    ? 'Run Estimate to see whether live depth appears.'
    : `Seeded snapshot only. Run Estimate for live depth curve and tail behavior.`);
}

function applySummary(summary) {
  if (!summary || !shouldApplySummary(summary)) return;
  const checkedAt = summary.checkedAt ? new Date(summary.checkedAt).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }) : '—';
  const routeLabel = normalizeRouteName(summary.bestRoute);
  const worstRouteLabel = normalizeRouteName(summary.worstRoute);
  const confidence = computeConfidence(summary);
  const pairLabel = `${formatCurrencyDisplay(summary.currency)} / XRP`;
  const shares = computeShare(summary);

  applyHeroCards(summary, routeLabel, checkedAt);
  applyMixAndDepth(summary, shares, routeLabel);
  setText(byResult('used-venue-summary'), `Precomputed best route: ${routeLabel}`);
  setText(byResult('used-venue-details'), `Seed size ${formatNumber(summary.sellAmount, 0)} · offers ${formatNumber(summary.offersCount, 0)}`);
  setText(byResult('used-venue-note'), `Checked ${checkedAt}. Run Estimate to replace this with live route reasoning.`);
  setText(byResult('endpoint'), `precompute snapshot · ${checkedAt}`);
  setText(byResult('endpoint-details'), `precompute current row · ${pairLabel}`);
  setText(byResult('pair-label'), pairLabel);
  setText(byResult('pair-meta'), `precompute seed ${formatNumber(summary.sellAmount, 0)} · route ${summary.bestRoute}`);
  setText(byResult('liquidity-split'), `Book ${formatPercent(shares.bookPct, 0)} / AMM ${formatPercent(shares.ammPct, 0)}`);
  setText(byResult('amm-reserves'), summary.amm?.available ? 'Precomputed AMM path available.' : 'No AMM path in current precompute row.');
  setText(byResult('amm-fee'), summary.amm?.slippagePct != null ? `impact ${formatPercent(summary.amm.slippagePct)}` : '—');

  setText(byResult('snapshot-headline'), `${routeLabel} leads for ${pairLabel} at the seeded size.`);
  setText(byResult('snapshot-body'), `This precompute row was built from ${formatNumber(summary.sellAmount, 0)} units and ${formatNumber(summary.offersCount, 0)} visible book levels. Live estimate can still differ.`);
  setList(byResult('snapshot-bullets'), [
    `Best route: ${routeLabel}`,
    `Worst route: ${worstRouteLabel}`,
    `Best receive: ${summary.bestReceiveXrp != null ? `${formatNumber(summary.bestReceiveXrp, 6)} XRP` : 'unavailable'}`,
  ]);

  const confidenceCard = byResult('route-confidence-card');
  if (confidenceCard) confidenceCard.hidden = false;
  setText(byResult('route-confidence-score'), `${Math.round(confidence)} / 100`);
  setBar(byResult('route-confidence-bar'), confidence);
  setText(byResult('route-confidence-summary'), `Precomputed from D1 current row · checked ${checkedAt} · rerun Estimate for live execution values.`);

  setText(byResult('path-headline'), `${routeLabel} is currently the strongest precomputed path.`);
  setText(byResult('why'), `Precompute favors ${routeLabel} because it currently offers the strongest bounded receive at the seed size. Live execution may shift with fresh depth.`);
  setText(byResult('risk-book'), summary.book?.available ? 'low' : 'high');
  setText(byResult('risk-amm'), summary.amm?.available ? 'watch' : 'low');
  setText(byResult('risk-bridge'), 'low');
  setText(byResult('risk-depth'), summary.offersCount > 0 ? 'contained' : 'high');
  setBar(byResult('risk-book-bar'), summary.book?.available ? 32 : 82);
  setBar(byResult('risk-amm-bar'), summary.amm?.available ? 48 : 10);
  setBar(byResult('risk-bridge-bar'), 8);
  setBar(byResult('risk-depth-bar'), summary.offersCount > 0 ? 28 : 84);
  setList(byResult('path-bullets'), [
    `Book route available: ${summary.book?.available ? 'yes' : 'no'}`,
    `AMM route available: ${summary.amm?.available ? 'yes' : 'no'}`,
    'This is a stable precompute snapshot, not the final live estimate.',
  ]);

  applyCandidate('candidate-a', {
    title: `Route A · ${routeLabel}`,
    role: 'Selected',
    output: summary.bestReceiveXrp != null ? `${formatNumber(summary.bestReceiveXrp, 6)} XRP` : 'Unavailable',
    impact: summary.bestRoute === 'amm' ? formatPercent(summary.amm?.slippagePct) : formatPercent(summary.book?.slippagePct),
    bottleneck: summary.offersCount > 0 ? `Observed offers ${formatNumber(summary.offersCount, 0)}` : 'No visible executable depth.',
    reason: `Current D1 precompute row selects ${routeLabel.toLowerCase()} at the seed size.`,
    confidence,
  });

  const alternativeOutput = summary.bestRoute === 'book'
    ? (summary.amm?.receiveXrp != null ? `${formatNumber(summary.amm.receiveXrp, 6)} XRP` : 'Unavailable')
    : (summary.book?.receiveXrp != null ? `${formatNumber(summary.book.receiveXrp, 6)} XRP` : 'Unavailable');
  const alternativeImpact = summary.bestRoute === 'book'
    ? formatPercent(summary.amm?.slippagePct)
    : formatPercent(summary.book?.slippagePct);
  applyCandidate('candidate-b', {
    title: `Route B · ${summary.bestRoute === 'book' ? 'AMM alternative' : 'Orderbook alternative'}`,
    role: 'Alternative',
    output: alternativeOutput,
    impact: alternativeImpact,
    bottleneck: summary.bestRoute === 'book' ? 'AMM path not leading in current row.' : 'Orderbook path not leading in current row.',
    reason: 'Shown from the current precompute row only.',
    confidence: Math.max(24, confidence - 18),
  });

  const fallbackReceive = summary.bestReceiveXrp != null ? summary.bestReceiveXrp * 0.82 : null;
  applyCandidate('candidate-c', {
    title: 'Route C · Bounded fallback',
    role: 'Fallback',
    output: fallbackReceive != null ? `${formatNumber(fallbackReceive, 6)} XRP` : 'Unavailable',
    impact: summary.bestRoute === 'none' ? 'Unavailable' : 'higher than selected',
    bottleneck: 'Fallback shown for continuity only.',
    reason: 'Precompute fallback is indicative only until live estimate runs.',
    confidence: Math.max(12, confidence - 34),
  });

  setText(byResult('snapshot-output-note'), `Precompute checked ${checkedAt}.`);
  setText(byResult('snapshot-impact-note'), `Seed-size impact ${summary.bestRoute === 'amm' ? formatPercent(summary.amm?.slippagePct) : formatPercent(summary.book?.slippagePct)}.`);
  setText(byResult('snapshot-context-note'), `Book ${formatPercent(shares.bookPct, 0)} / AMM ${formatPercent(shares.ammPct, 0)}.`);
  setList(byResult('snapshot-note-current'), [
    `Precompute route: ${routeLabel}`,
    `Offers seen: ${formatNumber(summary.offersCount, 0)}`,
    `Checked at: ${checkedAt}`,
  ]);
  setList(byResult('snapshot-note-delta'), [
    'Live estimate has not run yet for this pair in the current view.',
    'Use Estimate to refresh route quality with live orderbook and AMM reads.',
  ]);
}

function createHydrator() {
  const currencyInput = document.getElementById('currency-input');
  const issuerInput = document.getElementById('issuer-input');
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
      if (!data?.ok || !data?.found || !data?.row?.summary) return;
      applySummary(data.row.summary);
    } catch {
      // ignore hydration failures
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

  return { schedule };
}

function mount() {
  const hydrator = createHydrator();
  if (!hydrator) return;
  const currencyInput = document.getElementById('currency-input');
  const issuerInput = document.getElementById('issuer-input');
  currencyInput?.addEventListener('input', () => hydrator.schedule(false));
  issuerInput?.addEventListener('input', () => hydrator.schedule(false));
  currencyInput?.addEventListener('blur', () => hydrator.schedule(true));
  issuerInput?.addEventListener('blur', () => hydrator.schedule(true));
  window.addEventListener('pageshow', () => hydrator.schedule(true));
  hydrator.schedule(true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
