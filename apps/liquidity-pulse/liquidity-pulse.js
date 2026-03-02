(() => {
  const STORAGE_KEY = 'xsic.liteMode';
  const SNAPSHOT_MS = 12000;

  const refs = {
    canvas: document.getElementById('pulse-canvas'),
    liteToggle: document.getElementById('lite-mode-toggle'),
    retryButton: document.getElementById('retry-button'),
    choosePresetButton: document.getElementById('choose-preset-button'),
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
    },
    trendBars: {
      h1: document.querySelector('[data-trend="1h"]'),
      h6: document.querySelector('[data-trend="6h"]'),
      h24: document.querySelector('[data-trend="24h"]'),
    },
  };

  if (!refs.canvas || !refs.liteToggle) {
    return;
  }

  const ctx = refs.canvas.getContext('2d');
  const state = {
    mode: 'loading',
    liteMode: loadLiteMode(),
    snapshot: null,
    particles: [],
    rafId: null,
    loopStarted: 0,
    targetFrameMs: 1000 / 30,
    snapshotTimer: null,
    forceFailure: new URLSearchParams(window.location.search).get('fail') === '1',
  };

  refs.liteToggle.checked = state.liteMode;
  applyLiteMode();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  refs.liteToggle.addEventListener('change', () => {
    state.liteMode = refs.liteToggle.checked;
    saveLiteMode(state.liteMode);
    applyLiteMode();
  });

  refs.retryButton?.addEventListener('click', () => {
    void reloadSnapshot();
  });

  refs.choosePresetButton?.addEventListener('click', () => {
    state.forceFailure = false;
    void reloadSnapshot();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAnimation();
      stopSnapshotLoop();
      return;
    }
    startSnapshotLoop();
    if (state.mode === 'demo') {
      startAnimation();
    }
  });

  void init();

  async function init() {
    setMode('loading');
    await reloadSnapshot();
    startSnapshotLoop();
  }

  function loadLiteMode() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function saveLiteMode(enabled) {
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // ignore storage failures
    }
  }

  function setMode(mode) {
    state.mode = mode;
    Object.entries(refs.overlays).forEach(([name, node]) => {
      if (!node) return;
      node.hidden = name !== mode;
    });

    if (mode === 'demo') {
      startAnimation();
      return;
    }
    stopAnimation();
  }

  async function reloadSnapshot() {
    setMode('loading');

    try {
      const snapshot = await loadDummySnapshot();
      if (!snapshot) {
        resetSnapshotUI();
        setMode('empty');
        return;
      }
      state.snapshot = snapshot;
      renderSnapshot(snapshot);
      setMode('demo');
    } catch {
      resetSnapshotUI();
      setMode('error');
    }
  }

  function startSnapshotLoop() {
    if (state.snapshotTimer) return;
    state.snapshotTimer = window.setInterval(() => {
      void reloadSnapshot();
    }, SNAPSHOT_MS);
  }

  function stopSnapshotLoop() {
    if (!state.snapshotTimer) return;
    clearInterval(state.snapshotTimer);
    state.snapshotTimer = null;
  }

  async function loadDummySnapshot() {
    await wait(650);

    if (state.forceFailure) {
      throw new Error('forced_failure');
    }

    const chance = Math.random();
    if (chance < 0.14) {
      return null;
    }

    return {
      pool: 'XRP/USDC Demo',
      price: 0.51 + Math.random() * 0.03,
      liquidityUsd: 900000 + Math.random() * 120000,
      swaps5m: Math.round(12 + Math.random() * 31),
      deviationBps: Math.round(3 + Math.random() * 24),
      trend1h: Math.max(8, Math.round(25 + Math.random() * 65)),
      trend6h: Math.max(8, Math.round(20 + Math.random() * 75)),
      trend24h: Math.max(8, Math.round(15 + Math.random() * 82)),
    };
  }

  function renderSnapshot(snapshot) {
    safeText(refs.snapshot.pool, snapshot.pool);
    safeText(refs.snapshot.price, `${snapshot.price.toFixed(4)} XRP`);
    safeText(refs.snapshot.liquidityUsd, `$${Math.round(snapshot.liquidityUsd).toLocaleString()}`);
    safeText(refs.snapshot.swaps5m, String(snapshot.swaps5m));
    safeText(refs.snapshot.deviationBps, `${snapshot.deviationBps} bps`);

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
    state.targetFrameMs = state.liteMode ? 1000 / 16 : 1000 / 30;
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
    const count = state.liteMode ? 18 : 48;
    const particles = [];
    for (let i = 0; i < count; i += 1) {
      particles.push({
        x: Math.random(),
        y: Math.random(),
        radius: 1 + Math.random() * (state.liteMode ? 2.4 : 3.8),
        speed: 0.0008 + Math.random() * 0.002,
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
    const amp = h * (state.liteMode ? 0.05 : 0.09);
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
