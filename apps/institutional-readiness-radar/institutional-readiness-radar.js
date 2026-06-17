(() => {
  const AXES = [
    { name: 'Technical Maturity', level: 'Medium', group: 'stronger', reason: 'Multiple public surfaces and structured JSON exist; this is more than a concept.', sources: ['dna_testnet_registry', 'dna_zkbridge_dashboard', 'dna_zkbridge_transactions'] },
    { name: 'Production Readiness', level: 'Low', group: 'weaker', reason: 'Evidence remains testnet-linked and does not establish mainnet production operation.', sources: ['dna_testnet_registry', 'dna_verifier'] },
    { name: 'Verifiability / Auditability', level: 'Low', group: 'weaker', reason: 'Verifier JSON is unresolved, proof hashes are shortened, and no strong public proof-to-transaction join key is established.', sources: ['dna_verifier', 'dna_zkbridge_dashboard', 'dna_zkbridge_transactions', 'dna_testnet_registry'] },
    { name: 'Compliance Alignment', level: 'Medium', group: 'stronger', reason: 'Public records expose privacy, proof, scope, nullifier, commitment, and credential-oriented vocabulary.', sources: ['dna_zkbridge_dashboard', 'dna_zkbridge_transactions', 'ripple_zkp'] },
    { name: 'Operational Clarity', level: 'Low', group: 'weaker', reason: 'Public onboarding, role separation, failure handling, and operator workflows remain incomplete.', sources: ['dna_verifier', 'dna_zkbridge_dashboard'] },
    { name: 'Ecosystem Integration', level: 'Medium', group: 'stronger', reason: 'Testnet registry, verifier, zkBridge, explorer, and XRPL-linked surfaces are publicly connected.', sources: ['dna_testnet_registry', 'dna_zkbridge_dashboard', 'dna_zkbridge_transactions'] },
    { name: 'Source Credibility', level: 'Medium', group: 'stronger', reason: 'Official-like surfaces and structured APIs exist, but the verifier remains unresolved and volatile home content is excluded.', sources: ['dna_testnet_registry', 'dna_zkbridge_dashboard', 'dna_zkbridge_transactions', 'ripple_zkp', 'xls96'] },
    { name: 'Adoption Signal', level: 'Low', group: 'weaker', reason: 'Activity signals exist, but public evidence does not establish broad institutional adoption or production use.', sources: ['dna_zkbridge_dashboard', 'ripple_zkp'] },
  ];

  const CONFIRMED = [
    'External project surfaces are publicly reachable.',
    'zkBridge dashboard and transactions return structured JSON.',
    'The testnet anchor registry is publicly reachable.',
    'Testnet-linked activity and privacy / proof vocabulary are observable.',
  ];
  const UNCONFIRMED = [
    'Strong proof-to-transaction linkage',
    'Resolvable public verifier JSON',
    'Mainnet production deployment',
    'Broad institutional adoption',
    'Audit-ready third-party verification',
  ];

  let sources = [];

  const q = (selector) => document.querySelector(selector);
  const setText = (selector, value) => { const node = q(selector); if (node) node.textContent = value ?? ''; };
  function replaceList(selector, items) {
    const node = q(selector);
    if (!node) return;
    node.replaceChildren();
    items.forEach((item) => { const li = document.createElement('li'); li.textContent = item; node.appendChild(li); });
  }
  function sourceFor(name) { return sources.find((source) => source.name === name) || null; }
  function axisFreshness(axis) {
    const relevant = axis.sources.map(sourceFor).filter(Boolean).filter((source) => source.sourceGroup === 'primary');
    if (!relevant.length) return 'not checked';
    if (relevant.some((source) => !source.httpOk)) return 'degraded';
    if (relevant.some((source) => source.unresolved)) return 'checked / unresolved verifier';
    if (relevant.some((source) => source.changed === true)) return 'active source update';
    return 'stable sources';
  }
  function levelClass(level) {
    return level === 'Medium' ? 'watch-chip--proposal' : 'watch-chip--unresolved';
  }

  function renderAxes() {
    const mount = q('#radar-axes');
    if (!mount) return;
    mount.replaceChildren();
    AXES.forEach((axis) => {
      const card = document.createElement('article');
      card.className = 'watch-item';
      const head = document.createElement('div'); head.className = 'watch-item__head';
      const title = document.createElement('h3'); title.textContent = axis.name;
      const level = document.createElement('span'); level.className = `watch-chip ${levelClass(axis.level)}`; level.textContent = axis.level;
      head.append(title, level);
      const reason = document.createElement('p'); reason.className = 'watch-muted'; reason.textContent = axis.reason;
      const meta = document.createElement('div'); meta.className = 'watch-meta';
      const group = document.createElement('span'); group.textContent = axis.group === 'stronger' ? 'Stronger / passable dimension' : 'Weaker dimension';
      const freshness = document.createElement('span'); freshness.textContent = `Source status: ${axisFreshness(axis)}`;
      const basis = document.createElement('span'); basis.textContent = `Basis: ${axis.sources.join(', ')}`;
      meta.append(group, freshness, basis);
      card.append(head, reason, meta);
      mount.appendChild(card);
    });
  }

  function renderSources() {
    const mount = q('#radar-sources');
    if (!mount) return;
    mount.replaceChildren();
    sources.forEach((source) => {
      const card = document.createElement('article'); card.className = 'watch-source'; card.dataset.group = source.sourceGroup; card.dataset.health = source.httpOk ? 'ok' : 'failed';
      const head = document.createElement('div'); head.className = 'watch-source__head';
      const title = document.createElement('strong'); title.textContent = source.name;
      const group = document.createElement('span'); group.className = `watch-chip ${source.sourceGroup === 'primary' ? 'watch-chip--primary' : 'watch-chip--secondary'}`; group.textContent = source.sourceGroup;
      head.append(title, group);
      const meta = document.createElement('div'); meta.className = 'watch-meta';
      const rows = [
        `HTTP: ${source.httpOk ? source.httpStatus : source.error || 'failed'}`,
        `Stability: ${source.stability}`,
        `Changed: ${source.changed === null ? 'baseline' : source.changed ? 'yes' : 'no'}`,
        `Quality: ${source.quality}`,
        source.summary,
      ];
      if (source.unresolved) rows.push('Verifier remains a reachable HTML shell; this weakens Verifiability / Auditability.');
      if (source.excludedFromPrimary) rows.push('Volatile source; excluded from the main readiness signal.');
      rows.forEach((value) => { const span = document.createElement('span'); span.textContent = value; meta.appendChild(span); });
      card.append(head, meta); mount.appendChild(card);
    });
  }

  async function refresh() {
    setText('#radar-status', 'Checking');
    try {
      const response = await fetch('/api/watch-sources?group=readiness', { cache: 'no-store', headers: { accept: 'application/json' } });
      const payload = await response.json();
      sources = Array.isArray(payload.sources) ? payload.sources : [];
      setText('#radar-status', payload.summary?.degraded ? 'Freshness degraded' : 'Sources checked');
      setText('#radar-checked', `Last checked: ${payload.checkedAt || '—'} · no automatic rescoring`);
    } catch {
      sources = [];
      setText('#radar-status', 'Watcher unavailable');
      setText('#radar-checked', 'Last checked: failed · fixed profile retained');
    }
    renderAxes(); renderSources();
  }

  function boot() {
    replaceList('#radar-stronger', AXES.filter((axis) => axis.group === 'stronger').map((axis) => axis.name));
    replaceList('#radar-weaker', AXES.filter((axis) => axis.group === 'weaker').map((axis) => axis.name));
    replaceList('#radar-confirmed', CONFIRMED);
    replaceList('#radar-unconfirmed', UNCONFIRMED);
    q('#radar-refresh')?.addEventListener('click', () => void refresh());
    renderAxes(); renderSources(); void refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
