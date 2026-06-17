(() => {
  const ITEMS = [
    {
      id: 'xrpl-core-zkp',
      name: 'XRPL core ZKP',
      stage: 'In Development',
      role: 'XRPL Core / Protocol Track',
      network: 'Not network-specific',
      quality: 'Strong-ish official',
      sourceNames: ['ripple_zkp'],
      explanation: 'An official source describes ZKP work as in development. No live production status is inferred.',
      confirmed: ['Official source supports an in-development classification.'],
      unconfirmed: ['Live / production deployment', 'Broad adoption'],
      firstSeen: 'Fixed initial seed',
    },
    {
      id: 'credentials-deep-freeze',
      name: 'Credentials / Deep Freeze',
      stage: 'Live / Production',
      role: 'XRPL Core / Live Feature',
      network: 'Mainnet',
      quality: 'Strong-ish official',
      sourceNames: ['ripple_zkp'],
      explanation: 'The official source describes these XRPL features as live. Adoption depth is outside this page.',
      confirmed: ['Official live-feature claim'],
      unconfirmed: ['Adoption depth', 'Institutional usage breadth'],
      firstSeen: 'Fixed initial seed',
    },
    {
      id: 'dna-protocol',
      name: 'DNA Protocol on XRPL',
      stage: 'Demo / Experimental',
      role: 'External Project Using XRPL',
      network: 'Testnet-linked',
      quality: 'Medium structured + weak volatile',
      sourceNames: ['dna_testnet_registry', 'dna_verifier', 'dna_zkbridge_dashboard', 'dna_zkbridge_transactions', 'dna_home_volatile'],
      explanation: 'External testnet-linked surfaces and structured zkBridge APIs are reachable, but verifier JSON, strong linkage, and mainnet production remain unresolved.',
      confirmed: ['External project surfaces are reachable', 'Testnet-linked activity', 'Dashboard and transactions JSON are publicly reachable'],
      unconfirmed: ['Verifier JSON resolution', 'Strong proof-to-transaction linkage', 'Mainnet production status'],
      firstSeen: 'Fixed initial seed',
    },
    {
      id: 'xls-0096',
      name: 'XLS-0096 Confidential MPT',
      stage: 'Proposal',
      role: 'XRPL Proposal / Draft',
      network: 'Not live by itself',
      quality: 'Strong-ish official',
      sourceNames: ['xls96'],
      explanation: 'A published draft proposal exists. Publication of the proposal does not establish production deployment.',
      confirmed: ['Draft proposal exists', 'Confidential MPT scope is documented'],
      unconfirmed: ['Live production deployment'],
      firstSeen: 'Fixed initial seed',
    },
  ];

  let sources = [];
  let selectedId = ITEMS[0].id;

  function q(selector) { return document.querySelector(selector); }
  function text(node, value) { if (node) node.textContent = value ?? ''; }
  function replaceList(node, items) {
    if (!node) return;
    node.replaceChildren();
    items.forEach((item) => { const li = document.createElement('li'); li.textContent = item; node.appendChild(li); });
  }
  function stageClass(stage) {
    if (stage === 'Proposal') return 'watch-chip--proposal';
    if (stage === 'Demo / Experimental') return 'watch-chip--experimental';
    if (stage === 'Live / Production') return 'watch-chip--live';
    return '';
  }
  function sourceState(name) { return sources.find((source) => source.name === name) || null; }
  function itemFreshness(item) {
    const itemSources = item.sourceNames.map(sourceState).filter(Boolean).filter((source) => source.sourceGroup === 'primary');
    if (!itemSources.length) return 'not checked';
    if (itemSources.some((source) => !source.httpOk)) return 'degraded';
    if (itemSources.some((source) => source.changed === true)) return 'changed';
    if (itemSources.every((source) => source.changed === false)) return 'unchanged';
    return 'checked';
  }

  function renderItems() {
    const mount = q('#watch-items');
    if (!mount) return;
    mount.replaceChildren();
    ITEMS.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `watch-item${item.id === selectedId ? ' is-selected' : ''}`;
      button.dataset.itemId = item.id;
      const head = document.createElement('div');
      head.className = 'watch-item__head';
      const titleWrap = document.createElement('div');
      const eyebrow = document.createElement('p');
      eyebrow.className = 'eyebrow';
      eyebrow.textContent = item.role;
      const title = document.createElement('h3');
      title.textContent = item.name;
      titleWrap.append(eyebrow, title);
      const stage = document.createElement('span');
      stage.className = `watch-chip ${stageClass(item.stage)}`;
      stage.textContent = item.stage;
      head.append(titleWrap, stage);
      const meta = document.createElement('div');
      meta.className = 'watch-meta';
      for (const value of [`Network: ${item.network}`, `Source quality: ${item.quality}`, `Freshness: ${itemFreshness(item)}`]) {
        const row = document.createElement('span'); row.textContent = value; meta.appendChild(row);
      }
      button.append(head, meta);
      button.addEventListener('click', () => { selectedId = item.id; renderItems(); renderDetail(); });
      mount.appendChild(button);
    });
  }

  function renderDetail() {
    const item = ITEMS.find((candidate) => candidate.id === selectedId) || ITEMS[0];
    text(q('#detail-name'), item.name);
    const stage = q('#detail-stage');
    if (stage) { stage.className = `watch-chip ${stageClass(item.stage)}`; stage.textContent = item.stage; }
    text(q('#detail-role'), `Role: ${item.role}`);
    text(q('#detail-network'), `Network: ${item.network}`);
    text(q('#detail-quality'), `Source quality: ${item.quality}`);
    text(q('#detail-freshness'), `Freshness: ${itemFreshness(item)}`);
    text(q('#detail-explanation'), item.explanation);
    replaceList(q('#detail-confirmed'), item.confirmed);
    replaceList(q('#detail-unconfirmed'), item.unconfirmed);
    const timeline = q('#detail-timeline');
    if (timeline) {
      timeline.replaceChildren();
      const rows = [
        ['First seen', item.firstSeen],
        ['Current stage', item.stage],
        ['Last checked', sources[0]?.checkedAt || 'Not checked'],
        ['Changed / unchanged', itemFreshness(item)],
      ];
      rows.forEach(([label, value]) => {
        const row = document.createElement('div'); row.className = 'watch-timeline__row';
        const strong = document.createElement('strong'); strong.textContent = label;
        const span = document.createElement('span'); span.textContent = value;
        row.append(strong, span); timeline.appendChild(row);
      });
    }
  }

  function renderSources() {
    const mount = q('#watch-sources');
    if (!mount) return;
    mount.replaceChildren();
    sources.forEach((source) => {
      const card = document.createElement('article');
      card.className = 'watch-source';
      card.dataset.group = source.sourceGroup;
      card.dataset.health = source.httpOk ? 'ok' : 'failed';
      const head = document.createElement('div'); head.className = 'watch-source__head';
      const title = document.createElement('strong'); title.textContent = source.name;
      const group = document.createElement('span'); group.className = `watch-chip ${source.sourceGroup === 'primary' ? 'watch-chip--primary' : 'watch-chip--secondary'}`; group.textContent = source.sourceGroup;
      head.append(title, group);
      const meta = document.createElement('div'); meta.className = 'watch-meta';
      const values = [
        `HTTP: ${source.httpOk ? source.httpStatus : source.error || 'failed'}`,
        `Stability: ${source.stability}`,
        `Changed: ${source.changed === null ? 'baseline' : source.changed ? 'yes' : 'no'}`,
        `Quality: ${source.quality}`,
        source.summary,
      ];
      if (source.excludedFromPrimary) values.push('Volatile source; excluded from primary freshness signal.');
      if (source.unresolved) values.push('Reachable HTML shell; structured verifier JSON remains unresolved.');
      values.forEach((value) => { const row = document.createElement('span'); row.textContent = value; meta.appendChild(row); });
      card.append(head, meta); mount.appendChild(card);
    });
  }

  async function refresh() {
    text(q('#watch-status'), 'Checking');
    try {
      const response = await fetch('/api/watch-sources?group=privacy', { cache: 'no-store', headers: { accept: 'application/json' } });
      const payload = await response.json();
      sources = Array.isArray(payload.sources) ? payload.sources : [];
      text(q('#watch-status'), payload.summary?.degraded ? 'Degraded' : 'Sources checked');
      text(q('#watch-checked'), `Last checked: ${payload.checkedAt || '—'}`);
    } catch {
      sources = [];
      text(q('#watch-status'), 'Watcher unavailable');
      text(q('#watch-checked'), 'Last checked: failed');
    }
    renderItems(); renderDetail(); renderSources();
  }

  function boot() {
    q('#watch-refresh')?.addEventListener('click', () => void refresh());
    renderItems(); renderDetail(); renderSources();
    void refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
