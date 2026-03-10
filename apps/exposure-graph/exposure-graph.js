(() => {
  const state = {
    mode: 'ok',
    selectedNodeId: 'exchange',
    activeTab: 'egPanelExposure',
    nodes: [
      { id: 'issuer', name: 'Issuer', x: 360, y: 190, r: 16, share: '100%', detail: 'Anchor node issuing sampled trustline relationships.' },
      { id: 'exchange', name: 'Exchange cluster', x: 470, y: 120, r: 14, share: '31.2%', detail: 'Largest visible concentration cluster.' },
      { id: 'market', name: 'Market maker', x: 510, y: 240, r: 12, share: '18.7%', detail: 'High turnover pool with recurring route overlap.' },
      { id: 'custody', name: 'Custody desk', x: 270, y: 115, r: 11, share: '14.1%', detail: 'Operational cluster with stable carry behavior.' },
      { id: 'wallets', name: 'Retail wallets', x: 250, y: 255, r: 10, share: '9.8%', detail: 'Long-tail wallet cluster with diffuse behavior.' },
      { id: 'unknown', name: 'Unknown dense', x: 140, y: 180, r: 10, share: '7.1%', detail: 'Unlabeled dense pocket worth monitoring.' },
    ],
    concentration: ['Top 10 share: 63.8%', 'Largest cluster: Exchange 31.2%', 'Unknown dense nodes: 7.1%'],
    watch: [
      ['Exchange cluster', 'watch high'],
      ['Market maker', 'stable medium'],
      ['Unknown dense', 'review labels'],
    ],
    riskSummary: [
      'Freeze-related control appears present.',
      'Clawback capability appears enabled.',
      'RequireAuth not indicated in this static sample.',
    ],
    evidence: [
      { title: 'Freeze capability', status: 'present', points: ['Flag-derived check indicates freeze control path exists.'] },
      { title: 'Clawback capability', status: 'present', points: ['Issuer-side clawback path appears available in sampled state.'] },
      { title: 'RequireAuth', status: 'not observed', points: ['No RequireAuth signal in this static payload.'] },
    ],
  };

  function boot() {
    const refs = {
      signalCard: document.getElementById('egSignalCard'),
      metricsGrid: document.getElementById('egMetricsGrid'),
      graphMount: document.getElementById('egGraphMount'),
      entityDetail: document.getElementById('egEntityDetail'),
      concentrationList: document.getElementById('egConcentrationList'),
      watchList: document.getElementById('egWatchList'),
      radarMount: document.getElementById('egRadarMount'),
      rootCause: document.getElementById('egRootCause'),
      evidence: document.getElementById('egEvidence'),
      status: document.getElementById('egStatusText'),
      updated: document.getElementById('egUpdatedText'),
      debugStatus: document.getElementById('egDebugStatus'),
      tabs: Array.from(document.querySelectorAll('[data-eg-tab-target]')),
      panels: Array.from(document.querySelectorAll('.eg-tab-panel')),
      debugButtons: Array.from(document.querySelectorAll('[data-eg-force]')),
      refreshBtn: document.getElementById('egRefreshBtn'),
    };

    refs.tabs.forEach((tab) => tab.addEventListener('click', () => setActiveTab(refs, tab.dataset.egTabTarget)));
    refs.debugButtons.forEach((button) => button.addEventListener('click', () => {
      state.mode = button.dataset.egForce;
      render(refs);
    }));
    refs.refreshBtn?.addEventListener('click', () => render(refs));

    render(refs);
  }

  function setActiveTab(refs, targetId) {
    state.activeTab = targetId;
    refs.tabs.forEach((tab) => {
      const active = tab.dataset.egTabTarget === targetId;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });
    refs.panels.forEach((panel) => {
      const active = panel.id === targetId;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
  }

  function render(refs) {
    refs.status.textContent = state.mode.toUpperCase();
    refs.updated.textContent = new Date().toLocaleTimeString();
    refs.debugStatus.textContent = `EG_DEBUG · mode=${state.mode} · tab=${state.activeTab}`;

    renderSignal(refs.signalCard);
    renderMetrics(refs.metricsGrid);

    if (state.mode === 'error') {
      refs.graphMount.innerHTML = '<div class="eg-error">Graph unavailable in forced error mode.</div>';
      refs.radarMount.innerHTML = '<div class="eg-error">Risk radar unavailable in forced error mode.</div>';
      refs.entityDetail.innerHTML = '<p class="eg-meta">No selected entity while error is active.</p>';
      refs.concentrationList.innerHTML = '<p class="eg-meta">No concentration data.</p>';
      refs.watchList.innerHTML = '<p class="eg-meta">No watch items.</p>';
      refs.rootCause.innerHTML = '<p class="eg-meta">No root cause summary.</p>';
      refs.evidence.innerHTML = '<p class="eg-meta">No evidence cards.</p>';
      return;
    }

    if (state.mode === 'empty') {
      refs.graphMount.innerHTML = '<div class="eg-empty">No visible counterparties in current static filter.</div>';
      refs.entityDetail.innerHTML = '<p class="eg-meta">Select a node after data appears.</p>';
      refs.concentrationList.innerHTML = '<p class="eg-meta">Concentration metrics unavailable.</p>';
      refs.watchList.innerHTML = '<p class="eg-meta">No activity rows in this empty demo.</p>';
    } else {
      renderGraph(refs);
      renderEntity(refs);
      refs.concentrationList.innerHTML = `<ul class="eg-list">${state.concentration.map((item) => `<li>${item}</li>`).join('')}</ul>`;
      refs.watchList.innerHTML = state.watch.map((row) => `<div class="eg-watch-row"><span>${row[0]}</span><strong>${row[1]}</strong></div>`).join('');
    }

    renderRadar(refs.radarMount);
    refs.rootCause.innerHTML = `<ul class="eg-list">${state.riskSummary.map((item) => `<li>${item}</li>`).join('')}</ul>`;
    refs.evidence.innerHTML = state.evidence.map((item) => `<article><strong>${item.title}</strong> <span class="eg-meta">(${item.status})</span><ul class="eg-list">${item.points.map((point) => `<li>${point}</li>`).join('')}</ul></article>`).join('');
  }

  function renderSignal(mount) {
    mount.innerHTML = `
      <div class="eg-signal-block"><div class="eg-signal-label">Status</div><span class="eg-pill">Medium</span><p class="eg-meta">risk medium · concentration elevated</p></div>
      <div class="eg-signal-block"><div class="eg-signal-label">Top concentration</div><div class="eg-hero-value">63.8%</div><p class="eg-meta">top 10 visible entities</p></div>
      <div class="eg-signal-block"><div class="eg-signal-label">Why this matters</div><p class="eg-meta">A few clusters dominate short-window dependency.</p></div>
      <div class="eg-signal-block"><div class="eg-signal-label">Context</div><p class="eg-meta">Exposure = structure, Risk = issuer controls.</p></div>`;
  }

  function renderMetrics(mount) {
    const metrics = [
      ['Top 10 share', '63.8%', 'concentration threshold crossed'],
      ['Entities visible', '6', 'bounded for mobile safety'],
      ['Top cluster', 'Exchange', '31.2% of visible share'],
      ['Unknown share', '7.1%', 'requires monitoring'],
      ['Issuer freeze', 'On', 'see risk evidence'],
      ['Clawback', 'On', 'see risk evidence'],
      ['RequireAuth', 'Off', 'not observed here'],
      ['Render mode', 'Inline SVG', 'no force engine'],
    ];
    mount.innerHTML = metrics.map((m) => `<article class="card eg-metric-card"><div class="eg-metric-label">${m[0]}</div><div class="eg-metric-value">${m[1]}</div><div class="eg-metric-sub">${m[2]}</div></article>`).join('');
  }

  function renderGraph(refs) {
    const nodeById = new Map(state.nodes.map((n) => [n.id, n]));
    const links = [['issuer', 'exchange'], ['issuer', 'market'], ['issuer', 'custody'], ['issuer', 'wallets'], ['issuer', 'unknown']];
    const lines = links.map(([a, b]) => {
      const n1 = nodeById.get(a);
      const n2 = nodeById.get(b);
      return `<line x1="${n1.x}" y1="${n1.y}" x2="${n2.x}" y2="${n2.y}" stroke="rgba(111,99,194,.35)" stroke-width="2" />`;
    }).join('');
    const nodes = state.nodes.map((n) => `<g class="eg-node" data-eg-node-id="${n.id}" tabindex="0" role="button" aria-label="${n.name} ${n.share}"><circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${n.id === state.selectedNodeId ? 'rgba(111,99,194,.78)' : 'rgba(111,99,194,.48)'}"/><text x="${n.x}" y="${n.y + n.r + 14}" text-anchor="middle" font-size="11" fill="#4b5563">${n.name}</text></g>`).join('');

    refs.graphMount.innerHTML = `<svg class="eg-graph-svg" viewBox="0 0 760 388" role="img" aria-label="Exposure graph">${lines}${nodes}</svg>`;
    refs.graphMount.querySelectorAll('[data-eg-node-id]').forEach((nodeEl) => {
      const setNode = () => {
        state.selectedNodeId = nodeEl.dataset.egNodeId;
        render(refs);
      };
      nodeEl.addEventListener('click', setNode);
      nodeEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setNode();
        }
      });
    });
  }

  function renderEntity(refs) {
    const node = state.nodes.find((item) => item.id === state.selectedNodeId) || state.nodes[0];
    refs.entityDetail.innerHTML = `<div class="eg-kv"><strong>${node.name}</strong><div>Visible share: ${node.share}</div><div>${node.detail}</div></div>`;
  }

  function renderRadar(mount) {
    mount.innerHTML = `<svg class="eg-radar-svg" viewBox="0 0 420 360" role="img" aria-label="Issuer control radar"><g transform="translate(210 180)"><g fill="none" stroke="rgba(111,99,194,.14)"><polygon points="0,-120 103,-60 103,60 0,120 -103,60 -103,-60"/><polygon points="0,-90 77,-45 77,45 0,90 -77,45 -77,-45"/><polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30"/></g><polygon points="0,-98 72,-42 95,54 0,72 -42,22 -52,-30" fill="rgba(111,99,194,.22)" stroke="rgba(111,99,194,.7)" stroke-width="3"/></g><g fill="#6b7280" font-size="12" font-weight="700"><text x="210" y="24" text-anchor="middle">Freeze</text><text x="355" y="100" text-anchor="middle">GlobalFreeze</text><text x="356" y="272" text-anchor="middle">Clawback</text><text x="210" y="344" text-anchor="middle">RequireAuth</text><text x="60" y="272" text-anchor="middle">NoFreeze</text><text x="56" y="100" text-anchor="middle">Other ops</text></g></svg>`;
  }

  boot();
})();
