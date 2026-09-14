import contractModule from './_contract.cjs';

const contract = contractModule.default || contractModule;
const SECTION_TIMEOUT_MS = 5500;
const OVERALL_TIMEOUT_MS = 8000;

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

function detailUrl(path, input, extras = {}) {
  const url = new URL(path, 'https://xsic.invalid');
  url.searchParams.set('currency', input.currency);
  url.searchParams.set('issuer', input.issuer);
  url.searchParams.set('amount', String(input.amount));
  for (const [key, value] of Object.entries(extras)) {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

function section(state, options = {}) {
  return {
    state,
    scope: options.scope || 'requested-pair',
    sourceMode: options.sourceMode || 'none',
    observedAt: options.observedAt || null,
    freshness: options.freshness || { state: state === 'available' ? 'fresh' : 'missing' },
    warning: options.warning || null,
    detailUrl: options.detailUrl || null,
    data: options.data ?? null,
  };
}

function stateFromPayload(payload, options = {}) {
  if (!payload || typeof payload !== 'object') return 'unavailable';
  if (payload.state && ['fresh', 'aging', 'stale', 'partial', 'degraded', 'missing', 'error', 'demo'].includes(payload.state)) {
    if (payload.state === 'fresh') return 'available';
    return payload.state;
  }
  if (payload.ok === true) {
    if (payload.isStale || payload.stale || payload.freshness?.state === 'stale') return 'stale';
    if (payload.partial) return 'partial';
    return 'available';
  }
  if (options.emptyIsAvailable && payload.ok === false && !payload.error) return 'available';
  return payload.error ? 'unavailable' : 'missing';
}

async function fetchJson(fetchImpl, url, options = {}, timeoutMs = SECTION_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('section_timeout'), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      ...options,
      headers: { accept: 'application/json', ...(options.headers || {}) },
      cache: 'no-store',
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return { ok: false, status: response.status, error: 'non_json_response', payload: null };
    }
    const payload = await response.json();
    return { ok: response.ok, status: response.status, payload, error: response.ok ? null : payload?.error?.code || payload?.error || `http_${response.status}` };
  } catch (error) {
    return { ok: false, status: 0, error: error?.name === 'AbortError' ? 'timeout' : 'request_failed', payload: null };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSellImpact(input, bookResult, ammResult) {
  const book = bookResult.payload;
  const amm = ammResult.payload;
  const bookState = stateFromPayload(book);
  const ammAvailable = Boolean(amm?.ok && amm?.ammReserves);
  const ammState = ammAvailable ? stateFromPayload(amm) : (ammResult.ok ? 'missing' : 'unavailable');
  const usable = ['available', 'aging', 'stale', 'partial', 'degraded'].includes(bookState) || ammAvailable;
  const unavailableCount = [bookState, ammState].filter((value) => value === 'unavailable').length;
  const aggregateState = usable ? (unavailableCount ? 'partial' : 'available') : (unavailableCount === 2 ? 'unavailable' : 'missing');
  const observedAt = [book?.observedAt, amm?.observedAt].filter(Boolean).sort().at(-1) || null;

  return section(aggregateState, {
    sourceMode: [book?.sourceMode, amm?.sourceMode].filter(Boolean).join('+') || 'none',
    observedAt,
    freshness: {
      state: aggregateState === 'available' ? 'fresh' : aggregateState,
      book: book?.freshness || null,
      amm: amm?.freshness || null,
    },
    warning: 'Pair Brief preserves the authoritative Sell Impact calculation in the detailed tool; this section reports source availability and venue evidence only.',
    detailUrl: detailUrl('/apps/sell-impact/', input),
    data: {
      requestedAmount: input.amount,
      calculation: 'detail-tool-authoritative',
      estimatedReceiveXrp: null,
      impactPct: null,
      book: {
        state: bookState,
        offersCount: Number(book?.offersCount || 0),
        endpointUsed: book?.endpointUsed || null,
        error: bookResult.error || book?.error || null,
      },
      amm: {
        state: ammState,
        present: ammAvailable,
        reserves: amm?.ammReserves || null,
        endpointUsed: amm?.endpointUsed || null,
        error: ammResult.error || amm?.error || null,
      },
    },
  });
}

function normalizeLiquidity(input, currentResult, historyResult, liveResult) {
  const live = liveResult.payload;
  const current = currentResult.payload;
  const history = historyResult.payload;
  const selected = live?.ok ? live : current?.latest || history?.latest || null;
  const fallback = !live?.ok && Boolean(selected);
  const state = selected ? (fallback ? 'degraded' : stateFromPayload(selected)) : 'unavailable';
  return section(state, {
    scope: 'xrp-rlusd-market-context',
    sourceMode: fallback ? (current?.latest ? 'materialized-current' : 'history-fallback') : live?.sourceMode || 'live',
    observedAt: selected?.observedAt || selected?.ts || selected?.freshness?.observedAt || null,
    freshness: selected?.freshness || history?.historyMeta?.freshness || { state: state === 'available' ? 'fresh' : state },
    warning: 'Liquidity Pulse currently provides XRP/RLUSD market context and is not a direct liquidity measurement for every requested issuer pair.',
    detailUrl: detailUrl('/apps/liquidity-pulse/', input),
    data: {
      pool: selected?.poolLabel || selected?.pool || 'xrp-rlusd',
      price: selected?.price ?? null,
      liquidityUsd: selected?.liquidityUsd ?? null,
      historyCount: Number(history?.historyMeta?.count || history?.recent?.length || 0),
      liveError: liveResult.error,
    },
  });
}

function normalizeFlow(input, flowResult, historyResult) {
  const flow = flowResult.payload;
  const history = historyResult.payload;
  const fallback = !flow?.ok && history?.latest ? history.latest : null;
  const selected = flow?.ok ? flow : fallback;
  const state = selected ? (fallback ? 'degraded' : stateFromPayload(flow)) : 'unavailable';
  return section(state, {
    scope: 'exchange-flow-market-context',
    sourceMode: fallback ? 'history-fallback' : flow?.sourceMode || flow?.source || 'live',
    observedAt: selected?.observedAt || selected?.ts || history?.historyMeta?.newestTs || null,
    freshness: flow?.freshness || history?.historyMeta?.freshness || { state },
    warning: 'Flow Alert is exchange-flow market context. It is not a flow measurement for the requested issuer unless the underlying preset explicitly covers it.',
    detailUrl: detailUrl('/apps/flow-alert/', input, { preset: 'exchanges', window: '1h' }),
    data: {
      preset: 'exchanges',
      window: '1h',
      summary: selected?.summary || null,
      historyCount: Number(history?.historyMeta?.count || history?.recent?.length || 0),
      liveError: flowResult.error,
    },
  });
}

function normalizeExitCoverage(input, result) {
  const payload = result.payload;
  if (!result.ok || !payload) {
    return section('unavailable', {
      sourceMode: payload?.source || 'none',
      warning: 'Exit Coverage could not be checked. Upstream or contract failure is not treated as route absence.',
      detailUrl: detailUrl('/apps/exit-coverage-map/', input),
      data: { routeState: null, error: result.error },
    });
  }
  const match = (Array.isArray(payload.rows) ? payload.rows : []).find((row) => (
    String(row.currency || '').toUpperCase() === String(input.currency).toUpperCase()
    && String(row.issuer || '') === input.issuer
  ));
  if (!match) {
    return section('unsupported', {
      sourceMode: payload.source || 'fixed-proof-baseline',
      observedAt: payload.freshness?.checkedAt || null,
      freshness: payload.freshness || { state: 'fresh' },
      warning: 'The current Exit Coverage proof dataset does not contain this exact pair. Unsupported is not equivalent to none.',
      detailUrl: detailUrl('/apps/exit-coverage-map/', input),
      data: { routeState: null, matched: false },
    });
  }
  return section('available', {
    sourceMode: payload.source || 'fixed-proof-baseline',
    observedAt: payload.freshness?.checkedAt || null,
    freshness: payload.freshness || { state: 'fresh' },
    warning: 'Exit Coverage reports route presence only; it does not estimate execution depth or price impact.',
    detailUrl: match.sellImpactUrl || detailUrl('/apps/sell-impact/', input),
    data: {
      routeState: match.state,
      matched: true,
      bookPresent: Boolean(match.bookPresent),
      ammPresent: Boolean(match.ammPresent),
      evidence: Array.isArray(match.evidence) ? match.evidence : [],
      observedLedger: payload.observedLedger || null,
    },
  });
}

function exposureModel(issuer, rpcPayload) {
  const candidates = [rpcPayload?.result?.result?.lines, rpcPayload?.result?.lines, rpcPayload?.data?.result?.lines, rpcPayload?.lines];
  const lines = candidates.find(Array.isArray) || [];
  const values = lines.map((line) => ({
    account: String(line.account || ''),
    currency: String(line.currency || 'IOU'),
    exposureValue: Math.abs(Number.parseFloat(String(line.balance ?? '0')) || 0),
  })).filter((line) => line.account && Number.isFinite(line.exposureValue) && line.exposureValue > 0)
    .sort((a, b) => b.exposureValue - a.exposureValue);
  const totalExposure = values.reduce((sum, row) => sum + row.exposureValue, 0);
  const top = values.slice(0, 8).map((row) => ({
    account: row.account,
    currency: row.currency,
    exposureValue: row.exposureValue,
    share: totalExposure > 0 ? row.exposureValue / totalExposure : 0,
  }));
  return {
    issuer,
    usableLineCount: values.length,
    totalExposure,
    topCounterparties: top,
    top3Share: top.slice(0, 3).reduce((sum, row) => sum + row.share, 0),
  };
}

function normalizeExposure(input, result) {
  if (!result.ok || !result.payload) {
    return section('unavailable', {
      sourceMode: 'xrpl-account-lines',
      warning: 'Issuer exposure could not be loaded. No concentration conclusion is inferred from a failed request.',
      detailUrl: detailUrl('/apps/exposure-graph/', input),
      data: { error: result.error },
    });
  }
  const model = exposureModel(input.issuer, result.payload);
  return section(model.usableLineCount ? 'available' : 'missing', {
    sourceMode: result.payload?.endpointUsed || 'xsic-xrpl-proxy',
    observedAt: new Date().toISOString(),
    freshness: { state: 'fresh' },
    warning: 'Exposure is a bounded account-lines concentration view and remains heuristic context, not a safety or solvency rating.',
    detailUrl: detailUrl('/apps/exposure-graph/', input),
    data: model,
  });
}

export async function collectPairBrief(input, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = options.baseUrl || 'https://xsic.invalid';
  const endpoint = (path) => new URL(path, baseUrl).toString();
  const query = new URLSearchParams({ currency: input.currency, issuer: input.issuer, limit: '200' });
  const requests = {
    book: fetchJson(fetchImpl, endpoint(`/api/book-offers?${query}`)),
    amm: fetchJson(fetchImpl, endpoint(`/api/amm-info?currency=${encodeURIComponent(input.currency)}&issuer=${encodeURIComponent(input.issuer)}`)),
    liquidityCurrent: fetchJson(fetchImpl, endpoint('/api/xrpl/liquidity-current?pool=xrp-rlusd')),
    liquidityHistory: fetchJson(fetchImpl, endpoint('/api/xrpl/liquidity-history?pool=xrp-rlusd&limit=24')),
    liquidityLive: fetchJson(fetchImpl, endpoint('/api/xrpl/amm-snapshot?pool=xrp-rlusd')),
    flow: fetchJson(fetchImpl, endpoint('/api/xrpl/whale-flow?preset=exchanges&window=1h')),
    flowHistory: fetchJson(fetchImpl, endpoint('/api/xrpl/flow-history?preset=exchanges&window=1h&limit=24')),
    exitCoverage: fetchJson(fetchImpl, endpoint(`/api/exit-coverage?preset=expanded&issuer=${encodeURIComponent(input.issuer)}`)),
    exposure: fetchJson(fetchImpl, endpoint('/api/xrpl'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'account_lines', params: [{ account: input.issuer, ledger_index: 'validated', limit: 400 }] }),
    }),
  };

  const overall = new Promise((resolve) => setTimeout(() => resolve({ overallTimeout: true }), OVERALL_TIMEOUT_MS));
  const settled = Promise.all(Object.entries(requests).map(async ([key, promise]) => [key, await promise]));
  const race = await Promise.race([settled, overall]);
  const results = race?.overallTimeout ? {} : Object.fromEntries(race);
  const timeoutResult = { ok: false, status: 0, error: 'overall_timeout', payload: null };
  const value = (key) => results[key] || timeoutResult;

  const sections = {
    sellImpact: normalizeSellImpact(input, value('book'), value('amm')),
    liquidity: normalizeLiquidity(input, value('liquidityCurrent'), value('liquidityHistory'), value('liquidityLive')),
    flow: normalizeFlow(input, value('flow'), value('flowHistory')),
    exitCoverage: normalizeExitCoverage(input, value('exitCoverage')),
    issuerExposure: normalizeExposure(input, value('exposure')),
  };
  const nonIdeal = Object.values(sections).filter((entry) => entry.state !== 'available');
  const available = Object.values(sections).filter((entry) => ['available', 'aging', 'stale', 'partial', 'degraded'].includes(entry.state));
  const warnings = Object.entries(sections).filter(([, entry]) => entry.warning).map(([name, entry]) => ({ section: name, message: entry.warning }));

  return {
    schemaVersion: 1,
    ok: available.length > 0,
    partial: nonIdeal.length > 0,
    checkedAt: new Date().toISOString(),
    pair: { currency: input.currency, issuer: input.issuer },
    amount: { value: input.amount, unit: input.currency },
    sections,
    sourceModes: Object.fromEntries(Object.entries(sections).map(([key, entry]) => [key, entry.sourceMode])),
    freshness: Object.fromEntries(Object.entries(sections).map(([key, entry]) => [key, entry.freshness])),
    warnings,
    disclaimer: 'Decision-support context only. No Buy/Sell recommendation, safety score, or certification is produced.',
  };
}

