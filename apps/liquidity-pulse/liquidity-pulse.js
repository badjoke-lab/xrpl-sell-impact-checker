(() => {
  const STORAGE_KEY = 'xsic.liquidityPulse.liteMode';
  const DEMO_KEY = 'xsic.liquidityPulse.demoMode';
  const API_POOL = 'xrp-rlusd';
  const LIQUIDITY_WINDOW = 12;
  const LIQUIDITY_EMA_ALPHA = 0.3;
  const MAX_FETCH_TIMEOUT_MS = 5000;
  const RESIZE_DEBOUNCE_MS = 180;
  const STATE_PRIORITY = ['error', 'empty', 'loading', 'degraded', 'partial', 'stale', 'demo', 'ok'];
  const STATE_COPY = {
    loading: { badge: 'LOADING', status: 'Loading snapshot…', helper: 'Fetching the latest liquidity snapshot.', note: null },
    ok: { badge: 'OK', status: 'Live snapshot is fresh.', helper: 'All core metrics are available from live source.', note: null },
    stale: {
      badge: 'STALE',
      status: 'Snapshot is stale but display remains available.',
      helper: 'Latest known values are retained until refresh succeeds.',
      note: 'Data may be delayed. Latest known liquidity snapshot is retained while refresh continues.',
    },
    partial: {
      badge: 'PARTIAL',
      status: 'Partial snapshot shown.',
      helper: 'Some metrics are unavailable and shown as —.',
      note: 'Partial snapshot shown. Some metrics are unavailable.',
    },
    degraded: {
      badge: 'DEGRADED',
      status: 'Fallback visualization is active.',
      helper: 'Live source degraded; showing alternate output until recovery.',
      note: 'Live source unavailable; showing fallback snapshot.',
    },
    empty: {
      badge: 'EMPTY',
      status: 'No usable liquidity snapshot is available.',
      helper: 'Try Retry, or switch to Demo mode for a sample fallback view.',
      note: null,
    },
    error: {
      badge: 'ERROR',
      status: 'Unable to load a live liquidity snapshot.',
      helper: 'Live fetch failed. Retry or switch to Demo mode.',
      note: null,
    },
    demo: {
      badge: 'DEMO',
      status: 'Demo source is active.',
      helper: 'Sample fallback data is being shown intentionally.',
      note: 'Demo sample data is active.',
    },
  };

  function boot() {
    const refs = {
      canvasWrap: document.getElementById('lpCanvasWrap'),
      canvas: document.getElementById('lpCanvas'),
      vizSnapshot: document.getElementById('lpVizSnapshot'),
      status: document.getElementById('lpStatus'),
      snapshot: document.getElementById('lpSnapshot'),
      trends: document.getElementById('lpTrends'),
      actions: document.getElementById('lpActions'),
      liteToggle: document.getElementById('lite-mode-toggle'),
      demoToggle: document.getElementById('demo-mode-toggle'),
      retryButton: document.getElementById('retry-button'),
      overlays: {
        loading: document.querySelector('[data-state-overlay="loading"]'),
        error: document.querySelector('[data-state-overlay="error"]'),
        empty: document.querySelector('[data-state-overlay="empty"]'),
      },
      snapshotFields: {
        pool: document.querySelector('[data-snapshot="pool"]'),
        price: document.querySelector('[data-snapshot="price"]'),
        liquidityUsd: document.querySelector('[data-snapshot="liquidityUsd"]'),
        swaps5m: document.querySelector('[data-snapshot="swaps5m"]'),
        deviationBps: document.querySelector('[data-snapshot="deviationBps"]'),
        source: document.querySelector('[data-snapshot="source"]'),
        stateNote: document.querySelector('[data-snapshot="stateNote"]'),
        stateBadge: document.querySelector('[data-snapshot="stateBadge"]'),
        stateHelper: document.querySelector('[data-snapshot="stateHelper"]'),
      },
      trendBars: {
        h1: document.querySelector('[data-trend="1h"]'),
        h6: document.querySelector('[data-trend="6h"]'),
        h24: document.querySelector('[data-trend="24h"]'),
      },
      trendMeta: {
        h1: document.querySelector('[data-trend-meta="1h"]'),
        h6: document.querySelector('[data-trend-meta="6h"]'),
        h24: document.querySelector('[data-trend-meta="24h"]'),
      },
      reasonFields: {
        title: document.querySelector('[data-reason="title"]'),
        copy: document.querySelector('[data-reason="copy"]'),
        list: document.querySelector('[data-reason="list"]'),
      },
    };

    const setStatus = (message) => {
      if (refs.status) refs.status.textContent = `Status: ${message}`;
    };

    if (!refs.canvas) {
      setStatus('Initialization failed: canvas element #lpCanvas is missing.');
      if (refs.overlays.loading) refs.overlays.loading.hidden = true;
      if (refs.overlays.error) refs.overlays.error.hidden = false;
      return;
    }

    try {
      initApp(refs, setStatus);
    } catch (error) {
      setStatus('Initialization failed. Please refresh or try again later.');
      if (refs.overlays.loading) refs.overlays.loading.hidden = true;
      if (refs.overlays.error) refs.overlays.error.hidden = false;
      console.error('Liquidity Pulse init error:', error);
    }
  }

  function initApp(refs, setStatus) {
    const ctx = refs.canvas.getContext('2d');
    const state = {
      mode: 'loading',
      liteMode: loadBool(STORAGE_KEY),
      demoMode: loadBool(DEMO_KEY),
      particles: [],
      rafId: null,
      snapshotTimer: null,
      resizeTimer: null,
      destroyed: false,
      activeRequestId: 0,
      latestSnapshot: null,
      liquiditySamples: [],
      liquidityRateEma: 0,
      visual: {
        amplitudeNorm: 0.18,
        particleNorm: 0.24,
        jitterNorm: 0.03,
      },
    };
    const cleanups = [];

    const setStateUI = (viewState) => {
      const copy = STATE_COPY[viewState] || STATE_COPY.loading;
      safeText(refs.snapshotFields.stateBadge, copy.badge);
      safeText(refs.snapshotFields.stateHelper, copy.helper);
      setStatus(copy.status);
      if (refs.snapshotFields.stateNote) {
        refs.snapshotFields.stateNote.hidden = !copy.note;
        if (copy.note) safeText(refs.snapshotFields.stateNote, copy.note);
      }
    };

    if (refs.liteToggle) refs.liteToggle.checked = state.liteMode;
    if (refs.demoToggle) refs.demoToggle.checked = state.demoMode;

    applyLiteMode();
    resizeCanvas();
    const onResize = () => {
      if (state.resizeTimer) window.clearTimeout(state.resizeTimer);
      state.resizeTimer = window.setTimeout(() => {
        state.resizeTimer = null;
        resizeCanvas();
        requestRender();
      }, RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', onResize);
    cleanups.push(() => {
      window.removeEventListener('resize', onResize);
      if (state.resizeTimer) {
        window.clearTimeout(state.resizeTimer);
        state.resizeTimer = null;
      }
    });

    const onLiteToggle = () => {
      state.liteMode = Boolean(refs.liteToggle.checked);
      saveBool(STORAGE_KEY, state.liteMode);
      applyLiteMode();
      resizeCanvas();
      restartSnapshotLoop();
      requestRender();
      setStatus(`Lite mode ${state.liteMode ? 'enabled' : 'disabled'}.`);
    };
    refs.liteToggle?.addEventListener('change', onLiteToggle);
    cleanups.push(() => refs.liteToggle?.removeEventListener('change', onLiteToggle));

    const onDemoToggle = () => {
      state.demoMode = Boolean(refs.demoToggle.checked);
      saveBool(DEMO_KEY, state.demoMode);
      setStatus(state.demoMode ? 'Demo mode enabled.' : 'Demo mode disabled.');
      void reloadSnapshot({ preferDemo: state.demoMode });
    };
    refs.demoToggle?.addEventListener('change', onDemoToggle);
    cleanups.push(() => refs.demoToggle?.removeEventListener('change', onDemoToggle));

    const onRetry = () => {
      restartSnapshotLoop();
      setStatus('Retrying snapshot fetch…');
      void reloadSnapshot({ preferDemo: state.demoMode, forceApi: !state.demoMode });
    };
    refs.retryButton?.addEventListener('click', onRetry);
    cleanups.push(() => refs.retryButton?.removeEventListener('click', onRetry));

    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelPendingRender();
        stopSnapshotLoop();
        return;
      }
      restartSnapshotLoop();
      requestRender();
      void reloadSnapshot({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));

    const onBeforeUnload = () => cleanup();
    window.addEventListener('beforeunload', onBeforeUnload);
    cleanups.push(() => window.removeEventListener('beforeunload', onBeforeUnload));

    void init();

    async function init() {
      applyViewState('loading');
      await reloadSnapshot();
      startSnapshotLoop();
    }

    function snapshotIntervalMs() {
      return state.liteMode ? 30000 : 12000;
    }

    function loadBool(key) {
      try {
        return window.localStorage.getItem(key) === '1';
      } catch {
        return false;
      }
    }

    function saveBool(key, enabled) {
      try {
        window.localStorage.setItem(key, enabled ? '1' : '0');
      } catch {
        // ignore storage failures
      }
    }

    function setMode(mode) {
      state.mode = mode;
      Object.entries(refs.overlays).forEach(([name, node]) => {
        if (node) node.hidden = name !== mode;
      });
      requestRender();
    }

    function applyViewState(viewState) {
      const mode = (viewState === 'loading' || viewState === 'error' || viewState === 'empty') ? viewState : 'ok';
      setMode(mode);
      setStateUI(viewState);
    }

    async function reloadSnapshot({ preferDemo = false, forceApi = false, silent = false } = {}) {
      const requestId = ++state.activeRequestId;
      if (!silent) applyViewState('loading');

      try {
        const snapshot = (!preferDemo || forceApi) ? await fetchSnapshot() : await loadDummySnapshot();
        if (requestId !== state.activeRequestId) return;

        if (!snapshot) {
          resetSnapshotUI();
          applyViewState('empty');
          return;
        }

        snapshot = await enrichSnapshotWithHistory(snapshot);
        if (requestId !== state.activeRequestId) return;

        renderSnapshot(snapshot);
        updateVisualState(snapshot);
        applyViewState(resolveViewState(snapshot, { forcedDemo: preferDemo && !forceApi }));
      } catch {
        if (requestId !== state.activeRequestId) return;

        if (preferDemo) {
          try {
            const demoSnapshot = await loadDummySnapshot();
            renderSnapshot(demoSnapshot);
            updateVisualState(demoSnapshot);
            applyViewState(resolveViewState(demoSnapshot, { degradedFallback: true }));
            return;
          } catch {
            // fall through
          }
        }

        resetSnapshotUI();
        applyViewState('error');
      }
    }

    function resolveViewState(snapshot, { forcedDemo = false, degradedFallback = false } = {}) {
      const flags = {
        loading: false,
        ok: false,
        stale: Boolean(snapshot?.stale),
        partial: isPartialSnapshot(snapshot),
        degraded: Boolean(degradedFallback),
        empty: false,
        error: false,
        demo: forcedDemo || snapshot?.source === 'demo',
      };
      if (!flags.stale && !flags.partial && !flags.degraded && !flags.demo) flags.ok = true;
      return STATE_PRIORITY.find((name) => flags[name]) || 'ok';
    }

    function isPartialSnapshot(snapshot) {
      const requiredValues = [snapshot?.price, snapshot?.liquidityUsd];
      const requiredAvailable = requiredValues.filter((value) => value !== null && value !== undefined).length;
      return requiredAvailable > 0 && requiredAvailable < requiredValues.length;
    }

    async function fetchHistory(limit = HISTORY_LIMIT) {
      const res = await fetch(`/api/xrpl/liquidity-history?pool=${encodeURIComponent(API_POOL)}&limit=${encodeURIComponent(limit)}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`history_http_${res.status}`);
      const payload = await res.json();
      return Array.isArray(payload?.recent) ? payload.recent : [];
    }

    async function enrichSnapshotWithHistory(snapshot) {
      if (!snapshot || snapshot.source === 'demo') return snapshot;

      try {
        const recent = await fetchHistory();
        return {
          ...snapshot,
          ...deriveTrendMetrics(snapshot, recent),
        };
      } catch {
        return snapshot;
      }
    }

    function deriveTrendMetrics(snapshot, recent) {
      const rows = Array.isArray(recent)
        ? recent.filter((row) => row && row.ts && Number.isFinite(Number(row.liquidityUsd)))
        : [];

      const fallback = {
        trend1h: snapshot?.trend1h ?? 24,
        trend6h: snapshot?.trend6h ?? 42,
        trend24h: snapshot?.trend24h ?? 62,
      };

      const nowTs = Date.parse(snapshot?.ts || '') || Date.now();

      return {
        trend1h: deriveTrendValue(snapshot, rows, nowTs, 60 * 60 * 1000, fallback.trend1h),
        trend6h: deriveTrendValue(snapshot, rows, nowTs, 6 * 60 * 60 * 1000, fallback.trend6h),
        trend24h: deriveTrendValue(snapshot, rows, nowTs, 24 * 60 * 60 * 1000, fallback.trend24h),
      };
    }

    function deriveTrendValue(snapshot, rows, nowTs, horizonMs, fallback) {
      const horizonRows = rows.filter((row) => {
        const ts = Date.parse(row?.ts || '');
        return Number.isFinite(ts) && nowTs - ts <= horizonMs;
      });

      if (horizonRows.length < 2) return fallback;

      const first = horizonRows[0];
      const last = horizonRows[horizonRows.length - 1];
      const firstLiquidity = Number(first?.liquidityUsd);
      const lastLiquidity = Number(last?.liquidityUsd);

      if (!Number.isFinite(firstLiquidity) || !Number.isFinite(lastLiquidity) || firstLiquidity <= 0) {
        return fallback;
      }

      const deltaPct = Math.abs((lastLiquidity - firstLiquidity) / firstLiquidity);
      const base = 14 + Math.min(56, deltaPct * 220);
      const swapsBonus = snapshot?.swaps5m === null || snapshot?.swaps5m === undefined ? 0 : Math.min(16, snapshot.swaps5m * 0.8);
      const deviationBonus = snapshot?.deviationBps === null || snapshot?.deviationBps === undefined ? 0 : Math.min(14, snapshot.deviationBps * 0.22);
      const sampleBonus = Math.min(10, horizonRows.length * 1.25);

      return Math.max(10, Math.min(96, Math.round(base + swapsBonus + deviationBonus + sampleBonus)));
    }

    async function fetchSnapshot() {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), MAX_FETCH_TIMEOUT_MS);

      try {
        const res = await fetch(`/api/xrpl/amm-snapshot?pool=${encodeURIComponent(API_POOL)}`, {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        let payload = null;
        try {
          payload = await res.json();
        } catch {
          throw new Error('invalid_json');
        }

        if (!res.ok || payload?.error) {
          const structuredError = payload && typeof payload === 'object';
          throw new Error(structuredError ? 'structured_error' : payload?.error || `http_${res.status}`);
        }

        return normalizeSnapshot(payload);
      } finally {
        window.clearTimeout(timer);
      }
    }

    function normalizeSnapshot(snapshot) {
      const toFiniteOrNull = (value) => {
        if (value === null || value === undefined || value === '') return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      };

      const price = toFiniteOrNull(snapshot?.price);
      const liquidityUsd = toFiniteOrNull(snapshot?.liquidityUsd);
      const swaps5m = toFiniteOrNull(snapshot?.swaps5m);
      const deviationBps = toFiniteOrNull(snapshot?.deviationBps);
      const reserveA = toFiniteOrNull(snapshot?.reserves?.a);
      const reserveB = toFiniteOrNull(snapshot?.reserves?.b);
      const trend1h = toFiniteOrNull(snapshot?.trend1h);
      const trend6h = toFiniteOrNull(snapshot?.trend6h);
      const trend24h = toFiniteOrNull(snapshot?.trend24h);

      return {
        ts: snapshot?.ts || new Date().toISOString(),
        pool: snapshot?.poolLabel || snapshot?.pool || 'XRPL AMM',
        price,
        liquidityUsd,
        swaps5m: swaps5m === null ? null : Math.round(swaps5m),
        deviationBps: deviationBps === null ? null : Math.round(deviationBps),
        reserveA,
        reserveB,
        source: snapshot?.source || 'api',
        stale: Boolean(snapshot?.stale),
        trend1h: trend1h === null ? 24 : Math.round(trend1h),
        trend6h: trend6h === null ? 42 : Math.round(trend6h),
        trend24h: trend24h === null ? 62 : Math.round(trend24h),
      };
    }

    function startSnapshotLoop() {
      if (state.snapshotTimer) return;
      state.snapshotTimer = window.setInterval(() => {
        void reloadSnapshot({ preferDemo: state.demoMode, silent: true });
      }, snapshotIntervalMs());
    }

    function stopSnapshotLoop() {
      if (!state.snapshotTimer) return;
      window.clearInterval(state.snapshotTimer);
      state.snapshotTimer = null;
    }

    function restartSnapshotLoop() {
      stopSnapshotLoop();
      startSnapshotLoop();
    }

    async function loadDummySnapshot() {
      await wait(250);
      return {
        ts: new Date().toISOString(),
        pool: 'XRP / RLUSD Demo',
        price: 0.5 + Math.random() * 0.05,
        liquidityUsd: 850000 + Math.random() * 190000,
        swaps5m: Math.round(6 + Math.random() * 24),
        deviationBps: Math.round(2 + Math.random() * 26),
        source: 'demo',
        stale: false,
        trend1h: Math.max(8, Math.round(25 + Math.random() * 65)),
        trend6h: Math.max(8, Math.round(20 + Math.random() * 75)),
        trend24h: Math.max(8, Math.round(15 + Math.random() * 82)),
      };
    }

    function renderSnapshot(snapshot) {
      safeText(refs.snapshotFields.pool, snapshot.pool + (snapshot.stale ? ' (stale)' : ''));
      safeText(refs.snapshotFields.price, snapshot.price === null ? '—' : `${snapshot.price.toFixed(6)}`);
      safeText(refs.snapshotFields.liquidityUsd, snapshot.liquidityUsd === null ? '—' : `$${Math.round(snapshot.liquidityUsd).toLocaleString()}`);
      safeText(refs.snapshotFields.swaps5m, snapshot.swaps5m === null ? '—' : String(snapshot.swaps5m));
      safeText(refs.snapshotFields.deviationBps, snapshot.deviationBps === null ? '—' : `${snapshot.deviationBps} bps`);
      const sourceLabel = snapshot.source === 'demo' ? 'demo' : `live${snapshot.stale ? ' / stale' : ' / fresh'}`;
      safeText(refs.snapshotFields.source, sourceLabel);
      renderVizSnapshot(snapshot);

      if (refs.trendBars.h1) refs.trendBars.h1.style.height = `${snapshot.trend1h}%`;
      if (refs.trendBars.h6) refs.trendBars.h6.style.height = `${snapshot.trend6h}%`;
      if (refs.trendBars.h24) refs.trendBars.h24.style.height = `${snapshot.trend24h}%`;

      safeText(refs.trendMeta.h1, describeTrendPulse(snapshot.trend1h, '1h', snapshot.source));
      safeText(refs.trendMeta.h6, describeTrendPulse(snapshot.trend6h, '6h', snapshot.source));
      safeText(refs.trendMeta.h24, describeTrendPulse(snapshot.trend24h, '24h', snapshot.source));

      const reason = buildReasonSummary(snapshot);
      safeText(refs.reasonFields.title, reason.title);
      safeText(refs.reasonFields.copy, reason.copy);
      if (refs.reasonFields.list) {
        refs.reasonFields.list.innerHTML = reason.bullets.map((item) => `<li>${item}</li>`).join('');
      }

      requestRender();
    }

    function resetSnapshotUI() {
      Object.entries(refs.snapshotFields).forEach(([key, node]) => {
        if (key === 'stateNote') {
          if (node) node.hidden = true;
          return;
        }
        safeText(node, '—');
      });
      Object.values(refs.trendBars).forEach((node) => {
        if (node) node.style.height = '12%';
      });
      safeText(refs.trendMeta.h1, '—');
      safeText(refs.trendMeta.h6, '—');
      safeText(refs.trendMeta.h24, '—');
      safeText(refs.reasonFields.title, 'Liquidity read summary');
      safeText(refs.reasonFields.copy, 'Waiting for current liquidity interpretation.');
      if (refs.reasonFields.list) {
        refs.reasonFields.list.innerHTML = '<li>Waiting for current liquidity interpretation.</li>';
      }
      if (refs.vizSnapshot) refs.vizSnapshot.innerHTML = '';
    }



    function describeTrendPulse(value, horizonLabel, source) {
      const n = Number(value);
      const modeLabel = source === 'demo' ? 'sample' : 'live';
      if (!Number.isFinite(n)) return `${horizonLabel} ${modeLabel} pulse unavailable.`;
      if (n >= 70) return `${horizonLabel} ${modeLabel} pulse is elevated.`;
      if (n >= 40) return `${horizonLabel} ${modeLabel} pulse is active.`;
      return `${horizonLabel} ${modeLabel} pulse is quiet.`;
    }

    function buildReasonSummary(snapshot) {
      const liquidity = snapshot?.liquidityUsd;
      const sourceLabel = snapshot?.source === 'demo' ? 'demo sample' : (snapshot?.stale ? 'stale live read' : 'live read');
      let depthLabel = 'unavailable';

      if (liquidity !== null && liquidity !== undefined) {
        if (liquidity >= 5000000) depthLabel = 'deep';
        else if (liquidity >= 1000000) depthLabel = 'moderate';
        else depthLabel = 'thin';
      }

      const title = snapshot?.source === 'demo'
        ? 'Liquidity read summary · demo'
        : (snapshot?.stale ? 'Liquidity read summary · stale' : 'Liquidity read summary · live');

      const copy = `Current pool looks ${depthLabel} from this ${sourceLabel}. Read the pulse band and trend bars as quick cadence hints, then confirm source and freshness above.`;

      const bullets = [
        snapshot?.source === 'demo'
          ? 'Demo mode shows sample cadence instead of live pool activity.'
          : (snapshot?.stale
              ? 'Source is stale, so cadence hints should be treated as delayed.'
              : 'Source is live and fresh, so cadence hints reflect the latest fetch.'),
        snapshot?.swaps5m === null || snapshot?.swaps5m === undefined
          ? '5m swaps are unavailable right now, so the panel avoids implying zero activity.'
          : `5m swaps currently read ${snapshot.swaps5m}.`,
        snapshot?.deviationBps === null || snapshot?.deviationBps === undefined
          ? 'Deviation is unavailable right now, so pressure read is partial.'
          : `Deviation currently reads ${snapshot.deviationBps} bps.`,
      ];

      return { title, copy, bullets };
    }

    function renderVizSnapshot(snapshot) {
      if (!refs.vizSnapshot) return;

      if (!snapshot) {
        refs.vizSnapshot.innerHTML = '<div class="lp-viz-empty">Waiting for liquidity snapshot…</div>';
        return;
      }

      const compact = (value) => {
        if (value === null || value === undefined) return 'Unavailable';
        return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
      };

      const sourceText = snapshot.source === 'demo' ? 'demo' : (snapshot.stale ? 'live / stale' : 'live / fresh');
      const freshnessText = snapshot.stale ? 'STALE' : 'FRESH';

      const liquidityLabel = (() => {
        if (snapshot.liquidityUsd === null || snapshot.liquidityUsd === undefined) return 'Unavailable';
        if (snapshot.liquidityUsd >= 5000000) return 'Deep';
        if (snapshot.liquidityUsd >= 1000000) return 'Moderate';
        return 'Thin';
      })();

      const liquidityNorm = snapshot.liquidityUsd === null || snapshot.liquidityUsd === undefined
        ? 0
        : clamp(logScale(snapshot.liquidityUsd, 10000000), 0.08, 1);

      let reserveA = snapshot.reserveA;
      let reserveB = snapshot.reserveB;

      if ((reserveA === null || reserveA === undefined || reserveB === null || reserveB === undefined) && snapshot.source === 'demo' && snapshot.liquidityUsd) {
        reserveA = snapshot.liquidityUsd * 0.56;
        reserveB = snapshot.liquidityUsd * 0.44;
      }

      const reserveTotal = (reserveA || 0) + (reserveB || 0);
      const reserveRatio = reserveTotal > 0 ? reserveA / reserveTotal : null;

      const swapsText = snapshot.swaps5m === null || snapshot.swaps5m === undefined ? 'Unavailable' : String(snapshot.swaps5m);
      const deviationText = snapshot.deviationBps === null || snapshot.deviationBps === undefined ? 'Unavailable' : `${snapshot.deviationBps} bps`;

      const pulseSeed = [
        snapshot.trend1h ?? 24,
        snapshot.trend6h ?? 42,
        snapshot.trend24h ?? 62,
        snapshot.swaps5m === null || snapshot.swaps5m === undefined ? 18 : clamp(snapshot.swaps5m * 2.8, 12, 92),
        snapshot.deviationBps === null || snapshot.deviationBps === undefined ? 14 : clamp(snapshot.deviationBps * 1.4, 10, 88),
        clamp(liquidityNorm * 100, 12, 96),
      ];

      const pulseBars = Array.from({ length: 18 }, (_, i) => {
        const base = pulseSeed[i % pulseSeed.length];
        const swing = Math.sin((i / 18) * Math.PI * 2) * 10;
        const height = Math.max(10, Math.min(100, base + swing));
        const staleClass = snapshot.stale ? ' is-stale' : '';
        const demoClass = snapshot.source === 'demo' ? ' is-demo' : '';
        const delay = (i % 6) * 120;
        return `<span class="lp-viz-band-bar${staleClass}${demoClass}" style="--h:${height}%;--delay:${delay}ms"></span>`;
      }).join('');

      refs.vizSnapshot.innerHTML = `
        <div class="lp-viz-card">
          <div class="lp-viz-top">
            <div class="lp-viz-kicker">Price</div>
            <div class="lp-viz-price">${snapshot.price === null || snapshot.price === undefined ? '—' : snapshot.price.toFixed(6)}</div>
            <div class="lp-viz-sub">${freshnessText} · ${sourceText}</div>
          </div>

          <div class="lp-viz-pulse">
            <div class="lp-viz-kicker">Pulse band</div>
            <div class="lp-viz-band" aria-hidden="true">${pulseBars}</div>
            <div class="lp-viz-note">Current-state cadence view from liquidity depth and available activity signals.</div>
          </div>

          <div class="lp-viz-section">
            <div class="lp-viz-label">Liquidity depth</div>
            <div class="lp-viz-meter">
              <div class="lp-viz-meter-fill" style="width:${Math.max(0, Math.min(100, liquidityNorm * 100)).toFixed(1)}%"></div>
            </div>
            <div class="lp-viz-note">${compact(snapshot.liquidityUsd)} USD · ${liquidityLabel}</div>
          </div>

          <div class="lp-viz-section">
            <div class="lp-viz-label">Reserve split</div>
            ${
              reserveRatio === null
                ? '<div class="lp-viz-unavailable">Reserve breakdown unavailable.</div>'
                : `
                  <div class="lp-viz-split">
                    <div class="lp-viz-split-a" style="width:${(reserveRatio * 100).toFixed(1)}%"></div>
                    <div class="lp-viz-split-b" style="width:${((1 - reserveRatio) * 100).toFixed(1)}%"></div>
                  </div>
                  <div class="lp-viz-note lp-viz-note--two">
                    <span>XRP side: ${compact(reserveA)}</span>
                    <span>RLUSD side: ${compact(reserveB)}</span>
                  </div>
                `
            }
          </div>

          <div class="lp-viz-grid">
            <div class="lp-viz-mini">
              <div class="lp-viz-kicker">Swaps (5m, optional)</div>
              <div class="lp-viz-mini-value">${swapsText}</div>
            </div>
            <div class="lp-viz-mini">
              <div class="lp-viz-kicker">Deviation (optional)</div>
              <div class="lp-viz-mini-value">${deviationText}</div>
            </div>
          </div>
        </div>
      `;
    }

    function safeText(node, value) {
      if (node) node.textContent = value;
    }

    function applyLiteMode() {
      seedParticles();
    }

    function resizeCanvas() {
      const rect = refs.canvas.getBoundingClientRect();
      const dprCap = state.liteMode ? 1.25 : 1.5;
      const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), dprCap);
      refs.canvas.width = Math.max(320, Math.floor(rect.width * dpr));
      refs.canvas.height = Math.max(220, Math.floor(rect.height * dpr));
      seedParticles();
    }

    function seedParticles() {
      const intensity = state.visual?.particleNorm ?? 0.25;
      const minCount = state.liteMode ? 8 : 18;
      const maxCount = state.liteMode ? 20 : 54;
      const count = Math.round(minCount + (maxCount - minCount) * intensity);
      const particles = [];
      for (let i = 0; i < count; i += 1) {
        particles.push({
          x: Math.random(),
          y: Math.random(),
          radius: 1 + Math.random() * (state.liteMode ? 1.8 : 3.2),
          phase: Math.random() * Math.PI * 2,
        });
      }
      state.particles = particles;
    }

    function requestRender() {
      if (state.destroyed || document.hidden || state.rafId) return;
      state.rafId = requestAnimationFrame(() => {
        state.rafId = null;
        drawFrame();
      });
    }

    function cancelPendingRender() {
      if (!state.rafId) return;
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }

    function drawFrame() {
      if (!ctx) return;
      const w = refs.canvas.width;
      const h = refs.canvas.height;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);

      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.10)');
      gradient.addColorStop(1, 'rgba(14, 165, 233, 0.04)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(37, 99, 235, 0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const staleSoftener = state.latestSnapshot?.stale ? 0.68 : 1;
      const amp = h * (0.03 + state.visual.amplitudeNorm * (state.liteMode ? 0.08 : 0.13)) * staleSoftener;
      const baseY = h * 0.5;
      const jitterPx = state.visual.jitterNorm * 18;
      const wavePhase = (state.latestSnapshot?.swaps5m || 0) * 0.05;
      for (let x = 0; x <= w; x += 14) {
        const jitter = Math.sin((x * 0.06) + wavePhase) * jitterPx;
        const y = baseY + Math.sin((x * 0.018) + wavePhase * 0.7) * amp + jitter;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = 'rgba(37, 99, 235, 0.45)';
      state.particles.forEach((particle) => {
        const px = particle.x * w;
        const py = particle.y * h + Math.sin(particle.phase) * (7 + state.visual.jitterNorm * 16);

        ctx.beginPath();
        ctx.arc(px, py, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function updateVisualState(snapshot) {
      state.latestSnapshot = snapshot;
      const liquidity = Number(snapshot?.liquidityUsd);
      if (Number.isFinite(liquidity) && liquidity > 0) {
        const samples = state.liquiditySamples;
        samples.push(liquidity);
        if (samples.length > LIQUIDITY_WINDOW) samples.shift();
        if (samples.length >= 2) {
          const previous = samples[samples.length - 2];
          const relativeRate = Math.abs((liquidity - previous) / Math.max(previous, 1));
          const clampedRate = clamp(relativeRate, 0, 0.25);
          state.liquidityRateEma = (LIQUIDITY_EMA_ALPHA * clampedRate) + ((1 - LIQUIDITY_EMA_ALPHA) * state.liquidityRateEma);
        }
      }

      const swaps5m = clamp(Number(snapshot?.swaps5m) || 0, 0, 4000);
      const deviationBps = clamp(Number(snapshot?.deviationBps) || 0, 0, 2000);

      const amplitudeNorm = clamp(logScale(state.liquidityRateEma, 0.12), 0.02, 1);
      const particleNorm = clamp(0.12 + logScale(swaps5m, 240), 0.12, 1);
      const jitterNorm = clamp(0.02 + logScale(deviationBps, 120), 0.02, 1);

      state.visual = {
        amplitudeNorm,
        particleNorm,
        jitterNorm,
      };

      seedParticles();
      requestRender();
    }

    function cleanup() {
      if (state.destroyed) return;
      state.destroyed = true;
      cancelPendingRender();
      stopSnapshotLoop();
      if (state.resizeTimer) {
        window.clearTimeout(state.resizeTimer);
        state.resizeTimer = null;
      }
      cleanups.forEach((fn) => fn());
    }

    function logScale(value, scaleMax) {
      const clamped = clamp(value, 0, scaleMax);
      return Math.log10(1 + clamped * 9 / Math.max(scaleMax, 0.0001));
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function wait(ms) {
      return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
