import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
let checks = 0;

const requiredFiles = [
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
  'functions/api/ping.js',
  'functions/api/book-offers.js',
  'functions/api/amm-info.js',
  'functions/api/xrpl/amm-snapshot.js',
  'functions/api/xrpl/liquidity-history.js',
  'functions/api/xrpl/flow-history.js',
  'functions/api/xrpl/flow-snapshot.js',
  'data/flow-history/exchanges-1h.json',
  'data/flow-history/exchanges-24h.json',
  'data/flow-history/exchanges-7d.json',
  'apps/token-heatmap/token-heatmap-snapshot.json',
  'scripts/audit-seo.mjs',
];

const apiFiles = requiredFiles.filter((file) => file.startsWith('functions/api/'));
const flowFiles = requiredFiles.filter((file) => file.startsWith('data/flow-history/'));

function absolute(relative) {
  return path.join(root, relative);
}

function assert(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function readJson(relative) {
  try {
    return JSON.parse(fs.readFileSync(absolute(relative), 'utf8'));
  } catch (error) {
    failures.push(`${relative}: invalid JSON: ${error.message}`);
    return null;
  }
}

for (const file of requiredFiles) assert(fs.existsSync(absolute(file)), `missing required file: ${file}`);

for (const file of apiFiles) {
  if (!fs.existsSync(absolute(file))) continue;
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  assert(result.status === 0, `${file}: syntax check failed: ${result.stderr.trim()}`);
}

for (const file of flowFiles) {
  if (!fs.existsSync(absolute(file))) continue;
  const payload = readJson(file);
  if (!payload) continue;
  for (const key of ['latest', 'previous', 'recent', 'deltaSummary', 'historyMeta']) {
    assert(Object.hasOwn(payload, key), `${file}: missing ${key}`);
  }
  assert(Array.isArray(payload.recent), `${file}: recent must be an array`);
  if (!Array.isArray(payload.recent)) continue;
  assert(Number(payload.historyMeta?.count) === payload.recent.length, `${file}: historyMeta.count mismatch`);
  const ordered = payload.recent.every((row, index, rows) => index === 0 || Number(rows[index - 1]?.ts) < Number(row?.ts));
  assert(ordered, `${file}: recent timestamps must be strictly ascending`);
}

const heatmapFile = 'apps/token-heatmap/token-heatmap-snapshot.json';
if (fs.existsSync(absolute(heatmapFile))) {
  const payload = readJson(heatmapFile);
  if (payload) {
    for (const key of ['snapshotVersion', 'generatedAt', 'source', 'status', 'items']) {
      assert(Object.hasOwn(payload, key), `${heatmapFile}: missing ${key}`);
    }
    assert(Array.isArray(payload.items) && payload.items.length > 0, `${heatmapFile}: items must be a non-empty array`);
  }
}

const expectedLinks = {
  'index.html': ['/apps/', '/methods/', '/donate/'],
  'apps/index.html': ['/apps/sell-impact/', '/apps/liquidity-pulse/', '/apps/flow-alert/', '/apps/exit-coverage-map/', '/apps/exposure-graph/'],
};
for (const [file, links] of Object.entries(expectedLinks)) {
  if (!fs.existsSync(absolute(file))) continue;
  const html = fs.readFileSync(absolute(file), 'utf8');
  for (const link of links) assert(html.includes(`href="${link}"`) || html.includes(`href='${link}'`), `${file}: missing critical link ${link}`);
}

const seo = spawnSync(process.execPath, ['scripts/audit-seo.mjs'], { cwd: root, encoding: 'utf8' });
assert(seo.status === 0, `SEO audit failed:\n${seo.stdout}${seo.stderr}`);

if (failures.length > 0) {
  console.error(`Reliability baseline failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Reliability baseline passed (${checks} assertions).`);
