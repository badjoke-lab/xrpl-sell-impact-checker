const BASE_DIR = 'data/flow-history';
const MAX_PER_KEY = 200;
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
  return { preset: p, window: w, key: `${sanitize(p)}__${sanitize(w)}` };
}

async function readFileList(filePath) {
  const api = await getFsApi();
  if (!api) return null;
  try {
    const raw = await api.fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.snapshots) ? parsed.snapshots : [];
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
  return api.path.join(process.cwd(), BASE_DIR, `${resolved.key}.json`);
}

function sortByTs(snapshots) {
  return [...snapshots].sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0));
}

async function readSnapshots(resolved) {
  const mem = memoryStore.get(resolved.key);
  if (Array.isArray(mem)) return sortByTs(mem);

  const filePath = await fileFor(resolved);
  if (filePath) {
    const fileRows = await readFileList(filePath);
    if (Array.isArray(fileRows)) {
      memoryStore.set(resolved.key, sortByTs(fileRows));
      return sortByTs(fileRows);
    }
  }
  return [];
}

export async function readHistory(preset, window) {
  const resolved = keyFor(preset, window);
  const snapshots = await readSnapshots(resolved);
  return { ...resolved, snapshots };
}

export async function appendSnapshot(snapshot) {
  const resolved = keyFor(snapshot?.preset, snapshot?.window);
  const prev = await readSnapshots(resolved);
  const merged = sortByTs(prev.concat([{ ...snapshot, preset: resolved.preset, window: resolved.window }]));
  const trimmed = merged.slice(Math.max(0, merged.length - MAX_PER_KEY));
  memoryStore.set(resolved.key, trimmed);

  const filePath = await fileFor(resolved);
  if (filePath) {
    await writeFileList(filePath, { preset: resolved.preset, window: resolved.window, snapshots: trimmed });
  }

  return trimmed[trimmed.length - 1] || null;
}

export async function getLatestSnapshot(preset, window) {
  const { snapshots } = await readHistory(preset, window);
  return snapshots[snapshots.length - 1] || null;
}

export async function getPreviousSnapshot(preset, window) {
  const { snapshots } = await readHistory(preset, window);
  return snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;
}

export async function getRecentSnapshots(preset, window, limit = 10) {
  const { snapshots } = await readHistory(preset, window);
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 10));
  return snapshots.slice(Math.max(0, snapshots.length - safeLimit));
}

export async function getHistorySummary(preset, window) {
  const { snapshots } = await readHistory(preset, window);
  if (!snapshots.length) return { count: 0, oldestTs: null, newestTs: null };
  return {
    count: snapshots.length,
    oldestTs: snapshots[0].ts,
    newestTs: snapshots[snapshots.length - 1].ts,
  };
}
