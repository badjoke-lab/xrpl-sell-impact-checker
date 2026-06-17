const PRECOMPUTE_API = '/api/precompute-pair';
const DEBOUNCE_MS = 240;

function allResults(name) {
  return [...document.querySelectorAll(`[data-result="${name}"]`)];
}

function firstResult(name) {
  return allResults(name)[0] || null;
}

function setText(name, value) {
  allResults(name).forEach((target) => {
    target.textContent = value ?? '';
  });
}

function setList(name, items) {
  const target = firstResult(name);
  if (!target) return;
  target.replaceChildren();
  const values = Array.isArray(items) && items.length ? items : ['Unavailable in this snapshot.'];
  values.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    target.appendChild(li);
  });
}

function setBar(name, value) {
  const width = Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));
  allResults(name).forEach((target) => target.style.setProperty('--w', `${width}%`));
}

function setWidth(name, value) {
  const width = Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));
  allResults(name).forEach((target) => {
    target.style.width = `${width}%`;
  });
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(number);
}

function formatPercent(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(number)}%`;
}

function normalizeAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function decodeCurrency(code) {
  const value = String(code || '').trim();
  if (!/^[0-9A-Fa-f]{40}$/.test(value)) return value.toUpperCase();
  const bytes = value.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) || [];
  return bytes
    .filter((byte) => byte >= 0x20 && byte <= 0x7e)
    .map((byte) => String.fromCharCode(byte))
    .join('')
    .trim()
    .toUpperCase() || value.toUpperCase();
}

function currentInput() {
  const currencyInput = document.getElementById('currency-input');
  const issuerInput = document.getElementById('issuer-input');
  const amountInput = document.getElementById('sell-amount-input');
  return {
    currency: decodeCurrency(currencyInput?.dataset.currencyRaw || currencyInput?.value || ''),
    issuer: String(issuerInput?.value || '').trim(),
    amount: normalizeAmount(amountInput?.value),
  };
}

function pairKey(input) {
  if (!input.currency || !input.issuer) return '';
  return `${input.currency}|${input.issuer}`;
}

function fullInputKey(input) {
  return `${pairKey(input)}|${input.amount ?? ''}`;
}

function summaryPairKey(summary, row) {
  if (row?.pairKey) {
    const [currency, issuer] = String(row.pairKey).split('|');
    return currency && issuer ? `${decodeCurrency(currency)}|${issuer}` : '';
  }
  const currency = decodeCurrency(summary?.currency || '');
  const issuer = String(summary?.issuer || '').trim();
  return currency && issuer ? `${currency}|${issuer}` : '';
}

function routeLabel(route) {
  if (route === 'book') return 'Orderbook';
  if (route === 'amm') return 'AMM';
  if (route === 'none') return 'No executable route';
  return 'Unavailable';
}

function routeRecord(summary, route) {
  if (route === 'book') return summary?.book || null;
  if (route === 'amm') return summary?.amm || null;
  return null;
}

function seedState(summary, input) {
  const seededAmount = normalizeAmount(summary?.sellAmount);
  const requestedAmount = input.amount;
  if (!seededAmount || !requestedAmount) return { seededAmount, requestedAmount, matches: true };
  const relativeDifference = Math.abs(requestedAmount - seededAmount) / Math.max(requestedAmount, seededAmount);
  return { seededAmount, requestedAmount, matches: relativeDifference <= 0.001 };
}

function isPlaceholder(value) {
  const text = String(value || '').trim();
  return !text || text === '—' || /unavailable|waiting/i.test(text);
}

function isPrecomputeOwned() {
  return /precompute/i.test(firstResult('endpoint')?.textContent || '');
}

let lastLiveInputKey = '';

function canApplyPrecompute(input, expectedPairLabel) {
  const endpoint = String(firstResult('endpoint')?.textContent || '').trim();
  const currentPairLabel = String(firstResult('pair-label')?.textContent || '').trim();
  const currentKey = fullInputKey(input);
  if (isPrecomputeOwned()) return true;
  if (isPlaceholder(endpoint)) return true;
  if (currentPairLabel && currentPairLabel !== expectedPairLabel) return true;
  return currentKey !== lastLiveInputKey;
}

function setCandidate(prefix, config) {
  setText(`${prefix}-title`, config.title);
  setText(`${prefix}-role`, config.role);
  setText(`${prefix}-output`, config.output);
  setText(`${prefix}-impact`, config.impact);
  setText(`${prefix}-bottleneck`, config.bottleneck);
  setText(`${prefix}-reason`, config.reason);
  setText(`${prefix}-confidence`, config.confidence || 'Not scored');
  setBar(`${prefix}-confidence-bar`, 0);
  const card = document.querySelector(`[data-route-card="${prefix.slice(-1)}"]`);
  card?.classList.toggle('is-selected', Boolean(config.selected));
  card?.classList.toggle('is-unavailable', Boolean(config.unavailable));
}

function clearDerivedScores() {
  setText('route-confidence-score', 'Not scored');
  setText('route-confidence-summary', 'Precompute does not provide a route-confidence score. Run Estimate for live route reasoning.');
  const confidenceCard = firstResult('route-confidence-card');
  if (confidenceCard) confidenceCard.hidden = false;
  setBar('route-confidence-bar', 0);
  ['book', 'amm', 'bridge', 'depth'].forEach((key) => {
    setText(`risk-${key}`, 'Not scored');
    setBar(`risk-${key}-bar`, 0);
  });
}

function applyNoRoute(summary, input, seed, checkedAt, expectedPairLabel) {
  const seedLabel = seed.seededAmount ? formatNumber(seed.seededAmount, 0) : 'unknown';
  setText('receive', 'Unavailable');
  setText('slippage', '—');
  setText('sellability', 'No route');
  setText('filled-line', `No executable route in precompute row · seed ${seedLabel}`);
  setText('fiat-rate', 'No book or AMM output was returned by the precompute source.');
  setText('max-sell-value', 'No route');
  setText('max-sell-note', 'Run Estimate to confirm the current live no-liquidity state.');
  setText('used-venue-summary', 'Precomputed route state: none');
  setText('used-venue-details', `Seed size ${seedLabel} · offers ${formatNumber(summary.offersCount, 0)}`);
  setText('used-venue-note', `Checked ${checkedAt}. This is route-presence context, not a live execution result.`);
  setText('warning', 'No executable XRP route appears in the current precompute row. Run Estimate to confirm live liquidity.');
  setText('snapshot-headline', `No executable route is materialized for ${expectedPairLabel}.`);
  setText('snapshot-body', 'The current precompute row contains neither a usable orderbook result nor a usable AMM result.');
  setList('snapshot-bullets', [
    'Orderbook route: unavailable',
    'AMM route: unavailable',
    'Live confirmation required before treating this as final.',
  ]);
  setText('path-headline', 'No selected route');
  setText('why', 'No route can be selected from this precompute row because neither book nor AMM output is available.');
  setList('path-bullets', ['No selected route.', 'No alternative route.', 'No fallback route was returned.']);
  ['candidate-a', 'candidate-b', 'candidate-c'].forEach((prefix, index) => setCandidate(prefix, {
    title: `Route ${String.fromCharCode(65 + index)} · Unavailable`,
    role: 'Unavailable',
    output: 'Unavailable',
    impact: 'Unavailable',
    bottleneck: 'No executable route returned.',
    reason: 'The precompute source did not materialize this route.',
    unavailable: true,
  }));
  setText('depth-summary', 'No executable route in the precompute row.');
  setText('depth-touch-label', 'No book route');
  setText('depth-inner-label', 'No book route');
  setText('depth-amm-label', 'No AMM route');
  setText('depth-bridge-label', 'Not evaluated');
  setText('depth-caption', 'Run Estimate to perform current live liquidity checks.');
  clearDerivedScores();
}

function applyRouteSummary(summary, input, seed, checkedAt, expectedPairLabel) {
  const selectedRoute = summary.bestRoute;
  const selected = routeRecord(summary, selectedRoute);
  const alternativeRoute = selectedRoute === 'book' ? 'amm' : 'book';
  const alternative = routeRecord(summary, alternativeRoute);
  const seedLabel = seed.seededAmount ? formatNumber(seed.seededAmount, 0) : 'unknown';
  const inputLabel = seed.requestedAmount ? formatNumber(seed.requestedAmount, 0) : null;
  const selectedName = routeLabel(selectedRoute);
  const selectedReceive = Number(selected?.receiveXrp ?? summary.bestReceiveXrp);
  const selectedImpact = selected?.slippagePct;

  setText('receive', Number.isFinite(selectedReceive)
    ? `${seed.matches ? '' : 'Seed preview '}${formatNumber(selectedReceive, 6)} XRP`
    : 'Unavailable');
  setText('slippage', Number.isFinite(Number(selectedImpact))
    ? `${seed.matches ? '' : 'Seed '}${formatPercent(selectedImpact)}${seed.matches ? '' : ` @ ${seedLabel}`}`
    : '—');
  setText('sellability', seed.matches ? 'Seeded preview' : 'Seed preview');
  setText('filled-line', seed.matches
    ? `Seed row ${seedLabel} / ${seedLabel}`
    : `Input ${inputLabel} differs from seed ${seedLabel}`);
  setText('fiat-rate', seed.matches
    ? 'Precompute snapshot only · live values replace this after Estimate.'
    : 'Run Estimate for live output at the current amount.');
  setText('max-sell-value', seed.matches ? `${selectedName} seeded` : 'Run Estimate');
  setText('max-sell-note', 'Precompute does not establish live maximum sell bounds.');
  setText('slippage-help', `Seed-size ${selectedName.toLowerCase()} impact from the current precompute row.`);
  setText('best-price', summary.book?.bestPrice != null ? formatNumber(summary.book.bestPrice, 8) : '—');
  setText('worst-price', 'Requires live depth');
  setText('order-count', formatNumber(summary.offersCount, 0));
  setText('used-venue-summary', `Precomputed best route: ${selectedName}`);
  setText('used-venue-details', `Seed size ${seedLabel} · offers ${formatNumber(summary.offersCount, 0)}`);
  setText('used-venue-note', seed.matches
    ? `Checked ${checkedAt}. Run Estimate to replace this preview with live route reasoning.`
    : `Checked ${checkedAt}. The row is seeded at ${seedLabel}; current input is ${inputLabel}.`);

  setText('liquidity-split', 'Alternative-route comparison; not an execution split');
  setText('mix-book', selectedRoute === 'book' ? 'Book candidate selected' : 'Book alternative');
  setText('mix-amm', selectedRoute === 'amm' ? 'AMM candidate selected' : 'AMM alternative');
  setText('mix-bridge', 'Bridge not materialized');
  setWidth('mix-book-segment', selectedRoute === 'book' ? 100 : 0);
  setWidth('mix-amm-segment', selectedRoute === 'amm' ? 100 : 0);
  setWidth('mix-bridge-segment', 0);

  setText('depth-summary', 'Precompute confirms route availability but does not provide a live depth curve.');
  setText('depth-touch-label', summary.book?.available ? 'Book available' : 'No book route');
  setText('depth-inner-label', summary.book?.available ? `${formatNumber(summary.offersCount, 0)} offers observed` : 'No book route');
  setText('depth-amm-label', summary.amm?.available ? 'AMM available' : 'No AMM route');
  setText('depth-bridge-label', 'Not evaluated');
  ['depth-touch-bar', 'depth-inner-bar', 'depth-amm-bar', 'depth-bridge-bar'].forEach((name) => setBar(name, 0));
  setText('depth-caption', 'Run Estimate for current depth, tail behavior, and route mix.');

  setText('snapshot-headline', `${selectedName} leads the current seeded comparison for ${expectedPairLabel}.`);
  setText('snapshot-body', seed.matches
    ? `This row was calculated for ${seedLabel} units. It is a preview, not a live quote.`
    : `This row was calculated for ${seedLabel} units, while the current input is ${inputLabel}.`);
  setList('snapshot-bullets', [
    `Selected candidate: ${selectedName}`,
    `Alternative candidate: ${alternative?.available ? routeLabel(alternativeRoute) : 'unavailable'}`,
    'No third fallback route is inferred unless the source explicitly returns one.',
  ]);
  setText('path-headline', `${selectedName} is the selected precompute candidate.`);
  setText('why', `The precompute source returned the highest bounded receive for ${selectedName} at the seed amount. Live execution may differ.`);
  setList('path-bullets', [
    `Orderbook available: ${summary.book?.available ? 'yes' : 'no'}`,
    `AMM available: ${summary.amm?.available ? 'yes' : 'no'}`,
    'Confidence and bottleneck scores are not inferred from route presence alone.',
  ]);

  setCandidate('candidate-a', {
    title: `Route A · ${selectedName}`,
    role: 'Selected preview',
    output: Number.isFinite(selectedReceive) ? `${formatNumber(selectedReceive, 6)} XRP` : 'Unavailable',
    impact: Number.isFinite(Number(selectedImpact)) ? formatPercent(selectedImpact) : 'Unavailable',
    bottleneck: 'Requires live depth analysis.',
    reason: `Selected by the current precompute row at seed ${seedLabel}.`,
    selected: true,
  });

  setCandidate('candidate-b', alternative?.available ? {
    title: `Route B · ${routeLabel(alternativeRoute)}`,
    role: 'Alternative preview',
    output: Number.isFinite(Number(alternative.receiveXrp)) ? `${formatNumber(alternative.receiveXrp, 6)} XRP` : 'Unavailable',
    impact: Number.isFinite(Number(alternative.slippagePct)) ? formatPercent(alternative.slippagePct) : 'Unavailable',
    bottleneck: 'Requires live depth analysis.',
    reason: 'Returned by the source as the non-leading route at the seed amount.',
  } : {
    title: 'Route B · Unavailable',
    role: 'Unavailable',
    output: 'Unavailable',
    impact: 'Unavailable',
    bottleneck: 'Alternative route not returned.',
    reason: 'The precompute source did not materialize an alternative route.',
    unavailable: true,
  });

  const fallback = summary.fallback;
  setCandidate('candidate-c', fallback?.available ? {
    title: 'Route C · Source-provided fallback',
    role: 'Fallback preview',
    output: Number.isFinite(Number(fallback.receiveXrp)) ? `${formatNumber(fallback.receiveXrp, 6)} XRP` : 'Unavailable',
    impact: Number.isFinite(Number(fallback.slippagePct)) ? formatPercent(fallback.slippagePct) : 'Unavailable',
    bottleneck: fallback.bottleneck || 'Source-provided fallback.',
    reason: fallback.reason || 'Fallback explicitly returned by the precompute source.',
  } : {
    title: 'Route C · Not materialized',
    role: 'Unavailable',
    output: 'Unavailable',
    impact: 'Not materialized',
    bottleneck: 'No third route in precompute row.',
    reason: 'No fallback output is inferred or fabricated.',
    unavailable: true,
  });

  clearDerivedScores();
  setText('snapshot-output-note', `Precompute checked ${checkedAt}.`);
  setText('snapshot-impact-note', Number.isFinite(Number(selectedImpact)) ? `Seed-size impact ${formatPercent(selectedImpact)}.` : 'Impact unavailable.');
  setText('snapshot-context-note', 'Selected and alternative routes are compared independently.');
  setList('snapshot-note-current', [`Precompute route: ${selectedName}`, `Offers seen: ${formatNumber(summary.offersCount, 0)}`, `Checked at: ${checkedAt}`]);
  setList('snapshot-note-delta', seed.matches
    ? ['Live estimate has not run for this view.', 'Use Estimate for current route, depth, and execution values.']
    : [`Current input ${inputLabel} differs from seed ${seedLabel}.`, 'Use Estimate for the current amount.']);
}

function applyFreshness(freshness) {
  if (!freshness || freshness.state === 'fresh' || freshness.status === 'fresh') return;
  const state = freshness.state || freshness.status || 'missing';
  const age = Number(freshness.ageMs);
  const ageText = Number.isFinite(age) ? `${Math.round(age / 60000)}m old` : 'unknown age';
  const message = state === 'aging'
    ? `Aging precompute snapshot (${ageText}). Run Estimate for current values.`
    : state === 'stale'
      ? `Stale precompute snapshot (${ageText}). Treat it as context only until Estimate runs.`
      : 'No recent precompute snapshot is available. Run Estimate for live values.';
  setText('warning', message);
  setText('data-fetched', `precompute ${state} · ${ageText}`);
}

function applyResponse(data, requestedInput) {
  const summary = data?.row?.summary;
  if (!data?.ok || !data?.found || !summary) return;
  if (summaryPairKey(summary, data.row) !== pairKey(requestedInput)) return;
  const expectedPairLabel = `${requestedInput.currency} / XRP`;
  if (!canApplyPrecompute(requestedInput, expectedPairLabel)) return;

  const checkedAt = summary.checkedAt
    ? new Date(summary.checkedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '—';
  const seed = seedState(summary, requestedInput);

  setText('endpoint', `precompute snapshot · ${checkedAt}`);
  setText('endpoint-details', `precompute current row · ${expectedPairLabel}`);
  setText('pair-label', expectedPairLabel);
  setText('pair-meta', `precompute seed ${seed.seededAmount ? formatNumber(seed.seededAmount, 0) : 'unknown'} · route ${summary.bestRoute || 'none'}`);
  setText('data-fetched', `precompute checked ${checkedAt}`);
  setText('amm-reserves', summary.amm?.available ? 'AMM route present in precompute row.' : 'No AMM route in precompute row.');
  setText('amm-fee', Number.isFinite(Number(summary.amm?.slippagePct)) ? `seed impact ${formatPercent(summary.amm.slippagePct)}` : '—');

  if (summary.bestRoute === 'none' || (!summary.book?.available && !summary.amm?.available)) {
    applyNoRoute(summary, requestedInput, seed, checkedAt, expectedPairLabel);
  } else {
    applyRouteSummary(summary, requestedInput, seed, checkedAt, expectedPairLabel);
  }
  applyFreshness(data.freshness || data.row?.freshness || null);
  window.dispatchEvent(new CustomEvent('xsic:precompute-applied', { detail: { pairKey: pairKey(requestedInput), seed, freshness: data.freshness || data.row?.freshness || null } }));
}

function mount() {
  const currencyInput = document.getElementById('currency-input');
  const issuerInput = document.getElementById('issuer-input');
  const amountInput = document.getElementById('sell-amount-input');
  const estimateButton = document.querySelector('.primary-button');
  if (!currencyInput || !issuerInput || !amountInput || !estimateButton) return;

  let timer = null;
  let generation = 0;

  const schedule = (immediate = false) => {
    generation += 1;
    const scheduledGeneration = generation;
    if (timer) clearTimeout(timer);
    const run = async () => {
      if (scheduledGeneration !== generation || estimateButton.disabled) return;
      const input = currentInput();
      if (!pairKey(input)) return;
      try {
        const url = `${PRECOMPUTE_API}?currency=${encodeURIComponent(input.currency)}&issuer=${encodeURIComponent(input.issuer)}`;
        const response = await fetch(url, { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (scheduledGeneration !== generation) return;
        const latestInput = currentInput();
        if (pairKey(latestInput) !== pairKey(input) || latestInput.amount !== input.amount) return;
        applyResponse(data, latestInput);
      } catch {
        // Live Estimate remains available when hydration fails.
      }
    };
    if (immediate) void run();
    else timer = setTimeout(run, DEBOUNCE_MS);
  };

  estimateButton.addEventListener('click', () => {
    lastLiveInputKey = fullInputKey(currentInput());
    generation += 1;
    if (timer) clearTimeout(timer);
  }, { capture: true });

  [currencyInput, issuerInput, amountInput].forEach((input) => {
    input.addEventListener('input', () => schedule(false));
    input.addEventListener('blur', () => schedule(true));
  });
  window.addEventListener('pageshow', () => schedule(true));
  schedule(true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
