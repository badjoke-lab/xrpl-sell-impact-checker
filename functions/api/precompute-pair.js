import { normalizeCurrencyInput } from '../../shared/normalizeCurrency.js';
import {
  getPairPrecompute,
  summarizePrecomputeFreshness,
} from '../../shared/pair-precompute-store.js';

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

function normalizeIssuer(input) {
  return String(input || '').trim();
}

function buildPairKey(currency, issuer) {
  const cur = String(currency || '').trim().toUpperCase();
  const iss = normalizeIssuer(issuer);
  if (!cur || !iss) return '';
  return `${cur}|${iss}`;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const pairKeyParam = String(url.searchParams.get('pairKey') || '').trim();
  const rawCurrency = String(url.searchParams.get('currency') || '').trim();
  const issuer = normalizeIssuer(url.searchParams.get('issuer') || '');
  const currencyResult = rawCurrency ? normalizeCurrencyInput(rawCurrency) : null;
  const currency = currencyResult?.currencyNormalized || currencyResult?.currencyInput || '';
  const pairKey = pairKeyParam || buildPairKey(currency, issuer);

  if (!pairKey) {
    return json({
      ok: false,
      error: 'missing_params',
      pairKey: '',
      currency,
      issuer,
      freshness: summarizePrecomputeFreshness(null),
    }, 400);
  }

  const row = await getPairPrecompute(pairKey, env);
  const freshness = row?.freshness || summarizePrecomputeFreshness(null);
  return json({
    ok: true,
    pairKey,
    currency,
    issuer,
    found: Boolean(row),
    freshness,
    row,
  });
}
