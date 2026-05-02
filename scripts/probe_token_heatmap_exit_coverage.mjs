#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_INPUT = 'apps/token-heatmap/token-heatmap-snapshot.json';
const DEFAULT_OUTPUT_DIR = 'data/token-heatmap/probe';
const DEFAULT_LIMIT = 20;
const RPC_ENDPOINTS = [
  'https://xrplcluster.com/',
  'https://s1.ripple.com:51234/',
  'https://s2.ripple.com:51234/',
];

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(process.cwd(), args.input || process.env.TOKEN_HEATMAP_EXIT_INPUT || DEFAULT_INPUT);
const outputDir = path.resolve(process.cwd(), args.outputDir || process.env.TOKEN_HEATMAP_EXIT_OUTPUT_DIR || DEFAULT_OUTPUT_DIR);
const limit = clampInt(args.limit || process.env.TOKEN_HEATMAP_EXIT_LIMIT || DEFAULT_LIMIT, 1, 20);
const requestDelayMs = clampInt(args.delayMs || process.env.TOKEN_HEATMAP_EXIT_DELAY_MS || 250, 0, 5000);

async function main() {
  const startedAt = new Date().toISOString();
  await mkdir(outputDir, { recursive: true });

  const snapshot = await readJson(inputPath);
  const tokens = Array.isArray(snapshot.tokens) ? snapshot.tokens.slice(0, limit) : [];
  if (!tokens.length) throw new Error(`no tokens found in ${path.relative(process.cwd(), inputPath)}`);

  const rows = [];
  for (const [index, token] of tokens.entries()) {
    const normalized = normalizeToken(token, index + 1);
    if (!normalized) continue;
    const row = await probeToken(normalized);
    rows.push(row);
    if (requestDelayMs > 0 && index < tokens.length - 1) await sleep(requestDelayMs);
  }

  const finishedAt = new Date().toISOString();
  const report = buildReport({ startedAt, finishedAt, inputPath, limit, rows });
  const snapshotPatch = buildPatch({ startedAt, finishedAt, rows });

  await writeFile(path.join(outputDir, 'exit-coverage-top20-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outputDir, 'exit-coverage-top20-patch.json'), `${JSON.stringify(snapshotPatch, null, 2)}\n`, 'utf8');

  console.log(`[ok] checked=${rows.length} dual=${report.summary.dual} bookOnly=${report.summary.bookOnly} ammOnly=${report.summary.ammOnly} none=${report.summary.none} errors=${report.summary.errors}`);
  console.log(`[ok] report=${path.relative(process.cwd(), path.join(outputDir, 'exit-coverage-top20-report.json'))}`);
  console.log(`[ok] patch=${path.relative(process.cwd(), path.join(outputDir, 'exit-coverage-top20-patch.json'))}`);
}

async function probeToken(token) {
  const observedAt = new Date().toISOString();
  const book = await probeBook(token);
  const amm = await probeAmm(token);
  const exitCoverage = classifyExitCoverage({ bookOk: book.ok, bookCount: book.count, ammOk: amm.ok });
  return {
    rank: token.rank,
    currency: token.currency,
    displayCurrency: token.displayCurrency,
    issuer: token.issuer,
    exitCoverage,
    checkedAt: observedAt,
    book: {
      ok: book.ok,
      offersCount: book.count,
      endpoint: book.endpoint,
      elapsedMs: book.elapsedMs,
      error: book.error,
    },
    amm: {
      ok: amm.ok,
      endpoint: amm.endpoint,
      elapsedMs: amm.elapsedMs,
      error: amm.error,
    },
  };
}

async function probeBook(token) {
  const payload = {
    method: 'book_offers',
    params: [
      {
        taker_gets: { currency: token.currency, issuer: token.issuer },
        taker_pays: { currency: 'XRP' },
        limit: 10,
      },
    ],
  };
  const rpc = await hedgedRpcCall(payload);
  const result = rpc.result?.json?.result;
  const rpcError = rpc.result?.json?.error || result?.error || rpc.result?.error || null;
  const offers = Array.isArray(result?.offers) ? result.offers : [];
  return {
    ok: !rpcError && offers.length > 0,
    count: offers.length,
    endpoint: rpc.endpoint,
    elapsedMs: rpc.result?.elapsedMs || 0,
    error: rpcError,
  };
}

async function probeAmm(token) {
  const payload = {
    method: 'amm_info',
    params: [
      {
        asset: { currency: token.currency, issuer: token.issuer },
        asset2: { currency: 'XRP' },
      },
    ],
  };
  const rpc = await hedgedRpcCall(payload);
  const result = rpc.result?.json?.result;
  const rpcError = rpc.result?.json?.error || result?.error || rpc.result?.error || null;
  const amm = result?.amm || null;
  return {
    ok: !!amm && !rpcError,
    endpoint: rpc.endpoint,
    elapsedMs: rpc.result?.elapsedMs || 0,
    error: rpcError,
  };
}

async function hedgedRpcCall(payload) {
  const attempts = [];
  for (const endpoint of RPC_ENDPOINTS) {
    const result = await fetchJsonWithTimeout(endpoint, payload, 6500);
    attempts.push({ endpoint, ok: result.ok, status: result.status, elapsedMs: result.elapsedMs, error: result.error || null });
    const hasRpcShape = result?.json && (result.json.result || result.json.error);
    if (result.ok || hasRpcShape) return { endpoint, result, attempts };
  }
  return { endpoint: '', result: { ok: false, status: 0, elapsedMs: 0, error: 'all_failed', json: null }, attempts };
}

async function fetchJsonWithTimeout(url, payload, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { _invalidJson: true, _raw: text.slice(0, 200) };
    }
    return { ok: response.ok, status: response.status, elapsedMs: Math.round(performance.now() - started), json };
  } catch (error) {
    return { ok: false, status: 0, elapsedMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error), json: null };
  } finally {
    clearTimeout(timeout);
  }
}