async function run(context, input) {
  const currency = contract.validateCurrency(input.currency);
  const issuer = contract.validateIssuer(input.issuer);
  const amount = contract.validateAmount(input.amount, { max: 1e18 });
  const issue = contract.firstValidationError([currency, issuer, amount]);
  if (issue) {
    return contract.errorResponse({
      status: 400,
      code: issue.code,
      message: issue.message,
      field: issue.field,
      details: issue.details,
      requestId: contract.requestIdFrom(context.request),
      source: 'pair-brief',
    });
  }
  const requestUrl = new URL(context.request.url);
  const payload = await collectPairBrief({ currency: currency.value, issuer: issuer.value, amount: amount.value }, {
    baseUrl: requestUrl.origin,
    fetchImpl: context.fetch || fetch,
  });
  return json(payload, payload.ok ? 200 : 503);
}

export async function onRequestGet(context) {
  return run(context, Object.fromEntries(new URL(context.request.url).searchParams.entries()));
}

export async function onRequestPost(context) {
  const parsed = await contract.readInput(context.request);
  if (!parsed.ok) {
    return contract.errorResponse({
      status: parsed.status,
      code: parsed.error.code,
      message: parsed.error.message,
      field: parsed.error.field,
      details: parsed.error.details,
      requestId: contract.requestIdFrom(context.request),
      source: 'pair-brief',
    });
  }
  return run(context, parsed.input);
}
