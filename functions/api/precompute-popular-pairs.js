import { getPopularPairs } from './_popular_pairs.js';
import { upsertPairPrecompute } from '../../shared/pair-precompute-store.js';

const DEFAULT_SELL_AMOUNT = 1000;
const DEFAULT_LIMIT = 60;

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

function parseAmount(amount) {
  if (amount === null || amount === undefined) return 0;
  if (typeof amount === 'string') {
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed / 1_000_000 : 0;
  }
  if (typeof amount === 'number') {
    return Number.isFinite(amount) ? amount : 0;
  }
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
  const avgPrice = filled > 0 ? receive / filled : 0;
  const bestPrice = offers[0]?.price ?? 0;
  const slippagePct = bestPrice > 0 && avgPrice > 0 ? Math.max(0, ((bestPrice - avgPrice) / bestPrice) * 100) : null;
  return { filled, receive, avgPrice, bestPrice, slippagePct };
}

function simulateAmm(sellAmount, reserves) {
  if (!reserves) return null;
  const X = Number(reserves.tokenReserve);
  const Y = Number(reserves.xrpReserve);
  const feePct = Number(reserves.feePct || 0);
  if (!Number.isFinite(X) || !Number.isFinite(Y) || X <= 0 || Y <= 0) return null;
  const spotPrice = Y / X;
  const dxEff = sellAmount * (1 - Math.max(0, Math.min(1, feePct)));
  const k = X * Y;
  const newX = X + dxEff;
  const newY = k / newX;
  const receive = Math.max(0, Y - newY);
  const avgPrice = receive / sellAmount;
  const slippagePct = spotPrice > 0 && avgPrice > 0 ? Math.max(0, ((spotPrice - avgPrice) / spotPrice) * 100) : null;
  return { receive, avgPrice, slippagePct };
}

function impactBand(slippagePct) {
  if (!Number.isFinite(slippagePct)) return 'unavailable';
  if (slippagePct <= 2) return 'tight';
  if (slippagePct <= 5) return 'moderate';
  return 'wide';
}

async function fetchPairData(base, pair, limit) {
  const q = `currency=${encodeURIComponent(pair.currency)}&issuer=${encodeURIComponent(pair.issuer)}`;
  const [bookRes, ammRes] = await Promise.all([
    fetch(`${base}/api/book-offers?${q}&limit=${encodeURIComponent(String(limit))}`),
    fetch(`${base}/api/amm-info?${q}`),
  ]);
  const bookJson = await bookRes.json().catch(() => ({ ok: false }));
  const ammJson = await ammRes.json().catch(() => ({ ok: false }));
  return {
    offers: normalizeOffers(bookJson?.offers || []),
    ammReserves: ammJson?.ammReserves || null,
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const persist = url.searchParams.get('persist') === '1';
  const amount = Math.max(1, Number(url.searchParams.get('amount') || DEFAULT_SELL_AMOUNT));
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || DEFAULT_LIMIT)));
  const onlyPairKey = url.searchParams.get('pairKey') || '';
  const base = url.origin;
  const pairs = getPopularPairs().filter((pair) => !onlyPairKey || pair.pairKey === onlyPairKey);
  const checkedAt = new Date().toISOString();
  const rows = [];

  for (const pair of pairs) {
    const data = await fetchPairData(base, pair, limit);
    const book = simulateBook(amount, data.offers);
    const amm = simulateAmm(amount, data.ammReserves);
    const bookAvailable = book.receive > 0;
    const ammAvailable = Number.isFinite(amm?.receive) && amm.receive > 0;
    const bestRoute = bookAvailable && ammAvailable ? (book.receive >= amm.receive ? 'book' : 'amm') : (bookAvailable ? 'book' : ammAvailable ? 'amm' : 'none');
    const worstRoute = bookAvailable && ammAvailable ? (bestRoute === 'book' ? 'amm' : 'book') : bestRoute;
    const summary = {
      pairKey: pair.pairKey,
      currency: pair.currency,
      issuer: pair.issuer,
      sellAmount: amount,
      checkedAt,
      offersCount: data.offers.length,
      book: {
        available: bookAvailable,
        receiveXrp: bookAvailable ? book.receive : null,
        bestPrice: book.bestPrice || null,
        slippagePct: book.slippagePct,
        impactBand: impactBand(book.slippagePct),
      },
      amm: {
        available: ammAvailable,
        receiveXrp: ammAvailable ? amm.receive : null,
        slippagePct: amm?.slippagePct ?? null,
        impactBand: impactBand(amm?.slippagePct ?? null),
      },
      bestRoute,
      worstRoute,
      bestReceiveXrp: bestRoute === 'book' ? book.receive : bestRoute === 'amm' ? amm.receive : null,
    };
    rows.push(summary);

    if (persist) {
      await upsertPairPrecompute({
        pairKey: pair.pairKey,
        currency: pair.currency,
        issuer: pair.issuer,
        lastSuccessAt: checkedAt,
        endpointUsed: bestRoute,
        bestRoute,
        summary,
        stale: false,
        errorText: null,
      }, env);
    }
  }

  return json({ ok: true, persist, amount, limit, count: rows.length, rows });
}