function classifyExitCoverage({ bookOk, bookCount, ammOk }) {
  const hasBook = !!bookOk && bookCount > 0;
  const hasAmm = !!ammOk;
  if (hasBook && hasAmm) return 'dual';
  if (hasBook) return 'book-only';
  if (hasAmm) return 'amm-only';
  return 'none';
}

function buildReport({ startedAt, finishedAt, inputPath, limit, rows }) {
  const summary = {
    checked: rows.length,
    dual: rows.filter((row) => row.exitCoverage === 'dual').length,
    bookOnly: rows.filter((row) => row.exitCoverage === 'book-only').length,
    ammOnly: rows.filter((row) => row.exitCoverage === 'amm-only').length,
    none: rows.filter((row) => row.exitCoverage === 'none').length,
    errors: rows.filter((row) => row.book.error || row.amm.error).length,
  };
  return {
    startedAt,
    finishedAt,
    sourceSnapshot: path.relative(process.cwd(), inputPath),
    limit,
    rpcEndpoints: RPC_ENDPOINTS,
    summary,
    rows,
  };
}

function buildPatch({ startedAt, finishedAt, rows }) {
  return {
    generatedAt: finishedAt,
    source: 'token-heatmap-exit-top20-probe',
    note: 'Probe output only. Review before merging into token heatmap snapshot generation.',
    coverage: rows.map((row) => ({
      currency: row.currency,
      displayCurrency: row.displayCurrency,
      issuer: row.issuer,
      exitCoverage: row.exitCoverage,
      exitCoverageCheckedAt: row.checkedAt,
      exitCoverageSource: 'xrpl-rpc-book-offers-amm-info',
    })),
    meta: {
      startedAt,
      finishedAt,
      checked: rows.length,
    },
  };
}

function normalizeToken(token, rank) {
  if (!token || typeof token !== 'object') return null;
  const currency = String(token.currency || '').trim();
  const issuer = String(token.issuer || '').trim();
  if (!currency || !issuer) return null;
  return {
    rank,
    currency,
    displayCurrency: String(token.displayCurrency || token.currency || '').trim(),
    issuer,
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') out.input = argv[++i];
    else if (arg === '--output-dir') out.outputDir = argv[++i];
    else if (arg === '--limit') out.limit = argv[++i];
    else if (arg === '--delay-ms') out.delayMs = argv[++i];
  }
  return out;
}

function clampInt(value, min, max) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
});
