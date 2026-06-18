const BASE_URL = (process.env.XSIC_BASE_URL || 'https://xsic.badjoke-lab.com').replace(/\/$/, '');
const ATTEMPTS = Number(process.env.XSIC_SMOKE_ATTEMPTS || 4);
const RETRY_MS = Number(process.env.XSIC_SMOKE_RETRY_MS || 10000);
const TIMEOUT_MS = Number(process.env.XSIC_SMOKE_TIMEOUT_MS || 15000);

const staticChecks = [
  ['/', 'XRPL Signal & Insight Console'],
  ['/apps/', 'XSIC Apps'],
  ['/apps/sell-impact/', 'Sell Impact'],
  ['/apps/liquidity-pulse/', 'Liquidity Pulse'],
  ['/apps/flow-alert/', 'Flow Alert'],
  ['/apps/exit-coverage-map/', 'Exit Coverage Map'],
  ['/apps/exposure-graph/', 'Exposure Graph'],
  ['/apps/token-heatmap/', 'XRPL Token Heatmap'],
  ['/apps/privacy-zk-watch/', 'XRPL Privacy / ZK Watch'],
  ['/apps/proof-anchor-checker/', 'Proof Anchor Checker'],
  ['/apps/institutional-readiness-radar/', 'Institutional Readiness Radar'],
  ['/methods/', 'Methods'],
  ['/donate/', 'Donate'],
];

const apiChecks = [
  { path: '/api/ping', statuses: [200] },
  { path: '/api/health', statuses: [200, 207] },
  { path: '/api/health-watchers', statuses: [200, 207] },
  { path: '/api/watch-sources?group=privacy', statuses: [200, 207] },
  { path: '/api/exit-coverage?preset=baseline', statuses: [200] },
  { path: '/api/proof-anchor?input=67fe39b1', statuses: [200, 503] },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path) {
  let lastError = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        redirect: 'follow',
        headers: { accept: path.startsWith('/api/') ? 'application/json' : 'text/html' },
        signal: controller.signal,
      });
      const body = await response.text();
      return { response, body, attempt };
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) await sleep(RETRY_MS);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error(`request_failed:${path}`);
}

const failures = [];
const results = [];

for (const [path, marker] of staticChecks) {
  try {
    const { response, body, attempt } = await request(path);
    const type = response.headers.get('content-type') || '';
    const ok = response.status === 200 && type.toLowerCase().includes('text/html') && body.includes(marker);
    results.push({ path, status: response.status, type, attempt, marker, ok });
    if (!ok) failures.push(`${path}: expected 200 text/html containing ${JSON.stringify(marker)}, received ${response.status} ${type}`);
  } catch (error) {
    failures.push(`${path}: ${error?.message || 'request_failed'}`);
  }
}

for (const check of apiChecks) {
  try {
    const { response, body, attempt } = await request(check.path);
    const type = response.headers.get('content-type') || '';
    let payload = null;
    try {
      payload = JSON.parse(body);
    } catch {}
    const statusOk = check.statuses.includes(response.status);
    const jsonOk = type.toLowerCase().includes('application/json') && payload && typeof payload === 'object';
    let contractOk = true;

    if (check.path.startsWith('/api/health')) {
      contractOk = typeof payload?.status === 'string' || typeof payload?.ok === 'boolean';
    }
    if (check.path.startsWith('/api/exit-coverage')) {
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      const states = new Set(['dual', 'book-only', 'amm-only', 'none']);
      contractOk = rows.length > 0
        && rows.every((row) => states.has(row.state))
        && rows.every((row) => typeof row.sellImpactUrl === 'string' && row.sellImpactUrl.includes('/apps/sell-impact/'));
    }
    if (check.path.startsWith('/api/proof-anchor')) {
      contractOk = payload?.statuses && payload?.linkage && payload?.verifier;
    }

    const ok = statusOk && jsonOk && Boolean(contractOk);
    results.push({ path: check.path, status: response.status, type, attempt, ok });
    if (!ok) failures.push(`${check.path}: unexpected response status/type/contract (${response.status} ${type})`);
  } catch (error) {
    failures.push(`${check.path}: ${error?.message || 'request_failed'}`);
  }
}

console.log(JSON.stringify({ baseUrl: BASE_URL, checkedAt: new Date().toISOString(), results, failures }, null, 2));

if (failures.length) process.exit(1);
