const watcher = require('./watch_sources.cjs');

const SOURCES = {
  anchors: 'https://testnet.dnaprotocol.org/dna-anchors.json',
  dashboard: 'https://zkbridge.dnaprotocol.org/api/dashboard',
  transactions: 'https://zkbridge.dnaprotocol.org/api/transactions',
};

function extractInput(raw) {
  const text = String(raw || '').trim();
  const hash = text.match(/\b[A-Fa-f0-9]{64}\b/)?.[0]?.toUpperCase() || null;
  const uuid = text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)?.[0] || null;
  const proofId = text.match(/\b[0-9a-f]{8}\b/i)?.[0]?.toLowerCase() || null;
  return { raw: text, hash, uuid, proofId, type: hash ? 'xrpl-hash' : uuid ? 'proof-uuid' : proofId ? 'proof-id' : text ? 'raw-text' : 'empty' };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'follow', signal: controller.signal });
    const type = response.headers.get('content-type') || '';
    const text = await response.text();
    if (!response.ok) return { ok: false, status: response.status, error: `http_${response.status}`, data: null };
    if (!type.toLowerCase().includes('json')) return { ok: false, status: response.status, error: 'non_json_response', data: null };
    try {
      return { ok: true, status: response.status, error: null, data: JSON.parse(text) };
    } catch {
      return { ok: false, status: response.status, error: 'invalid_json', data: null };
    }
  } catch (error) {
    return { ok: false, status: 0, error: error?.name === 'AbortError' ? 'upstream_timeout' : 'upstream_unreachable', data: null };
  } finally {
    clearTimeout(timer);
  }
}

