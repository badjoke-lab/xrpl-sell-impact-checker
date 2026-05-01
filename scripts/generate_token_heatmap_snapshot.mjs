#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SNAPSHOT_VERSION = 1;
const DEFAULT_INPUT = 'data/token-heatmap/seed.tokens.json';
const DEFAULT_OUTPUT = 'apps/token-heatmap/token-heatmap-snapshot.demo.json';
const DEFAULT_TOP_LIMIT = 100;
const ALLOWED_EXIT = new Set(['dual', 'book-only', 'amm-only', 'none', 'unknown']);
const ALLOWED_STATUS = new Set(['demo', 'fresh', 'stale', 'degraded', 'partial']);

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(process.cwd(), args.input || process.env.TOKEN_HEATMAP_INPUT || DEFAULT_INPUT);
const outputPath = path.resolve(process.cwd(), args.output || process.env.TOKEN_HEATMAP_OUTPUT || DEFAULT_OUTPUT);
const topLimit = clampInt(args.topLimit || process.env.TOKEN_HEATMAP_TOP_LIMIT || DEFAULT_TOP_LIMIT, 1, 100);

async function main() {
  const seed = await readJson(inputPath);
  const snapshot = buildSnapshot(seed, topLimit);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`[ok] token heatmap snapshot written: ${path.relative(process.cwd(), outputPath)} tokens=${snapshot.tokens.length} status=${snapshot.status}`);
}

function buildSnapshot(seed, limit) {
  const tokens = normalizeTokens(seed?.tokens || [])
    .sort((a, b) => b.marketCap - a.marketCap || b.liquidity - a.liquidity || b.volume24h - a.volume24h)
    .slice(0, limit);

  const status = normalizeStatus(seed?.status || 'demo');
  const generatedAt = status === 'demo' ? 'demo' : new Date().toISOString();

  return {
    snapshotVersion: SNAPSHOT_VERSION,
    generatedAt,
    source: String(seed?.source || 'seed-json'),
    status,
    topLimit: limit,
    note: String(seed?.note || ''),
    tokens,
  };
}

function normalizeTokens(rawTokens) {
  if (!Array.isArray(rawTokens)) return [];
  const seen = new Set();
  const normalized = [];
  for (const raw of rawTokens) {
    const token = normalizeToken(raw);
    if (!token) continue;
    const key = `${token.currency}.${token.issuer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(token);
  }
  return normalized;
}

function normalizeToken(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const currency = String(raw.currency || '').trim();
  const issuer = String(raw.issuer || '').trim();
  if (!currency || !issuer) return null;

  const marketCap = positiveNumber(raw.marketCap);
  const liquidity = positiveNumber(raw.liquidity);
  const volume24h = positiveNumber(raw.volume24h);
  if (!marketCap && !liquidity && !volume24h) return null;

  return {
    currency,
    issuer,
    marketCap,
    liquidity,
    volume24h,
    priceChange24h: finiteNumber(raw.priceChange24h),
    liquidityChange24h: finiteNumber(raw.liquidityChange24h),
    exitCoverage: normalizeExit(raw.exitCoverage),
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : 'demo',
  };
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') out.input = argv[++i];
    else if (arg === '--output') out.output = argv[++i];
    else if (arg === '--top-limit') out.topLimit = argv[++i];
  }
  return out;
}

function normalizeStatus(value) {
  const status = String(value || '').trim();
  return ALLOWED_STATUS.has(status) ? status : 'demo';
}

function normalizeExit(value) {
  const exit = String(value || '').trim();
  return ALLOWED_EXIT.has(exit) ? exit : 'unknown';
}

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
