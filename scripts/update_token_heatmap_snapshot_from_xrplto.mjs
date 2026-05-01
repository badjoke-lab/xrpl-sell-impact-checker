#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SNAPSHOT_VERSION = 1;
const DEFAULT_OUTPUT = 'apps/token-heatmap/token-heatmap-snapshot.json';
const DEFAULT_LIMIT = 100;
const DEFAULT_URLS = [
  'https://api.xrpl.to/v1/tokens?sortBy=marketcap&sortType=desc&limit=100',
  'https://api.xrpl.to/v1/tokens?sortBy=vol24h&sortType=desc&limit=100',
  'https://api.xrpl.to/v1/tokens?sortBy=vol24hxrp&sortType=desc&limit=100',
];

const args = parseArgs(process.argv.slice(2));
const outputPath = path.resolve(process.cwd(), args.output || process.env.TOKEN_HEATMAP_OUTPUT || DEFAULT_OUTPUT);
const limit = clampInt(args.limit || process.env.TOKEN_HEATMAP_LIMIT || DEFAULT_LIMIT, 1, 100);
const sourceUrls = args.url ? [args.url] : DEFAULT_URLS;

async function main() {
  const generatedAt = new Date().toISOString();
  const probes = [];
  for (const url of sourceUrls) {
    try {
      const raw = await fetchJson(url);
      const rows = extractRows(raw);
      const normalized = normalizeRows(rows).slice(0, limit);
      probes.push({ ok: true, url, rows, normalized });
    } catch (error) {
      probes.push({ ok: false, url, rows: [], normalized: [], error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
    }
  }

  const best = chooseBestProbe(probes);
  if (!best || !best.normalized.length) {
    console.error(JSON.stringify({ ok: false, probes: probes.map((probe) => ({ url: probe.url, ok: probe.ok, error: probe.error || null, rows: probe.rows.length, normalized: probe.normalized.length })) }, null, 2));
    process.exitCode = 1;
    return;
  }

  const snapshot = {
    snapshotVersion: SNAPSHOT_VERSION,
    generatedAt,
    source: best.url,
    status: best.normalized.length >= Math.min(50, limit) ? 'fresh' : 'partial',
    topLimit: limit,
    note: 'Generated from XRPL.to token list. Exit coverage remains unknown until XSIC route checks are connected.',
    tokens: best.normalized.map(({ _sourceScore, ...token }) => token),
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log(`[ok] token heatmap snapshot written: ${path.relative(process.cwd(), outputPath)} tokens=${snapshot.tokens.length}`);
  console.log(`[ok] source=${best.url}`);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'xsic-token-heatmap-updater/1.0',
    },
  });
  if (!response.ok) throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
  return response.json();
}

function chooseBestProbe(probes) {
  return probes
    .filter((probe) => probe.ok)
    .sort((a, b) => scoreRows(b.normalized) - scoreRows(a.normalized))[0] || null;
}

function scoreRows(rows) {
  return rows.reduce((score, row) => score + row._sourceScore, 0) + rows.length * 20;
}

function normalizeRows(rows) {
  const seen = new Set();
  const normalized = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const token = normalizeRow(row);
    if (!token) continue;
    const key = `${token.currency}.${token.issuer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(token);
  }
  return normalized.sort((a, b) => b.marketCap - a.marketCap || b.volume24h - a.volume24h || b.liquidity - a.liquidity);
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

  const sourceScore = (marketCap > 0 ? 5 : 0) + (volume24h > 0 ? 4 : 0) + (liquidity > 0 ? 2 : 0) + (priceChange24h !== 0 ? 1 : 0);

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
    _sourceScore: sourceScore,
  };
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  const candidates = [payload?.tokens, payload?.data, payload?.result, payload?.results, payload?.items, payload?.rows];
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
    else if (arg === '--output') out.output = argv[++i];
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
