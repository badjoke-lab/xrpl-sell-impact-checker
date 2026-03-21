const BASE_DIR = 'data/liquidity-pulse-history';
const MAX_PER_KEY = 720;
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

function sortByTs(rows) {
  return [...rows].sort((a, b) => toTs(a?.ts) - toTs(b?.ts));
}

async function readSnapshots(resolved) {
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

export async function readHistory(pool) {
  const resolved = keyFor(pool);
  const snapshots = await readSnapshots(resolved);
  return { ...resolved, snapshots };
}

export async function appendSnapshot(snapshot) {
  const resolved = keyFor(snapshot?.pool);
  const prev = await readSnapshots(resolved);
  const merged = sortByTs(
    prev.concat([
      {
        ...snapshot,
        pool: resolved.pool,
      },
    ]),
  );
  const trimmed = merged.slice(Math.max(0, merged.length - MAX_PER_KEY));
  memoryStore.set(resolved.key, trimmed);

  const filePath = await fileFor(resolved);
  if (filePath) {
    await writeFileList(filePath, { pool: resolved.pool, snapshots: trimmed });
  }

  return trimmed[trimmed.length - 1] || null;
}

export async function getLatestSnapshot(pool) {
  const { snapshots } = await readHistory(pool);
  return snapshots[snapshots.length - 1] || null;
}

export async function getRecentSnapshots(pool, limit = 60) {
  const { snapshots } = await readHistory(pool);
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 60));
  return snapshots.slice(Math.max(0, snapshots.length - safeLimit));
}

export async function getHistorySummary(pool) {
  const { snapshots } = await readHistory(pool);
  if (!snapshots.length) return { count: 0, oldestTs: null, newestTs: null };
  return {
    count: snapshots.length,
    oldestTs: snapshots[0].ts,
    newestTs: snapshots[snapshots.length - 1].ts,
  };
}
