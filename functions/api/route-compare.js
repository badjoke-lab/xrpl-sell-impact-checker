const DEFAULT_AMOUNT = 1000;
const DEFAULT_LIMIT = 60;
const MAX_AMOUNT = 1_000_000_000;
const MAX_LIMIT = 120;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

function normalizeCurrency(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const upper = text.toUpperCase();
  if (/^[A-Z0-9]{3,6}$/.test(upper)) return upper;
  if (/^[A-Fa-f0-9]{40}$/.test(text)) return text.toUpperCase();
  return '';
}

function isClassicAddress(value) {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(String(value || '').trim());
}

function parsePositiveNumber(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, parsed);
}

function parseAmount(amount) {
  if (amount === null || amount === undefined) return 0;
  if (typeof amount === 'string') {
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed / 1_000_000 : 0;
  }
  if (typeof amount === 'number') return Number.isFinite(amount) ? amount : 0;
  if (typeof amount === 'object' && typeof amount.value === 'string') {
    const parsed = Number(amount.value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeOffers(offers) {
  return Array.isArray(offers)
    ? offers
        .map((offer) => {
          const gets = offer?.taker_gets_funded ?? offer?.taker_gets ?? null;
          const pays = offer?.taker_pays_funded ?? offer?.taker_pays ?? null;
          const availableTokenAmount = parseAmount(gets);
          const availableXrpAmount = parseAmount(pays);
          const price = availableTokenAmount > 0 ? availableXrpAmount / availableTokenAmount : 0;
          return { availableTokenAmount, availableXrpAmount, price };
        })
        .filter((offer) => offer.availableTokenAmount > 0 && offer.availableXrpAmount > 0 && offer.price > 0)
        .sort((a, b) => b.price - a.price)
    : [];
}

function simulateBook(sellAmount, offers) {
  let filled = 0;
  let receive = 0;
  for (const offer of offers) {
    if (filled >= sellAmount) break;
    const remaining = sellAmount - filled;
    const take = Math.min(remaining, offer.availableTokenAmount);
    if (take <= 0) continue;
    receive += (take / offer.availableTokenAmount) * offer.availableXrpAmount;
    filled += take;
  }
  const avgPrice = filled > 0 ? receive / filled : null;
  const bestPrice = offers[0]?.price ?? null;
  const slippagePct = bestPrice && avgPrice ? Math.max(0, ((bestPrice - avgPrice) / bestPrice) * 100) : null;
  return { filled, receive, avgPrice, bestPrice, slippagePct, available: receive > 0 };
}

function simulateAmm(sellAmount, reserves) {
  if (!reserves) return { available: false, receive: null, avgPrice: null, spotPrice: null, slippagePct: null };
  const tokenReserve = Number(reserves.tokenReserve);
  const xrpReserve = Number(reserves.xrpReserve);
  const feePct = Number(reserves.feePct || 0);
  if (!Number.isFinite(tokenReserve) || !Number.isFinite(xrpReserve) || tokenReserve <= 0 || xrpReserve <= 0) {
    return { available: false, receive: null, avgPrice: null, spotPrice: null, slippagePct: null };
  }
  const spotPrice = xrpReserve / tokenReserve;
  const dxEff = sellAmount * (1 - Math.max(0, Math.min(1, feePct)));
  const k = tokenReserve * xrpReserve;
  const newTokenReserve = tokenReserve + dxEff;
  const newXrpReserve = k / newTokenReserve;
  const receive = Math.max(0, xrpReserve - newXrpReserve);
  const avgPrice = receive > 0 ? receive / sellAmount : null;
  const slippagePct = spotPrice && avgPrice ? Math.max(0, ((spotPrice - avgPrice) / spotPrice) * 100) : null;
  return { available: receive > 0, receive, avgPrice, spotPrice, slippagePct };
}

function band(slippagePct) {
  if (!Number.isFinite(slippagePct)) return 'unavailable';
  if (slippagePct <= 2) return 'tight';
  if (slippagePct <= 5) return 'moderate';
  return 'wide';
}

async function readJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const payload = await res.json().catch(() => ({ ok: false, error: 'invalid_json' }));
  return { httpStatus: res.status, payload };
}

function rankRoutes(routes) {
  return [...routes].sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    const receiveDiff = (b.receiveXrp || 0) - (a.receiveXrp || 0);
    if (Math.abs(receiveDiff) > 0.000001) return receiveDiff;
    return (a.slippagePct ?? 9999) - (b.slippagePct ?? 9999);
  });
}

