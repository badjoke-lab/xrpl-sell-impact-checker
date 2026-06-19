const baseUrl = String(process.env.XSIC_BASE_URL || 'https://xsic.badjoke-lab.com').replace(/\/$/, '');
const range = Number(process.env.XSIC_USAGE_RANGE || 7);
const timeoutMs = Number(process.env.XSIC_REPORT_TIMEOUT_MS || 10000);

async function read(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { accept: 'application/json', 'x-xsic-synthetic': '1' },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch {}
    return { path, status: response.status, ok: response.ok, payload };
  } catch (error) {
    return { path, status: null, ok: false, error: error?.message || 'request_failed' };
  } finally {
    clearTimeout(timer);
  }
}

const [usage, coreHealth, watcherHealth, retention] = await Promise.all([
  read(`/api/usage-summary?range=${range}`),
  read('/api/health'),
  read('/api/health-watchers'),
  read('/api/retention-policy'),
]);

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  rangeDays: range,
  usage,
  operations: { coreHealth, watcherHealth, retention },
  interpretation: {
    usageAndHealthAreSeparate: true,
    zeroUsageIsNotAnOutage: true,
    unavailableUsageIsNotZero: true,
  },
};

console.log(JSON.stringify(report, null, 2));
if (![7, 30].includes(range)) process.exit(1);
