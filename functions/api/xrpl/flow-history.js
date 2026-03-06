import { buildDeltaSummary } from '../../../shared/flow-alert-history.js';
import {
  getLatestSnapshot,
  getPreviousSnapshot,
  getRecentSnapshots,
  getHistorySummary,
} from '../../../shared/flow-alert-history-store.js';

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

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const preset = url.searchParams.get('preset') || 'exchanges';
  const window = normalizeWindow(url.searchParams.get('window'));
  const limit = resolveLimit(url.searchParams.get('limit'));

  const [latest, previous, recent, historyMeta] = await Promise.all([
    getLatestSnapshot(preset, window),
    getPreviousSnapshot(preset, window),
    getRecentSnapshots(preset, window, limit),
    getHistorySummary(preset, window),
  ]);

  const deltaSummary = buildDeltaSummary(latest, previous);
  const recentNetSeries = recent.map((row) => ({ ts: row.ts, netXrp: row.summary?.netXrp ?? 0 }));
  const recentEventCountSeries = recent.map((row) => ({ ts: row.ts, matchedEvents: row.metrics?.matchedEvents ?? 0 }));

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
  });
}
