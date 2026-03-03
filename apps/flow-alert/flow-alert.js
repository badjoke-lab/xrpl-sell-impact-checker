(() => {
  const LITE_KEY = 'xsic.flowAlert.liteMode';
  const DEMO_KEY = 'xsic.flowAlert.demoOnly';
  const PRESET_KEY = 'xsic.flowAlert.targetPreset';

  const PRESET_LABELS = {
    exchanges: 'Exchanges (default)',
    whales: 'Whales (default)',
    custom: 'Custom (coming soon)',
  };

  function boot() {
    const refs = {
      canvasWrap: document.getElementById('flowCanvasWrap'),
      canvas: document.getElementById('flowCanvas'),
      status: document.getElementById('flowStatus'),
      liteToggle: document.getElementById('flow-lite-toggle'),
      demoToggle: document.getElementById('flow-demo-toggle'),
      presetSelect: document.getElementById('flow-target-preset'),
      retryButton: document.getElementById('flow-retry-button'),
      emptyButton: document.getElementById('flow-empty-button'),
      overlays: {
        loading: document.querySelector('[data-flow-state="loading"]'),
        error: document.querySelector('[data-flow-state="error"]'),
        empty: document.querySelector('[data-flow-state="empty"]'),
      },
      snapshot: {
        target: document.querySelector('[data-flow-snapshot="target"]'),
        window: document.querySelector('[data-flow-snapshot="window"]'),
        inflow: document.querySelector('[data-flow-snapshot="inflow"]'),
        outflow: document.querySelector('[data-flow-snapshot="outflow"]'),
        net: document.querySelector('[data-flow-snapshot="net"]'),
        source: document.querySelector('[data-flow-snapshot="source"]'),
      },
      trendBars: Array.from(document.querySelectorAll('[data-flow-trend]')),
    };

    const setStatus = (message) => {
      if (refs.status) refs.status.textContent = `Status: ${message}`;
    };

    if (!refs.canvas) {
      setStatus('Initialization failed: canvas element is missing.');
      if (refs.overlays.loading) refs.overlays.loading.hidden = true;
      if (refs.overlays.error) refs.overlays.error.hidden = false;
      return;
    }

    try {
      init(refs, setStatus);
    } catch (error) {
      setStatus('Initialization failed. Please refresh.');
      if (refs.overlays.loading) refs.overlays.loading.hidden = true;
      if (refs.overlays.error) refs.overlays.error.hidden = false;
      console.error('Flow Alert init error:', error);
    }
  }

  function init(refs, setStatus) {
    const ctx = refs.canvas.getContext('2d');
    const state = {
      mode: 'loading',
      liteMode: loadBool(LITE_KEY),
      demoOnly: loadBool(DEMO_KEY, true),
      preset: loadPreset(),
      rafId: null,
      loopStamp: 0,
      targetFrameMs: 1000 / 30,
      inParticles: [],
      outParticles: [],
      burstTimer: 0,
      intensity: 0.42,
      snapshotTimer: null,
    };

    if (refs.liteToggle) refs.liteToggle.checked = state.liteMode;
    if (refs.demoToggle) refs.demoToggle.checked = state.demoOnly;
    if (refs.presetSelect) refs.presetSelect.value = state.preset;

    applyLiteMode();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    refs.liteToggle?.addEventListener('change', () => {
      state.liteMode = Boolean(refs.liteToggle.checked);
      saveBool(LITE_KEY, state.liteMode);
      applyLiteMode();
      setStatus(`Lite mode ${state.liteMode ? 'enabled' : 'disabled'}.`);
    });

    refs.demoToggle?.addEventListener('change', () => {
      state.demoOnly = Boolean(refs.demoToggle.checked);
      saveBool(DEMO_KEY, state.demoOnly);
      void refreshState();
    });

    refs.presetSelect?.addEventListener('change', () => {
      state.preset = refs.presetSelect?.value || '';
      savePreset(state.preset);
      void refreshState();
    });

    refs.retryButton?.addEventListener('click', () => {
      setStatus('Retrying flow renderer…');
      seedParticles();
      void refreshState({ forceDemo: true });
    });

    refs.emptyButton?.addEventListener('click', () => {
      state.preset = 'exchanges';
      if (refs.presetSelect) refs.presetSelect.value = 'exchanges';
      savePreset(state.preset);
      void refreshState();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopAnimation();
        stopSnapshotLoop();
      } else {
        startSnapshotLoop();
        if (state.mode === 'demo') startAnimation();
      }
    });

    void refreshState();
    startSnapshotLoop();

    function loadBool(key, fallback = false) {
      try {
        const value = window.localStorage.getItem(key);
        if (value === null) return fallback;
        return value === '1';
      } catch {
        return fallback;
      }
    }

    function saveBool(key, value) {
      try {
        window.localStorage.setItem(key, value ? '1' : '0');
      } catch {
        // ignore
      }
    }

    function loadPreset() {
      try {
        const value = window.localStorage.getItem(PRESET_KEY);
        if (!value) return 'exchanges';
        return Object.prototype.hasOwnProperty.call(PRESET_LABELS, value) ? value : '';
      } catch {
        return 'exchanges';
      }
    }

    function savePreset(value) {
      try {
        window.localStorage.setItem(PRESET_KEY, value);
      } catch {
        // ignore
      }
    }

    function setMode(mode) {
      state.mode = mode;
      Object.entries(refs.overlays).forEach(([name, node]) => {
        if (node) node.hidden = name !== mode;
      });

      if (mode === 'demo') {
        setStatus('Demo rendering active.');
        startAnimation();
      } else if (mode === 'loading') {
        setStatus('Loading flow state…');
        stopAnimation();
      } else if (mode === 'error') {
        setStatus('Error: could not start renderer.');
        stopAnimation();
      } else if (mode === 'empty') {
        setStatus('Preset missing. Choose a target preset.');
        stopAnimation();
      }
    }

    async function refreshState({ forceDemo = false } = {}) {
      setMode('loading');
      await wait(220);

      if (!state.preset) {
        updateSnapshot({ inflow: null, outflow: null, net: null, source: 'demo' });
        resetTrend();
        setMode('empty');
        return;
      }

      if (!state.demoOnly && !forceDemo) {
        updateSnapshot({ inflow: null, outflow: null, net: null, source: 'API: unavailable' });
        resetTrend();
        setMode('error');
        return;
      }

      const snapshot = createDemoSnapshot(state.preset);
      updateSnapshot(snapshot);
      updateTrend(snapshot);
      setMode('demo');
    }

    function createDemoSnapshot(preset) {
      const now = Date.now();
      const wave = (Math.sin(now / 1700) + 1) / 2;
      const skew = preset === 'whales' ? 1.24 : preset === 'custom' ? 0.82 : 1;
      const inflow = Math.round((170000 + (wave * 130000) + (Math.random() * 45000)) * skew);
      const outflow = Math.round((165000 + ((1 - wave) * 120000) + (Math.random() * 42000)) * skew);
      const net = inflow - outflow;
      state.intensity = clamp((Math.abs(net) / 320000) + (wave * 0.35), 0.18, 1);

      return {
        inflow,
        outflow,
        net,
        source: 'demo',
      };
    }

    function updateSnapshot(snapshot) {
      safeText(refs.snapshot.target, PRESET_LABELS[state.preset] || '—');
      safeText(refs.snapshot.window, '5m');
      safeText(refs.snapshot.inflow, snapshot.inflow === null ? '—' : formatUsd(snapshot.inflow));
      safeText(refs.snapshot.outflow, snapshot.outflow === null ? '—' : formatUsd(snapshot.outflow));
      safeText(refs.snapshot.net, snapshot.net === null ? '—' : formatSignedUsd(snapshot.net));
      safeText(refs.snapshot.source, snapshot.source === 'demo' ? 'demo' : snapshot.source);
    }

    function updateTrend(snapshot) {
      const range = Math.max(1, Math.abs(snapshot.net));
      refs.trendBars.forEach((bar, index) => {
        const wobble = 0.45 + (Math.sin((Date.now() / 800) + index) * 0.25);
        const pct = clamp(Math.round(22 + (range / 7000) * wobble), 12, 94);
        if (bar) bar.style.height = `${pct}%`;
      });
    }

    function resetTrend() {
      refs.trendBars.forEach((bar) => {
        if (bar) bar.style.height = '14%';
      });
    }

    function snapshotIntervalMs() {
      return state.liteMode ? 3200 : 1900;
    }

    function startSnapshotLoop() {
      if (state.snapshotTimer) return;
      state.snapshotTimer = window.setInterval(() => {
        if (state.mode !== 'demo') return;
        const snapshot = createDemoSnapshot(state.preset);
        updateSnapshot(snapshot);
        updateTrend(snapshot);
      }, snapshotIntervalMs());
    }

    function stopSnapshotLoop() {
      if (!state.snapshotTimer) return;
      window.clearInterval(state.snapshotTimer);
      state.snapshotTimer = null;
    }

    function applyLiteMode() {
      state.targetFrameMs = state.liteMode ? 1000 / 12 : 1000 / 30;
      seedParticles();
      stopSnapshotLoop();
      startSnapshotLoop();
    }

    function resizeCanvas() {
      const rect = refs.canvasWrap?.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.max(300, Math.floor((rect?.width || 300) * dpr));
      const height = Math.max(200, Math.floor((rect?.height || 220) * dpr));
      refs.canvas.width = width;
      refs.canvas.height = height;
      seedParticles();
    }

    function seedParticles() {
      const base = state.liteMode ? 10 : 24;
      const extra = state.liteMode ? 7 : 32;
      const count = Math.max(8, Math.round(base + (extra * state.intensity)));
      state.inParticles = Array.from({ length: count }, createParticle('in'));
      state.outParticles = Array.from({ length: count }, createParticle('out'));
    }

    function createParticle(direction) {
      const inbound = direction === 'in';
      return () => ({
        lane: Math.random() * 0.36 + (inbound ? 0.14 : 0.5),
        progress: Math.random(),
        speed: 0.0012 + Math.random() * (state.liteMode ? 0.0024 : 0.0036),
        radius: 1.6 + Math.random() * (state.liteMode ? 1.8 : 3.2),
        jitter: (Math.random() - 0.5) * 0.16,
        alpha: 0.4 + Math.random() * 0.5,
        inbound,
      });
    }

    function startAnimation() {
      if (state.rafId || document.hidden) return;
      state.loopStamp = performance.now();
      state.rafId = window.requestAnimationFrame(loop);
    }

    function stopAnimation() {
      if (!state.rafId) return;
      window.cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }

    function loop(now) {
      const elapsed = now - state.loopStamp;
      if (elapsed >= state.targetFrameMs) {
        drawFrame(elapsed);
        state.loopStamp = now;
      }
      state.rafId = window.requestAnimationFrame(loop);
    }

    function drawFrame(elapsed) {
      if (!ctx) return;
      const width = refs.canvas.width;
      const height = refs.canvas.height;
      const centerX = width * 0.5;
      const centerY = height * 0.5;
      state.burstTimer += elapsed;

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);

      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, 'rgba(37, 99, 235, 0.08)');
      gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.18)');
      gradient.addColorStop(1, 'rgba(30, 64, 175, 0.08)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(37, 99, 235, 0.25)';
      ctx.lineWidth = state.liteMode ? 1 : 2;
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, height);
      ctx.stroke();

      drawLane(state.inParticles, elapsed, centerX, centerY, true);
      drawLane(state.outParticles, elapsed, centerX, centerY, false);

      if (state.burstTimer > (state.liteMode ? 4500 : 2900) && Math.random() > 0.74) {
        state.burstTimer = 0;
        drawBurst(centerX, centerY);
      }
    }

    function drawLane(particles, elapsed, centerX, centerY, inbound) {
      particles.forEach((particle) => {
        particle.progress += particle.speed * elapsed;
        if (particle.progress >= 1.06) particle.progress = 0;

        const fromX = inbound ? 0 : refs.canvas.width;
        const laneY = centerY + ((particle.lane - 0.5) * refs.canvas.height);
        const toX = centerX;
        const x = inbound
          ? fromX + ((toX - fromX) * particle.progress)
          : fromX - ((fromX - toX) * particle.progress);
        const y = laneY + Math.sin((particle.progress * 10) + particle.jitter) * 8;

        const alphaBoost = 0.25 + (state.intensity * 0.5);
        const color = inbound ? `rgba(16, 185, 129, ${Math.min(0.95, particle.alpha + alphaBoost)})` : `rgba(239, 68, 68, ${Math.min(0.95, particle.alpha + alphaBoost)})`;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function drawBurst(centerX, centerY) {
      const burstCount = state.liteMode ? 10 : 20;
      for (let i = 0; i < burstCount; i += 1) {
        const angle = (Math.PI * 2 * i) / burstCount;
        const distance = (state.liteMode ? 14 : 26) + Math.random() * (state.liteMode ? 32 : 52);
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)';
        ctx.beginPath();
        ctx.arc(x, y, state.liteMode ? 2 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function safeText(node, value) {
    if (node) node.textContent = value;
  }

  function wait(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatUsd(value) {
    return `$${Math.round(value).toLocaleString()}`;
  }

  function formatSignedUsd(value) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${formatUsd(value)}`;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
