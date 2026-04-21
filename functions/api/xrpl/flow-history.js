import { buildDeltaSummary } from '../../../shared/flow-alert-history.js';
import {
  getLatestSnapshot,
  getPreviousSnapshot,
  getRecentSnapshots,
  getHistorySummary,
} from '../../../shared/flow-alert-history-store.js';

const PRIMARY_HISTORY_WINDOWS = new Set(['1h', '24h', '7d']);

function sanitize(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function historyFileName(preset, window) {
  return `${sanitize(preset)}-${sanitize(window)}.json`;
}

function resolveBaseUrl(request) {
  if (!request) return null;
  try {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function normalizeStaticPayload(payload, preset, window, limit) {
  const recentAll = Array.isArray(payload?.recent) ? payload.recent : [];
  const recent = recentAll.slice(Math.max(0, recentAll.length - limit));
  const latest = payload?.latest || recent[recent.length - 1] || null;
  const previous = payload?.previous || (recent.length >= 2 ? recent[recent.length - 2] : null);
  const deltaSummary = payload?.deltaSummary || buildDeltaSummary(latest, previous);
  const historyMeta = {
    count: payload?.historyMeta?.count ?? recentAll.length,
    oldestTs: payload?.historyMeta?.oldestTs ?? recentAll[0]?.ts ?? null,
    newestTs: payload?.historyMeta?.newestTs ?? latest?.ts ?? null,
    preset: payload?.historyMeta?.preset || preset,
    window: payload?.historyMeta?.window || window,
    updatedAt: payload?.historyMeta?.updatedAt || null,
    storageMode: 'repo-json',
  };

  return {
    latest,
    previous,
    recent,
    deltaSummary,
    historyMeta,
  };
}

async function readStaticHistory(request, preset, window, limit) {
  const baseUrl = resolveBaseUrl(request);
  if (!baseUrl) return null;
  const fileName = historyFileName(preset, window);

  try {
    const response = await fetch(`${baseUrl}/data/flow-history/${fileName}`, {
      headers: { 'cache-control': 'no-cache' },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return normalizeStaticPayload(payload, preset, window, limit);
  } catch {
    return null;
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function normalizeWindow(rawWindow) {
  if (rawWindow === '5m' || rawWindow === '1h' || rawWindow === '24h' || rawWindow === '7d') return rawWindow;
  return '1h';
}

function resolveLimit(rawLimit) {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const preset = url.searchParams.get('preset') || 'exchanges';
  const window = normalizeWindow(url.searchParams.get('window'));
  const limit = resolveLimit(url.searchParams.get('limit'));
  const shouldUseRepoHistory = PRIMARY_HISTORY_WINDOWS.has(window);

  const staticHistory = shouldUseRepoHistory
    ? await readStaticHistory(request, preset, window, limit)
    : null;

  if (staticHistory) {
    const recentNetSeries = staticHistory.recent.map((row) => ({ ts: row.ts, netXrp: row.summary?.netXrp ?? 0 }));
    const recentEventCountSeries = staticHistory.recent.map((row) => ({ ts: row.ts, matchedEvents: row.metrics?.matchedEvents ?? 0 }));

    return json({
      ok: true,
      preset,
      window,
      latest: staticHistory.latest,
      previous: staticHistory.previous,
      recent: staticHistory.recent,
      deltaSummary: staticHistory.deltaSummary,
      recentNetSeries,
      recentEventCountSeries,
      historyMeta: staticHistory.historyMeta,
      source: 'repo-json',
      historyMode: 'primary',
    });
  }

  const [latest, previous, recent, historyMeta] = await Promise.all([
    getLatestSnapshot(preset, window, env),
    getPreviousSnapshot(preset, window, env),
    getRecentSnapshots(preset, window, limit, env),
    getHistorySummary(preset, window, env),
  ]);

  const deltaSummary = buildDeltaSummary(latest, previous);
  const recentNetSeries = recent.map((row) => ({ ts: row.ts, netXrp: row.summary?.netXrp ?? 0 }));
  const recentEventCountSeries = recent.map((row) => ({ ts: row.ts, matchedEvents: row.metrics?.matchedEvents ?? 0 }));
  const storageMode = historyMeta?.storageMode || 'runtime-fallback';

  return json({
    ok: true,
    preset,
    window,
    latest,
    previous,
    recent,
    deltaSummary,
    recentNetSeries,
    recentEventCountSeries,
    historyMeta,
    source: storageMode,
    historyMode: shouldUseRepoHistory ? 'primary' : 'supplemental-live',
  });
}