function buildAdvice(best, routes) {
  if (!best || !best.available) {
    return {
      status: 'no-route',
      headline: 'No executable XRP exit route observed.',
      detail: 'Neither book nor AMM produced a receive estimate for this amount.',
    };
  }
  const available = routes.filter((route) => route.available);
  if (available.length === 1) {
    return {
      status: 'single-route',
      headline: `${best.label} is the only observed route.`,
      detail: 'Treat this as coverage plus rough receive estimate; continue in Sell Impact before execution.',
    };
  }
  const second = available.find((route) => route.id !== best.id);
  const diff = second?.receiveXrp ? ((best.receiveXrp - second.receiveXrp) / second.receiveXrp) * 100 : null;
  return {
    status: 'compare',
    headline: `${best.label} currently returns the most XRP.`,
    detail: Number.isFinite(diff)
      ? `Best route is about ${diff.toFixed(2)}% above the next observed route for this amount.`
      : 'Compare route receive and slippage before execution.',
  };
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const currency = normalizeCurrency(url.searchParams.get('currency'));
  const issuer = String(url.searchParams.get('issuer') || '').trim();
  const amount = parsePositiveNumber(url.searchParams.get('amount') || DEFAULT_AMOUNT, DEFAULT_AMOUNT, MAX_AMOUNT);
  const limit = Math.round(parsePositiveNumber(url.searchParams.get('limit') || DEFAULT_LIMIT, DEFAULT_LIMIT, MAX_LIMIT));
  const checkedAt = new Date().toISOString();

  if (!currency || !isClassicAddress(issuer)) {
    return json({
      ok: false,
      error: 'missing_or_invalid_params',
      message: 'Provide currency and a valid XRPL issuer address.',
      currency,
      issuer,
      amount,
      limit,
      checkedAt,
    }, 400);
  }

  const q = `currency=${encodeURIComponent(currency)}&issuer=${encodeURIComponent(issuer)}`;
  const [bookResult, ammResult] = await Promise.all([
    readJson(`${url.origin}/api/book-offers?${q}&limit=${encodeURIComponent(String(limit))}`),
    readJson(`${url.origin}/api/amm-info?${q}`),
  ]);

  const offers = normalizeOffers(bookResult.payload?.offers || []);
  const book = simulateBook(amount, offers);
  const amm = simulateAmm(amount, ammResult.payload?.ammReserves || null);

  const routes = [
    {
      id: 'book',
      label: 'Order book',
      available: book.available,
      receiveXrp: book.available ? book.receive : null,
      filledAmount: book.filled,
      avgPrice: book.avgPrice,
      bestPrice: book.bestPrice,
      slippagePct: book.slippagePct,
      impactBand: band(book.slippagePct),
      evidence: [`offers_seen: ${offers.length}`, `filled_amount: ${book.filled}`],
    },
    {
      id: 'amm',
      label: 'AMM',
      available: amm.available,
      receiveXrp: amm.available ? amm.receive : null,
      filledAmount: amm.available ? amount : 0,
      avgPrice: amm.avgPrice,
      spotPrice: amm.spotPrice,
      slippagePct: amm.slippagePct,
      impactBand: band(amm.slippagePct),
      evidence: [amm.available ? 'amm_info: present' : 'amm_info: not observed'],
    },
  ];
  const ranked = rankRoutes(routes);
  const best = ranked[0] || null;
  const unavailable = routes.filter((route) => !route.available).map((route) => route.id);

  return json({
    ok: true,
    pairKey: `${currency}|${issuer}`,
    currency,
    issuer,
    amount,
    limit,
    checkedAt,
    source: 'bounded-route-compare',
    routes,
    rankedRouteIds: ranked.map((route) => route.id),
    bestRoute: best?.available ? best.id : 'none',
    bestReceiveXrp: best?.available ? best.receiveXrp : null,
    unavailableRoutes: unavailable,
    advice: buildAdvice(best, routes),
    sellImpactUrl: `/apps/sell-impact/?currency=${encodeURIComponent(currency)}&issuer=${encodeURIComponent(issuer)}&amount=${encodeURIComponent(String(amount))}`,
    freshness: { state: 'fresh', checkedAt },
    limits: { maxAmount: MAX_AMOUNT, maxLimit: MAX_LIMIT, unboundedDiscovery: false, allPairScanning: false },
  });
}
