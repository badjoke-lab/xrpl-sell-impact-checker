const XRPL_ENDPOINTS = [
  'https://s1.ripple.com:51234/',
  'https://s2.ripple.com:51234/',
];

const REQUEST_TIMEOUT_MS = 4_500;
const CACHE_TTL_MS = 15_000;
const CACHE_STALE_MS = 90_000;

const PRESETS = {
  'xrp-rlusd': {
    id: 'xrp-rlusd',
    label: 'XRP / RLUSD',
    asset: { currency: 'XRP' },
    asset2: { currency: '524C555344000000000000000000000000000000', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De' },
  },
};

const cache = globalThis.__xsicAmmSnapshotCache || new Map();
globalThis.__xsicAmmSnapshotCache = cache;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function basePayload({ poolLabel = 'Unknown', source = null, stale = false } = {}) {
  return {
    ts: new Date().toISOString(),
    poolLabel,
    price: null,
    liquidityUsd: null,
    reserves: null,
    swaps5m: null,
    deviationBps: null,
    stale,
    source,
  };
}

function toAmountNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeAmount(amount) {
  if (typeof amount === 'string') {
    const drops = toAmountNumber(amount);
    return drops === null ? null : drops / 1_000_000;
  }
  if (amount && typeof amount === 'object') {
    return toAmountNumber(amount.value);
  }
  return null;
}

function buildSnapshot(preset, ammResult, source) {
  const amountA = normalizeAmount(ammResult?.amount);
  const amountB = normalizeAmount(ammResult?.amount2);

  let price = null;
  if (amountA && amountB) {
    const looksLikeXrpBase = preset.asset.currency === 'XRP';
    price = looksLikeXrpBase ? amountB / amountA : amountA / amountB;
  }

  let liquidityUsd = null;
  if (price && amountA && amountB && preset.asset.currency === 'XRP') {
    liquidityUsd = amountA * price + amountB;
  }

  return {
    ...basePayload({ poolLabel: preset.label, source, stale: false }),
    price,
    liquidityUsd,
    reserves: amountA !== null && amountB !== null ? { a: amountA, b: amountB } : null,
  };
}

function parseAsset(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.toUpperCase() === 'XRP') {
    return { currency: 'XRP' };
  }

  const [currency, issuer] = trimmed.split('.');
  if (!currency || !issuer) return null;
  return { currency: currency.toUpperCase(), issuer };
}

function resolvePool(poolParam) {
  const pool = (poolParam || 'xrp-rlusd').trim();
  if (PRESETS[pool]) return PRESETS[pool];

  const [aRaw, bRaw] = pool.split(',');
  const asset = parseAsset(aRaw);
  const asset2 = parseAsset(bRaw);
  if (!asset || !asset2) return null;

  return {
    id: pool,
    label: `${aRaw} / ${bRaw}`,
    asset,
    asset2,
  };
}

async function fetchWithTimeout(endpoint, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFreshSnapshot(preset) {
  const payload = {
    method: 'amm_info',
    params: [{ asset: preset.asset, asset2: preset.asset2 }],
  };

  let timeoutSeen = false;
  let lastError = null;
  for (const endpoint of XRPL_ENDPOINTS) {
    try {
      const jsonBody = await fetchWithTimeout(endpoint, payload);
      const result = jsonBody?.result;
      if (!result || result.status !== 'success' || !result.amm) {
        throw new Error(result?.error || 'invalid_amm_response');
      }
      return buildSnapshot(preset, result.amm, endpoint);
    } catch (error) {
      if (error?.name === 'AbortError') {
        timeoutSeen = true;
      }
      lastError = error;
    }
  }

  if (timeoutSeen) {
    const err = new Error('upstream_timeout');
    err.isTimeout = true;
    throw err;
  }

  throw new Error(lastError?.message || 'upstream_unreachable');
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const preset = resolvePool(url.searchParams.get('pool'));

  if (!preset) {
    return json({
      ...basePayload({ poolLabel: 'unknown' }),
      error: 'invalid_pool',
    }, 400);
  }

  const now = Date.now();
  const cached = cache.get(preset.id);
  if (cached && now - cached.fetchedAt <= CACHE_TTL_MS) {
    return json({ ...cached.data, stale: false });
  }

  try {
    const fresh = await fetchFreshSnapshot(preset);
    cache.set(preset.id, { data: fresh, fetchedAt: now });
    return json(fresh);
  } catch (error) {
    const canServeStale = cached && now - cached.fetchedAt <= CACHE_TTL_MS + CACHE_STALE_MS;
    if (canServeStale) {
      return json({ ...cached.data, stale: true });
    }

    const timeoutError = error?.isTimeout || error?.message === 'upstream_timeout';
    return json({
      ...basePayload({ poolLabel: preset.label, stale: false }),
      source: null,
      error: timeoutError ? 'upstream_timeout' : 'upstream_unreachable',
    }, timeoutError ? 502 : 503);
  }
}
