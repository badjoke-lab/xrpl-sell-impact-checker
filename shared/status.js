(function () {
  const POLL_MS = 20000;
  const AGO_TICK_MS = 1000;

  const roots = Array.from(document.querySelectorAll('[data-status-strip="health"]'));
  if (!roots.length) return;

  const statusLabels = {
    ok: "OK",
    stale: "stale",
    down: "down",
  };

  let pollTimer = null;
  let agoTimer = null;
  let lastCheckedAt = null;
  let currentState = { status: 'down', details: {} };

  function safeText(el, value) {
    if (el) el.textContent = value;
  }

  function getNodes(root) {
    return {
      status: root.querySelector('[data-health="status"]'),
      lastRefresh: root.querySelector('[data-health="last-refresh"]'),
      details: root.querySelector('[data-health="details"]'),
    };
  }

  function render(state) {
    currentState = {
      status: state?.status || 'down',
      details: state?.details || {},
    };
    const checkedAtLabel = Number.isFinite(lastCheckedAt)
      ? `${Math.max(0, Math.floor((Date.now() - lastCheckedAt) / 1000))} sec ago`
      : '—';

    if (window.XSICUiKit?.renderStatusStrip) {
      window.XSICUiKit.renderStatusStrip({
        status: currentState.status,
        checkedAt: checkedAtLabel,
        details: currentState.details,
      });
      return;
    }

    roots.forEach((root) => {
      const nodes = getNodes(root);
      const label = statusLabels[currentState.status] || "down";
      safeText(nodes.status, label);

      if (nodes.details) {
        try {
          nodes.details.textContent = JSON.stringify(currentState.details || {}, null, 2);
        } catch {
          nodes.details.textContent = "{}";
        }
      }

      safeText(nodes.lastRefresh, checkedAtLabel);
    });
  }

  async function fetchHealth() {
    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: { 'accept': 'application/json' },
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => null);
      const status = payload?.status;
      const parsedCheckedAt = Date.parse(payload?.checked_at || '');
      lastCheckedAt = Number.isFinite(parsedCheckedAt) ? parsedCheckedAt : Date.now();

      if (status === 'ok' || status === 'stale' || status === 'down') {
        render({ status, details: payload?.details || {} });
        return;
      }

      render({ status: 'down', details: { reason: 'invalid_health_payload' } });
    } catch {
      lastCheckedAt = Date.now();
      render({ status: 'down', details: { reason: 'health_fetch_failed' } });
    }
  }

  function startPolling() {
    if (pollTimer) return;
    fetchHealth();
    pollTimer = window.setInterval(fetchHealth, POLL_MS);
    if (!agoTimer) {
      agoTimer = window.setInterval(() => {
        render(currentState);
      }, AGO_TICK_MS);
    }
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (agoTimer) {
      clearInterval(agoTimer);
      agoTimer = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
    } else {
      startPolling();
    }
  });

  startPolling();
})();
