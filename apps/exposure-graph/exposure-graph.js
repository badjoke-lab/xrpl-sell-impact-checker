(() => {
  const XRPL_ACCOUNT_INFO_ENDPOINTS = [
    '/api/xrpl/account-info?issuer=',
    '/api/xrpl/account-info?address=',
    '/api/xrpl/account-info?account=',
  ];
  const XRPL_PROXY_ENDPOINT = '/api/xrpl';
  const XRPL_RPC_ENDPOINTS = ['https://xrplcluster.com/', 'https://s1.ripple.com:51234/'];
  const MAX_VISIBLE_COUNTERPARTIES = 8;
  const URL_ISSUER_KEY = 'issuer';
  const ISSUER_PRESETS = [
    { label: 'Bitstamp', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B' },
    { label: 'GateHub', issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq' },
    { label: 'Ripple', issuer: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh' },
  ];

  const state = {
    mode: 'ok',
    selectedNodeId: 'issuer',
    activeTab: 'egPanelExposure',
    issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
    refreshSeq: 0,
    risk: { status: 'idle', error: null, flags: null, accountFlags: null, source: null },
    exposure: { status: 'idle', error: null, model: null, source: null },
  };

  const lifecycle = {
    cleanups: [],
    refreshController: null,
  };

  function boot() {
    const refs = {
      issuerInput: document.getElementById('egIssuerInput'),
      presets: document.getElementById('egPresets'),
      signalCard: document.getElementById('egSignalCard'),
      metricsGrid: document.getElementById('egMetricsGrid'),
      overallSummary: document.getElementById('egOverallSummary'),
      graphMount: document.getElementById('egGraphMount'),
      legendMount: document.getElementById('egLegendMount'),
      entityDetail: document.getElementById('egEntityDetail'),
      concentrationList: document.getElementById('egConcentrationList'),
      watchList: document.getElementById('egWatchList'),
      radarMount: document.getElementById('egRadarMount'),
      rootCause: document.getElementById('egRootCause'),
      evidence: document.getElementById('egEvidence'),
      status: document.getElementById('egStatusText'),
      updated: document.getElementById('egUpdatedText'),
      tabs: Array.from(document.querySelectorAll('[data-eg-tab-target]')),
      panels: Array.from(document.querySelectorAll('.eg-tab-panel')),
      refreshBtn: document.getElementById('egRefreshBtn'),
    };

    state.issuer = getIssuerFromUrl() || state.issuer;
    refs.issuerInput.value = state.issuer;
    hydratePresets(refs);

    refs.tabs.forEach((tab) => addManagedListener(tab, 'click', () => setActiveTab(refs, tab.dataset.egTabTarget)));

    const triggerRefresh = async () => {
      state.issuer = refs.issuerInput.value.trim();
      syncIssuerToUrl(state.issuer);
      await refreshAllData(refs);
      render(refs);
    };

    addManagedListener(refs.refreshBtn, 'click', triggerRefresh);
    addManagedListener(refs.issuerInput, 'change', triggerRefresh);
    addManagedListener(refs.issuerInput, 'keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        triggerRefresh();
      }
    });

    addManagedListener(refs.presets, 'click', async (event) => {
      const button = event.target.closest('[data-eg-preset]');
      if (!button) return;
      state.mode = 'ok';
      state.issuer = button.dataset.egPreset;
      refs.issuerInput.value = state.issuer;
      syncIssuerToUrl(state.issuer);
      await refreshAllData(refs);
      render(refs);
    });

    addManagedListener(refs.graphMount, 'click', (event) => {
      const nodeEl = event.target.closest('[data-eg-node-id]');
      if (!nodeEl) return;
      state.selectedNodeId = nodeEl.dataset.egNodeId;
      render(refs);
    });

    addManagedListener(refs.graphMount, 'keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const nodeEl = event.target.closest('[data-eg-node-id]');
      if (!nodeEl) return;
      event.preventDefault();
      state.selectedNodeId = nodeEl.dataset.egNodeId;
      render(refs);
    });

    addManagedListener(window, 'pagehide', cleanupRuntime);
    addManagedListener(window, 'beforeunload', cleanupRuntime);

    refreshAllData(refs).finally(() => render(refs));
  }

  function hydratePresets(refs) {
    if (!refs.presets) return;
    refs.presets.innerHTML = ISSUER_PRESETS.map((preset) => `<button type="button" class="eg-preset" data-eg-preset="${preset.issuer}">${preset.label}</button>`).join('');
  }

  function addManagedListener(target, eventName, handler, options) {
    if (!target) return;
    target.addEventListener(eventName, handler, options);
    lifecycle.cleanups.push(() => target.removeEventListener(eventName, handler, options));
  }

  function resetRefreshController() {
    if (lifecycle.refreshController) {
      lifecycle.refreshController.abort();
      lifecycle.refreshController = null;
    }
  }

  function cleanupRuntime() {
    resetRefreshController();
    while (lifecycle.cleanups.length) {
      const dispose = lifecycle.cleanups.pop();
      dispose();
    }
  }

  function getIssuerFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get(URL_ISSUER_KEY)?.trim() || '';
  }

  function syncIssuerToUrl(issuer) {
    const url = new URL(window.location.href);
    if (!issuer) {
      url.searchParams.delete(URL_ISSUER_KEY);
    } else {
      url.searchParams.set(URL_ISSUER_KEY, issuer);
    }
    window.history.replaceState({}, '', url);
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

  async function refreshAllData(refs) {
    const seq = ++state.refreshSeq;
    resetRefreshController();
    lifecycle.refreshController = new AbortController();
    const { signal } = lifecycle.refreshController;

    if (!isValidIssuer(state.issuer)) {
      state.risk = { status: 'invalid', error: 'Enter a valid XRPL issuer address to load risk evidence.', flags: null, accountFlags: null, source: null };
      state.exposure = { status: 'no_issuer', error: 'Enter a valid XRPL issuer address to load exposure.', model: null, source: null };
      lifecycle.refreshController = null;
      return;
    }

    const previousRisk = state.risk;
    const previousExposure = state.exposure;
    state.risk = { status: 'loading', error: null, flags: previousRisk.flags, accountFlags: previousRisk.accountFlags, source: previousRisk.source };
    state.exposure = { status: 'loading', error: null, model: previousExposure.model, source: previousExposure.source };
    render(refs);

    const [riskResult, exposureResult] = await Promise.allSettled([
      fetchIssuerRisk(state.issuer, { signal }),
      fetchIssuerExposure(state.issuer, { signal }),
    ]);

    if (seq !== state.refreshSeq || signal.aborted) return;

    if (riskResult.status === 'fulfilled') {
      const { flags, accountFlags, source } = riskResult.value;
      state.risk = { status: 'ready', error: null, flags, accountFlags, source };
    } else {
      const message = riskResult.reason?.message || 'Unable to fetch issuer account data right now.';
      if (isAbortError(riskResult.reason)) return;
      if (canUseStaleRisk(previousRisk)) {
        state.risk = { ...previousRisk, status: 'stale', error: message };
      } else {
        state.risk = { status: 'error', error: message, flags: null, accountFlags: null, source: null };
      }
    }

    if (exposureResult.status === 'fulfilled') {
      const { model, source } = exposureResult.value;
      if (!model.counterparties.length || model.totalExposure === 0) {
        state.exposure = { status: 'empty', error: null, model, source };
      } else {
        state.exposure = { status: 'ready', error: null, model, source };
        if (!model.nodes.some((node) => node.id === state.selectedNodeId)) {
          state.selectedNodeId = 'issuer';
        }
      }
    } else {
      const message = exposureResult.reason?.message || 'Unable to fetch issuer exposure.';
      if (isAbortError(exposureResult.reason)) return;
      if (canUseStaleExposure(previousExposure)) {
        state.exposure = { ...previousExposure, status: 'stale', error: message };
      } else {
        state.exposure = { status: 'error', error: message, model: null, source: null };
      }
    }

    lifecycle.refreshController = null;
  }

  function canUseStaleExposure(snapshot) {
    return ['ready', 'empty', 'stale'].includes(snapshot?.status) && !!snapshot?.model;
  }

  function canUseStaleRisk(snapshot) {
    return ['ready', 'stale'].includes(snapshot?.status) && !!snapshot?.flags;
  }

  function isAbortError(error) {
    return error?.name === 'AbortError';
  }

  async function fetchIssuerExposure(issuer, options = {}) {
    const payload = { method: 'account_lines', params: [{ account: issuer, ledger_index: 'validated', limit: 400 }] };
    const response = await fetch(XRPL_PROXY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error('Exposure fetch failed at XSIC XRPL proxy.');
    }

    const json = await response.json();
    const source = json?.endpointUsed || XRPL_PROXY_ENDPOINT;
    const lines = extractAccountLines(json);

    if (!Array.isArray(lines)) {
      throw new Error('Exposure data format is invalid.');
    }

    return {
      source,
      model: buildExposureModel(issuer, lines),
    };
  }

  function extractAccountLines(json) {
    const candidates = [
      json?.result?.result?.lines,
      json?.result?.lines,
      json?.result?.data?.lines,
      json?.data?.result?.lines,
      json?.data?.lines,
      json?.lines,
    ];
    return candidates.find((item) => Array.isArray(item)) || [];
  }

  function buildExposureModel(issuer, lines) {
    const enriched = lines
      .map((line) => {
        const exposureValue = Math.abs(Number.parseFloat(String(line.balance ?? '0')) || 0);
        const account = String(line.account || '').trim();
        return { account, currency: line.currency || 'IOU', exposureValue };
      })
      .filter((line) => line.account && Number.isFinite(line.exposureValue) && line.exposureValue > 0)
      .sort((a, b) => b.exposureValue - a.exposureValue);

    const usableLineCount = enriched.length;
    const totalExposure = enriched.reduce((sum, row) => sum + row.exposureValue, 0);
    const counterparties = enriched.slice(0, MAX_VISIBLE_COUNTERPARTIES).map((row, index) => {
      const share = totalExposure > 0 ? row.exposureValue / totalExposure : 0;
      return {
        id: `cp-${index + 1}`,
        address: row.account,
        label: `${row.account.slice(0, 6)}…${row.account.slice(-4)}`,
        currency: row.currency,
        exposureValue: row.exposureValue,
        share,
      };
    });

    const nodes = [
      {
        id: 'issuer',
        name: 'Issuer',
        address: issuer,
        exposureValue: totalExposure,
        share: 1,
        x: 380,
        y: 194,
        r: 19,
      },
      ...counterparties.map((party, index) => {
        const angle = (Math.PI * 2 * index) / Math.max(counterparties.length, 1) - Math.PI / 2;
        return {
          ...party,
          name: party.label,
          x: 380 + Math.cos(angle) * 250,
          y: 194 + Math.sin(angle) * 122,
          r: 9 + Math.min(13, Math.round(party.share * 100)),
        };
      }),
    ];

    const top3Share = counterparties.slice(0, 3).reduce((sum, item) => sum + item.share, 0);
    const top5Share = counterparties.slice(0, 5).reduce((sum, item) => sum + item.share, 0);

    return {
      issuer,
      totalExposure,
      lineCount: lines.length,
      usableLineCount,
      coveredExposure: counterparties.reduce((sum, item) => sum + item.exposureValue, 0),
      counterparties,
      nodes,
      top3Share,
      top5Share,
    };
  }

  async function fetchIssuerRisk(issuer, options = {}) {
    let payload = null;
    let source = null;
    for (const endpoint of XRPL_ACCOUNT_INFO_ENDPOINTS) {
      const url = `${endpoint}${encodeURIComponent(issuer)}&ledger_index=validated`;
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: options.signal });
      if (!response.ok) continue;
      const json = await response.json();
      const accountData = extractAccountInfo(json);
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
          signal: options.signal,
        });
        if (!rpcRes.ok) continue;
        const rpcJson = await rpcRes.json();
        const rpcAccount = extractAccountInfo(rpcJson);
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

  function extractAccountInfo(json) {
    return json?.result?.account_data
      || json?.result?.result?.account_data
      || json?.data?.result?.account_data
      || json?.data?.account_data
      || json?.account_data
      || null;
  }

  function render(refs) {
    refs.status.textContent = describeStatusLine();
    refs.updated.textContent = new Date().toLocaleTimeString();

    renderSignal(refs.signalCard);
    renderMetrics(refs.metricsGrid);
    renderOverallSummary(refs.overallSummary);
    renderExposure(refs);
    renderRisk(refs);
  }

  function renderExposure(refs) {
    if (state.exposure.status === 'loading') {
      refs.graphMount.innerHTML = '<div class="eg-empty">Loading live issuer exposure from validated XRPL ledger…</div>';
      refs.entityDetail.innerHTML = '<p class="eg-meta">Awaiting exposure model.</p>';
      refs.concentrationList.innerHTML = '<p class="eg-meta">Concentration summary will appear after load.</p>';
      refs.watchList.innerHTML = '<p class="eg-meta">Watch / activity panel is waiting for data.</p>';
      renderLegend(refs.legendMount);
      return;
    }

    if (state.exposure.status === 'no_issuer') {
      refs.graphMount.innerHTML = '<div class="eg-empty">Enter a valid issuer or use a preset to build a live exposure graph.</div>';
      refs.entityDetail.innerHTML = '<p class="eg-meta">No issuer selected.</p>';
      refs.concentrationList.innerHTML = '<p class="eg-meta">Concentration metrics unavailable.</p>';
      refs.watchList.innerHTML = '<p class="eg-meta">No activity rows without issuer data.</p>';
      renderLegend(refs.legendMount);
      return;
    }

    if (state.exposure.status === 'error') {
      refs.graphMount.innerHTML = `<div class="eg-error">${state.exposure.error || 'Exposure data unavailable.'}</div>`;
      refs.entityDetail.innerHTML = '<p class="eg-meta">The issuer could not be modeled from current API output.</p>';
      refs.concentrationList.innerHTML = '<p class="eg-meta">No concentration data.</p>';
      refs.watchList.innerHTML = '<p class="eg-meta">No watch items.</p>';
      renderLegend(refs.legendMount);
      return;
    }

    if (state.exposure.status === 'empty') {
      const model = state.exposure.model;
      const hasLines = Number(model?.lineCount || 0) > 0;
      const noUsableLines = hasLines && Number(model?.usableLineCount || 0) === 0;
      refs.graphMount.innerHTML = `<div class="eg-empty">${noUsableLines ? 'Trustlines were returned, but none had usable positive balances for concentration weighting.' : 'No trustline exposure detected for this issuer in validated ledger data.'}</div>`;
      refs.entityDetail.innerHTML = `<p class="eg-meta">${noUsableLines ? 'This can happen when balances are zero, missing, or non-numeric in the current snapshot.' : 'No counterparties to inspect.'}</p>`;
      refs.concentrationList.innerHTML = '<p class="eg-meta">Concentration metrics unavailable because total exposure is zero. Try another issuer or refresh later.</p>';
      refs.watchList.innerHTML = '<p class="eg-meta">No watch rows because no weighted counterparties are available.</p>';
      renderLegend(refs.legendMount);
      return;
    }

    const isStale = state.exposure.status === 'stale';
    renderGraph(refs, { stale: isStale, staleReason: state.exposure.error });
    renderLegend(refs.legendMount);
    renderEntity(refs);

    const model = state.exposure.model;
    refs.concentrationList.innerHTML = `
      <ul class="eg-list">
        ${isStale ? `<li>Stale snapshot: showing previous exposure because the latest refresh failed (${state.exposure.error || 'refresh unavailable'}).</li>` : ''}
        <li>Top 3 share: ${toPct(model.top3Share)}</li>
        <li>Top 5 share: ${toPct(model.top5Share)}</li>
        <li>Visible nodes: ${model.nodes.length} (bounded)</li>
        <li>Usable counterparties: ${model.usableLineCount}/${model.lineCount}</li>
        <li>${model.usableLineCount <= 3 ? 'Very few counterparties detected; concentration may swing quickly.' : 'Snapshot includes enough counterparties for stable ranking.'}</li>
      </ul>`;

    refs.watchList.innerHTML = model.counterparties.slice(0, 5).map((party, index) => {
      const flag = party.share >= 0.25 ? 'watch high' : party.share >= 0.12 ? 'watch medium' : 'stable';
      return `<div class="eg-watch-row"><span>#${index + 1} ${party.label}</span><strong>${flag}</strong></div>`;
    }).join('') || '<p class="eg-meta">No watch rows.</p>';
  }



  function getExposureSignal() {
    const model = state.exposure.model;
    if ((state.exposure.status === 'ready' || state.exposure.status === 'stale') && model) {
      const top1 = model.counterparties?.[0]?.share || 0;
      const top3 = model.top3Share || 0;
      const visibilityRatio = model.lineCount > 0 ? model.counterparties.length / model.lineCount : 0;
      const bounded = model.lineCount > model.counterparties.length;
      let badge = 'distributed';
      let score = 1;
      if (top1 >= 0.5 || top3 >= 0.82) {
        badge = 'highly concentrated';
        score = 3;
      } else if (top1 >= 0.25 || top3 >= 0.6) {
        badge = 'moderately concentrated';
        score = 2;
      }
      if (bounded && visibilityRatio < 0.3) {
        badge = 'limited visibility';
      }
      return {
        status: 'ready',
        badge,
        score,
        bounded,
        top1,
        top3,
        top5: model.top5Share || 0,
        visibilityRatio,
        lineCount: model.lineCount,
        usableLineCount: model.usableLineCount || 0,
        visibleCount: model.counterparties.length,
        isStale: state.exposure.status === 'stale',
      };
    }
    return { status: state.exposure.status, badge: 'limited visibility', score: 0, bounded: true, top1: 0, top3: 0, top5: 0, visibilityRatio: 0, lineCount: 0, usableLineCount: 0, visibleCount: 0, isStale: false };
  }

  function getRiskSignal() {
    const model = getRiskModel();
    const entries = Object.values(model.statuses || {});
    const unknownCount = entries.filter((v) => v === 'Unknown').length;
    const observedCount = entries.filter((v) => v === 'Observed').length;
    const controlRiskCount = ['GlobalFreeze', 'Clawback', 'RequireAuth'].filter((key) => model.statuses?.[key] === 'Observed').length;
    return {
      statuses: model.statuses,
      unknownCount,
      observedCount,
      controlRiskCount,
      hasUnknown: unknownCount > 0,
      isStale: state.risk.status === 'stale',
    };
  }

  function isPartialState() {
    const exposureUsable = ['ready', 'stale'].includes(state.exposure.status);
    const riskUsable = ['ready', 'stale'].includes(state.risk.status);
    return exposureUsable !== riskUsable;
  }

  function describeStatusLine() {
    const exposure = state.exposure.status;
    const risk = state.risk.status;
    const partial = isPartialState();

    if (exposure === 'loading' || risk === 'loading') return 'Loading issuer exposure and risk…';
    if (exposure === 'no_issuer' || risk === 'invalid') return 'Enter a valid issuer to load exposure and risk.';
    if (exposure === 'error' && risk === 'error') return 'Exposure and risk could not be loaded.';
    if (exposure === 'error') return 'Exposure unavailable; issuer risk is shown from current data.';
    if (risk === 'error') return 'Issuer risk unavailable; exposure is shown from current data.';
    if (exposure === 'stale' || risk === 'stale') {
      return partial
        ? 'Showing a mixed live/stale read while one data source recovers.'
        : 'Showing the latest readable snapshot while live refresh recovers.';
    }
    if (exposure === 'empty' && risk === 'ready') return 'No usable trustline exposure found; issuer risk is available.';
    if (exposure === 'ready' && risk === 'ready') return 'Live issuer exposure and risk loaded.';
    if (partial) return 'Partial issuer read loaded.';
    return 'Waiting for issuer data.';
  }

  function getOverallSummaryModel() {
    const exposure = getExposureSignal();
    const risk = getRiskSignal();

    if (state.exposure.status === 'no_issuer' || state.risk.status === 'invalid') {
      return {
        status: 'Unknown',
        insights: ['Enter a valid issuer to compute concentration and issuer-control signals.'],
        why: 'Without a valid issuer, neither concentration nor control risk can be evaluated.',
        confidence: 'Low confidence: no issuer data loaded.',
        exposureBadge: 'limited visibility',
        scoreBreakdown: 'Exposure score 0 + control score 0',
      };
    }

    const exposureReady = ['ready', 'stale'].includes(state.exposure.status);
    const riskReady = ['ready', 'stale'].includes(state.risk.status);
    let score = exposure.score + risk.controlRiskCount;
    if (risk.hasUnknown) score -= 1;
    if (!exposureReady || !riskReady) score = 0;

    const status = score >= 5 ? 'High' : score >= 3 ? 'Medium' : score > 0 ? 'Low' : 'Unknown';
    const insights = [];

    if (exposure.status === 'ready') {
      insights.push(`Exposure is ${exposure.badge}; top holder share is ${toPct(exposure.top1)} and top 3 share is ${toPct(exposure.top3)}.`);
      insights.push(`Visible counterparties: ${exposure.visibleCount}/${exposure.usableLineCount || exposure.lineCount}${exposure.bounded ? ' (bounded top counterparties view).' : '.'}`);
      if ((exposure.usableLineCount || 0) <= 3) {
        insights.push('Very few weighted counterparties were found, so concentration labels can change sharply between refreshes.');
      }
    } else {
      insights.push('Exposure concentration is not currently available from live trustline data.');
    }

    const observedControls = ['Freeze', 'GlobalFreeze', 'Clawback', 'RequireAuth'].filter((key) => risk.statuses?.[key] === 'Observed');
    insights.push(observedControls.length
      ? `Issuer controls observed: ${observedControls.join(', ')}.`
      : 'No issuer-control flags are currently observed from account flags.');

    if (risk.hasUnknown) {
      insights.push(`Risk evidence has ${risk.unknownCount} unknown control checks; treat this as a bounded-confidence read.`);
    }

    if (exposure.isStale || risk.isStale) {
      insights.push('Stale snapshot in use: latest refresh failed, so previous successful data is still displayed for continuity.');
    }

    if (!exposureReady && riskReady) {
      insights.push('Partial fetch: issuer-control risk loaded, but exposure is unavailable or empty.');
    } else if (exposureReady && !riskReady) {
      insights.push('Partial fetch: exposure loaded, but issuer-control evidence is unavailable.');
    }

    const why = 'Concentration can amplify issuer actions: when exposures cluster, issuer controls (Freeze / GlobalFreeze / Clawback / RequireAuth) can impact a larger share of holders at once.';
    const confidence = (exposureReady && riskReady && !risk.hasUnknown)
      ? 'Higher confidence: both dimensions loaded from live sources; exposure still uses bounded top-counterparties rendering.'
      : 'Bounded confidence: one or more dimensions are unknown, loading, failed, or bounded to top counterparties only.';

    return {
      status,
      insights: insights.slice(0, 6),
      why,
      confidence,
      exposureBadge: exposure.badge,
      scoreBreakdown: `Exposure score ${exposureReady ? exposure.score : 0} + control score ${riskReady ? risk.controlRiskCount : 0}${risk.hasUnknown ? ' - unknown penalty 1' : ''}`
    };
  }

  function renderOverallSummary(mount) {
    if (!mount) return;
    const model = getOverallSummaryModel();
    const statusClass = `eg-status-chip--${model.status.toLowerCase()}`;
    mount.innerHTML = `
      <div class="eg-overall-head">
        <div>
          <p class="eyebrow">Overall Summary</p>
          <h3 class="eg-section-title">Decision-grade combined read</h3>
        </div>
        <div class="eg-overall-status-wrap">
          <span class="eg-status-chip ${statusClass}">${model.status}</span>
          <span class="eg-badge">${model.exposureBadge}</span>
        </div>
      </div>
      <ul class="eg-list eg-list--tight">${model.insights.map((item) => `<li>${item}</li>`).join('')}</ul>
      <div class="eg-overall-foot">
        <p class="eg-meta"><strong>Why this matters:</strong> ${model.why}</p>
        <p class="eg-meta"><strong>Method:</strong> ${model.scoreBreakdown}</p>
        <p class="eg-meta"><strong>Confidence:</strong> ${model.confidence}</p>
      </div>`;
  }

  function renderLegend(mount) {
    if (!mount) return;
    mount.innerHTML = `
      <div class="eg-legend-grid">
        <div><strong>Node meaning</strong><p class="eg-meta">Center node is issuer. Outer nodes are top counterparties by absolute trustline exposure.</p></div>
        <div><strong>Edge thickness</strong><p class="eg-meta">Thicker edges indicate higher visible share concentration from issuer to that counterparty.</p></div>
        <div><strong>Bounded view</strong><p class="eg-meta">Graph is intentionally limited to top ${MAX_VISIBLE_COUNTERPARTIES} counterparties for fast live refresh and stable layout.</p></div>
      </div>`;
  }

  function renderSignal(mount) {
    const model = state.exposure.model;
    const topShare = model?.counterparties?.[0]?.share || 0;
    const concentrationLabel = ['ready', 'stale'].includes(state.exposure.status)
      ? (topShare >= 0.35 ? 'High' : topShare >= 0.2 ? 'Medium' : 'Low')
      : 'Unknown';
    const staleSuffix = state.exposure.status === 'stale' ? ' · stale snapshot' : '';

    mount.innerHTML = `
      <div class="eg-signal-block"><div class="eg-signal-label">Status</div><span class="eg-pill">${concentrationLabel}</span><p class="eg-meta">issuer concentration from live trustlines${staleSuffix}</p></div>
      <div class="eg-signal-block"><div class="eg-signal-label">Top concentration</div><div class="eg-hero-value">${toPct(topShare)}</div><p class="eg-meta">largest visible counterparty share (High ≥35%, Medium ≥20%)</p></div>
      <div class="eg-signal-block"><div class="eg-signal-label">Coverage</div><p class="eg-meta">${model ? `${model.counterparties.length} shown / ${model.usableLineCount} usable / ${model.lineCount} reported` : 'No model loaded yet. Enter an issuer or use a preset.'}</p></div>
      <div class="eg-signal-block"><div class="eg-signal-label">Context</div><p class="eg-meta">Exposure = trustline concentration. Risk = issuer account-control evidence.</p></div>`;
  }

  function renderMetrics(mount) {
    const model = state.exposure.model;
    const metrics = [
      ['Total exposure', model ? formatAmount(model.totalExposure) : '—', 'sum of absolute trustline balances'],
      ['Entities visible', model ? String(model.nodes.length) : '—', 'fixed max node count'],
      ['Top node share', model ? toPct(model.counterparties?.[0]?.share || 0) : '—', 'largest visible counterparty'],
      ['Top 5 concentration', model ? toPct(model.top5Share) : '—', 'share captured by top 5 nodes'],
    ];

    mount.innerHTML = metrics.map((m) => `<article class="card eg-metric-card"><div class="eg-metric-label">${m[0]}</div><div class="eg-metric-value">${m[1]}</div><div class="eg-metric-sub">${m[2]}</div></article>`).join('');
  }

  function renderGraph(refs, options = {}) {
    const model = state.exposure.model;
    if (!model) {
      refs.graphMount.innerHTML = '<div class="eg-empty">No graph data.</div>';
      return;
    }

    const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
    const links = model.nodes.filter((n) => n.id !== 'issuer').map((node) => ['issuer', node.id]);
    const lines = links.map(([a, b]) => {
      const n1 = nodeById.get(a);
      const n2 = nodeById.get(b);
      const strokeWidth = Math.max(1.5, Math.min(8, (n2.share || 0) * 22));
      return `<line x1="${n1.x}" y1="${n1.y}" x2="${n2.x}" y2="${n2.y}" stroke="rgba(111,99,194,.35)" stroke-width="${strokeWidth}" />`;
    }).join('');

    const nodes = model.nodes.map((n) => {
      const label = n.id === 'issuer' ? 'Issuer' : n.label;
      const share = n.id === 'issuer' ? '100%' : toPct(n.share);
      const selected = n.id === state.selectedNodeId;
      return `<g class="eg-node" data-eg-node-id="${n.id}" tabindex="0" role="button" aria-label="${label} ${share}">
        <circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${selected ? 'rgba(111,99,194,.82)' : 'rgba(111,99,194,.5)'}"/>
        <text x="${n.x}" y="${n.y + n.r + 14}" text-anchor="middle" font-size="11" fill="#4b5563">${label}</text>
      </g>`;
    }).join('');

    const staleBanner = options.stale
      ? `<div class="eg-meta">Stale snapshot: latest refresh failed (${options.staleReason || 'no detail'}). Displaying previous exposure graph.</div>`
      : '';
    refs.graphMount.innerHTML = `${staleBanner}<svg class="eg-graph-svg" viewBox="0 0 760 388" role="img" aria-label="Exposure graph">${lines}${nodes}</svg>`;
  }

  function renderEntity(refs) {
    const model = state.exposure.model;
    if (!model) {
      refs.entityDetail.innerHTML = '<p class="eg-meta">No entity data.</p>';
      return;
    }

    const node = model.nodes.find((item) => item.id === state.selectedNodeId) || model.nodes[0];
    if (node.id === 'issuer') {
      refs.entityDetail.innerHTML = `<div class="eg-kv"><strong>Issuer</strong><div class="eg-break-anywhere">${model.issuer}</div><div>Total exposure: ${formatAmount(model.totalExposure)}</div><div class="eg-break-anywhere">Data source: ${state.exposure.source}</div></div>`;
      return;
    }

    refs.entityDetail.innerHTML = `<div class="eg-kv"><strong>${node.label}</strong><div class="eg-break-anywhere">${node.address}</div><div>Visible share: ${toPct(node.share)}</div><div>Exposure: ${formatAmount(node.exposureValue)} ${node.currency}</div></div>`;
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
    if (state.mode === 'empty' || state.risk.status === 'empty') return buildUnknownRiskModel('No evidence available in empty mode.');
    if (state.risk.status === 'invalid') return buildUnknownRiskModel(state.risk.error);
    if (state.mode === 'error' || state.risk.status === 'error') return buildUnknownRiskModel(state.risk.error || 'Risk data unavailable due to a fetch failure.');
    if (state.risk.status === 'loading') return buildUnknownRiskModel('Loading live issuer account flags from XRPL.');
    if (state.risk.status !== 'ready' && state.risk.status !== 'stale') return buildUnknownRiskModel('Risk evidence is unavailable.');
    if (!state.risk.flags) return buildUnknownRiskModel('Risk evidence is unavailable.');

    const entries = Object.entries(state.risk.flags);
    const observedCount = entries.filter(([, v]) => v === 'Observed').length;
    const unknownCount = entries.filter(([, v]) => v === 'Unknown').length;

    return {
      statuses: state.risk.flags,
      summary: [
        state.risk.status === 'stale' ? `Stale snapshot: latest risk refresh failed (${state.risk.error || 'no detail'}), continuing with prior evidence.` : null,
        `${observedCount} of ${entries.length} issuer-control checks are observed from account flags.`,
        unknownCount ? `${unknownCount} checks are Unknown because source data is incomplete.` : 'All checks were derived from current account flags.',
        `Source: ${state.risk.source || 'XRPL account info endpoint'} · account Flags=${state.risk.accountFlags}`,
      ].filter(Boolean),
      evidence: entries.map(([flag, status]) => ({
        title: flag,
        status,
        kind: status.toLowerCase().replace(/\s+/g, '-'),
        note: describeRiskEvidence(flag, status),
      })),
    };
  }

  function describeRiskEvidence(flag, status) {
    if (status === 'Unknown') {
      return 'Unknown means the app cannot confirm this control from current data.';
    }
    if (flag === 'Freeze') {
      return status === 'Observed'
        ? 'Observed means lsfNoFreeze is not set, so issuer-side freeze remains possible.'
        : 'Not observed means lsfNoFreeze is set, so issuer-side freeze is disabled.';
    }
    return status === 'Observed'
      ? 'Observed means the issuer flag is set in current account data.'
      : 'Not observed means the flag is not set in current account data.';
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

  function toPct(value) {
    return `${((value || 0) * 100).toFixed(1)}%`;
  }

  function formatAmount(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return '0';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
  }

  boot();
})();
