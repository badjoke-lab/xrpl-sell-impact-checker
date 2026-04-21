#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const BASE_URL = process.env.FLOW_HISTORY_BASE_URL || 'https://xsic.badjoke-lab.com';
const OUTPUT_DIR = path.join(process.cwd(), 'data/flow-history');
const MAX_RECENT = Number(process.env.FLOW_HISTORY_MAX_RECENT || 168);
// Primary observation windows: 1h baseline, 24h comparison, 7d trend.
// 5m remains supplemental and is intentionally excluded from default history writes.
const DEFAULT_TARGETS = [
  { preset: 'exchanges', window: '1h' },
  { preset: 'exchanges', window: '24h' },
  { preset: 'exchanges', window: '7d' },
];
const OPTIONAL_TARGETS = [
  { preset: 'whales', window: '1h' },
  { preset: 'ripple', window: '1h' },
];

const includeOptional = process.argv.includes('--include-optional');
const targets = includeOptional ? DEFAULT_TARGETS.concat(OPTIONAL_TARGETS) : DEFAULT_TARGETS;

function buildFileName(preset, window) {
  return `${sanitize(preset)}-${sanitize(window)}.json`;
}

function sanitize(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildDeltaSummary(latest, previous) {
  if (!latest || !previous) {
    return {
      inflowXrpDelta: null,
      outflowXrpDelta: null,
      netXrpDelta: null,
      matchedEventsDelta: null,
    };
  }

  return {
    inflowXrpDelta: asNumber(latest.summary?.inflowXrp) - asNumber(previous.summary?.inflowXrp),
    outflowXrpDelta: asNumber(latest.summary?.outflowXrp) - asNumber(previous.summary?.outflowXrp),
    netXrpDelta: asNumber(latest.summary?.netXrp) - asNumber(previous.summary?.netXrp),
    matchedEventsDelta: asNumber(latest.metrics?.matchedEvents) - asNumber(previous.metrics?.matchedEvents),
  };
}

function snapshotFingerprint(snapshot) {
  return JSON.stringify({
    preset: snapshot?.preset || null,
    window: snapshot?.window || null,
    stale: Boolean(snapshot?.stale),
    staleReason: snapshot?.staleReason || null,
    source: snapshot?.source || null,
    summary: snapshot?.summary || null,
    metrics: snapshot?.metrics || null,
    latestEvent: snapshot?.latestEvent || null,
    escrow: snapshot?.escrow || null,
    debugSummary: snapshot?.debugSummary || null,
  });
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  const sorted = rows
    .filter((row) => row && Number.isFinite(Number(row.ts)))
    .map((row) => ({ ...row, ts: Number(row.ts) }))
    .sort((a, b) => a.ts - b.ts);

  const deduped = [];
  for (const row of sorted) {
    const prev = deduped[deduped.length - 1];
    if (!prev) {
      deduped.push(row);
      continue;
    }
    const sameTs = Number(prev.ts) === Number(row.ts);
    const sameFingerprint = snapshotFingerprint(prev) === snapshotFingerprint(row);
    if (sameTs || sameFingerprint) continue;
    deduped.push(row);
  }

  return deduped;
}

function buildHistoryPayload(preset, window, rows, updatedAt = new Date().toISOString()) {
  const recent = normalizeRows(rows).slice(-MAX_RECENT);
  const latest = recent[recent.length - 1] || null;
  const previous = recent.length >= 2 ? recent[recent.length - 2] : null;

  return {
    latest,
    previous,
    recent,
    deltaSummary: buildDeltaSummary(latest, previous),
    historyMeta: {
      count: recent.length,
      oldestTs: recent[0]?.ts || null,
      newestTs: latest?.ts || null,
      preset,
      window,
      updatedAt: updatedAt || new Date().toISOString(),
    },
  };
}

async function readHistoryFile(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return buildHistoryPayload(
      parsed?.historyMeta?.preset || parsed?.latest?.preset || 'exchanges',
      parsed?.historyMeta?.window || parsed?.latest?.window || '1h',
      parsed?.recent || [],
      parsed?.historyMeta?.updatedAt || null,
    );
  } catch {
    return null;
  }
}

async function fetchSnapshot(preset, window) {
  const url = `${BASE_URL}/api/xrpl/flow-snapshot?preset=${encodeURIComponent(preset)}&window=${encodeURIComponent(window)}`;
  const response = await fetch(url, { headers: { 'user-agent': 'xsic-flow-history-updater/1.0' } });
  if (!response.ok) throw new Error(`snapshot fetch failed: ${response.status} ${response.statusText}`);
  const payload = await response.json();
  if (!payload?.ok || !payload?.snapshot) throw new Error('snapshot payload invalid');
  return payload.snapshot;
}

async function updateOneTarget(target) {
  const fileName = buildFileName(target.preset, target.window);
  const filePath = path.join(OUTPUT_DIR, fileName);
  const existing = await readHistoryFile(filePath);
  const snapshot = await fetchSnapshot(target.preset, target.window);

  const currentRecent = normalizeRows(existing?.recent || []);
  const latest = currentRecent[currentRecent.length - 1] || null;

  const duplicateTs = latest && Number(latest.ts) === Number(snapshot.ts);
  const duplicateFingerprint = latest && snapshotFingerprint(latest) === snapshotFingerprint(snapshot);

  const willAppend = !(duplicateTs || duplicateFingerprint);
  const nextRows = willAppend
    ? currentRecent.concat([{ ...snapshot, preset: target.preset, window: target.window }])
    : currentRecent;

  const nextPayload = buildHistoryPayload(
    target.preset,
    target.window,
    nextRows,
    willAppend ? new Date().toISOString() : (existing?.historyMeta?.updatedAt || new Date().toISOString()),
  );
  const beforeSerialized = JSON.stringify(existing || {}, null, 2);
  const afterSerialized = JSON.stringify(nextPayload, null, 2);
  const changed = beforeSerialized !== afterSerialized;

  if (changed) {
    await writeFile(filePath, `${afterSerialized}\n`, 'utf8');
  }

  return {
    target: `${target.preset}/${target.window}`,
    changed,
    duplicateTs,
    duplicateFingerprint,
    count: nextPayload.historyMeta.count,
  };
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const results = [];
  for (const target of targets) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await updateOneTarget(target);
      results.push({ ok: true, ...result });
    } catch (error) {
      results.push({ ok: false, target: `${target.preset}/${target.window}`, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
    }
  }

  for (const row of results) {
    if (row.ok) {
      console.log(`[ok] ${row.target} changed=${row.changed} count=${row.count} duplicateTs=${row.duplicateTs} duplicateContent=${row.duplicateFingerprint}`);
    } else {
      console.error(`[error] ${row.target} ${row.error}`);
    }
  }

  if (results.some((row) => !row.ok)) {
    process.exitCode = 1;
  }
}

main();
