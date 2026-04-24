const BASE_DIR = 'data/flow-history';
// Canonical production history can still come from committed JSON.
// When XSIC_DB is bound, runtime history persistence prefers D1.
const MAX_PER_KEY = 200;
const FLOW_WARN_AFTER_MS = 90 * 60 * 1000;
const FLOW_STALE_AFTER_MS = 180 * 60 * 1000;
const memoryStore = globalThis.__xsicFlowAlertHistoryStore || new Map();
globalThis.__xsicFlowAlertHistoryStore = memoryStore;

let fsApiPromise = null;

async function getFsApi() {
  if (!fsApiPromise) {
    fsApiPromise = (async () => {
      try {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        return { fs, path };
      } catch {
        return null;
      }
    })();
  }
  return fsApiPromise;
}

function getBoundDb(env) {
  return env?.XSIC_DB || env?.DB || null;
}

function normalizeWindow(rawWindow) {
  if (rawWindow === '5m' || rawWindow === '1h' || rawWindow === '24h' || rawWindow === '7d') return rawWindow;
  return '1h';
}

function normalizePreset(rawPreset) {
  return String(rawPreset || 'exchanges').trim() || 'exchanges';
}

function sanitize(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function keyFor(preset, window) {
  const p = normalizePreset(preset);
  const w = normalizeWindow(window);
  return { preset: p, window: w, key: `${sanitize(p)}__${sanitize(w)}`, fileName: `${sanitize(p)}-${sanitize(w)}.json` };
}

function parseSnapshotText(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseTsMs(value) {
  if (value == null) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function summarizeFlowFreshness(latestTs, now = Date.now()) {
  const tsMs = parseTsMs(latestTs);
  if (!tsMs) {
    return {
      state: 'missing',
      ageMs: null,
      warnAfterMs: FLOW_WARN_AFTER_MS,
      staleAfterMs: FLOW_STALE_AFTER_MS,
      isWarning: true,
      isStale: true,
    };
  }

  const ageMs = Math.max(0, Number(now) - tsMs);
  const state = ageMs >= FLOW_STALE_AFTER_MS
    ? 'stale'
    : ageMs >= FLOW_WARN_AFTER_MS
      ? 'aging'
      : 'fresh';

  return {
    state,
    ageMs,
    warnAfterMs: FLOW_WARN_AFTER_MS,
    staleAfterMs: FLOW_STALE_AFTER_MS,
    isWarning: state !== 'fresh',
    isStale: state === 'stale',
  };
}

function withFreshness(snapshot) {
  if (!snapshot) return null;
  return {
    ...snapshot,
    freshness: summarizeFlowFreshness(snapshot.ts),
  };
}

async function readFileList(filePath) {
  const api = await getFsApi();
  if (!api) return null;
  try {
    const raw = await api.fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.snapshots)) return parsed.snapshots;
    if (Array.isArray(parsed?.recent)) return parsed.recent;
    return [];
  } catch {
    return null;
  }
}

async function writeFileList(filePath, payload) {
  const api = await getFsApi();
  if (!api) return false;
  try {
    await api.fs.mkdir(api.path.dirname(filePath), { recursive: true });
    await api.fs.writeFile(filePath, JSON.stringify(payload, null, 2));
    return true;
  } catch {
    return false;
  }
}

async function fileFor(resolved) {
  const api = await getFsApi();
  if (!api) return null;
  return api.path.join(process.cwd(), BASE_DIR, resolved.fileName);
}

function sortByTs(snapshots) {
  return [...snapshots].sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0));
}

async function readSnapshotsFromD1(db, resolved, limit = MAX_PER_KEY) {
  const stmt = db
    .prepare(`SELECT snapshot_json
      FROM flow_events
      WHERE preset = ?1 AND window_key = ?2
      ORDER BY ts DESC
      LIMIT ?3`)
    .bind(resolved.preset, resolved.window, Math.max(1, Math.min(MAX_PER_KEY, Number(limit) || MAX_PER_KEY)));
  const { results } = await stmt.all();
  return (results || [])
    .map((row) => parseSnapshotText(row.snapshot_json))
    .filter(Boolean)
    .reverse()
    .map(withFreshness);
}

async function readLatestFromD1(db, resolved, offset = 0) {
  const row = await db
    .prepare(`SELECT snapshot_json
      FROM flow_events
      WHERE preset = ?1 AND window_key = ?2
      ORDER BY ts DESC
      LIMIT 1 OFFSET ?3`)
    .bind(resolved.preset, resolved.window, offset)
    .first();
  return withFreshness(parseSnapshotText(row?.snapshot_json || null));
}

