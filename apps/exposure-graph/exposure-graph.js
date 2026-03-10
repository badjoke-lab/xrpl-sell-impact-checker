(() => {
  const XRPL_ACCOUNT_INFO_ENDPOINTS = [
    '/api/xrpl/account-info?issuer=',
    '/api/xrpl/account-info?address=',
    '/api/xrpl/account-info?account=',
  ];
  const XRPL_RPC_ENDPOINTS = ['https://xrplcluster.com/', 'https://s1.ripple.com:51234/'];

  const state = {
    mode: 'ok',
    selectedNodeId: 'exchange',
    activeTab: 'egPanelExposure',
    issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
    risk: { status: 'idle', error: null, flags: null, accountFlags: null, source: null },
    nodes: [
      { id: 'issuer', name: 'Issuer', x: 360, y: 190, r: 16, share: '100%', detail: 'Anchor node issuing sampled trustline relationships.' },
      { id: 'exchange', name: 'Exchange cluster', x: 470, y: 120, r: 14, share: '31.2%', detail: 'Largest visible concentration cluster.' },
      { id: 'market', name: 'Market maker', x: 510, y: 240, r: 12, share: '18.7%', detail: 'High turnover pool with recurring route overlap.' },
      { id: 'custody', name: 'Custody desk', x: 270, y: 115, r: 11, share: '14.1%', detail: 'Operational cluster with stable carry behavior.' },
      { id: 'wallets', name: 'Retail wallets', x: 250, y: 255, r: 10, share: '9.8%', detail: 'Long-tail wallet cluster with diffuse behavior.' },
      { id: 'unknown', name: 'Unknown dense', x: 140, y: 180, r: 10, share: '7.1%', detail: 'Unlabeled dense pocket worth monitoring.' },
    ],
    concentration: ['Top 10 share: 63.8%', 'Largest cluster: Exchange 31.2%', 'Unknown dense nodes: 7.1%'],
    watch: [['Exchange cluster', 'watch high'], ['Market maker', 'stable medium'], ['Unknown dense', 'review labels']],
  };

  function boot() {
    const refs = {
      issuerInput: document.getElementById('egIssuerInput'),
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

    refs.issuerInput.value = state.issuer;
    refs.tabs.forEach((tab) => tab.addEventListener('click', () => setActiveTab(refs, tab.dataset.egTabTarget)));
    refs.debugButtons.forEach((button) => button.addEventListener('click', async () => {
      state.mode = button.dataset.egForce;
      if (state.mode === 'ok') {
        await refreshRiskData(refs);
      }
      render(refs);
    }));
    refs.refreshBtn?.addEventListener('click', async () => {
      state.issuer = refs.issuerInput.value.trim();
      await refreshRiskData(refs);
      render(refs);
    });
    refs.issuerInput?.addEventListener('change', async () => {
      state.issuer = refs.issuerInput.value.trim();
      await refreshRiskData(refs);
      render(refs);
    });

    refreshRiskData(refs).finally(() => render(refs));
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

  async function refreshRiskData(refs) {
    if (state.mode === 'error') {
      state.risk = { status: 'error', error: 'Forced error mode is active.', flags: null, accountFlags: null, source: null };
      return;
    }
    if (state.mode === 'empty') {
      state.risk = { status: 'empty', error: null, flags: null, accountFlags: null, source: null };
      return;
    }
    if (!isValidIssuer(state.issuer)) {
      state.risk = { status: 'invalid', error: 'Enter a valid XRPL issuer address to load risk evidence.', flags: null, accountFlags: null, source: null };
      return;
    }

    state.risk = { status: 'loading', error: null, flags: null, accountFlags: null, source: null };
    render(refs);

    try {
      const { flags, accountFlags, source } = await fetchIssuerRisk(state.issuer);
      state.risk = { status: 'ready', error: null, flags, accountFlags, source };
    } catch (error) {
      state.risk = { status: 'error', error: error?.message || 'Unable to fetch issuer account data right now.', flags: null, accountFlags: null, source: null };
    }
  }

  async function fetchIssuerRisk(issuer) {
    let payload = null;
    let source = null;
    for (const endpoint of XRPL_ACCOUNT_INFO_ENDPOINTS) {
      const url = `${endpoint}${encodeURIComponent(issuer)}&ledger_index=validated`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        continue;
      }
      const json = await response.json();
      const accountData = json?.result?.account_data || json?.account_data || json?.data?.account_data;
      if (accountData) {
        payload = accountData;
        source = endpoint.split('?')[0];
        break;
      }
    }

    if (!payload) {
      for (const rpcUrl of XRPL_RPC_ENDPOINTS) {
        const rpcRes = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'account_info', params: [{ account: issuer, ledger_index: 'validated' }] }),
        });
        if (!rpcRes.ok) {
          continue;
        }
        const rpcJson = await rpcRes.json();
        const rpcAccount = rpcJson?.result?.account_data;
        if (rpcAccount) {
          payload = rpcAccount;
          source = rpcUrl;
          break;
        }
      }
    }

    if (!payload) {
      throw new Error('Issuer account data is unavailable for this address.');
    }

    const accountFlags = Number(payload.Flags || 0);
    return {
      accountFlags,
      source,
      flags: {
        Freeze: toObserved((accountFlags & 0x00200000) === 0),
        GlobalFreeze: toObserved((accountFlags & 0x00400000) !== 0),
        Clawback: toObserved((accountFlags & 0x80000000) !== 0),
        RequireAuth: toObserved((accountFlags & 0x00040000) !== 0),
      },
    };
  }

  function render(refs) {
    refs.status.textContent = state.mode.toUpperCase();
    refs.updated.textContent = new Date().toLocaleTimeString();
    refs.debugStatus.textContent = `EG_DEBUG · mode=${state.mode} · tab=${state.activeTab} · risk=${state.risk.status}`;

    renderSignal(refs.signalCard);
    renderMetrics(refs.metricsGrid);

    if (state.mode === 'error') {
      refs.graphMount.innerHTML = '<div class="eg-error">Graph unavailable in forced error mode.</div>';
      refs.entityDetail.innerHTML = '<p class="eg-meta">No selected entity while error is active.</p>';
      refs.concentrationList.innerHTML = '<p class="eg-meta">No concentration data.</p>';
      refs.watchList.innerHTML = '<p class="eg-meta">No watch items.</p>';
    } else if (state.mode === 'empty') {
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

    renderRisk(refs);
  }

  function renderRisk(refs) {
    const model = getRiskModel();
    renderRadar(refs.radarMount, model);
    refs.rootCause.innerHTML = model.summary.length
      ? `<ul class="eg-list">${model.summary.map((item) => `<li>${item}</li>`).join('')}</ul>`
      : '<p class="eg-meta">No risk summary available.</p>';
    refs.evidence.innerHTML = model.evidence.length
      ? model.evidence.map((item) => `<article class="eg-evidence-item"><header><strong>${item.title}</strong><span class="eg-obs-chip eg-obs-chip--${item.kind}">${item.status}</span></header><p class="eg-meta">${item.note}</p></article>`).join('')
      : '<p class="eg-meta">No evidence cards.</p>';
  }

  function getRiskModel() {
    if (state.mode === 'empty' || state.risk.status === 'empty') {
      return buildUnknownRiskModel('No evidence available in empty mode.');
    }
    if (state.risk.status === 'invalid') {
      return buildUnknownRiskModel(state.risk.error);
    }
    if (state.mode === 'error' || state.risk.status === 'error') {
      return buildUnknownRiskModel(state.risk.error || 'Risk data unavailable due to a fetch failure.');
    }
    if (state.risk.status === 'loading') {
      return buildUnknownRiskModel('Loading live issuer account flags from XRPL.');
    }
    if (state.risk.status !== 'ready' || !state.risk.flags) {
      return buildUnknownRiskModel('Risk evidence is unavailable.');
    }

    const entries = Object.entries(state.risk.flags);
    const observedCount = entries.filter(([, v]) => v === 'Observed').length;
    const unknownCount = entries.filter(([, v]) => v === 'Unknown').length;

    return {
      statuses: state.risk.flags,
      summary: [
        `${observedCount} of ${entries.length} issuer-control checks are observed from account flags.`,
        unknownCount ? `${unknownCount} checks are Unknown because source data is incomplete.` : 'All checks were derived from current account flags.',
        `Source: ${state.risk.source || 'XRPL account info endpoint'} · account Flags=${state.risk.accountFlags}`,
      ],
      evidence: entries.map(([flag, status]) => ({
        title: flag,
        status,
        kind: status.toLowerCase().replace(/\s+/g, '-'),
        note: `This state is ${status.toLowerCase()} from live issuer account flags and may change as the issuer updates controls.`,
      })),
    };
  }

  function buildUnknownRiskModel(message) {
    const statuses = { Freeze: 'Unknown', GlobalFreeze: 'Unknown', Clawback: 'Unknown', RequireAuth: 'Unknown' };
    return {
      statuses,
      summary: [message, 'Use Refresh after entering a valid issuer to attempt live evidence loading.'],
      evidence: Object.entries(statuses).map(([flag, status]) => ({
        title: flag,
        status,
        kind: 'unknown',
        note: 'Unknown means the app cannot confirm this control from current data.',
      })),
    };
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

  function renderRadar(mount, model) {
    const keys = ['Freeze', 'GlobalFreeze', 'Clawback', 'RequireAuth'];
    const valueByStatus = { Observed: 1, 'Not observed': 0.22, Unknown: 0.55 };
    const centerX = 220;
    const centerY = 170;
    const radius = 120;

    const points = keys.map((key, index) => {
      const angle = -Math.PI / 2 + ((Math.PI * 2) / keys.length) * index;
      const value = valueByStatus[model.statuses[key]] ?? valueByStatus.Unknown;
      return `${centerX + Math.cos(angle) * radius * value},${centerY + Math.sin(angle) * radius * value}`;
    }).join(' ');

    const labels = keys.map((key, index) => {
      const angle = -Math.PI / 2 + ((Math.PI * 2) / keys.length) * index;
      const x = centerX + Math.cos(angle) * (radius + 28);
      const y = centerY + Math.sin(angle) * (radius + 28);
      return `<text x="${x}" y="${y}" text-anchor="middle">${key}</text>`;
    }).join('');

    mount.innerHTML = `<svg class="eg-radar-svg" viewBox="0 0 440 360" role="img" aria-label="Issuer control radar">
      <g fill="none" stroke="rgba(111,99,194,.14)">
        <polygon points="220,50 340,170 220,290 100,170"/><polygon points="220,80 310,170 220,260 130,170"/><polygon points="220,110 280,170 220,230 160,170"/>
        <line x1="220" y1="50" x2="220" y2="290"/><line x1="100" y1="170" x2="340" y2="170"/>
      </g>
      <polygon points="${points}" fill="rgba(111,99,194,.24)" stroke="rgba(111,99,194,.75)" stroke-width="3"/>
      <g fill="#6b7280" font-size="12" font-weight="700">${labels}</g>
    </svg>`;
  }

  function isValidIssuer(value) {
    return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(String(value || '').trim());
  }

  function toObserved(value) {
    if (value === true) return 'Observed';
    if (value === false) return 'Not observed';
    return 'Unknown';
  }

  boot();
})();
