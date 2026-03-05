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
      statusMeta: document.querySelector('[data-flow-meta="status"]'),
      refreshMeta: document.querySelector('[data-flow-meta="refresh"]'),
      staleNote: document.getElementById('flowStaleNote'),
      liteToggle: document.getElementById('flow-lite-toggle'),
      demoToggle: document.getElementById('flow-demo-toggle'),
      presetSelect: document.getElementById('flow-target-preset'),
      windowSelect: document.getElementById('flow-window'),
      retryButton: document.getElementById('flow-retry-button'),
      emptyButton: document.getElementById('flow-empty-button'),
      debugButtons: Array.from(document.querySelectorAll('[data-flow-force]')),
      overlays: {
        loading: document.querySelector('[data-flow-state="loading"]'),
        error: document.querySelector('[data-flow-state="error"]'),
        empty: document.querySelector('[data-flow-state="empty"]'),
      },
      summary: {
        headline: document.querySelector('[data-flow-summary="headline"]'),
        reason: document.querySelector('[data-flow-summary="reason"]'),
      },
      snapshot: {
        inflow: document.querySelector('[data-flow-snapshot="inflow"]'),
        outflow: document.querySelector('[data-flow-snapshot="outflow"]'),
        net: document.querySelector('[data-flow-snapshot="net"]'),
        window: document.querySelector('[data-flow-snapshot="window"]'),
        source: document.querySelector('[data-flow-snapshot="source"]'),
        updated: document.querySelector('[data-flow-snapshot="updated"]'),
      },
      trendWrap: document.getElementById('flowTrendBars'),
      eventsTableBody: document.getElementById('flowEventsTableBody'),
      eventCards: document.getElementById('flowEventCards'),
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
      window: loadValue(WINDOW_KEY, '5m'),
      payload: null,
      heatmapCells: [],
      hoveredCell: null,
      pinnedCell: null,
      lastRefreshMs: 0,
      timer: null,
      isFetching: false,
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
      return;
    }

    state.mode = 'loading';
    renderPanels(refs, state);
    renderHeatmap(refs, state);

    let payload;
    if (state.demoOnly) {
      payload = makeDemoPayload(state);
    } else {
      payload = await fetchLivePayload(state);
    }

    state.payload = payload;
    state.lastRefreshMs = payload?.ts || Date.now();
    applyMode(state);
    buildHeatmapCells(state);
    renderPanels(refs, state);
    renderHeatmap(refs, state);
    renderTrend(refs, state);
    renderEvents(refs, state);
  }

  async function fetchLivePayload(state) {
    try {
      const response = await fetch(`/api/xrpl/whale-flow?preset=${encodeURIComponent(state.preset)}&window=${encodeURIComponent(state.window)}`);
      if (!response.ok) throw new Error(`http_${response.status}`);
      const payload = await response.json();
      return payload;
    } catch (error) {
      return {
        ok: false,
        ts: Date.now(),
        source: 'demo',
        stale: true,
        window: state.window,
        priceXrpUsd: null,
        summary: { inflowXrp: 0, outflowXrp: 0, netXrp: 0, inflowUsd: null, outflowUsd: null, netUsd: null },
        heatmap: { labels: ['Unknown'], buckets: [], matrix: [], unit: 'xrp' },
        events: [],
        summaryReason: 'Unable to fetch live data.',
        debug: { endpointsTried: [], ledgersScanned: 0, paymentsCount: 0, cacheHit: false, warnings: [`fetch_error:${error instanceof Error ? error.message : 'unknown'}`] },
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
      debug: { endpointsTried: [], ledgersScanned: 0, paymentsCount: events.length, cacheHit: false, scoreBasis: events[0]?.scoreBasis || 'amount', warnings: [] },
    };
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
    toggleOverlay(refs, state.mode);
    const payload = state.payload;
    safeText(refs.statusMeta, state.mode.toUpperCase());
    safeText(refs.status, `Status: ${state.mode.toUpperCase()}`);
    refs.staleNote.hidden = state.mode !== 'stale';

    if (!payload || (state.mode !== 'ok' && state.mode !== 'stale')) {
      ['inflow', 'outflow', 'net', 'window', 'source', 'updated'].forEach((key) => safeText(refs.snapshot[key], '—'));
      safeText(refs.summary.headline, 'NET: — | Pressure: — | Window: — | Target: —');
      safeText(refs.summary.reason, 'Why: waiting for data.');
      safeText(refs.refreshMeta, '—');
      return;
    }

    const useUsd = Number.isFinite(payload?.summary?.inflowUsd) && payload.priceXrpUsd;
    safeText(refs.snapshot.inflow, useUsd ? formatUsd(payload.summary.inflowUsd) : formatXrp(payload.summary.inflowXrp));
    safeText(refs.snapshot.outflow, useUsd ? formatUsd(payload.summary.outflowUsd) : formatXrp(payload.summary.outflowXrp));
    safeText(refs.snapshot.net, useUsd ? formatSignedUsd(payload.summary.netUsd) : formatSignedXrp(payload.summary.netXrp));
    safeText(refs.snapshot.window, payload.window || state.window);
    safeText(refs.snapshot.source, `${payload.source}${payload.stale ? ' (stale)' : ''}`);
    safeText(refs.snapshot.updated, relativeSeconds(state.lastRefreshMs));
    safeText(refs.refreshMeta, relativeSeconds(state.lastRefreshMs));

    const net = useUsd ? payload.summary.netUsd : payload.summary.netXrp;
    const pressure = Math.abs(net) > (useUsd ? 700000 : 1000000) ? 'HIGH' : 'MEDIUM';
    safeText(refs.summary.headline, `NET: ${useUsd ? formatSignedUsd(net) : formatSignedXrp(net)} | Pressure: ${pressure} | Window: ${payload.window} | Target: ${state.preset}`);
    safeText(refs.summary.reason, payload.summaryReason ? `Why: ${payload.summaryReason}` : 'Why: no notable events yet.');
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

  function renderTrend(refs, state) {
    const matrix = state.payload?.heatmap?.matrix || [];
    const cols = Math.max(0, ...(matrix.map((row) => row.length)));
    const values = [];
    for (let c = 0; c < cols; c += 1) {
      let sum = 0;
      for (let r = 0; r < matrix.length; r += 1) {
        sum += Number(matrix[r]?.[c] || 0);
      }
      values.push(sum);
    }

    refs.trendWrap.innerHTML = '';
    values.forEach((value) => {
      const bar = document.createElement('div');
      const pct = Math.min(100, Math.max(8, Math.round((Math.abs(value) / 500000) * 100)));
      bar.style.height = `${pct}%`;
      bar.className = value < 0 ? 'flow-trend-bar flow-trend-bar--neg' : 'flow-trend-bar flow-trend-bar--pos';
      bar.title = `Net ${formatSignedXrp(value)}`;
      refs.trendWrap.appendChild(bar);
    });
  }

  function renderEvents(refs, state) {
    const useUsd = Number.isFinite(state.payload?.priceXrpUsd);
    const rows = (state.payload?.events || []).slice(0, state.liteMode ? 8 : 16);

    refs.eventsTableBody.innerHTML = rows.map((row) => `
      <tr>
        <td><details><summary>${formatTime(row.time)}</summary><div>reason: ${row.reason || 'n/a'}<br>label source: ${row.labelSource || 'unknown'}<br>tx: ${row.txHash || 'n/a'}<br>bucket: ${row.timeBucket || 'n/a'}<br>from: ${row.from}<br>to: ${row.to}</div></details></td>
        <td>${shortAddress(row.from)} → ${shortAddress(row.to)}</td>
        <td>${row.label}</td>
        <td>${row.dir}</td>
        <td>${useUsd && row.amountUsd ? `${formatUsd(row.amountUsd)} (${formatXrp(row.amountXrp)})` : formatXrp(row.amountXrp)}</td>
        <td>${row.score}</td>
      </tr>
    `).join('');

    refs.eventCards.innerHTML = rows.map((row) => `
      <details class="flow-event-card">
        <summary>${formatTime(row.time)} • ${row.dir} • ${formatXrp(row.amountXrp)} • ${row.score}</summary>
        <p>${shortAddress(row.from)} → ${shortAddress(row.to)} (${row.label})</p>
        <p>reason: ${row.reason || 'n/a'}</p>
        <p>label source: ${row.labelSource || 'unknown'}</p>
        <p>tx: ${row.txHash || 'n/a'} / bucket: ${row.timeBucket || 'n/a'}</p>
      </details>
    `).join('');
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
