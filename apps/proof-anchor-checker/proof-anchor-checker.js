(() => {
  const q = (selector) => document.querySelector(selector);
  const setText = (selector, value) => { const node = q(selector); if (node) node.textContent = value ?? '—'; };

  function renderPairs(selector, pairs) {
    const node = q(selector);
    if (!node) return;
    node.replaceChildren();
    for (const [label, value] of pairs) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.className = 'watch-mono';
      dd.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
      node.append(dt, dd);
    }
  }

  function setChip(selector, value, unresolved = false) {
    const node = q(selector);
    if (!node) return;
    node.className = `watch-chip${unresolved ? ' watch-chip--unresolved' : ''}`;
    node.textContent = value;
  }

  function render(payload) {
    setText('#status-chain', payload.statuses?.chain);
    setText('#status-proof', payload.statuses?.proof);
    setText('#status-verifier', payload.statuses?.verifier);
    setText('#status-linkage', payload.statuses?.linkage);
    setText('#proof-checked', `Last checked: ${payload.checkedAt || '—'} · input type: ${payload.input?.type || 'unknown'}`);

    const chain = payload.chain;
    setChip('#chain-source-state', chain ? 'Record found' : payload.sourceStatus?.chainRegistry?.ok ? 'Not found' : 'Unavailable');
    renderPairs('#chain-detail', chain ? [
      ['Full hash', chain.hash], ['Ledger index', chain.ledgerIndex], ['Validated', chain.validated], ['Transaction type', chain.transactionType], ['Result', chain.transactionResult], ['Account', chain.account], ['Sequence', chain.sequence], ['Fee XRP', chain.feeXrp], ['Profile', chain.profile], ['Batch ID', chain.batchId], ['Explorer URL', chain.explorerUrl], ['Local URL', chain.localUrl],
    ] : [['Source status', payload.sourceStatus?.chainRegistry?.ok ? 'reachable / no matching row' : 'unavailable'], ['Registry rows', payload.sourceStatus?.chainRegistry?.count]]);

    const proof = payload.proof;
    setChip('#proof-source-state', proof ? 'Record found' : payload.sourceStatus?.proofDashboard?.ok || payload.sourceStatus?.proofTransactions?.ok ? 'Not found' : 'Unavailable');
    renderPairs('#proof-detail', proof ? [
      ['UUID', proof.id], ['Proof ID', proof.proofId], ['Status', proof.status], ['Scope / type', proof.scope], ['Created at', proof.createdAt], ['Verified at', proof.verifiedAt], ['Anchored at', proof.anchoredAt], ['Displayed tx hash', proof.txHashDisplay], ['Nullifier', proof.nullifierDisplay], ['Commitment', proof.commitmentDisplay],
    ] : [['Dashboard rows', payload.sourceStatus?.proofDashboard?.count], ['Transaction rows', payload.sourceStatus?.proofTransactions?.count], ['Result', 'No matching public proof-side record']]);

    const verifier = payload.verifier || {};
    setChip('#verifier-source-state', verifier.unresolved ? 'Unresolved' : verifier.reachable ? 'Reachable' : 'Unavailable', verifier.unresolved);
    renderPairs('#verifier-detail', [
      ['Reachable', verifier.reachable], ['Structured JSON', verifier.structuredJson], ['Unresolved', verifier.unresolved], ['Content type', verifier.contentType], ['Attempted query keys', (verifier.attemptedQueryKeys || []).join(', ')], ['Attempted modes', (verifier.attemptedModes || []).join(', ')], ['Checked at', verifier.checkedAt],
    ]);

    const link = payload.linkage || {};
    setChip('#linkage-source-state', link.strongJoinKeyFound ? 'Candidate string' : 'Unresolved', !link.strongJoinKeyFound);
    renderPairs('#linkage-detail', [
      ['Strong join key found', link.strongJoinKeyFound], ['Direct full-hash match', link.directFullHashMatch], ['Full proof hash available', link.proofFullHashAvailable], ['Proof hash prefix', link.proofHashPrefix], ['Prefix matches', link.prefixMatches], ['Join key in chain registry', link.chainJoinKeyObserved], ['Linkage status', link.status],
    ]);
    setText('#linkage-conclusion', link.conclusion || 'Not enough evidence.');
    setText('#proof-status', payload.ok ? 'Comparison complete' : 'Sources degraded');
  }

  async function run() {
    const input = String(q('#proof-input')?.value || '').trim();
    setText('#proof-status', 'Checking sources');
    try {
      const response = await fetch(`/api/proof-anchor?input=${encodeURIComponent(input)}`, { cache: 'no-store', headers: { accept: 'application/json' } });
      render(await response.json());
    } catch {
      render({ ok: false, checkedAt: new Date().toISOString(), statuses: { chain: 'Chain Source Unavailable', proof: 'Proof Sources Unavailable', verifier: 'Verifier Source Unavailable', linkage: 'Not Enough Evidence' }, sourceStatus: {}, verifier: {}, linkage: { status: 'Not Enough Evidence', conclusion: 'Source request failed. No match was inferred.' } });
    }
  }

  function boot() {
    q('#proof-run')?.addEventListener('click', () => void run());
    q('#proof-input')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') void run(); });
    document.querySelectorAll('.sample-input').forEach((button) => button.addEventListener('click', () => { const input = q('#proof-input'); if (input) input.value = button.dataset.value || ''; void run(); }));
    void run();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
