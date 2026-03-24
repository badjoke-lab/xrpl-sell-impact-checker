(() => {
  let appCleanup = null;
  const LITE_KEY = 'xsic.flowAlert.liteMode';
  const DEMO_KEY = 'xsic.flowAlert.demoOnly.v2';
  const PRESET_KEY = 'xsic.flowAlert.targetPreset';
  const WINDOW_KEY = 'xsic.flowAlert.window';
  const PRIMARY_HISTORY_WINDOWS = new Set(['1h', '24h', '7d']);


  const WINDOW_PROFILE = {
    '5m': {
      role: 'short-window assist',
      quietHint: 'Short window assist mode: low signal density is normal.',
      emptyHint: 'No labeled flow in this short assist window yet. This is normal—try 1h or 24h for denser signal.',
      try24h: true,
      quietAbsNetXrp: 40_000,
      quietDeltaXrp: 40_000,
      lowAbsNetXrp: 180_000,
      mediumAbsNetXrp: 700_000,
      eventMedium: 2,
      eventHigh: 4,
    },
    '1h': {
      role: 'standard observation window',
      quietHint: 'No major labeled flow in the standard 1h window.',
      emptyHint: 'No major labeled flow in the standard 1h window. If conditions stay quiet, compare with 24h for broader context.',
      try24h: true,
      quietAbsNetXrp: 70_000,
      quietDeltaXrp: 70_000,
      lowAbsNetXrp: 250_000,
      mediumAbsNetXrp: 1_000_000,
      eventMedium: 2,
      eventHigh: 5,
    },
    '24h': {
      role: 'primary comparison window',
      quietHint: 'No major labeled flow across the broader 24h primary window.',
      emptyHint: 'No major labeled flow across the broader 24h primary window.',
      try24h: false,
      quietAbsNetXrp: 120_000,
      quietDeltaXrp: 120_000,
      lowAbsNetXrp: 300_000,
      mediumAbsNetXrp: 1_200_000,
      eventMedium: 3,
      eventHigh: 6,
    },
    '7d': {
      role: 'trend confirmation window',
      quietHint: 'No major labeled trend flow detected in the sampled 7d window.',
      emptyHint: 'No major labeled trend flow detected in the sampled 7d window. Use 24h for primary comparisons.',
      try24h: true,
      quietAbsNetXrp: 220_000,
      quietDeltaXrp: 220_000,
      lowAbsNetXrp: 500_000,
      mediumAbsNetXrp: 1_800_000,
      eventMedium: 3,
      eventHigh: 7,
    },
  };

  function getWindowProfile(windowKey) {
    return WINDOW_PROFILE[windowKey] || WINDOW_PROFILE['1h'];
  }

  function describeHeaderStatus(state) {
    const historySource = state.historyPayload?.source;
    if ((historySource === 'repo-json' || historySource === 'runtime-fallback') && state.mode === 'stale') {
      return 'HISTORY';
    }
    if (state.isFetching && state.payload && state.mode === 'ok') {
      return 'REFRESHING';
    }
    return state.mode.toUpperCase();
  }

  function describeHeaderUpdated(updatedTs, state) {
    if (!updatedTs) return '—';
    const historySource = state.historyPayload?.source;
    if (historySource === 'repo-json' || historySource === 'runtime-fallback') {
      return `history ${formatDateTime(updatedTs)}`;
    }
    return relativeSeconds(updatedTs);
  }

  function boot() {
    try { localStorage.removeItem('xsic.flowAlert.demoOnly'); } catch { }
    if (typeof appCleanup === 'function') appCleanup();
    const refs = {
      canvasWrap: document.getElementById('flowCanvasWrap'),
      canvas: document.getElementById('flowCanvas'),
      tooltip: document.getElementById('flowTooltip'),
      statusMeta: document.querySelector('[data-flow-meta="status"]'),
      refreshMeta: document.querySelector('[data-flow-meta="refresh"]'),
      staleNote: document.getElementById('flowStaleNote'),
      liteToggle: document.getElementById('flow-lite-toggle'),
      demoToggle: document.getElementById('flow-demo-toggle'),
      presetSelect: document.getElementById('flow-target-preset'),
      windowSelect: document.getElementById('flow-window'),
      refreshButton: document.getElementById('flow-refresh-button'),
      retryButton: document.getElementById('flow-retry-button'),
      emptyButton: document.getElementById('flow-empty-button'),
      overlays: {
        loading: document.querySelector('[data-flow-state="loading"]'),
        error: document.querySelector('[data-flow-state="error"]'),
        empty: document.querySelector('[data-flow-state="empty"]'),
      },
      signal: {
        statusPill: document.querySelector('[data-flow-signal="status-pill"]'),
        severity: document.querySelector('[data-flow-signal="severity"]'),
        impact: document.querySelector('[data-flow-signal="impact"]'),
        why: document.querySelector('[data-flow-signal="why"]'),
        observed: document.querySelector('[data-flow-signal="observed"]'),
        context: document.querySelector('[data-flow-signal="context"]'),
        ctxPreset: document.querySelector('[data-flow-signal="ctx-preset"]'),
        ctxWindow: document.querySelector('[data-flow-signal="ctx-window"]'),
        ctxSource: document.querySelector('[data-flow-signal="ctx-source"]'),
      },
      snapshot: {
        inflow: document.querySelector('[data-flow-snapshot="inflow"]'),
        outflow: document.querySelector('[data-flow-snapshot="outflow"]'),
        net: document.querySelector('[data-flow-snapshot="net"]'),
        payments: document.querySelector('[data-flow-snapshot="payments"]'),
        ledgers: document.querySelector('[data-flow-snapshot="ledgers"]'),
        matched: document.querySelector('[data-flow-snapshot="matched"]'),
        source: document.querySelector('[data-flow-snapshot="source"]'),
        updated: document.querySelector('[data-flow-snapshot="updated"]'),
        subNet: document.querySelector('[data-flow-snapshot-sub="net"]'),
        subMatched: document.querySelector('[data-flow-snapshot-sub="matched"]'),
        subUpdated: document.querySelector('[data-flow-snapshot-sub="updated"]'),
      },
      reasonTitle: document.getElementById('flowReasonTitle'),
      reasonCopy: document.getElementById('flowReasonCopy'),
      reasonList: document.getElementById('flowReasonList'),
      recentFlows: document.getElementById('flowRecentFlows'),
      eventsEmpty: document.getElementById('flowEventsEmptyState'),
      escrow: {
        next: document.getElementById('flowEscrowNext'),
        recent: document.getElementById('flowEscrowRecent'),
        pattern: document.getElementById('flowEscrowPattern'),
        stats: document.getElementById('flowEscrowStats'),
      },
      history: {
        latestTs: document.getElementById('flowHistoryLatestTs'),
        netDelta: document.getElementById('flowHistoryNetDelta'),
        recentCount: document.getElementById('flowHistoryRecentCount'),
        lastEvent: document.getElementById('flowHistoryLastEvent'),
      },
      historyStrip: {
        root: document.querySelector('[data-flow-history-strip]'),
        netSvg: document.querySelector('[data-flow-history="net-svg"]'),
        netCompare: document.querySelector('[data-flow-history="net-compare"]'),
        matchedBars: document.querySelector('[data-flow-history="matched-bars"]'),
        matchedCompare: document.querySelector('[data-flow-history="matched-compare"]'),
        status: document.querySelector('[data-flow-history="status"]'),
      },
    };

    if (!refs.canvas || !refs.canvasWrap) return;
    appCleanup = init(refs);
  }

  function init(refs) {
    const state = {
      mode: 'loading',
      forcedMode: null,
      liteMode: loadBool(LITE_KEY),
      demoOnly: loadBool(DEMO_KEY, false),
      preset: loadValue(PRESET_KEY, 'exchanges') || 'exchanges',
      window: loadValue(WINDOW_KEY, '1h'),
      payload: null,
      escrowPayload: null,
      historyPayload: null,
      heatmapCells: [],
      hoveredCell: null,
      pinnedCell: null,
      lastRefreshMs: 0,
      timer: null,
      resizeTimer: null,
      hoverRaf: 0,
      isFetching: false,
      isPageHidden: document.hidden === true,
      abortController: null,
      detectedEventsCache: {},
      heatmapLayout: null,
    };

    const cleanups = [];
    const addManagedListener = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      cleanups.push(() => target.removeEventListener(type, handler, options));
    };
    const stopPolling = () => {
      if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
      }
    };
    const abortInFlight = () => {
      if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
      }
    };
    const startPolling = () => {
      if (state.isPageHidden) return;
      stopPolling();
      state.timer = window.setInterval(() => syncData(refs, state), state.liteMode ? 12_000 : 8_000);
    };

    refs.liteToggle.checked = state.liteMode;
    refs.demoToggle.checked = state.demoOnly;
    refs.presetSelect.value = state.preset;
    refs.windowSelect.value = state.window;

    const liteToggleHandler = () => {
      state.liteMode = refs.liteToggle.checked;
      saveBool(LITE_KEY, state.liteMode);
      renderCycle();
    };
    addManagedListener(refs.liteToggle, 'change', liteToggleHandler);

    const demoToggleHandler = () => {
      state.demoOnly = refs.demoToggle.checked;
      saveBool(DEMO_KEY, state.demoOnly);
      renderCycle(true);
    };
    addManagedListener(refs.demoToggle, 'change', demoToggleHandler);

    const presetChangeHandler = () => {
      state.preset = refs.presetSelect.value;
      saveValue(PRESET_KEY, state.preset);
      renderCycle(true);
    };
    addManagedListener(refs.presetSelect, 'change', presetChangeHandler);

    const windowChangeHandler = () => {
      state.window = refs.windowSelect.value;
      saveValue(WINDOW_KEY, state.window);
      renderCycle(true);
    };
    addManagedListener(refs.windowSelect, 'change', windowChangeHandler);

    if (refs.refreshButton) addManagedListener(refs.refreshButton, 'click', () => renderCycle(true));

    if (refs.retryButton) {
      addManagedListener(refs.retryButton, 'click', () => {
        state.forcedMode = null;
        renderCycle(true);
      });
    }

    if (refs.emptyButton) {
      addManagedListener(refs.emptyButton, 'click', () => {
        state.preset = 'exchanges';
        refs.presetSelect.value = 'exchanges';
        saveValue(PRESET_KEY, state.preset);
        state.forcedMode = null;
        renderCycle(true);
      });
    }

    const resizeHandler = () => {
      if (state.isPageHidden) return;
      if (state.resizeTimer) clearTimeout(state.resizeTimer);
      state.resizeTimer = window.setTimeout(() => {
        state.resizeTimer = null;
        renderHeatmap(refs, state);
      }, 180);
    };
    addManagedListener(window, 'resize', resizeHandler);

    const visibilityHandler = () => {
      state.isPageHidden = document.hidden === true;
      if (state.isPageHidden) {
        stopPolling();
        abortInFlight();
        refs.tooltip.hidden = true;
        cancelHoverFrame(state);
        return;
      }
      renderHeatmap(refs, state);
      startPolling();
      syncData(refs, state);
    };
    addManagedListener(document, 'visibilitychange', visibilityHandler);

    cleanups.push(bindCanvasInteraction(refs, state));
    renderCycle(true);

    function renderCycle(immediate = false) {
      startPolling();
      if (immediate && !state.isPageHidden) syncData(refs, state);
    }

    return () => {
      stopPolling();
      abortInFlight();
      if (state.resizeTimer) clearTimeout(state.resizeTimer);
      cancelHoverFrame(state);
      cleanups.forEach((fn) => fn());
    };
  }

  async function syncData(refs, state) {
    if (state.isPageHidden || state.isFetching) return;
    if (!state.preset) {
      state.mode = 'empty';
      state.payload = null;
      renderPanels(refs, state);
      renderHeatmap(refs, state);
      renderEscrow(refs, state);
      renderHistory(refs, state);
      renderHistoryStrip(refs, state);
      return;
    }

    state.isFetching = true;
    const controller = new AbortController();
    state.abortController = controller;
    if (!state.payload) {
      state.mode = 'loading';
      renderPanels(refs, state);
      renderHeatmap(refs, state);
      renderEscrow(refs, state);
      renderHistory(refs, state);
      renderHistoryStrip(refs, state);
    } else {
      renderPanels(refs, state);
    }

    let result;
    try {
      if (state.demoOnly) {
        result = {
          flow: makeDemoPayload(state),
          escrow: makeDemoEscrowPayload(state),
          history: makeDemoHistoryPayload(state),
        };
      } else {
        result = await fetchLivePayload(state, controller.signal);
      }
      state.payload = result.flow;
      state.escrowPayload = result.escrow;
      state.historyPayload = result.history;
      state.lastRefreshMs = Math.max(result.flow?.ts || 0, result.escrow?.ts || 0, Date.now());
      applyMode(state);
      buildHeatmapCells(state);
      updateLastDetectedCache(state);
      renderPanels(refs, state);
      renderHeatmap(refs, state);
      renderEvents(refs, state);
      renderEscrow(refs, state);
      renderHistory(refs, state);
      renderHistoryStrip(refs, state);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        throw error;
      }
    } finally {
      state.isFetching = false;
      if (state.abortController === controller) state.abortController = null;
      renderPanels(refs, state);
      renderHistory(refs, state);
      renderHistoryStrip(refs, state);
    }
  }

  async function fetchLivePayload(state, signal) {
    const flowUrl = `/api/xrpl/whale-flow?preset=${encodeURIComponent(state.preset)}&window=${encodeURIComponent(state.window)}`;
    const escrowWindow = state.window;
    const escrowLimit = state.liteMode || state.window === '24h' || state.window === '7d' ? 5 : 10;
    const escrowUrl = `/api/xrpl/escrow-watch?window=${encodeURIComponent(escrowWindow)}&limit=${escrowLimit}`;
    const historyUrl = `/api/xrpl/flow-history?preset=${encodeURIComponent(state.preset)}&window=${encodeURIComponent(state.window)}&limit=24`;

    const [historyResult, flowResult, escrowResult] = await Promise.allSettled([
      fetchHistoryPayload(historyUrl, signal),
      withClientTimeout(fetchFlowPayload(flowUrl, state, signal), 4200, 'flow'),
      withClientTimeout(fetchEscrowPayload(escrowUrl, escrowWindow, signal), 4200, 'escrow'),
    ]);

    const history = historyResult.status === 'fulfilled'
      ? historyResult.value
      : buildHistoryFetchFallback(historyResult.reason);

    const flow = flowResult.status === 'fulfilled'
      ? flowResult.value
      : buildFlowFetchFallback(state, flowResult.reason);

    const escrow = escrowResult.status === 'fulfilled'
      ? escrowResult.value
      : buildEscrowFetchFallback(escrowWindow, escrowResult.reason);

    return { flow, escrow, history };
  }

  function withClientTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        const timer = setTimeout(() => {
          clearTimeout(timer);
          reject(new Error(`${label}_client_timeout`));
        }, ms);
      }),
    ]);
  }

  function buildFlowFetchFallback(state, reason) {
    const message = reason instanceof Error ? reason.message : 'unknown';
    return {
      ok: false,
      ts: Date.now(),
      source: 'xrpl:rpc',
      stale: true,
      window: state.window,
      priceXrpUsd: null,
      summary: { inflowXrp: 0, outflowXrp: 0, netXrp: 0, inflowUsd: null, outflowUsd: null, netUsd: null },
      heatmap: { labels: ['Unknown'], buckets: [], matrix: [], unit: 'xrp' },
      events: [],
      summaryReason: 'Unable to fetch live data.',
      staleReason: 'fetch_error',
      debug: {
        endpointsTried: [],
        ledgersScanned: 0,
        paymentsCount: 0,
        cacheHit: false,
        warnings: [`fetch_error:${message}`],
        durationMs: 0,
        rpcCalls: 0,
        lastValidatedLedger: null,
        degradeLevel: 'D',
        strategy: 'fetch_failed',
        lastError: message,
      },
    };
  }

  function buildEscrowFetchFallback(window, reason) {
    const message = reason instanceof Error ? reason.message : 'unknown';
    return {
      ok: false,
      ts: Date.now(),
      source: 'xrpl:rpc',
      stale: true,
      window,
      next: null,
      recent: [],
      stats: { sumXrp: 0, count: 0, avgXrp: 0, maxXrp: 0 },
      pattern: [{ label: 'unavailable', note: 'Escrow watcher unavailable. Showing fallback payload.' }],
      staleReason: 'cached',
      debug: {
        endpointsTried: [],
        ledgersScanned: 0,
        txCount: 0,
        cacheHit: false,
        warnings: [`fetch_error:${message}`],
        durationMs: 0,
        rpcCalls: 0,
        lastValidatedLedger: null,
        degradeLevel: 'D',
        strategy: 'fetch_failed',
      },
    };
  }

  function buildHistoryFetchFallback(reason) {
    const message = reason instanceof Error ? reason.message : 'unknown';
    return {
      ok: false,
      source: 'unavailable',
      latest: null,
      previous: null,
      recent: [],
      deltaSummary: { netXrpDelta: null },
      historyMeta: { count: 0 },
      debug: { warnings: [`fetch_error:${message}`] },
    };
  }

  async function fetchFlowPayload(url, state, signal) {
    const startedAt = Date.now();
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`http_${response.status}`);
      return await response.json();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      return {
        ok: false,
        ts: Date.now(),
        source: 'xrpl:rpc',
        stale: true,
        window: state.window,
        priceXrpUsd: null,
        summary: { inflowXrp: 0, outflowXrp: 0, netXrp: 0, inflowUsd: null, outflowUsd: null, netUsd: null },
        heatmap: { labels: ['Unknown'], buckets: [], matrix: [], unit: 'xrp' },
        events: [],
        summaryReason: 'Unable to fetch live data.',
        staleReason: 'fetch_error',
        debug: { endpointsTried: [], ledgersScanned: 0, paymentsCount: 0, cacheHit: false, warnings: [`fetch_error:${error instanceof Error ? error.message : 'unknown'}`], durationMs: Math.max(1, Date.now() - startedAt), rpcCalls: 0, lastValidatedLedger: null, degradeLevel: 'D', strategy: 'fetch_failed', lastError: error instanceof Error ? error.message : 'unknown' },
      };
    }
  }

  async function fetchEscrowPayload(url, window, signal) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`http_${response.status}`);
      return await response.json();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      return {
        ok: false,
        ts: Date.now(),
        source: 'demo',
        stale: true,
        window,
        next: null,
        recent: [],
        stats: { sumXrp: 0, count: 0, avgXrp: 0, maxXrp: 0 },
        pattern: [{ label: 'unavailable', note: 'Escrow watcher unavailable. Showing fallback payload.' }],
        staleReason: 'cached',
        debug: { endpointsTried: [], ledgersScanned: 0, txCount: 0, cacheHit: false, warnings: [`fetch_error:${error instanceof Error ? error.message : 'unknown'}`], durationMs: 0, rpcCalls: 0, lastValidatedLedger: null, degradeLevel: 'D', strategy: 'fetch_failed' },
      };
    }
  }
  async function fetchHistoryPayload(url, signal) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`http_${response.status}`);
      return await response.json();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      return { ok: false, latest: null, previous: null, recent: [], deltaSummary: { netXrpDelta: null }, historyMeta: { count: 0 } };
    }
  }

  function applyMode(state) {
    if (state.forcedMode) {
      state.mode = state.forcedMode;
      return;
    }
    if (!state.payload) {
      state.mode = 'loading';
      return;
    }
    if (!state.payload.ok && !state.payload.stale) {
      state.mode = 'error';
      return;
    }
    if (state.payload.stale) {
      state.mode = 'stale';
      return;
    }
    state.mode = 'ok';
  }

  function makeDemoPayload(state) {
    const labels = ['Binance', 'Coinbase', 'Bitstamp', 'Kraken', 'Bybit', 'Unknown'];
    const cols = state.liteMode ? 12 : 20;
    const matrix = labels.map(() => []);
    const events = [];
    let inflowXrp = 0;
    let outflowXrp = 0;

    for (let y = 0; y < labels.length; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const value = Math.round(Math.sin((Date.now() / 11000) + x * 0.4 + y * 0.7) * 400000 + 500000);
        const signed = y % 2 === 0 ? Math.max(0, value) : -Math.max(0, Math.round(value * 0.7));
        matrix[y].push(signed);
        if (signed > 0) inflowXrp += signed;
        if (signed < 0) outflowXrp += Math.abs(signed);
      }
    }

    for (let i = 0; i < 8; i += 1) {
      const amountXrp = Math.round(200000 + Math.random() * 1200000);
      events.push({
        time: new Date(Date.now() - i * 21000).toISOString(),
        from: `rDemoFrom${i}`,
        to: `rDemoTo${i}`,
        dir: i % 2 ? 'IN' : 'OUT',
        label: labels[i % labels.length],
        amountXrp,
        amountUsd: amountXrp * 0.58,
        score: amountXrp > 900000 ? 'HIGH' : 'MED',
        scoreBasis: i % 3 === 0 ? 'both' : i % 2 ? 'amount' : 'rank',
        reason: i % 2 ? `to exchange address (${labels[i % labels.length]}) → potential sell pressure` : `from exchange address (${labels[i % labels.length]}) → potential withdrawal`,
        labelSource: `matched preset: ${labels[i % labels.length]}`,
        txHash: `DEMOHASH${i}`,
        timeBucket: `b${i + 1}`,
      });
    }

    return {
      ok: true,
      ts: Date.now(),
      source: 'demo',
      stale: false,
      window: state.window,
      priceXrpUsd: 0.58,
      summary: {
        inflowXrp,
        outflowXrp,
        netXrp: inflowXrp - outflowXrp,
        inflowUsd: inflowXrp * 0.58,
        outflowUsd: outflowXrp * 0.58,
        netUsd: (inflowXrp - outflowXrp) * 0.58,
      },
      heatmap: {
        labels,
        buckets: Array.from({ length: cols }, (_, i) => `b${i + 1}`),
        matrix,
        unit: 'usd',
      },
      events,
      summaryReason: events[0]?.reason || 'No notable events above threshold.',
      debug: { endpointsTried: [], ledgersScanned: 0, paymentsCount: events.length, cacheHit: false, scoreBasis: events[0]?.scoreBasis || 'amount', warnings: [], durationMs: 0, rpcCalls: 0, lastValidatedLedger: null, degradeLevel: 'none', strategy: `demo_${state.window}` },
    };
  }


  function makeDemoEscrowPayload(state) {
    const now = Date.now();
    const recent = Array.from({ length: state.liteMode ? 4 : 8 }, (_, index) => ({
      time: now - (index * 6 * 60 * 60 * 1000),
      amountXrp: 12_000_000 + index * 2_000_000,
      txHash: `DEMOESCROW${index}`,
      type: index % 3 === 0 ? 'create' : index % 2 === 0 ? 'cancel' : 'finish',
      account: 'rDemoEscrowAddr',
      note: 'Demo escrow signal',
    }));

    return {
      ok: true,
      ts: now,
      source: 'demo',
      stale: false,
      window: state.window === '24h' ? '24h' : '7d',
      next: {
        time: now + (18 * 60 * 60 * 1000),
        amountXrp: 42_000_000,
        txHash: 'DEMOESCROWNEXT',
        account: 'rDemoEscrowAddr',
        note: 'Upcoming unlock from demo schedule',
      },
      recent,
      stats: {
        sumXrp: recent.reduce((sum, row) => sum + row.amountXrp, 0),
        count: recent.length,
        avgXrp: recent.reduce((sum, row) => sum + row.amountXrp, 0) / recent.length,
        maxXrp: Math.max(...recent.map((row) => row.amountXrp)),
      },
      pattern: [
        { label: 'monthly-ish', note: 'Unlock cadence appears monthly-ish in demo sequence.' },
      ],
      debug: { endpointsTried: [], ledgersScanned: 0, txCount: recent.length, cacheHit: false, warnings: [], durationMs: 0, rpcCalls: 0, lastValidatedLedger: null, degradeLevel: 'none', strategy: `demo_${state.window}` },
    };
  }

  function makeDemoHistoryPayload(state) {
    const now = Date.now();
    const recent = Array.from({ length: 6 }, (_, i) => ({
      ts: now - (i * 60_000),
      summary: { netXrp: 120000 - i * 15000 },
      metrics: { matchedEvents: Math.max(0, 5 - i) },
      latestEvent: i === 0 ? { time: now - 45_000, label: 'Binance', dir: 'IN', amountXrp: 450000, reason: 'demo event' } : null,
    })).reverse();
    return {
      ok: true,
      latest: recent[recent.length - 1],
      previous: recent[recent.length - 2],
      recent,
      deltaSummary: { netXrpDelta: 15000 },
      historyMeta: { count: recent.length, oldestTs: recent[0].ts, newestTs: recent[recent.length - 1].ts },
    };
  }

  function renderEscrow(refs, state) {
    const escrow = state.escrowPayload;
    if (!escrow) {
      safeText(refs.escrow.next, 'No upcoming unlock found');
      safeText(refs.escrow.stats, 'sum: — / count: — / avg: — / max: —');
      refs.escrow.recent.innerHTML = '<li>—</li>';
      refs.escrow.pattern.innerHTML = '<li>No pattern note yet.</li>';
      return;
    }

    if (escrow.next?.time) {
      safeText(
        refs.escrow.next,
        `${formatDateTime(escrow.next.time)} • ${formatXrp(escrow.next.amountXrp || 0)}${escrow.stale ? ' (stale)' : ''}`,
      );
    } else {
      safeText(refs.escrow.next, 'No upcoming unlock found');
    }

    safeText(
      refs.escrow.stats,
      `sum: ${formatXrp(escrow.stats?.sumXrp || 0)} / count: ${escrow.stats?.count || 0} / avg: ${formatXrp(escrow.stats?.avgXrp || 0)} / max: ${formatXrp(escrow.stats?.maxXrp || 0)}`,
    );

    const recentRows = (escrow.recent || []).slice(0, state.liteMode ? 5 : 10);
    refs.escrow.recent.innerHTML = recentRows.length
      ? recentRows.map((row) => `<li>${formatDateTime(row.time)} • ${row.type} • ${formatXrp(row.amountXrp || 0)} • ${row.txHash || 'n/a'}</li>`).join('')
      : '<li>No recent unlocks in selected window.</li>';

    const notes = escrow.pattern || [];
    refs.escrow.pattern.innerHTML = notes.length
      ? notes.map((row) => `<li><strong>${row.label}:</strong> ${row.note}</li>`).join('')
      : '<li>No strong pattern detected.</li>';
  }

  function renderHistory(refs, state) {
    const history = state.historyPayload;
    if (!history || !history.latest) {
      safeText(refs.history.latestTs, '—');
      safeText(refs.history.netDelta, '—');
      safeText(refs.history.recentCount, '0');
      safeText(refs.history.lastEvent, buildLastEventLine(findLastDetectedEvent(state)));
      return;
    }

    safeText(refs.history.latestTs, formatDateTime(history.latest.ts));
    const delta = history.deltaSummary?.netXrpDelta;
    safeText(refs.history.netDelta, Number.isFinite(delta) ? formatSignedXrp(delta) : '—');
    safeText(refs.history.recentCount, `${history.historyMeta?.count ?? history.recent?.length ?? 0}`);
    const lastEvent = history.latest?.latestEvent || findLastDetectedEvent(state);
    safeText(refs.history.lastEvent, buildLastEventLine(lastEvent));
  }

  function renderHistoryStrip(refs, state) {
    const strip = refs.historyStrip;
    if (!strip?.root) return;
    const series = buildHistorySeries(state.historyPayload);

    if (!series.hasHistory) {
      strip.root.hidden = true;
      return;
    }

    strip.root.hidden = false;
    const canDraw = series.points.length > 1;
    if (!canDraw) {
      strip.status.hidden = false;
      safeText(strip.status, 'History building…');
      if (strip.netSvg) strip.netSvg.innerHTML = '';
      if (strip.matchedBars) strip.matchedBars.innerHTML = '';
      safeText(strip.netCompare, 'latest vs oldest: —');
      safeText(strip.matchedCompare, 'latest vs oldest: —');
      return;
    }

    strip.status.hidden = true;
    drawNetSparkline(strip.netSvg, series.net);
    drawMatchedBars(strip.matchedBars, series.matched);

    const latestNet = series.net.at(-1);
    const oldestNet = series.net[0];
    safeText(strip.netCompare, `latest vs oldest: ${formatSignedCompactXrp(latestNet)} vs ${formatSignedCompactXrp(oldestNet)}`);

    const latestMatched = series.matched.at(-1);
    const oldestMatched = series.matched[0];
    safeText(strip.matchedCompare, `latest vs oldest: ${latestMatched} vs ${oldestMatched}`);
  }

  function buildHistorySeries(historyPayload) {
    const snapshots = Array.isArray(historyPayload?.recent) ? historyPayload.recent : [];
    const points = snapshots
      .filter((row) => row && Number.isFinite(Date.parse(row.ts || '')))
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

    const net = points.map((row) => {
      const value = Number(row?.summary?.netXrp);
      return Number.isFinite(value) ? value : 0;
    });
    const matched = points.map((row) => {
      const value = Number(row?.metrics?.matchedEvents);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    });

    return { hasHistory: snapshots.length > 0, points, net, matched };
  }

  function drawNetSparkline(svgNode, values) {
    if (!svgNode) return;
    if (!Array.isArray(values) || values.length < 2) {
      svgNode.innerHTML = '';
      return;
    }

    const width = 100;
    const height = 28;
    const padding = 2;
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const span = Math.max(max - min, 1);
    const xFor = (i) => (values.length === 1 ? width / 2 : (i / (values.length - 1)) * width);
    const yFor = (v) => {
      const ratio = (v - min) / span;
      return (height - padding) - (ratio * (height - padding * 2));
    };

    const zeroY = yFor(0);
    const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(v).toFixed(2)}`).join(' ');
    const latest = values.at(-1);

    svgNode.innerHTML = `
      <line x1="0" y1="${zeroY.toFixed(2)}" x2="100" y2="${zeroY.toFixed(2)}" class="flow-history-zero" />
      <path d="${path}" class="flow-history-net ${latest >= 0 ? 'is-pos' : 'is-neg'}" />
      <circle cx="100" cy="${yFor(latest).toFixed(2)}" r="1.7" class="flow-history-dot ${latest >= 0 ? 'is-pos' : 'is-neg'}" />
    `;
  }

  function drawMatchedBars(container, values) {
    if (!container) return;
    if (!Array.isArray(values) || values.length < 2) {
      container.innerHTML = '';
      return;
    }

    const max = Math.max(...values, 0);
    container.innerHTML = values.map((value, index) => {
      const ratio = max > 0 ? value / max : 0;
      const minRatio = value > 0 ? 0.18 : 0.06;
      const heightRatio = Math.max(minRatio, ratio);
      const latestClass = index === values.length - 1 ? 'is-latest' : '';
      return `<span class="flow-history-bar ${latestClass}" style="--bar-h:${heightRatio.toFixed(4)}" title="${value}"></span>`;
    }).join('');
  }

  function buildEscrowSummaryNote(escrowPayload) {
    if (!escrowPayload) return '';
    const latest = (escrowPayload.recent || [])[0];
    if (latest?.amountXrp >= 20_000_000) {
      return `Escrow unlock detected in last ${escrowPayload.window}: ${Math.round(latest.amountXrp).toLocaleString()} XRP`;
    }
    if (escrowPayload.next?.amountXrp >= 20_000_000) {
      return `Upcoming escrow unlock: ${Math.round(escrowPayload.next.amountXrp).toLocaleString()} XRP`;
    }
    return '';
  }

  function buildHistoryFallbackHeatmap(state) {
    const recent = Array.isArray(state.historyPayload?.recent) ? state.historyPayload.recent : [];
    const tail = recent.slice(-Math.max(1, Math.min(recent.length, 12)));
    const payloadLabels = Array.isArray(state.payload?.heatmap?.labels) ? state.payload.heatmap.labels.filter(Boolean) : [];
    const eventLabels = [];
    tail.forEach((row) => {
      const label = row?.latestEvent?.label;
      if (label && !eventLabels.includes(label)) eventLabels.push(label);
    });

    const labels = eventLabels.length
      ? eventLabels
      : (payloadLabels.length ? payloadLabels : ['Unknown']);

    const buckets = tail.length
      ? tail.map((row, index) => row?.timeBucket || row?.latestEvent?.timeBucket || `h${index + 1}`)
      : ['h1'];

    const matrix = labels.map(() => Array.from({ length: buckets.length }, () => 0));
    const labelIndex = new Map(labels.map((label, index) => [label, index]));

    tail.forEach((row, col) => {
      const evt = row?.latestEvent;
      if (!evt) return;
      const idx = labelIndex.get(evt.label || 'Unknown');
      if (idx == null) return;
      const amount = Number(evt.amountXrp || 0);
      const signed = evt.dir === 'OUT' ? -amount : amount;
      matrix[idx][col] = Number.isFinite(signed) ? signed : 0;
    });

    return {
      labels,
      buckets,
      matrix,
      unit: 'xrp',
      derivedFrom: 'history',
    };
  }

  function getRenderableHeatmap(state) {
    const heatmap = state.payload?.heatmap || {};
    const labels = Array.isArray(heatmap.labels) ? heatmap.labels : [];
    const buckets = Array.isArray(heatmap.buckets) ? heatmap.buckets : [];
    const matrix = Array.isArray(heatmap.matrix) ? heatmap.matrix : [];
    const hasVisiblePayload =
      labels.length > 1 &&
      buckets.length > 0 &&
      matrix.some((row) => Array.isArray(row) && row.some((value) => Number(value || 0) !== 0));

    if (hasVisiblePayload) return heatmap;
    return buildHistoryFallbackHeatmap(state);
  }

  function buildHeatmapCells(state) {
    const heatmap = getRenderableHeatmap(state);
    const labels = heatmap?.labels || [];
    const matrix = heatmap?.matrix || [];
    const cols = Math.max(0, ...(matrix.map((row) => row.length)));
    const cells = [];

    for (let y = 0; y < labels.length; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const signed = Number(matrix[y]?.[x] || 0);
        cells.push({ x, y, label: labels[y], value: Math.abs(signed), signed });
      }
    }

    state.heatmapCells = cells;
  }

  function renderPanels(refs, state) {
    const overlayMode = state.isFetching && state.payload ? 'ok' : state.mode;
    toggleOverlay(refs, overlayMode);
    const payload = state.payload;
    const history = state.historyPayload;
    const liveError = getLiveError(payload, state.demoOnly);
    const statusLabel = describeHeaderStatus(state);
    safeText(refs.statusMeta, statusLabel);
    refs.staleNote.hidden = state.mode !== 'stale';

    const snapshotKeys = ['inflow', 'outflow', 'net', 'payments', 'ledgers', 'matched', 'source', 'updated'];
    if (!payload || (state.mode !== 'ok' && state.mode !== 'stale')) {
      snapshotKeys.forEach((key) => safeText(refs.snapshot[key], '—'));
      safeText(refs.snapshot.subNet, 'prev: — / Δ —');
      safeText(refs.snapshot.subMatched, 'prev: — / recent: —');
      safeText(refs.snapshot.subUpdated, 'history newest: —');

      const fallbackProfile = getWindowProfile(state.window);
      const currentMode = state.mode;
      const pillText =
        currentMode === 'loading' ? 'LOADING'
          : currentMode === 'empty' ? 'EMPTY'
          : currentMode === 'error' ? 'ERROR'
          : currentMode.toUpperCase();
      const pillClass =
        currentMode === 'loading' ? 'quiet'
          : currentMode === 'empty' ? 'low'
          : currentMode === 'error' ? 'medium'
          : 'quiet';

      safeText(refs.signal.statusPill, pillText);
      refs.signal.statusPill.className = `flow-pill ${pillClass}`;
      safeText(refs.signal.impact, '—');
      safeText(refs.signal.ctxPreset, `target: ${state.preset || 'unset'}`);
      safeText(refs.signal.ctxWindow, `window: ${state.window}`);

      if (currentMode === 'loading') {
        safeText(refs.signal.severity, 'severity: — · pressure: loading');
        safeText(refs.signal.why, 'Loading live flow snapshot for the selected preset and window.');
        safeText(refs.signal.observed, 'Fetching live data now…');
        safeText(refs.signal.ctxSource, 'source: pending');
        safeText(refs.signal.context, `Preparing ${fallbackProfile.role}. Metrics and heatmap will populate after load.`);
        safeText(refs.reasonTitle, 'Loading current flow state');
        safeText(refs.reasonCopy, 'Loading live flow snapshot for the selected preset and window.');
        refs.reasonList.innerHTML = [
          '<li>Fetching current flow snapshot.</li>',
          `<li>Window role: ${fallbackProfile.role}.</li>`,
          '<li>Metrics and heatmap will populate after load.</li>',
        ].join('');
      } else if (currentMode === 'empty') {
        safeText(refs.signal.severity, 'severity: — · pressure: empty');
        safeText(refs.signal.why, 'No target preset selected.');
        safeText(refs.signal.observed, 'Scanned — payments across — ledgers.');
        safeText(refs.signal.ctxSource, 'source: unset');
        safeText(refs.signal.context, 'Choose a tracked preset to populate flow state.');
        safeText(refs.reasonTitle, 'No target preset selected');
        safeText(refs.reasonCopy, 'Select a target preset to load signal, metrics, and heatmap.');
        refs.reasonList.innerHTML = [
          '<li>No tracked preset is selected.</li>',
          '<li>Use Exchanges, Whales, or Ripple / Escrow to populate the page.</li>',
          `<li>Window role: ${fallbackProfile.role}.</li>`,
        ].join('');
      } else {
        const liveIssue = liveError || 'live_fetch_unavailable';
        safeText(refs.signal.severity, 'severity: — · pressure: unavailable');
        safeText(refs.signal.why, 'Live flow fetch failed for the selected preset and window.');
        safeText(refs.signal.observed, 'Scanned — payments across — ledgers.');
        safeText(refs.signal.ctxSource, 'source: unavailable');
        safeText(refs.signal.context, `Last live fetch failed before a readable snapshot was available (${liveIssue}).`);
        safeText(refs.reasonTitle, 'Live flow unavailable');
        safeText(refs.reasonCopy, 'Could not load live flow data yet. Retry after source recovery.');
        refs.reasonList.innerHTML = [
          `<li>Live fetch failed before a readable snapshot was available (${liveIssue}).</li>`,
          '<li>Retry after source recovery.</li>',
          fallbackProfile.try24h ? '<li>24h usually gives the broadest comparison context.</li>' : `<li>Window role: ${fallbackProfile.role}.</li>`,
        ].join('');
      }

      safeText(refs.refreshMeta, '—');
      return;
    }

    const latest = history?.latest || null;
    const previous = history?.previous || null;
    const hasHistoryLatest = Boolean(latest);
    const summary = latest?.summary || payload.summary || {};
    const metrics = latest?.metrics || {};
    const prevSummary = previous?.summary || {};
    const eventCount = hasHistoryLatest ? (latest?.metrics?.matchedEvents ?? 0) : (payload.events || []).length;
    const prevEventCount = hasHistoryLatest ? (previous?.metrics?.matchedEvents ?? 0) : null;
    const recentCount = history?.historyMeta?.count ?? history?.recent?.length ?? 0;
    const netXrp = Number(summary?.netXrp ?? payload?.summary?.netXrp ?? 0);
    const prevNetXrp = Number(prevSummary?.netXrp ?? 0);
    const deltaNetXrpRaw = history?.deltaSummary?.netXrpDelta;
    const deltaNetXrp = Number.isFinite(deltaNetXrpRaw) ? Number(deltaNetXrpRaw) : (hasHistoryLatest && previous ? netXrp - prevNetXrp : null);
    const useUsd = Number.isFinite(summary?.inflowUsd) && Number.isFinite(summary?.outflowUsd) && Number.isFinite(summary?.netUsd);
    const activeWindow = latest?.window || payload.window || state.window;
    const pressure = hasHistoryLatest
      ? inferPressureHistory(netXrp, deltaNetXrp, eventCount, prevEventCount, activeWindow)
      : inferPressure(Number(useUsd ? summary.netUsd : netXrp) || 0, useUsd, eventCount, activeWindow);

    safeText(refs.snapshot.inflow, formatXrpOrUsd(summary?.inflowXrp, summary?.inflowUsd, useUsd));
    safeText(refs.snapshot.outflow, formatXrpOrUsd(summary?.outflowXrp, summary?.outflowUsd, useUsd));
    safeText(refs.snapshot.net, useUsd ? formatSignedUsd(summary?.netUsd ?? 0) : formatSignedXrp(netXrp));
    safeText(refs.snapshot.payments, `${metrics?.paymentsScanned ?? payload?.debug?.paymentsCount ?? 0}`);
    safeText(refs.snapshot.ledgers, `${metrics?.ledgersScanned ?? payload?.debug?.ledgersScanned ?? 0}`);
    safeText(refs.snapshot.matched, `${eventCount ?? 0}`);
    safeText(refs.snapshot.subNet, `prev: ${previous ? formatSignedXrp(prevNetXrp) : '—'} / Δ ${Number.isFinite(deltaNetXrp) ? formatSignedCompactXrp(deltaNetXrp) : '—'}`);
    safeText(refs.snapshot.subMatched, `prev: ${previous ? `${prevEventCount ?? 0}` : '—'} / recent: ${recentCount ?? 0}`);

    const sourceLabel = resolveSourceLabel(history, payload, state.demoOnly, state.window);
    safeText(refs.snapshot.source, sourceLabel);

    const updatedTs = history?.historyMeta?.newestTs ?? latest?.ts ?? payload?.ts ?? state.lastRefreshMs;
    safeText(refs.snapshot.updated, formatDateTime(updatedTs));
    safeText(refs.snapshot.subUpdated, `history newest: ${history?.historyMeta?.newestTs ? formatDateTime(history.historyMeta.newestTs) : '—'}`);
    safeText(refs.refreshMeta, describeHeaderUpdated(updatedTs, state));

    const pillClass = pressure === 'HIGH' ? 'high' : pressure === 'MEDIUM' ? 'medium' : pressure === 'QUIET' ? 'quiet' : 'low';
    safeText(refs.signal.statusPill, pressure);
    refs.signal.statusPill.className = `flow-pill ${pillClass}`;
    safeText(refs.signal.severity, `severity: ${pressure === 'HIGH' ? 3 : pressure === 'MEDIUM' ? 2 : 1} · pressure: ${pressure}`);
    safeText(refs.signal.impact, useUsd ? formatSignedUsd(summary?.netUsd ?? 0) : formatSignedXrp(netXrp));

    const reason = buildSignalReason(latest, previous, history, payload, eventCount, recentCount, deltaNetXrp);
    safeText(refs.signal.why, reason);
    safeText(refs.signal.observed, `Scanned ${metrics?.paymentsScanned ?? payload?.debug?.paymentsCount ?? 0} payments across ${metrics?.ledgersScanned ?? payload?.debug?.ledgersScanned ?? 0} ledgers.`);
    safeText(refs.signal.ctxPreset, `target: ${state.preset || 'unset'}`);
    safeText(refs.signal.ctxWindow, `window: ${latest?.window || payload.window || state.window}`);
    safeText(
      refs.signal.ctxSource,
      history?.source === 'repo-json'
        ? 'source: history(primary)'
        : history?.source === 'runtime-fallback'
          ? 'source: history(fallback)'
          : `source: ${sourceLabel}`
    );

    const oldest = history?.historyMeta?.oldestTs ? formatDateTime(history.historyMeta.oldestTs) : '—';
    const newest = history?.historyMeta?.newestTs ? formatDateTime(history.historyMeta.newestTs) : '—';
    const activeProfile = getWindowProfile(activeWindow);
    const contextLines = [
      `window role: ${activeProfile.role}`,
      `recent: ${recentCount ?? 0} snapshots (${oldest} → ${newest})`,
      `latest: ${formatSignedXrp(netXrp)} / previous: ${previous ? formatSignedXrp(prevNetXrp) : '—'} / Δ ${Number.isFinite(deltaNetXrp) ? formatSignedCompactXrp(deltaNetXrp) : '—'}`,
    ];
    if (history?.source === 'repo-json') contextLines.push('primary read: repo history');
    if (history?.source === 'runtime-fallback') contextLines.push('primary read: runtime fallback history');
    if (!PRIMARY_HISTORY_WINDOWS.has(state.window)) contextLines.push('history mode: supplemental-live (5m assist)');
    if (latest?.stale || payload.stale) contextLines.push('stale: true');
    if (latest?.partial || payload?.partial) contextLines.push('partial: true');
    safeText(refs.signal.context, contextLines.join(' · '));

    safeText(refs.reasonTitle, eventCount ? 'Labeled flow activity detected' : `Quiet ${activeWindow} labeled-flow window`);
    safeText(refs.reasonCopy, reason);
    const fallbackLast = latest?.latestEvent || previous?.latestEvent || findLastDetectedEvent(state);
    refs.reasonList.innerHTML = [
      `Latest net: ${formatSignedXrp(netXrp)}${previous ? ` / Previous: ${formatSignedXrp(prevNetXrp)}` : ''}`,
      `Net delta: ${Number.isFinite(deltaNetXrp) ? formatSignedCompactXrp(deltaNetXrp) : '—'} / Recent snapshots: ${recentCount ?? 0}`,
      `Last detected event: ${buildLastEventLine(fallbackLast).replace('Last detected event: ', '')}`,
      eventCount === 0 ? activeProfile.quietHint : `Window role: ${activeProfile.role}.`,
      (activeProfile.try24h && (eventCount === 0 || recentCount <= 2)) ? 'Suggestion: Try 24h for broader comparison context.' : (latest?.stale || payload.stale ? 'Snapshot freshness: stale/cached.' : 'Snapshot freshness: current.'),
    ].map((line) => `<li>${line}</li>`).join('');
  }

  function resolveSourceLabel(history, payload, demoOnly, selectedWindow) {
    if (demoOnly) return 'demo';
    if (history?.source === 'repo-json') return 'history(primary)';
    if (history?.source === 'runtime-fallback') return 'history(runtime-fallback)';
    if (!PRIMARY_HISTORY_WINDOWS.has(selectedWindow || '1h')) return 'live-supplemental(5m)';
    if (payload?.source === 'cache' || payload?.staleReason === 'cached') return 'cache';
    if (payload?.source) return payload.source;
    return 'runtime';
  }

  function formatXrpOrUsd(xrpValue, usdValue, useUsd) {
    if (useUsd) return formatUsd(usdValue ?? 0);
    return formatXrp(xrpValue ?? 0);
  }

  function inferPressureHistory(netXrp, deltaNetXrp, eventCount, prevEventCount, window) {
    const profile = getWindowProfile(window);
    const absNet = Math.abs(netXrp || 0);
    const absDelta = Math.abs(deltaNetXrp || 0);
    if (eventCount === 0 && absNet <= profile.quietAbsNetXrp && absDelta <= profile.quietDeltaXrp && (prevEventCount || 0) === 0) return 'QUIET';
    if (absNet >= profile.mediumAbsNetXrp || absDelta >= profile.mediumAbsNetXrp || eventCount >= profile.eventHigh) return 'HIGH';
    if (absNet >= profile.lowAbsNetXrp || absDelta >= profile.lowAbsNetXrp || eventCount >= profile.eventMedium) return 'MEDIUM';
    return 'LOW';
  }

  function buildSignalReason(latest, previous, history, payload, eventCount, recentCount, deltaNetXrp) {
    if (latest?.latestEvent?.reason) return latest.latestEvent.reason;
    const activeWindow = latest?.window || payload?.window;
    const profile = getWindowProfile(activeWindow);
    const previousEvent = previous?.latestEvent;
    const recentHasEvent = (history?.recent || []).some((row) => row?.latestEvent);
    if (!latest?.latestEvent && previousEvent) {
      return `No event in latest snapshot, but ${recentCount ?? 0} recent detections. Last detected event: ${formatDateTime(previousEvent.time || previous?.ts)} ${previousEvent.label ? `(${previousEvent.label})` : ''}.`;
    }
    if (!latest?.latestEvent && recentHasEvent) {
      return `No event in latest snapshot, but ${recentCount ?? 0} recent detections. Δ ${Number.isFinite(deltaNetXrp) ? formatSignedCompactXrp(deltaNetXrp) : '—'}.`;
    }
    if (eventCount > 0 && payload.summaryReason) return payload.summaryReason;
    const base = `${profile.emptyHint} Previous snapshot Δ ${Number.isFinite(deltaNetXrp) ? formatSignedCompactXrp(deltaNetXrp) : '—'} / recent count ${recentCount ?? 0}.`;
    return profile.try24h ? `${base} Try 24h for broader comparison context.` : base;
  }

  function renderHeatmap(refs, state) {
    if (state.isPageHidden) return;
    const ctx = refs.canvas.getContext('2d');
    if (!ctx) return;

    const width = Math.floor(refs.canvasWrap.clientWidth - 24);
    const height = 320;
    const dprCap = state.liteMode ? 1.25 : 1.5;
    const effectiveDpr = Math.min(window.devicePixelRatio || 1, dprCap);
    refs.canvas.width = width * effectiveDpr;
    refs.canvas.height = height * effectiveDpr;
    refs.canvas.style.height = `${height}px`;
    refs.canvas.style.width = `${width}px`;
    ctx.setTransform(effectiveDpr, 0, 0, effectiveDpr, 0, 0);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    if (!state.payload || (state.mode !== 'ok' && state.mode !== 'stale')) return;

    const renderHeatmapData = getRenderableHeatmap(state);
    const labels = renderHeatmapData?.labels || [];
    const cols = Math.max(1, renderHeatmapData?.buckets?.length || 1);
    const leftPad = 92;
    const topPad = 18;
    const chartW = width - leftPad - 14;
    const chartH = height - topPad - 48;
    const cellW = chartW / cols;
    const cellH = chartH / Math.max(1, labels.length);
    state.heatmapLayout = { leftPad, topPad, chartW, chartH, cols, rows: Math.max(1, labels.length), cellW, cellH };
    const max = Math.max(...state.heatmapCells.map((cell) => cell.value), 1);

    state.heatmapCells.forEach((cell) => {
      const alpha = 0.15 + (cell.value / max) * 0.8;
      const x = leftPad + (cell.x * cellW);
      const y = topPad + (cell.y * cellH);
      ctx.fillStyle = cell.signed >= 0 ? `rgba(37, 99, 235, ${alpha})` : `rgba(220, 38, 38, ${alpha})`;
      ctx.fillRect(x + 1, y + 1, Math.max(2, cellW - 2), Math.max(2, cellH - 2));
    });

    ctx.fillStyle = '#334155';
    ctx.font = '12px sans-serif';
    labels.forEach((label, index) => {
      const y = topPad + index * cellH + cellH * 0.66;
      ctx.fillText(label, 8, y);
    });

    updateHoverOverlay(refs, state);
  }

  function renderEvents(refs, state) {
    const useUsd = Number.isFinite(state.payload?.priceXrpUsd);
    const maxRows = state.liteMode ? 4 : 6;
    const recent = getRecentDetections(state, maxRows);
    const rows = recent.rows;

    if (!rows.length) {
      refs.recentFlows.innerHTML = '';
      if (refs.eventsEmpty) {
        refs.eventsEmpty.hidden = false;
        const activeWindow = state.payload?.window || state.window;
        const profile = getWindowProfile(activeWindow);
        refs.eventsEmpty.textContent = state.historyPayload?.historyMeta?.count
          ? `History exists, but no labeled event has been recorded for the ${profile.role}.`
          : `No recent labeled detection yet in the ${profile.role}.`;
      }
      return;
    }

    if (refs.eventsEmpty) refs.eventsEmpty.hidden = true;
    refs.recentFlows.innerHTML = rows.map((row) => `
      <article class="flow-recent-row">
        <div class="flow-time">${formatTime(row.time)}</div>
        <div>
          ${row.label || 'unknown'} · ${row.dir || '—'}
          ${row.from || row.to ? `<div class="flow-meta">${shortAddress(row.from || 'n/a')} → ${shortAddress(row.to || 'n/a')}</div>` : ''}
          <div class="flow-meta">${formatReason(row.reason)}</div>
          <div class="flow-meta">${row.sourceWindow || state.window} / ${formatTime(row.sourceSnapshotTs || row.time)}${row.sourceType === 'history' ? ' · history' : ' · fallback'}</div>
        </div>
        <div>${row.dir || '—'}</div>
        <div class="flow-amount">${useUsd && row.amountUsd ? `${formatUsd(row.amountUsd)} (${formatXrp(row.amountXrp)})` : formatXrp(row.amountXrp)}</div>
      </article>
    `).join('');
  }

  function formatReason(reason) {
    if (!reason) return 'No reason details.';
    if (reason.length <= 120) return reason;
    return `${reason.slice(0, 117)}...`;
  }

  function getRecentDetections(state, limit = 6) {
    const historyRows = extractHistoryRecentDetections(state.historyPayload, state.window, Number.isFinite(state.payload?.priceXrpUsd) ? state.payload.priceXrpUsd : null);
    if (historyRows.length) {
      return { rows: historyRows.slice(0, limit), source: 'history' };
    }
    const fallbackRows = extractPayloadRecentDetections(state.payload, state.window).slice(0, limit);
    return { rows: fallbackRows, source: 'payload' };
  }

  function extractHistoryRecentDetections(historyPayload, defaultWindow, priceXrpUsd) {
    const snapshots = Array.isArray(historyPayload?.recent) ? historyPayload.recent : [];
    const rows = [];
    const seen = new Set();

    snapshots.forEach((snapshot) => {
      const event = snapshot?.latestEvent;
      if (!event) return;
      const normalized = normalizeRecentDetection(event, {
        sourceType: 'history',
        sourceSnapshotTs: snapshot.ts,
        sourceWindow: snapshot.window || defaultWindow,
        priceXrpUsd,
      });
      const dedupeKey = buildDetectionKey(normalized);
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      rows.push(normalized);
    });

    return rows.sort((a, b) => Date.parse(b.time || '') - Date.parse(a.time || ''));
  }

  function extractPayloadRecentDetections(payload, defaultWindow) {
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const seen = new Set();
    const rows = [];
    events.forEach((event) => {
      const normalized = normalizeRecentDetection(event, {
        sourceType: 'payload',
        sourceSnapshotTs: payload?.ts,
        sourceWindow: payload?.window || defaultWindow,
        priceXrpUsd: Number.isFinite(payload?.priceXrpUsd) ? payload.priceXrpUsd : null,
      });
      const dedupeKey = buildDetectionKey(normalized);
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      rows.push(normalized);
    });
    return rows.sort((a, b) => Date.parse(b.time || '') - Date.parse(a.time || ''));
  }

  function normalizeRecentDetection(event, options) {
    const amountXrp = Number(event?.amountXrp || 0);
    const amountUsd = Number.isFinite(event?.amountUsd)
      ? Number(event.amountUsd)
      : (Number.isFinite(options.priceXrpUsd) ? amountXrp * options.priceXrpUsd : null);
    return {
      time: event?.time || options.sourceSnapshotTs || null,
      label: event?.label || 'unknown',
      dir: event?.dir || '—',
      amountXrp,
      amountUsd,
      reason: event?.reason || event?.scoreBasis || '',
      sourceWindow: options.sourceWindow,
      sourceSnapshotTs: options.sourceSnapshotTs,
      sourceType: options.sourceType,
      txHash: event?.txHash || null,
      from: event?.from || null,
      to: event?.to || null,
    };
  }

  function buildDetectionKey(row) {
    return [
      row.txHash || '',
      row.time || '',
      row.label || '',
      row.dir || '',
      Number(row.amountXrp || 0).toFixed(6),
    ].join('|');
  }

  function inferPressure(net, useUsd, eventCount, window) {
    const profile = getWindowProfile(window);
    const abs = Math.abs(net);
    if (eventCount === 0 && abs <= profile.quietAbsNetXrp) return 'QUIET';
    if (abs >= profile.mediumAbsNetXrp || eventCount >= profile.eventHigh) return 'HIGH';
    if (abs >= profile.lowAbsNetXrp || eventCount >= profile.eventMedium) return 'MEDIUM';
    return 'LOW';
  }

  function buildSummaryReason(payload, net, eventCount) {
    if (eventCount > 0 && payload.summaryReason) return `Why: ${payload.summaryReason}`;
    const profile = getWindowProfile(payload.window);
    const lines = [
      `Why: ${profile.emptyHint}`,
      `Scanned ${payload.debug?.paymentsCount ?? 0} payments across ${payload.debug?.ledgersScanned ?? 0} ledgers.`,
    ];
    if (eventCount === 0 && Math.abs(net) <= profile.quietAbsNetXrp) {
      lines.push(profile.quietHint);
    }
    if (profile.try24h) {
      lines.push('Try 24h for broader signal coverage.');
    }
    return lines.join(' ');
  }

  function updateLastDetectedCache(state) {
    const first = getRecentDetections(state, 1).rows[0];
    if (!first) return;
    const win = first.sourceWindow || state.payload?.window || state.window;
    const prev = state.detectedEventsCache[win];
    if (!prev || Date.parse(first.time || '') > Date.parse(prev.time || '')) {
      state.detectedEventsCache[win] = first;
    }
  }

  function findLastDetectedEvent(state) {
    const current = getRecentDetections(state, 1).rows[0];
    if (current) return current;
    if (state.detectedEventsCache['24h']) return state.detectedEventsCache['24h'];
    const cached = Object.values(state.detectedEventsCache)
      .filter(Boolean)
      .sort((a, b) => Date.parse(b.time || '') - Date.parse(a.time || ''));
    return cached[0] || null;
  }

  function buildLastEventLine(event) {
    if (!event) return 'Last detected event: No detected labeled event yet.';
    return `Last detected event: ${formatDateTime(event.time)} | ${event.dir || '—'} | ${event.label || 'unknown'} | ${formatXrp(event.amountXrp || 0)}`;
  }

  function getLiveError(payload, demoOnly) {
    if (demoOnly || !payload || payload.ok) return '';
    const warnings = Array.isArray(payload.debug?.warnings) ? payload.debug.warnings : [];
    return warnings[0] || payload.debug?.lastError || payload.staleReason || 'unknown_live_error';
  }

  function bindCanvasInteraction(refs, state) {
    refs.canvasWrap.style.position = refs.canvasWrap.style.position || 'relative';
    const hoverOverlay = document.createElement('div');
    hoverOverlay.id = 'flowHoverCell';
    Object.assign(hoverOverlay.style, {
      position: 'absolute',
      border: '2px solid #0f172a',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '2',
      boxSizing: 'border-box',
    });
    refs.canvasWrap.appendChild(hoverOverlay);
    refs.hoverOverlay = hoverOverlay;

    const findCell = (clientX, clientY) => {
      const cells = state.heatmapCells || [];
      if (!cells.length || !state.payload || !state.heatmapLayout) return null;
      const rect = refs.canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const { leftPad, topPad, chartW, chartH, cols, rows } = state.heatmapLayout;
      if (x < leftPad || x > leftPad + chartW || y < topPad || y > topPad + chartH) return null;
      const cx = Math.max(0, Math.min(cols - 1, Math.floor(((x - leftPad) / chartW) * cols)));
      const cy = Math.max(0, Math.min(rows - 1, Math.floor(((y - topPad) / chartH) * rows)));
      const idx = (cy * cols) + cx;
      return cells[idx] || null;
    };

    const showTooltip = (cell, clientX, clientY, fixed = false) => {
      if (!cell) {
        refs.tooltip.hidden = true;
        return;
      }
      refs.tooltip.hidden = false;
      refs.tooltip.textContent = `${cell.label} | ${cell.signed >= 0 ? '+' : ''}${formatXrp(cell.signed)}`;
      const rect = refs.canvasWrap.getBoundingClientRect();
      refs.tooltip.style.left = `${Math.min(rect.width - 160, Math.max(12, clientX - rect.left + 10))}px`;
      refs.tooltip.style.top = `${Math.min(rect.height - 40, Math.max(16, clientY - rect.top - 8))}px`;
      refs.tooltip.dataset.fixed = fixed ? '1' : '';
    };

    const queueHoverOverlayUpdate = () => {
      if (state.isPageHidden || state.hoverRaf) return;
      state.hoverRaf = window.requestAnimationFrame(() => {
        state.hoverRaf = 0;
        updateHoverOverlay(refs, state);
      });
    };

    const moveHandler = (event) => {
      if (state.isPageHidden || state.pinnedCell) return;
      const cell = findCell(event.clientX, event.clientY);
      state.hoveredCell = cell;
      showTooltip(cell, event.clientX, event.clientY);
      queueHoverOverlayUpdate();
    };

    const leaveHandler = () => {
      if (state.isPageHidden) return;
      if (state.pinnedCell) return;
      state.hoveredCell = null;
      refs.tooltip.hidden = true;
      queueHoverOverlayUpdate();
    };

    const clickHandler = (event) => {
      const cell = findCell(event.clientX, event.clientY);
      state.pinnedCell = cell;
      showTooltip(cell, event.clientX, event.clientY, true);
      renderHeatmap(refs, state);
    };

    [refs.canvas, refs.canvasWrap].forEach((target) => {
      target.addEventListener('mousemove', moveHandler);
      target.addEventListener('mouseleave', leaveHandler);
      target.addEventListener('click', clickHandler);
    });

    return () => {
      cancelHoverFrame(state);
      [refs.canvas, refs.canvasWrap].forEach((target) => {
        target.removeEventListener('mousemove', moveHandler);
        target.removeEventListener('mouseleave', leaveHandler);
        target.removeEventListener('click', clickHandler);
      });
      refs.hoverOverlay?.remove();
    };
  }

  function cancelHoverFrame(state) {
    if (!state.hoverRaf) return;
    cancelAnimationFrame(state.hoverRaf);
    state.hoverRaf = 0;
  }

  function updateHoverOverlay(refs, state) {
    const overlay = refs.hoverOverlay;
    const layout = state.heatmapLayout;
    const cell = state.pinnedCell || state.hoveredCell;
    if (!overlay || !layout || !cell || state.mode === 'loading') {
      if (overlay) overlay.style.display = 'none';
      return;
    }
    const { leftPad, topPad, cellW, cellH } = layout;
    overlay.style.display = 'block';
    overlay.style.left = `${leftPad + cell.x * cellW + 1}px`;
    overlay.style.top = `${topPad + cell.y * cellH + 1}px`;
    overlay.style.width = `${Math.max(2, cellW - 2)}px`;
    overlay.style.height = `${Math.max(2, cellH - 2)}px`;
  }

  function toggleOverlay(refs, mode) {
    Object.entries(refs.overlays).forEach(([name, node]) => {
      node.hidden = name !== mode;
    });
  }

  function loadBool(key, fallback = false) {
    try {
      const value = localStorage.getItem(key);
      if (value == null) return fallback;
      return value === '1';
    } catch {
      return fallback;
    }
  }

  function saveBool(key, value) {
    try { localStorage.setItem(key, value ? '1' : '0'); } catch { }
  }

  function loadValue(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
  }

  function saveValue(key, value) {
    try { localStorage.setItem(key, value); } catch { }
  }

  function safeText(node, value) {
    if (node) node.textContent = value;
  }

  function formatUsd(value) {
    return `$${Math.round(value).toLocaleString()}`;
  }

  function formatSignedUsd(value) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${formatUsd(value)}`;
  }

  function formatXrp(value) {
    return `${Math.round(value).toLocaleString()} XRP`;
  }

  function formatSignedXrp(value) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${formatXrp(value)}`;
  }

  function formatSignedCompactXrp(value) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${Math.round(value || 0).toLocaleString()} XRP`;
  }

  function shortAddress(address) {
    if (!address) return '—';
    if (address.length <= 12) return address;
    return `${address.slice(0, 5)}...${address.slice(-5)}`;
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '—');
    return date.toLocaleString();
  }

  function formatTime(value) {
    if (typeof value === 'number') return String(value);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '—');
    return date.toLocaleTimeString();
  }

  function relativeSeconds(timestamp) {
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    return `${seconds}s ago`;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