async function readSummaryFromD1(db, resolved) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS count, MIN(ts) AS oldestTs, MAX(ts) AS newestTs
      FROM flow_events
      WHERE preset = ?1 AND window_key = ?2`)
    .bind(resolved.preset, resolved.window)
    .first();

  const newestTs = row?.newestTs ?? null;
  return {
    count: Number(row?.count || 0),
    oldestTs: row?.oldestTs ?? null,
    newestTs,
    storageMode: 'd1',
    freshness: summarizeFlowFreshness(newestTs),
  };
}

async function readSnapshots(resolved, env) {
  const db = getBoundDb(env);
  if (db) {
    try {
      return await readSnapshotsFromD1(db, resolved);
    } catch {}
  }

  const mem = memoryStore.get(resolved.key);
  if (Array.isArray(mem)) return sortByTs(mem).map(withFreshness);

  const filePath = await fileFor(resolved);
  if (filePath) {
    const fileRows = await readFileList(filePath);
    if (Array.isArray(fileRows)) {
      memoryStore.set(resolved.key, sortByTs(fileRows));
      return sortByTs(fileRows).map(withFreshness);
    }
  }
  return [];
}

export async function readHistory(preset, window, env) {
  const resolved = keyFor(preset, window);
  const snapshots = await readSnapshots(resolved, env);
  return { ...resolved, snapshots };
}

export async function appendSnapshot(snapshot, env) {
  const resolved = keyFor(snapshot?.preset, snapshot?.window);
  const db = getBoundDb(env);

  if (db) {
    const snapshotJson = JSON.stringify({ ...snapshot, preset: resolved.preset, window: resolved.window });
    try {
      const latest = await readLatestFromD1(db, resolved, 0);
      if (latest && (latest.ts === snapshot?.ts || JSON.stringify(latest) === snapshotJson)) {
        return latest;
      }
      await db
        .prepare(`INSERT INTO flow_events (preset, window_key, ts, pair_key, snapshot_json)
          VALUES (?1, ?2, ?3, ?4, ?5)`)
        .bind(resolved.preset, resolved.window, Number(snapshot?.ts || Date.now()), null, snapshotJson)
        .run();
      return withFreshness(parseSnapshotText(snapshotJson));
    } catch {
      // fall through to memory/fs fallback
    }
  }

  const prev = await readSnapshots(resolved, env);
  const merged = sortByTs(prev.concat([{ ...snapshot, preset: resolved.preset, window: resolved.window }]));
  const trimmed = merged.slice(Math.max(0, merged.length - MAX_PER_KEY));
  memoryStore.set(resolved.key, trimmed);

  const filePath = await fileFor(resolved);
  if (filePath) {
    await writeFileList(filePath, { preset: resolved.preset, window: resolved.window, snapshots: trimmed });
  }

  return withFreshness(trimmed[trimmed.length - 1] || null);
}

export async function getLatestSnapshot(preset, window, env) {
  const resolved = keyFor(preset, window);
  const db = getBoundDb(env);
  if (db) {
    try {
      return await readLatestFromD1(db, resolved, 0);
    } catch {}
  }
  const { snapshots } = await readHistory(preset, window, env);
  return withFreshness(snapshots[snapshots.length - 1] || null);
}

export async function getPreviousSnapshot(preset, window, env) {
  const resolved = keyFor(preset, window);
  const db = getBoundDb(env);
  if (db) {
    try {
      return await readLatestFromD1(db, resolved, 1);
    } catch {}
  }
  const { snapshots } = await readHistory(preset, window, env);
  return snapshots.length >= 2 ? withFreshness(snapshots[snapshots.length - 2]) : null;
}

export async function getRecentSnapshots(preset, window, limit = 10, env) {
  const resolved = keyFor(preset, window);
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 10));
  const db = getBoundDb(env);
  if (db) {
    try {
      return await readSnapshotsFromD1(db, resolved, safeLimit);
    } catch {}
  }
  const { snapshots } = await readHistory(preset, window, env);
  return snapshots.slice(Math.max(0, snapshots.length - safeLimit)).map(withFreshness);
}

export async function getHistorySummary(preset, window, env) {
  const resolved = keyFor(preset, window);
  const db = getBoundDb(env);
  if (db) {
    try {
      return await readSummaryFromD1(db, resolved);
    } catch {}
  }
  const { snapshots } = await readHistory(preset, window, env);
  if (!snapshots.length) {
    return {
      count: 0,
      oldestTs: null,
      newestTs: null,
      storageMode: 'runtime-fallback',
      freshness: summarizeFlowFreshness(null),
    };
  }
  const newestTs = snapshots[snapshots.length - 1].ts;
  return {
    count: snapshots.length,
    oldestTs: snapshots[0].ts,
    newestTs,
    storageMode: 'runtime-fallback',
    freshness: summarizeFlowFreshness(newestTs),
  };
}