function rowsFrom(value, candidateKeys) {
  if (Array.isArray(value)) return value;
  for (const key of candidateKeys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function upperHash(value) {
  const text = String(value || '').trim().toUpperCase();
  return /^[A-F0-9]{64}$/.test(text) ? text : null;
}

function truncatedPrefix(value) {
  const text = String(value || '').toUpperCase().replace(/[^A-F0-9]/g, '');
  return text.length >= 8 ? text.slice(0, Math.min(16, text.length)) : null;
}

function findChainRecord(rows, input) {
  if (!input.hash) return null;
  return rows.find((row) => upperHash(row?.hash || row?.txHash || row?.transaction_hash) === input.hash) || null;
}

function proofIdentity(row) {
  return {
    id: row?.id || row?.uuid || null,
    proofId: row?.proofId || row?.proof_id || null,
    status: row?.status || null,
    scope: row?.scope || row?.proofType || row?.proof_type || null,
    createdAt: row?.createdAt || row?.created_at || row?.timestamp || null,
    verifiedAt: row?.verifiedAt || row?.verified_at || null,
    anchoredAt: row?.anchoredAt || row?.anchored_at || null,
    txHashDisplay: row?.txHash || row?.tx_hash || null,
    nullifierDisplay: row?.nullifier || null,
    commitmentDisplay: row?.commitment || row?.merkleRoot || null,
  };
}

function findProofRecord(rows, input) {
  const normalized = rows.map((row) => ({ raw: row, view: proofIdentity(row) }));
  if (input.uuid) return normalized.find(({ view }) => String(view.id || '').toLowerCase() === input.uuid.toLowerCase()) || null;
  if (input.proofId) return normalized.find(({ view }) => String(view.proofId || '').toLowerCase() === input.proofId.toLowerCase()) || null;
  if (input.hash) return normalized.find(({ view }) => upperHash(view.txHashDisplay) === input.hash) || null;
  const raw = input.raw.toLowerCase();
  return normalized.find(({ view }) => [view.id, view.proofId].some((value) => value && raw.includes(String(value).toLowerCase()))) || null;
}

function chainView(row) {
  if (!row) return null;
  return {
    hash: upperHash(row.hash || row.txHash || row.transaction_hash),
    ledgerIndex: row.ledger_index ?? row.ledgerIndex ?? null,
    validated: row.validated ?? null,
    transactionType: row.transaction_type || row.TransactionType || 'Payment',
    transactionResult: row.transaction_result || row.meta?.TransactionResult || null,
    account: row.account || row.Account || null,
    sequence: row.sequence || row.Sequence || null,
    feeXrp: row.fee_xrp || row.feeXrp || null,
    explorerUrl: row.explorer_url || row.explorerUrl || null,
    localUrl: row.local_url || row.localUrl || null,
    profile: row.profile || null,
    batchId: row.batch_id || row.batchId || null,
  };
}

function linkage(chain, proof, chainRows) {
  const proofFullHash = upperHash(proof?.view?.txHashDisplay);
  const direct = Boolean(chain?.hash && proofFullHash && chain.hash === proofFullHash);
  const prefix = truncatedPrefix(proof?.view?.txHashDisplay);
  const prefixMatches = prefix ? chainRows.filter((row) => upperHash(row?.hash || row?.txHash || row?.transaction_hash)?.startsWith(prefix)).length : 0;
  const strongJoinKeyFound = direct;
  return {
    strongJoinKeyFound,
    directFullHashMatch: direct,
    proofFullHashAvailable: Boolean(proofFullHash),
    proofHashPrefix: prefix,
    prefixMatches,
    chainJoinKeyObserved: false,
    status: strongJoinKeyFound ? 'Direct hash candidate requires independent verification' : 'No Strong Link Between Proof And XRPL Tx',
    conclusion: strongJoinKeyFound
      ? 'A direct hash string was observed, but this tool does not validate the cryptographic proof.'
      : 'No strong public linkage was established between proof-side record and XRPL transaction.',
  };
}

async function check(rawInput) {
  const input = extractInput(rawInput || '67fe39b1');
  const [anchorsResult, dashboardResult, transactionsResult, verifier] = await Promise.all([
    fetchJson(SOURCES.anchors),
    fetchJson(SOURCES.dashboard),
    fetchJson(SOURCES.transactions),
    watcher.checkSource('dna_verifier'),
  ]);

  const chainRows = rowsFrom(anchorsResult.data, ['transactions', 'anchors', 'rows']);
  const dashboardRows = rowsFrom(dashboardResult.data, ['recentProofs', 'proofs', 'transactions']);
  const transactionRows = rowsFrom(transactionsResult.data, ['transactions', 'rows', 'items']);
  const proofRows = dashboardRows.concat(transactionRows);
  const chain = chainView(findChainRecord(chainRows, input));
  const proof = findProofRecord(proofRows, input);
  const link = linkage(chain, proof, chainRows);
  const verifierUnresolved = Boolean(verifier?.httpOk && !verifier?.structured);
  const enoughEvidence = Boolean(chain || proof);

  return {
    ok: anchorsResult.ok || dashboardResult.ok || transactionsResult.ok,
    checkedAt: new Date().toISOString(),
    input,
    statuses: {
      chain: chain ? 'Anchor Registry Record Found' : anchorsResult.ok ? 'Anchor Registry Record Not Found' : 'Chain Source Unavailable',
      proof: proof ? 'Proof-side Record Found' : dashboardResult.ok || transactionsResult.ok ? 'Proof-side Record Not Found' : 'Proof Sources Unavailable',
      verifier: verifierUnresolved ? 'Verifier Endpoint Unresolved' : verifier?.structured ? 'Structured verifier response observed; no verdict issued' : 'Verifier Source Unavailable',
      linkage: enoughEvidence ? link.status : 'Not Enough Evidence',
    },
    chain,
    proof: proof?.view || null,
    verifier: {
      reachable: Boolean(verifier?.httpOk),
      structuredJson: Boolean(verifier?.structured),
      unresolved: verifierUnresolved,
      contentType: verifier?.contentType || '',
      checkedAt: verifier?.checkedAt || null,
      attemptedQueryKeys: ['proofId', 'id', 'proof', 'hash', 'txHash', 'q', 'nullifier', 'commitment'],
      attemptedModes: ['GET query', 'public endpoint observation'],
    },
    linkage: link,
    sourceStatus: {
      chainRegistry: { ok: anchorsResult.ok, status: anchorsResult.status, count: chainRows.length, strength: 'strong' },
      proofDashboard: { ok: dashboardResult.ok, status: dashboardResult.status, count: dashboardRows.length, strength: 'medium' },
      proofTransactions: { ok: transactionsResult.ok, status: transactionsResult.status, count: transactionRows.length, strength: 'medium' },
      verifier: { ok: Boolean(verifier?.httpOk), unresolved: verifierUnresolved, strength: 'unresolved' },
    },
    prohibitedVerdicts: ['Verified', 'Direct proof↔tx confirmed', 'Chain-confirmed proof', 'Matched by tx hash'],
  };
}

module.exports = { check, extractInput, linkage, proofIdentity, chainView };
