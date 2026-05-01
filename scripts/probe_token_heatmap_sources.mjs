#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_OUTPUT_DIR = 'data/token-heatmap/probe';
const DEFAULT_LIMIT = 100;
const DEFAULT_URLS = [
  'https://api.xrpl.to/v1/tokens?sortBy=marketcap&sortType=desc&limit=100',
  'https://api.xrpl.to/v1/tokens?sortBy=vol24h&sortType=desc&limit=100',
  'https://api.xrpl.to/v1/tokens?sortBy=vol24hxrp&sortType=desc&limit=100',
];

const args = parseArgs(process.argv.slice(2));
const targetUrls = args.url ? [args.url] : DEFAULT_URLS;
const outputDir = path.resolve(process.cwd(), args.outputDir || process.env.TOKEN_HEATMAP_PROBE_OUTPUT_DIR || DEFAULT_OUTPUT_DIR);
const limit = clampInt(args.limit || process.env.TOKEN_HEATMAP_PROBE_LIMIT || DEFAULT_LIMIT, 1, 100);

async function main() {
  await mkdir(outputDir, { recursive: true });
  const fetchedAt = new Date().toISOString();
  const probes = [];
  for (const url of targetUrls) {
    try {
      const raw = await fetchJson(url);
      const rows = extractRows(raw);
      const normalized = rows.map(normalizeRow).filter(Boolean).slice(0, limit);
      probes.push({ ok: true, url, raw, rows, normalized, report: buildReport({ fetchedAt, targetUrl: url, raw, rows, normalized }) });
    } catch (error) {
      probes.push({ ok: false, url, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error), raw: null, rows: [], normalized: [], report: null });
    }
  }

  const best = chooseBestProbe(probes);
  const report = {
    fetchedAt,
    candidates: probes.map((probe) => probe.ok ? probe.report : { targetUrl: probe.url, ok: false, error: probe.error }),
    selectedUrl: best?.url || null,
    selectedRows: best?.normalized?.length || 0,
  };
  const candidateSnapshot = buildCandidateSnapshot({
    fetchedAt,
    sourceUrl: best?.url || targetUrls[0],
    tokens: best?.normalized || [],
    limit,
  });

  await writeFile(path.join(outputDir, 'xrplto-raw.sample.json'), `${JSON.stringify(best?.raw || {}, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outputDir, 'xrplto-candidates.json'), `${JSON.stringify(candidateSnapshot, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outputDir, 'xrplto-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[ok] selected=${best?.url || 'none'} normalized=${best?.normalized?.length || 0}`);
  console.log(`[ok] report=${path.relative(process.cwd(), path.join(outputDir, 'xrplto-report.json'))}`);
  console.log(`[ok] candidates=${path.relative(process.cwd(), path.join(outputDir, 'xrplto-candidates.json'))}`);
  if (!best?.normalized?.length) process.exitCode = 1;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'xsic-token-heatmap-source-probe/1.1',
    },
  });
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function chooseBestProbe(probes) {
  return probes
    .filter((probe) => probe.ok)
    .sort((a, b) => scoreProbe(b) - scoreProbe(a))[0] || null;
}

function scoreProbe(probe) {
  const coverage = probe.report?.coverage || {};
  return (coverage.currencyIssuer || 0) * 10 + (coverage.marketCap || 0) * 4 + (coverage.volume24h || 0) * 3 + (coverage.priceChange24h || 0) * 2 + (coverage.liquidity || 0);
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.tokens,
    payload?.data,
    payload?.result,
    payload?.results,
    payload?.items,
    payload?.rows,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  if (payload && typeof payload === 'object') {
    for (const value of Object.values(payload)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return null;
  const currency = firstString(row.currency, row.code, row.symbol, row.name, row.token);
  const issuer = firstString(row.issuer, row.issuerAddress, row.issuer_address, row.account, row.address);
  if (!currency || !issuer) return null;

  const marketCap = positiveNumber(row.marketCap, row.marketcap, row.market_cap, row.mcap, row.mc);
  const liquidity = positiveNumber(row.liquidity, row.liquidityUsd, row.liquidity_usd, row.reserve, row.tvl, row.ammLiquidity, row.amount, row.supplyInXrp);
  const volume24h = positiveNumber(row.volume24h, row.vol24h, row.volume_24h, row.volume24, row.volume, row['24hVolume'], row.vol24hxrp, row.vol24hXrp);
  const priceChange24h = finiteNumber(row.priceChange24h, row.change24h, row.price_change_24h, row.change24, row.percentChange24h, row.pro24h);
  const updatedAt = firstString(row.updatedAt, row.lastUpdated, row.updated, row.ts, row.timestamp) || new Date().toISOString();

  if (!marketCap && !liquidity && !volume24h) return null;

  return {
    currency,
    issuer,
    marketCap,
    liquidity,
    volume24h,
    priceChange24h,
    liquidityChange24h: 0,
    exitCoverage: 'unknown',
    updatedAt: String(updatedAt),
    _probe: {
      directLiquidity: liquidity > 0,
      rawKeys: Object.keys(row).slice(0, 60),
    },
  };
}

function buildCandidateSnapshot({ fetchedAt, sourceUrl, tokens, limit }) {
  return {
    snapshotVersion: 1,
    generatedAt: fetchedAt,
    source: sourceUrl,
    status: tokens.length >= Math.min(50, limit) ? 'partial' : 'degraded',
    topLimit: limit,
    note: 'Probe output. Review before using as production snapshot.',
    tokens: tokens.map(({ _probe, ...token }) => token),
  };
}

function buildReport({ fetchedAt, targetUrl, raw, rows, normalized }) {
  const sample = rows.slice(0, 3).map((row) => ({ keys: Object.keys(row || {}), row }));
  const coverage = {
    currencyIssuer: normalized.length,
    marketCap: normalized.filter((row) => row.marketCap > 0).length,
    liquidity: normalized.filter((row) => row.liquidity > 0).length,
    volume24h: normalized.filter((row) => row.volume24h > 0).length,
    priceChange24h: normalized.filter((row) => Number.isFinite(row.priceChange24h) && row.priceChange24h !== 0).length,
  };
  return {
    ok: true,
    fetchedAt,
    targetUrl,
    rawType: Array.isArray(raw) ? 'array' : typeof raw,
    topLevelKeys: raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw) : [],
    fetchedRows: rows.length,
    normalizedRows: normalized.length,
    coverage,
    sample,
    normalizedSample: normalized.slice(0, 10),
  };
}

function firstString(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function positiveNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function finiteNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') out.url = argv[++i];
    else if (arg === '--output-dir') out.outputDir = argv[++i];
    else if (arg === '--limit') out.limit = argv[++i];
  }
  return out;
}

function clampInt(value, min, max) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
});
