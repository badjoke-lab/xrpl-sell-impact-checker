(() => {
  const LITE_KEY = 'xsic.flowAlert.liteMode';
  const DEMO_KEY = 'xsic.flowAlert.demoOnly';
  const PRESET_KEY = 'xsic.flowAlert.targetPreset';
  const WINDOW_KEY = 'xsic.flowAlert.window';
  const FORCE_MODES = new Set(['loading', 'ok', 'empty', 'error', 'stale']);

  function boot() {
    const refs = {
      canvasWrap: document.getElementById('flowCanvasWrap'),
      canvas: document.getElementById('flowCanvas'),
      tooltip: document.getElementById('flowTooltip'),
      status: document.getElementById('flowStatus'),
      debugLine: document.getElementById('flowDebugLine'),
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
      debugButtons: Array.from(document.querySelectorAll('[data-flow-force]')),
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
    };

    if (!refs.canvas || !refs.canvasWrap) return;
    init(refs);
  }

  function init(refs) {
    const state = {
      mode: 'loading',
      forcedMode: null,
      liteMode: loadBool(LITE_KEY),
      demoOnly: loadBool(DEMO_KEY, true),
      preset: loadValue(PRESET_KEY, 'exchanges') || 'exchanges',
      window: loadValue(WINDOW_KEY, '1h'),
      payload: null,
      escrowPayload: null,
      heatmapCells: [],
      hoveredCell: null,
      pinnedCell: null,
      lastRefreshMs: 0,
      timer: null,
      isFetching: false,
      detectedEventsCache: {},
    };

    refs.liteToggle.checked = state.liteMode;
    refs.demoToggle.checked = state.demoOnly;
    refs.presetSelect.value = state.preset;
    refs.windowSelect.value = state.window;

    refs.liteToggle.addEventListener('change', () => {
      state.liteMode = refs.liteToggle.checked;
      saveBool(LITE_KEY, state.liteMode);
      renderCycle();
    });

    refs.demoToggle.addEventListener('change', () => {
      state.demoOnly = refs.demoToggle.checked;
      saveBool(DEMO_KEY, state.demoOnly);
      renderCycle(true);
    });

    refs.presetSelect.addEventListener('change', () => {
      state.preset = refs.presetSelect.value;
      saveValue(PRESET_KEY, state.preset);
      renderCycle(true);
    });

    refs.windowSelect.addEventListener('change', () => {
      state.window = refs.windowSelect.value;
      saveValue(WINDOW_KEY, state.window);
      renderCycle(true);
    });

    refs.refreshButton?.addEventListener('click', () => renderCycle(true));

    refs.retryButton?.addEventListener('click', () => {
      state.forcedMode = null;
      renderCycle(true);
    });

    refs.emptyButton?.addEventListener('click', () => {
      state.preset = 'exchanges';
      refs.presetSelect.value = 'exchanges';
      saveValue(PRESET_KEY, state.preset);
      state.forcedMode = null;
      renderCycle(true);
    });

    refs.debugButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.flowForce;
        if (!FORCE_MODES.has(mode)) return;
        state.forcedMode = mode === 'ok' ? null : mode;
        applyMode(state);
        renderPanels(refs, state);
        renderHeatmap(refs, state);
      });
    });

    window.addEventListener('resize', () => renderHeatmap(refs, state));
    bindCanvasInteraction(refs, state);
    renderCycle(true);

    function renderCycle(immediate = false) {
      clearInterval(state.timer);
      state.timer = window.setInterval(() => syncData(refs, state), state.liteMode ? 12_000 : 8_000);
      if (immediate) syncData(refs, state);
    }
  }

  async function syncData(refs, state) {
    if (!state.preset) {
      state.mode = 'empty';
      state.payload = null;
      renderPanels(refs, state);
      renderHeatmap(refs, state);
      renderEscrow(refs, state);
      return;
    }

    state.isFetching = true;
    if (!state.payload) {
      state.mode = 'loading';
      renderPanels(refs, state);
      renderHeatmap(refs, state);
      renderEscrow(refs, state);
    } else {
      renderPanels(refs, state);
    }

    let result;
    if (state.demoOnly) {
      result = {
        flow: makeDemoPayload(state),
        escrow: makeDemoEscrowPayload(state),
      };
    } else {
      result = await fetchLivePayload(state);
    }

    try {
      state.payload = result.flow;
      state.escrowPayload = result.escrow;
      state.lastRefreshMs = Math.max(result.flow?.ts || 0, result.escrow?.ts || 0, Date.now());
      applyMode(state);
      buildHeatmapCells(state);
      updateLastDetectedCache(state);
      renderPanels(refs, state);
      renderHeatmap(refs, state);
      renderEvents(refs, state);
      renderEscrow(refs, state);
    } finally {
      state.isFetching = false;
      renderPanels(refs, state);
    }
  }

  async function fetchLivePayload(state) {
    const flowUrl = `/api/xrpl/whale-flow?preset=${encodeURIComponent(state.preset)}&window=${encodeURIComponent(state.window)}`;
    const escrowWindow = state.window;
    const escrowLimit = state.liteMode || state.window === '24h' || state.window === '7d' ? 5 : 10;
    const escrowUrl = `/api/xrpl/escrow-watch?window=${encodeURIComponent(escrowWindow)}&limit=${escrowLimit}`;

    const [flow, escrow] = await Promise.all([
      fetchFlowPayload(flowUrl, state),
      fetchEscrowPayload(escrowUrl, escrowWindow),
    ]);

    return { flow, escrow };
  }

  async function fetchFlowPayload(url, state) {
    const startedAt = Date.now();
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`http_${response.status}`);
      return await response.json();
    } catch (error) {
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

  async function fetchEscrowPayload(url, window) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`http_${response.status}`);
      return await response.json();
    } catch (error) {
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

  function buildHeatmapCells(state) {
    const labels = state.payload?.heatmap?.labels || [];
    const matrix = state.payload?.heatmap?.matrix || [];
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
    const liveError = getLiveError(payload, state.demoOnly);
    const statusLabel = state.isFetching && payload ? 'REFRESHING' : state.mode.toUpperCase();
    safeText(refs.statusMeta, statusLabel);
    safeText(refs.status, liveError ? `Status: ${statusLabel} | Live error: ${liveError}` : `Status: ${statusLabel}`);
    safeText(refs.debugLine, buildDebugLine(state));
    refs.staleNote.hidden = state.mode !== 'stale';

    const snapshotKeys = ['inflow', 'outflow', 'net', 'payments', 'ledgers', 'matched', 'source', 'updated'];
    if (!payload || (state.mode !== 'ok' && state.mode !== 'stale')) {
      snapshotKeys.forEach((key) => safeText(refs.snapshot[key], '—'));
      safeText(refs.signal.statusPill, 'LOW');
      refs.signal.statusPill.className = 'flow-pill low';
      safeText(refs.signal.severity, 'severity: — · pressure: —');
      safeText(refs.signal.impact, '—');
      safeText(refs.signal.why, 'No major labeled flow detected in this window.');
      safeText(refs.signal.observed, 'Scanned — payments across — ledgers.');
      safeText(refs.signal.context, 'Partial live data (timeout-limited). Try 24h for broader coverage.');
      safeText(refs.signal.ctxPreset, `target: ${state.preset || 'unset'}`);
      safeText(refs.signal.ctxWindow, `window: ${state.window}`);
      safeText(refs.signal.ctxSource, `source: ${state.demoOnly ? 'demo' : 'live'}`);
      safeText(refs.reasonTitle, 'No dominant pressure');
      safeText(refs.reasonCopy, 'No major labeled flow detected in this window.');
      refs.reasonList.innerHTML = '<li>No major labeled flow detected in this window.</li><li>Scanned 0 payments across 0 ledgers.</li><li>Try 24h for broader coverage.</li>';
      safeText(refs.refreshMeta, '—');
      return;
    }

    const useUsd = Number.isFinite(payload?.summary?.inflowUsd) && payload.priceXrpUsd;
    const net = Number(useUsd ? payload.summary.netUsd : payload.summary.netXrp) || 0;
    const eventCount = (payload.events || []).length;
    const dbg = payload.debug || {};
    const pressure = inferPressure(net, useUsd, eventCount);

    safeText(refs.snapshot.inflow, useUsd ? formatUsd(payload.summary.inflowUsd) : formatXrp(payload.summary.inflowXrp));
    safeText(refs.snapshot.outflow, useUsd ? formatUsd(payload.summary.outflowUsd) : formatXrp(payload.summary.outflowXrp));
    safeText(refs.snapshot.net, useUsd ? formatSignedUsd(payload.summary.netUsd) : formatSignedXrp(payload.summary.netXrp));
    safeText(refs.snapshot.payments, `${dbg.paymentsCount ?? 0}`);
    safeText(refs.snapshot.ledgers, `${dbg.ledgersScanned ?? 0}`);
    safeText(refs.snapshot.matched, `${eventCount}`);
    const staleTag = payload.staleReason === 'sampled' ? 'sampled' : payload.stale ? 'cached' : '';
    safeText(refs.snapshot.source, `${payload.source}${staleTag ? ` (${staleTag})` : ''}`);
    safeText(refs.snapshot.updated, relativeSeconds(state.lastRefreshMs));
    safeText(refs.refreshMeta, relativeSeconds(state.lastRefreshMs));

    const severity = pressure;
    const pillClass = pressure === 'HIGH' ? 'high' : pressure === 'MEDIUM' ? 'medium' : pressure === 'QUIET' ? 'quiet' : 'low';
    safeText(refs.signal.statusPill, severity);
    refs.signal.statusPill.className = `flow-pill ${pillClass}`;
    safeText(refs.signal.severity, `severity: ${pressure === 'HIGH' ? 3 : pressure === 'MEDIUM' ? 2 : 1} · pressure: ${pressure}`);
    safeText(refs.signal.impact, useUsd ? formatSignedUsd(net) : formatSignedXrp(net));

    const reason = buildSummaryReason(payload, net, eventCount).replace(/^Why:\s*/, '');
    safeText(refs.signal.why, reason);
    safeText(refs.signal.observed, `Scanned ${dbg.paymentsCount ?? 0} payments across ${dbg.ledgersScanned ?? 0} ledgers.`);
    safeText(refs.signal.ctxPreset, `target: ${state.preset || 'unset'}`);
    safeText(refs.signal.ctxWindow, `window: ${payload.window || state.window}`);
    safeText(refs.signal.ctxSource, `source: ${state.demoOnly ? 'demo' : payload.source}`);

    const contextLines = [];
    if (payload.stale) contextLines.push('Partial live data (timeout-limited).');
    if (payload.staleReason === 'sampled') contextLines.push('Sampled payload was used for responsiveness.');
    if (eventCount === 0) contextLines.push('No major labeled flow detected in this window.');
    if ((payload.window === '5m' || payload.window === '1h') && eventCount === 0) contextLines.push('Try 24h for broader coverage.');
    safeText(refs.signal.context, contextLines.join(' ') || 'Live payload synchronized.');

    safeText(refs.reasonTitle, eventCount ? 'Labeled flow activity detected' : 'Quiet labeled-flow window');
    safeText(refs.reasonCopy, reason);
    refs.reasonList.innerHTML = [
      `No major labeled flow detected in this window${eventCount ? ' (overridden by detected events).' : '.'}`,
      `Scanned ${dbg.paymentsCount ?? 0} payments across ${dbg.ledgersScanned ?? 0} ledgers.`,
      payload.stale ? 'Partial live data (timeout-limited).' : 'Payload freshness: current.',
      (payload.window === '5m' || payload.window === '1h') ? 'Try 24h for broader coverage.' : 'Window is broad enough for lower-noise context.',
    ].map((line) => `<li>${line}</li>`).join('');
  }

  function renderHeatmap(refs, state) {
    const ctx = refs.canvas.getContext('2d');
    if (!ctx) return;

    const width = Math.floor(refs.canvasWrap.clientWidth - 24);
    const height = 320;
    refs.canvas.width = width * devicePixelRatio;
    refs.canvas.height = height * devicePixelRatio;
    refs.canvas.style.height = `${height}px`;
    refs.canvas.style.width = `${width}px`;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    if (!state.payload || (state.mode !== 'ok' && state.mode !== 'stale')) return;

    const labels = state.payload.heatmap.labels || [];
    const cols = Math.max(1, state.payload.heatmap.buckets?.length || 1);
    const leftPad = 92;
    const topPad = 18;
    const chartW = width - leftPad - 14;
    const chartH = height - topPad - 48;
    const cellW = chartW / cols;
    const cellH = chartH / Math.max(1, labels.length);
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

    if (state.hoveredCell || state.pinnedCell) {
      const cell = state.pinnedCell || state.hoveredCell;
      const x = leftPad + cell.x * cellW;
      const y = topPad + cell.y * cellH;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, Math.max(2, cellW - 2), Math.max(2, cellH - 2));
    }
  }

  function renderEvents(refs, state) {
    const useUsd = Number.isFinite(state.payload?.priceXrpUsd);
    const highWindow = state.window === '24h' || state.window === '7d';
    const rows = (state.payload?.events || []).slice(0, (state.liteMode || highWindow) ? 6 : 8);

    if (!rows.length) {
      refs.recentFlows.innerHTML = '';
      if (refs.eventsEmpty) {
        refs.eventsEmpty.hidden = false;
        refs.eventsEmpty.textContent = 'No recent labeled event in this window.';
      }
      return;
    }

    if (refs.eventsEmpty) refs.eventsEmpty.hidden = true;
    refs.recentFlows.innerHTML = rows.map((row) => `
      <article class="flow-recent-row">
        <div class="flow-time">${formatTime(row.time)}</div>
        <div>${shortAddress(row.from)} → ${shortAddress(row.to)} · ${row.label || 'unknown'}</div>
        <div>${row.dir || '—'}</div>
        <div class="flow-amount">${useUsd && row.amountUsd ? `${formatUsd(row.amountUsd)} (${formatXrp(row.amountXrp)})` : formatXrp(row.amountXrp)}</div>
      </article>
    `).join('');
  }

  function inferPressure(net, useUsd, eventCount) {
    const abs = Math.abs(net);
    const quietLimit = useUsd ? 15_000 : 25_000;
    const lowLimit = useUsd ? 150_000 : 250_000;
    const mediumLimit = useUsd ? 700_000 : 1_000_000;
    if (eventCount === 0 && abs <= quietLimit) return 'QUIET';
    if (abs >= mediumLimit) return 'HIGH';
    if (abs >= lowLimit) return 'MEDIUM';
    return 'LOW';
  }

  function buildSummaryReason(payload, net, eventCount) {
    if (eventCount > 0 && payload.summaryReason) return `Why: ${payload.summaryReason}`;
    const lines = [
      'Why: No major labeled flow detected in this window.',
      `Scanned ${payload.debug?.paymentsCount ?? 0} payments across ${payload.debug?.ledgersScanned ?? 0} ledgers.`,
    ];
    if (eventCount === 0 && Math.abs(net) <= 25_000) {
      lines.push('Market looks quiet (near-neutral net flow).');
    }
    if (payload.window === '5m' || payload.window === '1h') {
      lines.push('Try 24h for broader signal coverage.');
    }
    return lines.join(' ');
  }

  function updateLastDetectedCache(state) {
    const first = (state.payload?.events || [])[0];
    if (!first) return;
    const win = state.payload?.window || state.window;
    const prev = state.detectedEventsCache[win];
    if (!prev || Date.parse(first.time || '') > Date.parse(prev.time || '')) {
      state.detectedEventsCache[win] = first;
    }
  }

  function findLastDetectedEvent(state) {
    const current = (state.payload?.events || [])[0];
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

  function buildDebugLine(state) {
    const payload = state.payload || {};
    const dbg = payload.debug || {};
    const firstWarning = Array.isArray(dbg.warnings) && dbg.warnings.length ? dbg.warnings[0] : 'none';
    return `FLOW_DEBUG preset=${state.preset || 'none'} window=${payload.window || state.window} ok=${Boolean(payload.ok)} stale=${Boolean(payload.stale)} dur=${Math.round(dbg.durationMs || 0)}ms rpc=${dbg.rpcCalls || 0} strat=${dbg.strategy || 'n/a'} degrade=${dbg.degradeLevel || 'none'} lastError=${dbg.lastError || 'none'} warn=${firstWarning}`;
  }

  function getLiveError(payload, demoOnly) {
    if (demoOnly || !payload || payload.ok) return '';
    const warnings = Array.isArray(payload.debug?.warnings) ? payload.debug.warnings : [];
    return warnings[0] || payload.debug?.lastError || payload.staleReason || 'unknown_live_error';
  }

  function bindCanvasInteraction(refs, state) {
    const findCell = (clientX, clientY) => {
      const cells = state.heatmapCells || [];
      if (!cells.length || !state.payload) return null;
      const rect = refs.canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const leftPad = 92;
      const topPad = 18;
      const chartW = rect.width - leftPad - 14;
      const chartH = rect.height - topPad - 48;
      const cols = Math.max(1, state.payload.heatmap.buckets?.length || 1);
      const rows = Math.max(1, state.payload.heatmap.labels?.length || 1);
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

    const moveHandler = (event) => {
      if (state.pinnedCell) return;
      const cell = findCell(event.clientX, event.clientY);
      state.hoveredCell = cell;
      showTooltip(cell, event.clientX, event.clientY);
      renderHeatmap(refs, state);
    };

    const leaveHandler = () => {
      if (state.pinnedCell) return;
      state.hoveredCell = null;
      refs.tooltip.hidden = true;
      renderHeatmap(refs, state);
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
