(() => {
  const STORAGE_KEY = 'xsic.liquidityPulse.liteMode';
  const DEMO_KEY = 'xsic.liquidityPulse.demoMode';
  const API_POOL = 'xrp-rlusd';

  const refs = {
    canvas: document.getElementById('pulse-canvas'),
    liteToggle: document.getElementById('lite-mode-toggle'),
    demoToggle: document.getElementById('demo-mode-toggle'),
    retryButton: document.getElementById('retry-button'),
    overlays: {
      loading: document.querySelector('[data-state-overlay="loading"]'),
      error: document.querySelector('[data-state-overlay="error"]'),
      empty: document.querySelector('[data-state-overlay="empty"]'),
    },
    snapshot: {
      pool: document.querySelector('[data-snapshot="pool"]'),
      price: document.querySelector('[data-snapshot="price"]'),
      liquidityUsd: document.querySelector('[data-snapshot="liquidityUsd"]'),
      swaps5m: document.querySelector('[data-snapshot="swaps5m"]'),
      deviationBps: document.querySelector('[data-snapshot="deviationBps"]'),
      source: document.querySelector('[data-snapshot="source"]'),
    },
    trendBars: {
      h1: document.querySelector('[data-trend="1h"]'),
      h6: document.querySelector('[data-trend="6h"]'),
      h24: document.querySelector('[data-trend="24h"]'),
    },
  };

  if (!refs.canvas) return;

  const ctx = refs.canvas.getContext('2d');
  const state = {
    mode: 'loading',
    liteMode: loadBool(STORAGE_KEY),
    demoMode: loadBool(DEMO_KEY),
    particles: [],
    rafId: null,
    loopStarted: 0,
    targetFrameMs: 1000 / 30,
    snapshotTimer: null,
    activeRequestId: 0,
  };

  if (refs.liteToggle) refs.liteToggle.checked = state.liteMode;
  if (refs.demoToggle) refs.demoToggle.checked = state.demoMode;

  applyLiteMode();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  refs.liteToggle?.addEventListener('change', () => {
    state.liteMode = Boolean(refs.liteToggle.checked);
    saveBool(STORAGE_KEY, state.liteMode);
    applyLiteMode();
    restartSnapshotLoop();
  });

  refs.demoToggle?.addEventListener('change', () => {
    state.demoMode = Boolean(refs.demoToggle.checked);
    saveBool(DEMO_KEY, state.demoMode);
    void reloadSnapshot({ preferDemo: state.demoMode });
  });

  refs.retryButton?.addEventListener('click', () => {
    restartSnapshotLoop();
    void reloadSnapshot({ forceApi: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAnimation();
      stopSnapshotLoop();
      return;
    }
    restartSnapshotLoop();
    if (state.mode === 'demo') startAnimation();
    void reloadSnapshot({ silent: true });
  });

  void init();

  async function init() {
    setMode('loading');
    await reloadSnapshot();
    startSnapshotLoop();
  }

  function snapshotIntervalMs() {
    return state.liteMode ? 20000 : 12000;
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
    if (mode === 'demo') startAnimation();
    else stopAnimation();
  }

  async function reloadSnapshot({ preferDemo = false, forceApi = false, silent = false } = {}) {
    const requestId = ++state.activeRequestId;
    if (!silent) setMode('loading');

    try {
      const snapshot = (!preferDemo || forceApi) ? await fetchSnapshot() : await loadDummySnapshot();
      if (requestId !== state.activeRequestId) return;

      if (!snapshot) {
        resetSnapshotUI();
        setMode('empty');
        return;
      }

      renderSnapshot(snapshot);
      setMode('demo');
    } catch {
      if (requestId !== state.activeRequestId) return;
      if (!preferDemo) {
        try {
          const demoSnapshot = await loadDummySnapshot();
          renderSnapshot(demoSnapshot);
          setMode('demo');
          return;
        } catch {
          // fall through
        }
      }
      resetSnapshotUI();
      setMode('error');
    }
  }

  async function fetchSnapshot() {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);

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
        throw new Error(payload?.error || `http_${res.status}`);
      }

      return normalizeSnapshot(payload);
    } finally {
      window.clearTimeout(timer);
    }
  }

  function normalizeSnapshot(snapshot) {
    const price = Number(snapshot?.price);
    const liquidityUsd = Number(snapshot?.liquidityUsd);
    const swaps5m = Number(snapshot?.swaps5m);
    const deviationBps = Number(snapshot?.deviationBps);

    return {
      pool: snapshot?.poolLabel || 'XRPL AMM',
      price: Number.isFinite(price) ? price : null,
      liquidityUsd: Number.isFinite(liquidityUsd) ? liquidityUsd : null,
      swaps5m: Number.isFinite(swaps5m) ? Math.round(swaps5m) : null,
      deviationBps: Number.isFinite(deviationBps) ? Math.round(deviationBps) : null,
      source: snapshot?.source || 'demo',
      stale: Boolean(snapshot?.stale),
      trend1h: 24,
      trend6h: 42,
      trend24h: 62,
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
    safeText(refs.snapshot.pool, snapshot.pool + (snapshot.stale ? ' (stale)' : ''));
    safeText(refs.snapshot.price, snapshot.price === null ? '—' : `${snapshot.price.toFixed(6)}`);
    safeText(refs.snapshot.liquidityUsd, snapshot.liquidityUsd === null ? '—' : `$${Math.round(snapshot.liquidityUsd).toLocaleString()}`);
    safeText(refs.snapshot.swaps5m, snapshot.swaps5m === null ? '—' : String(snapshot.swaps5m));
    safeText(refs.snapshot.deviationBps, snapshot.deviationBps === null ? '—' : `${snapshot.deviationBps} bps`);
    safeText(refs.snapshot.source, snapshot.source || '—');

    if (refs.trendBars.h1) refs.trendBars.h1.style.height = `${snapshot.trend1h}%`;
    if (refs.trendBars.h6) refs.trendBars.h6.style.height = `${snapshot.trend6h}%`;
    if (refs.trendBars.h24) refs.trendBars.h24.style.height = `${snapshot.trend24h}%`;
  }

  function resetSnapshotUI() {
    Object.values(refs.snapshot).forEach((node) => safeText(node, '—'));
    Object.values(refs.trendBars).forEach((node) => {
      if (node) node.style.height = '12%';
    });
  }

  function safeText(node, value) {
    if (node) node.textContent = value;
  }

  function applyLiteMode() {
    state.targetFrameMs = state.liteMode ? 1000 / 14 : 1000 / 30;
    seedParticles();
  }

  function resizeCanvas() {
    const rect = refs.canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    refs.canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    refs.canvas.height = Math.max(220, Math.floor(rect.height * dpr));
    seedParticles();
  }

  function seedParticles() {
    const count = state.liteMode ? 16 : 44;
    const particles = [];
    for (let i = 0; i < count; i += 1) {
      particles.push({
        x: Math.random(),
        y: Math.random(),
        radius: 1 + Math.random() * (state.liteMode ? 2.2 : 3.6),
        speed: 0.0008 + Math.random() * 0.0018,
        drift: (Math.random() - 0.5) * 0.0012,
        phase: Math.random() * Math.PI * 2,
      });
    }
    state.particles = particles;
  }

  function startAnimation() {
    if (state.rafId || document.hidden) return;
    state.loopStarted = performance.now();
    state.rafId = requestAnimationFrame(loop);
  }

  function stopAnimation() {
    if (!state.rafId) return;
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }

  function loop(now) {
    const elapsed = now - state.loopStarted;
    if (elapsed >= state.targetFrameMs) {
      drawFrame(elapsed);
      state.loopStarted = now;
    }
    state.rafId = requestAnimationFrame(loop);
  }

  function drawFrame(elapsedMs) {
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
    const amp = h * (state.liteMode ? 0.04 : 0.09);
    const baseY = h * 0.5;
    for (let x = 0; x <= w; x += 14) {
      const y = baseY + Math.sin((x + elapsedMs * 0.06) * 0.018) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(37, 99, 235, 0.45)';
    state.particles.forEach((particle) => {
      particle.phase += particle.speed * elapsedMs;
      particle.y += particle.drift * elapsedMs;
      if (particle.y < -0.05) particle.y = 1.05;
      if (particle.y > 1.05) particle.y = -0.05;
      const px = particle.x * w;
      const py = particle.y * h + Math.sin(particle.phase) * 12;

      ctx.beginPath();
      ctx.arc(px, py, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function wait(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }
})();
