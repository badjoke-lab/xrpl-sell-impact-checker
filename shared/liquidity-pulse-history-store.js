const BASE_DIR = 'data/liquidity-pulse-history';
const MAX_PER_KEY = 720;
const D1_METRIC_PREFIX = 'liquidity-pulse';
const memoryStore = globalThis.__xsicLiquidityPulseHistoryStore || new Map();
globalThis.__xsicLiquidityPulseHistoryStore = memoryStore;

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

function normalizePool(rawPool) {
  return String(rawPool || 'xrp-rlusd').trim() || 'xrp-rlusd';
}

function sanitize(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function keyFor(pool) {
  const resolvedPool = normalizePool(pool);
  return {
    pool: resolvedPool,
    key: sanitize(resolvedPool),
    fileName: `${sanitize(resolvedPool)}.json`,
  };
}

function metricKeyFor(resolved) {
  return `${D1_METRIC_PREFIX}:${resolved.key}`;
}

async function readFileList(filePath) {
  const api = await getFsApi();
  if (!api) return null;
  try {
    const raw = await api.fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.snapshots)) return parsed.snapshots;
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

function toTs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBucketTs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function sortByTs(rows) {
  return [...rows].sort((a, b) => toTs(a?.ts) - toTs(b?.ts));
}

function toFiniteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSnapshotForStore(snapshot, resolved) {
  return {
    ...snapshot,
    pool: resolved.pool,
    ts: toBucketTs(snapshot?.ts),
  };
}

function parseSnapshotJson(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function snapshotsEquivalent(a, b) {
  if (!a || !b) return false;

  return (
    toFiniteOrNull(a?.price) === toFiniteOrNull(b?.price) &&
    toFiniteOrNull(a?.liquidityUsd) === toFiniteOrNull(b?.liquidityUsd) &&
    toFiniteOrNull(a?.reserves?.a) === toFiniteOrNull(b?.reserves?.a) &&
    toFiniteOrNull(a?.reserves?.b) === toFiniteOrNull(b?.reserves?.b) &&
    Boolean(a?.stale) === Boolean(b?.stale) &&
    String(a?.source || '') === String(b?.source || '')
  );
}

async function readD1Snapshots(resolved, env, limit = MAX_PER_KEY) {
  const db = getBoundDb(env);
  if (!db) return null;
  const safeLimit = Math.max(1, Math.min(2000, Number(limit) || MAX_PER_KEY));
  const { results } = await db
    .prepare(`SELECT bucket_ts, value_json
      FROM metric_hourly
      WHERE metric_key = ?1
      ORDER BY bucket_ts DESC
      LIMIT ?2`)
    .bind(metricKeyFor(resolved), safeLimit)
    .all();

  const rows = (results || [])
    .map((row) => parseSnapshotJson(row.value_json))
    .filter(Boolean);

  return sortByTs(rows);
}

async function readSnapshots(resolved, env) {
  const d1Rows = await readD1Snapshots(resolved, env, MAX_PER_KEY);
  if (Array.isArray(d1Rows)) return d1Rows;

  const mem = memoryStore.get(resolved.key);
  if (Array.isArray(mem)) return sortByTs(mem);

  const filePath = await fileFor(resolved);
  if (filePath) {
    const fileRows = await readFileList(filePath);
    if (Array.isArray(fileRows)) {
      const sorted = sortByTs(fileRows);
      memoryStore.set(resolved.key, sorted);
      return sorted;
    }
  }

  return [];
}

async function appendD1Snapshot(snapshot, resolved, env) {
  const db = getBoundDb(env);
  if (!db) return null;

  const incoming = normalizeSnapshotForStore(snapshot, resolved);
  const latest = await getLatestSnapshot(resolved.pool, env);
  if (snapshotsEquivalent(latest, incoming)) return latest;

  const metricKey = metricKeyFor(resolved);
  const bucketTs = toBucketTs(incoming.ts);
  const valueJson = JSON.stringify(incoming);

  await db
    .prepare(`INSERT INTO metric_hourly (metric_key, bucket_ts, value_json, updated_at)
      VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
      ON CONFLICT(metric_key, bucket_ts) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = CURRENT_TIMESTAMP`)
    .bind(metricKey, bucketTs, valueJson)
    .run();

  await db
    .prepare(`DELETE FROM metric_hourly
      WHERE metric_key = ?1
        AND bucket_ts NOT IN (
          SELECT bucket_ts
          FROM metric_hourly
          WHERE metric_key = ?1
          ORDER BY bucket_ts DESC
          LIMIT ?2
        )`)
    .bind(metricKey, MAX_PER_KEY)
    .run();

  return incoming;
}

export async function readHistory(pool, env) {
  const resolved = keyFor(pool);
  const snapshots = await readSnapshots(resolved, env);
  return { ...resolved, snapshots, source: getBoundDb(env) ? 'd1' : 'runtime-fallback' };
}

export async function appendSnapshot(snapshot, env) {
  const resolved = keyFor(snapshot?.pool);
  const d1Result = await appendD1Snapshot(snapshot, resolved, env);
  if (d1Result) return d1Result;

  const prev = await readSnapshots(resolved, env);
  const incoming = normalizeSnapshotForStore(snapshot, resolved);

  const latest = prev[prev.length - 1] || null;
  if (snapshotsEquivalent(latest, incoming)) {
    return latest;
  }

  const merged = sortByTs(prev.concat([incoming]));
  const trimmed = merged.slice(Math.max(0, merged.length - MAX_PER_KEY));
  memoryStore.set(resolved.key, trimmed);

  const filePath = await fileFor(resolved);
  if (filePath) {
    await writeFileList(filePath, { pool: resolved.pool, snapshots: trimmed });
  }

  return trimmed[trimmed.length - 1] || null;
}

export async function getLatestSnapshot(pool, env) {
  const resolved = keyFor(pool);
  const db = getBoundDb(env);
  if (db) {
    const row = await db
      .prepare(`SELECT value_json
        FROM metric_hourly
        WHERE metric_key = ?1
        ORDER BY bucket_ts DESC
        LIMIT 1`)
      .bind(metricKeyFor(resolved))
      .first();
    const parsed = parseSnapshotJson(row?.value_json);
    if (parsed) return parsed;
  }

  const { snapshots } = await readHistory(pool, env);
  return snapshots[snapshots.length - 1] || null;
}

export async function getRecentSnapshots(pool, limit = 60, env) {
  const resolved = keyFor(pool);
  const d1Rows = await readD1Snapshots(resolved, env, limit);
  if (Array.isArray(d1Rows)) return d1Rows;

  const { snapshots } = await readHistory(pool, env);
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 60));
  return snapshots.slice(Math.max(0, snapshots.length - safeLimit));
}

export async function getHistorySummary(pool, env) {
  const resolved = keyFor(pool);
  const db = getBoundDb(env);
  if (db) {
    const row = await db
      .prepare(`SELECT COUNT(*) AS count,
        MIN(bucket_ts) AS oldestTs,
        MAX(bucket_ts) AS newestTs
        FROM metric_hourly
        WHERE metric_key = ?1`)
      .bind(metricKeyFor(resolved))
      .first();

    return {
      count: Number(row?.count || 0),
      oldestTs: row?.oldestTs || null,
      newestTs: row?.newestTs || null,
      source: 'd1',
    };
  }

  const { snapshots } = await readHistory(pool, env);
  if (!snapshots.length) return { count: 0, oldestTs: null, newestTs: null, source: 'runtime-fallback' };
  return {
    count: snapshots.length,
    oldestTs: snapshots[0].ts,
    newestTs: snapshots[snapshots.length - 1].ts,
    source: 'runtime-fallback',
  };
}
