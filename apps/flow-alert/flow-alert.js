(() => {
  const LITE_KEY = 'xsic.flowAlert.liteMode';
  const DEMO_KEY = 'xsic.flowAlert.demoOnly';
  const PRESET_KEY = 'xsic.flowAlert.targetPreset';
  const WINDOW_KEY = 'xsic.flowAlert.window';

  const LABELS = ['Binance', 'Coinbase', 'Bitstamp', 'Kraken', 'Bybit', 'Unknown'];
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
      forcedMode: 'ok',
      liteMode: loadBool(LITE_KEY),
      demoOnly: true,
      preset: loadValue(PRESET_KEY, 'exchanges') || 'exchanges',
      window: loadValue(WINDOW_KEY, '5m'),
      snapshot: null,
      heatmap: null,
      hoveredCell: null,
      pinnedCell: null,
      lastRefreshMs: 0,
      timer: null,
    };

    refs.liteToggle.checked = state.liteMode;
    refs.demoToggle.checked = state.demoOnly;
    refs.presetSelect.value = state.preset;
    refs.windowSelect.value = state.window;

    refs.liteToggle.addEventListener('change', () => {
      state.liteMode = refs.liteToggle.checked;
      saveBool(LITE_KEY, state.liteMode);
      renderNow();
    });

    refs.demoToggle.addEventListener('change', () => {
      state.demoOnly = refs.demoToggle.checked;
      saveBool(DEMO_KEY, state.demoOnly);
      renderNow();
    });

    refs.presetSelect.addEventListener('change', () => {
      state.preset = refs.presetSelect.value;
      saveValue(PRESET_KEY, state.preset);
      renderNow();
    });

    refs.windowSelect.addEventListener('change', () => {
      state.window = refs.windowSelect.value;
      saveValue(WINDOW_KEY, state.window);
      renderNow();
    });

    refs.retryButton?.addEventListener('click', () => {
      state.forcedMode = 'ok';
      renderNow();
    });

    refs.emptyButton?.addEventListener('click', () => {
      state.preset = 'exchanges';
      refs.presetSelect.value = 'exchanges';
      saveValue(PRESET_KEY, state.preset);
      state.forcedMode = 'ok';
      renderNow();
    });

    refs.debugButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.flowForce;
        if (!FORCE_MODES.has(mode)) return;
        state.forcedMode = mode;
        renderNow();
      });
    });

    window.addEventListener('resize', () => renderHeatmap(refs, state));
    bindCanvasInteraction(refs, state);

    renderEvents(refs);
    renderTrend(refs, []);
    renderNow();

    state.timer = window.setInterval(() => {
      if (state.mode === 'loading') return;
      if (state.mode === 'error') return;
      generateData(state);
      renderPanels(refs, state);
      renderHeatmap(refs, state);
      renderTrend(refs, state.heatmap.netSeries);
    }, state.liteMode ? 5500 : 3000);

    function renderNow() {
      applyMode(state);
      clearInterval(state.timer);
      const delay = state.mode === 'loading' ? 700 : 0;
      window.setTimeout(() => {
        if (state.mode === 'error' || state.mode === 'empty') {
          renderPanels(refs, state);
          renderHeatmap(refs, state);
          return;
        }
        generateData(state);
        renderPanels(refs, state);
        renderHeatmap(refs, state);
        renderTrend(refs, state.heatmap.netSeries);
      }, delay);

      state.timer = window.setInterval(() => {
        if (state.mode !== 'ok' && state.mode !== 'stale') return;
        generateData(state);
        renderPanels(refs, state);
        renderHeatmap(refs, state);
        renderTrend(refs, state.heatmap.netSeries);
      }, state.liteMode ? 5500 : 3000);
    }

    function applyMode(current) {
      if (current.forcedMode === 'loading') {
        current.mode = 'loading';
      } else if (current.forcedMode === 'error' || !current.demoOnly) {
        current.mode = 'error';
      } else if (current.forcedMode === 'empty' || !current.preset) {
        current.mode = 'empty';
      } else if (current.forcedMode === 'stale') {
        current.mode = 'stale';
      } else {
        current.mode = 'ok';
      }
    }
  }

  function generateData(state) {
    const now = Date.now();
    const bucketCount = state.liteMode ? 12 : 24;
    const cells = [];
    const totals = Array.from({ length: LABELS.length }, () => 0);
    const netSeries = [];

    for (let y = 0; y < LABELS.length; y += 1) {
      for (let x = 0; x < bucketCount; x += 1) {
        const wave = Math.sin((now / 13000) + x * 0.45 + y * 0.65);
        const noise = (Math.random() * 0.35) + 0.2;
        const base = Math.max(0, wave + noise);
        const value = Math.round(base * 980000);
        totals[y] += value;
        cells.push({ x, y, label: LABELS[y], value });
      }
    }

    for (let i = 0; i < bucketCount; i += 1) {
      const inflow = 90000 + Math.round(Math.random() * 210000);
      const outflow = 90000 + Math.round(Math.random() * 230000);
      netSeries.push(inflow - outflow);
    }

    const inflow = netSeries.reduce((acc, value) => acc + (value > 0 ? value : Math.round(Math.abs(value) * 0.52)), 0);
    const outflow = netSeries.reduce((acc, value) => acc + (value < 0 ? Math.abs(value) : Math.round(value * 0.48)), 0);
    const net = inflow - outflow;

    state.lastRefreshMs = now;
    state.heatmap = { bucketCount, cells, totals, netSeries };
    state.snapshot = {
      inflow,
      outflow,
      net,
      pressure: Math.abs(net) > 600000 ? 'HIGH' : 'MEDIUM',
    };
  }

  function renderPanels(refs, state) {
    const isData = Boolean(state.snapshot);
    toggleOverlay(refs, state.mode);

    const statusText = state.mode === 'ok' ? 'OK' : state.mode.toUpperCase();
    safeText(refs.statusMeta, statusText);
    safeText(refs.status, `Status: ${statusText}`);
    refs.staleNote.hidden = state.mode !== 'stale';

    if (!isData) {
      ['inflow', 'outflow', 'net', 'window', 'source', 'updated'].forEach((key) => safeText(refs.snapshot[key], '—'));
      safeText(refs.summary.headline, 'NET: — | Pressure: — | Window: — | Target: —');
      safeText(refs.summary.reason, 'Why: no data generated for this state.');
      safeText(refs.refreshMeta, '—');
      return;
    }

    safeText(refs.snapshot.inflow, formatUsd(state.snapshot.inflow));
    safeText(refs.snapshot.outflow, formatUsd(state.snapshot.outflow));
    safeText(refs.snapshot.net, formatSignedUsd(state.snapshot.net));
    safeText(refs.snapshot.window, state.window);
    safeText(refs.snapshot.source, state.mode === 'stale' ? 'demo (cached)' : 'demo');
    safeText(refs.snapshot.updated, relativeSeconds(state.lastRefreshMs));
    safeText(refs.refreshMeta, relativeSeconds(state.lastRefreshMs));

    safeText(
      refs.summary.headline,
      `NET: ${formatSignedUsd(state.snapshot.net)} | Pressure: ${state.snapshot.pressure} | Window: ${state.window} | Target: ${state.preset || 'Unset'}`,
    );
    safeText(refs.summary.reason, 'Why: Exchange IN spike + whale→exchange burst (demo).');
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

    if (!state.heatmap || (state.mode !== 'ok' && state.mode !== 'stale')) return;

    const leftPad = 92;
    const topPad = 18;
    const chartW = width - leftPad - 14;
    const chartH = height - topPad - 48;
    const rows = LABELS.length;
    const cols = state.heatmap.bucketCount;
    const cellW = chartW / cols;
    const cellH = chartH / rows;
    const max = Math.max(...state.heatmap.cells.map((cell) => cell.value), 1);

    state.heatmap.cells.forEach((cell) => {
      const alpha = 0.15 + (cell.value / max) * 0.8;
      const x = leftPad + (cell.x * cellW);
      const y = topPad + (cell.y * cellH);
      ctx.fillStyle = `rgba(37, 99, 235, ${alpha})`;
      ctx.fillRect(x + 1, y + 1, Math.max(2, cellW - 2), Math.max(2, cellH - 2));
    });

    ctx.fillStyle = '#334155';
    ctx.font = '12px sans-serif';
    LABELS.forEach((label, index) => {
      const y = topPad + index * cellH + cellH * 0.66;
      ctx.fillText(label, 8, y);
    });

    ctx.fillStyle = '#64748b';
    const xStep = Math.max(1, Math.floor(cols / (state.liteMode ? 4 : 6)));
    for (let i = 0; i < cols; i += xStep) {
      const x = leftPad + i * cellW;
      const minute = String((i * 5) % 60).padStart(2, '0');
      ctx.fillText(`${minute}m`, x, height - 14);
    }

    if (state.hoveredCell || state.pinnedCell) {
      const cell = state.pinnedCell || state.hoveredCell;
      const x = leftPad + cell.x * cellW;
      const y = topPad + cell.y * cellH;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, Math.max(2, cellW - 2), Math.max(2, cellH - 2));
    }
  }

  function renderTrend(refs, values) {
    refs.trendWrap.innerHTML = '';
    values.forEach((value) => {
      const bar = document.createElement('div');
      const pct = Math.min(100, Math.max(12, Math.round((Math.abs(value) / 260000) * 100)));
      bar.style.height = `${pct}%`;
      bar.className = value < 0 ? 'flow-trend-bar flow-trend-bar--neg' : 'flow-trend-bar flow-trend-bar--pos';
      bar.title = `Net ${formatSignedUsd(value)}`;
      refs.trendWrap.appendChild(bar);
    });
  }

  function renderEvents(refs) {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      time: `19:${String(24 + i).padStart(2, '0')}:10`,
      route: `r${i}x.. → ${LABELS[i % LABELS.length]}`,
      label: i % 2 === 0 ? 'Exchange' : 'Whale',
      dir: i % 3 === 0 ? 'OUT' : 'IN',
      amount: `${(1.2 + i * 0.3).toFixed(1)}M XRP`,
      score: i % 2 === 0 ? 'HIGH' : 'MED',
    }));

    refs.eventsTableBody.innerHTML = rows.map((row) => `
      <tr>
        <td><details><summary>${row.time}</summary><div>tx link: coming soon<br>classification reason: demo rule set</div></details></td>
        <td>${row.route}</td>
        <td>${row.label}</td>
        <td>${row.dir}</td>
        <td>${row.amount}</td>
        <td>${row.score}</td>
      </tr>
    `).join('');

    refs.eventCards.innerHTML = rows.map((row) => `
      <details class="flow-event-card">
        <summary>${row.time} • ${row.dir} • ${row.amount} • ${row.score}</summary>
        <p>${row.route} (${row.label})</p>
        <p>tx link: coming soon</p>
        <p>classification reason: demo rule set</p>
      </details>
    `).join('');
  }

  function bindCanvasInteraction(refs, state) {
    const findCell = (clientX, clientY) => {
      if (!state.heatmap) return null;
      const rect = refs.canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const leftPad = 92;
      const topPad = 18;
      const chartW = rect.width - leftPad - 14;
      const chartH = rect.height - topPad - 48;
      const cols = state.heatmap.bucketCount;
      const rows = LABELS.length;
      if (x < leftPad || x > leftPad + chartW || y < topPad || y > topPad + chartH) return null;
      const cx = Math.max(0, Math.min(cols - 1, Math.floor(((x - leftPad) / chartW) * cols)));
      const cy = Math.max(0, Math.min(rows - 1, Math.floor(((y - topPad) / chartH) * rows)));
      const idx = (cy * cols) + cx;
      return state.heatmap.cells[idx] || null;
    };

    const showTooltip = (cell, clientX, clientY, fixed = false) => {
      if (!cell) {
        refs.tooltip.hidden = true;
        return;
      }
      refs.tooltip.hidden = false;
      refs.tooltip.textContent = `${cell.label} | t-${cell.x + 1} | ${formatUsd(cell.value)}`;
      const rect = refs.canvasWrap.getBoundingClientRect();
      refs.tooltip.style.left = `${Math.min(rect.width - 160, Math.max(12, clientX - rect.left + 10))}px`;
      refs.tooltip.style.top = `${Math.min(rect.height - 40, Math.max(16, clientY - rect.top - 8))}px`;
      refs.tooltip.dataset.fixed = fixed ? '1' : '';
    };

    const moveHandler = (event) => {
      if (state.pinnedCell) return;
      const cell = findCell(event.clientX, event.clientY) || state.heatmap?.cells?.[0] || null;
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
      const cell = findCell(event.clientX, event.clientY) || state.heatmap?.cells?.[0] || null;
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
    try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* ignore */ }
  }

  function loadValue(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  }

  function saveValue(key, value) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
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
