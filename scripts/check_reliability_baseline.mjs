import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const requiredRoutes = [
  'index.html',
  'apps/index.html',
  'apps/sell-impact/index.html',
  'apps/liquidity-pulse/index.html',
  'apps/flow-alert/index.html',
  'apps/exit-coverage-map/index.html',
  'apps/exposure-graph/index.html',
  'apps/token-heatmap/index.html',
  'methods/index.html',
  'faq/index.html',
  'disclaimer/index.html',
  'credits/index.html',
  'donate/index.html',
];
const requiredApis = [
  'functions/api/ping.js',
  'functions/api/book-offers.js',
  'functions/api/amm-info.js',
  'functions/api/xrpl/amm-snapshot.js',
  'functions/api/xrpl/liquidity-history.js',
  'functions/api/xrpl/flow-history.js',
  'functions/api/xrpl/flow-snapshot.js',
];
const flowHistoryFiles = [
  'data/flow-history/exchanges-1h.json',
  'data/flow-history/exchanges-24h.json',
  'data/flow-history/exchanges-7d.json',
];
const failures = [];
let checks = 0;

function fail(message) {
  failures.push(message);
}

function exists(relative) {
  checks += 1;
  if (!fs.existsSync(path.join(root, relative))) fail(`missing required file: ${relative}`);
}

function parseJson(relative) {
  checks += 1;
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  } catch (error) {
    fail(`invalid JSON: ${relative}: ${error.message}`);
    return null;
  }
}

for (const file of [...requiredRoutes, ...requiredApis, ...flowHistoryFiles]) exists(file);
exists('apps/token-heatmap/token-heatmap-snapshot.json');
exists('scripts/audit-seo.mjs');

for (const file of requiredApis) {
  if (!fs.existsSync(path.join(root, file))) continue;
  checks += 1;
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail(`syntax check failed: ${file}: ${result.stderr.trim()}`);
}

for (const file of flowHistoryFiles) {
  if (!fs.existsSync(path.join(root, file))) continue;
  const payload = parseJson(file);
  if (!payload) continue;
  const requiredKeys = ['latest', 'previous', 'recent', 'deltaSummary', 'historyMeta'];
  for (const key of requiredKeys) {
    checks += 1;
    if (!(key in payload)) fail(`${file}: missing ${key}`);
  }
  checks += 1;
  if (!Array.isArray(payload.recent)) fail(`${file}: recent must be an array`);
  if (Array.isArray(payload.recent)) {
    checks += 1;
    if (Number(payload.historyMeta?.count) !== payload.recent.length) fail(`${file}: historyMeta.count mismatch`);
    for (let index = 1; index < payload.recent.length; index += 1) {
      checks += 1;
      if (Number(payload.recent[index - 1]?.ts) >= Number(payload.recent[index]?.ts)) {
        fail(`${file}: timestamps must be strictly ascending at index ${index}`);
        break;
      }
    }
  }
}

const heatmapPath = 'apps/token-heatmap/token-heatmap-snapshot.json';
if (fs.existsSync(path.join(root, heatmapPath))) {
  const payload = parseJson(heatmapPath);
  if (payload) {
    for (const key of ['snapshotVersion', 'generatedAt', 'source', 'status', 'items']) {
      checks += 1;
      if (!(key in payload)) fail(`${heatmapPath}: missing ${key}`);
    }
    checks += 1;
    if (!Array.isArray(payload.items) || payload.items.length === 0) fail(`${heatmapPath}: items must be a non-empty array`);
  }
}

function localTarget(fromFile, href) {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean || clean.startsWith('#') || clean.startsWith('http:') || clean.startsWith('https:') || clean.startsWith('mailto:') || clean.startsWith('tel:') || clean.startsWith('javascript:') || clean.startsWith('/api/')) return null;
  const relative = clean.startsWith('/') ? clean.slice(1) : path.join(path.dirname(fromFile), clean);
  const normalized = path.normalize(relative);
  if (normalized.endsWith('/')) return path.join(normalized, 'index.html');
  if (!path.extname(normalized)) return path.join(normalized, 'index.html');
  return normalized;
}

for (const file of requiredRoutes) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) continue;
  const html = fs.readFileSync(absolute, 'utf8');
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const target = localTarget(file, match[1]);
    if (!target) continue;
    checks += 1;
    if (!fs.existsSync(path.join(root, target))) fail(`${file}: broken local href ${match[1]} -> ${target}`);
  }
}

checks += 1;
const seo = spawnSync(process.execPath, ['scripts/audit-seo.mjs'], { cwd: root, encoding: 'utf8' });
if (seo.status !== 0) fail(`SEO audit failed:\n${seo.stdout}${seo.stderr}`);

if (failures.length > 0) {
  console.error(`Reliability baseline failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Reliability baseline passed (${checks} assertions).`);
