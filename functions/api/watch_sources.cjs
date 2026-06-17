const SOURCE_REGISTRY = {
  dna_testnet_registry: {
    url: 'https://testnet.dnaprotocol.org/dna-anchors.json',
    group: 'primary',
    quality: 'strong',
    stability: 'stable',
    kind: 'json',
  },
  dna_verifier: {
    url: 'https://verifier.dnaprotocol.org/api/verify',
    group: 'primary',
    quality: 'unresolved',
    stability: 'stable',
    kind: 'html',
  },
  dna_zkbridge_dashboard: {
    url: 'https://zkbridge.dnaprotocol.org/api/dashboard',
    group: 'primary',
    quality: 'medium',
    stability: 'active',
    kind: 'json',
  },
  dna_zkbridge_transactions: {
    url: 'https://zkbridge.dnaprotocol.org/api/transactions',
    group: 'primary',
    quality: 'medium',
    stability: 'stable',
    kind: 'json',
  },
  ripple_zkp: {
    url: 'https://ripple.com/insights/the-next-phase-of-institutional-de-fi-on-xrpl',
    group: 'primary',
    quality: 'strong-ish-official',
    stability: 'low-change',
    kind: 'html',
  },
  xls96: {
    url: 'https://xls.xrpl.org/xls/XLS-0096-confidential-mpt.html',
    group: 'primary',
    quality: 'strong-ish-official',
    stability: 'stable',
    kind: 'html',
  },
  dna_home_volatile: {
    url: 'https://dnaprotocol.org/',
    group: 'secondary',
    quality: 'weak-volatile',
    stability: 'volatile',
    kind: 'html',
  },
};

const memory = globalThis.__xsicWatchSourceState || new Map();
globalThis.__xsicWatchSourceState = memory;

function compactWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = sortObject(value[key]);
    return out;
  }, {});
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function summarizeJson(name, value) {
  if (name === 'dna_testnet_registry') {
    const rows = Array.isArray(value) ? value : Array.isArray(value?.transactions) ? value.transactions : [];
    const ledgers = new Set(rows.map((row) => row?.ledger_index).filter(Boolean));
    return `transactions=${rows.length} ledgers=${ledgers.size} generated_at=${value?.generated_at || 'unknown'}`;
  }
  if (name === 'dna_zkbridge_dashboard') {
    return `recentProofs=${Array.isArray(value?.recentProofs) ? value.recentProofs.length : 0}`;
  }
  if (name === 'dna_zkbridge_transactions') {
    const rows = Array.isArray(value) ? value : Array.isArray(value?.transactions) ? value.transactions : [];
    return `transactions=${rows.length}`;
  }
  return 'structured JSON reachable';
}

function htmlTitle(text) {
  const match = String(text || '').match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? compactWhitespace(match[1]) : 'HTML source reachable';
}

async function checkSource(name, options = {}) {
  const definition = SOURCE_REGISTRY[name];
  if (!definition) return { name, ok: false, error: 'unknown_source' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs) || 8000);
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(definition.url, {
      headers: { accept: definition.kind === 'json' ? 'application/json,text/plain;q=0.8,*/*;q=0.5' : 'text/html,text/plain;q=0.8,*/*;q=0.5' },
      redirect: 'follow',
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    const raw = await response.text();
    let normalized;
    let summary;
    let structured = false;
    if (contentType.toLowerCase().includes('json') || definition.kind === 'json') {
      try {
        const parsed = JSON.parse(raw);
        normalized = JSON.stringify(sortObject(parsed));
        summary = summarizeJson(name, parsed);
        structured = true;
      } catch {
        normalized = compactWhitespace(raw);
        summary = 'Expected JSON but received non-JSON content';
      }
    } else {
      normalized = compactWhitespace(raw);
      summary = htmlTitle(raw);
    }
    const normalizedHash = await sha256(normalized);
    const previous = memory.get(name) || null;
    const changed = previous ? previous.normalizedHash !== normalizedHash : null;
    const result = {
      name,
      url: definition.url,
      sourceGroup: definition.group,
      quality: definition.quality,
      stability: definition.stability,
      primaryEligible: definition.group === 'primary',
      excludedFromPrimary: definition.group !== 'primary',
      checkedAt,
      httpOk: response.ok,
      httpStatus: response.status,
      contentType,
      structured,
      normalizedHash,
      changed,
      summary,
      unresolved: name === 'dna_verifier' && !structured,
    };
    memory.set(name, result);
    return result;
  } catch (error) {
    return {
      name,
      url: definition.url,
      sourceGroup: definition.group,
      quality: definition.quality,
      stability: definition.stability,
      primaryEligible: definition.group === 'primary',
      excludedFromPrimary: definition.group !== 'primary',
      checkedAt,
      httpOk: false,
      httpStatus: 0,
      contentType: '',
      structured: false,
      normalizedHash: null,
      changed: null,
      summary: 'Source fetch failed',
      unresolved: name === 'dna_verifier',
      error: error?.name === 'AbortError' ? 'upstream_timeout' : 'upstream_unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkSources(names) {
  const uniqueNames = [...new Set(names)].filter((name) => SOURCE_REGISTRY[name]);
  const sources = await Promise.all(uniqueNames.map((name) => checkSource(name)));
  const primary = sources.filter((source) => source.sourceGroup === 'primary');
  const secondary = sources.filter((source) => source.sourceGroup === 'secondary');
  const primaryAllOk = primary.length > 0 && primary.every((source) => source.httpOk);
  return {
    ok: primaryAllOk,
    checkedAt: new Date().toISOString(),
    sources,
    summary: {
      primaryCount: primary.length,
      secondaryCount: secondary.length,
      primaryAllOk,
      primaryAnyChanged: primary.some((source) => source.changed === true),
      secondaryAnyChanged: secondary.some((source) => source.changed === true),
      degraded: primary.some((source) => !source.httpOk),
    },
  };
}

module.exports = { SOURCE_REGISTRY, checkSource, checkSources, compactWhitespace, sortObject };
