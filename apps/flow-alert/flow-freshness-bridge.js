(() => {
  const REFRESH_MS = 60_000;

  function q(selector) {
    return document.querySelector(selector);
  }

  function setText(node, value) {
    if (node) node.textContent = value ?? '';
  }

  function getPreset() {
    return q('#flow-target-preset')?.value || 'exchanges';
  }

  function getWindowKey() {
    return q('#flow-window')?.value || '1h';
  }

  function stateLabel(state) {
    if (state === 'fresh') return 'fresh';
    if (state === 'aging') return 'aging';
    if (state === 'stale') return 'stale';
    return 'missing';
  }

  function formatAge(ageMs) {
    const age = Number(ageMs);
    if (!Number.isFinite(age) || age < 0) return 'unknown age';
    const minutes = Math.round(age / 60_000);
    if (minutes < 60) return `${minutes}m old`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m old` : `${hours}h old`;
  }

  function buildMessage(payload) {
    const freshness = payload?.freshness || payload?.historyMeta?.freshness || payload?.latest?.freshness || null;
    const state = stateLabel(freshness?.state);
    const age = formatAge(freshness?.ageMs);
    const source = payload?.source || payload?.historyMeta?.storageMode || 'unknown';
    const mode = payload?.historyMode || 'history';
    const count = Number(payload?.historyMeta?.count || 0);

    if (state === 'fresh') return `Flow history ${source} / ${mode} · fresh · ${age} · ${count} snapshots.`;
    if (state === 'aging') return `Flow history ${source} / ${mode} · aging · ${age}. Treat signal as context until refresh catches up.`;
    if (state === 'stale') return `Flow history ${source} / ${mode} · stale · ${age}. Use Refresh before treating this as current pressure.`;
    return `Flow history ${source} / ${mode} · missing. Waiting for the first usable history snapshot.`;
  }

  function applyPayload(payload) {
    if (!payload?.ok) return;
    const freshness = payload?.freshness || payload?.historyMeta?.freshness || payload?.latest?.freshness || null;
    const state = stateLabel(freshness?.state);
    const source = payload?.source || payload?.historyMeta?.storageMode || 'unknown';
    const mode = payload?.historyMode || 'history';
    const message = buildMessage(payload);

    const staleNote = q('#flowStaleNote');
    const status = q('[data-flow-meta="status"]');
    const refresh = q('[data-flow-meta="refresh"]');
    const ctxSource = q('[data-flow-signal="ctx-source"]');
    const snapshotSource = q('[data-flow-snapshot="source"]');
    const updatedSub = q('[data-flow-snapshot-sub="updated"]');
    const historyStatus = q('[data-flow-history="status"]');

    if (staleNote) {
      staleNote.hidden = state === 'fresh';
      if (state !== 'fresh') setText(staleNote, message);
    }

    if (status && /loading|history|stale|aging|missing/i.test(status.textContent || '')) {
      setText(status, state.toUpperCase());
    }

    setText(ctxSource, `source: ${source} / ${state}`);
    setText(snapshotSource, `${source} / ${state}`);
    setText(updatedSub, message);

    if (historyStatus) {
      historyStatus.hidden = false;
      setText(historyStatus, message);
    }

    if (refresh && /—|history|stale|aging|missing/i.test(refresh.textContent || '')) {
      const newest = payload?.historyMeta?.newestTs || payload?.latest?.ts || null;
      setText(refresh, newest ? `history ${new Date(Number(newest)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : message);
    }
  }

  async function refresh() {
    const preset = getPreset();
    const windowKey = getWindowKey();
    if (!preset) return;
    try {
      const url = `/api/xrpl/flow-history?preset=${encodeURIComponent(preset)}&window=${encodeURIComponent(windowKey)}&limit=24`;
      const res = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
      const payload = await res.json().catch(() => null);
      applyPayload(payload);
    } catch {
      // ignore bridge failures; the main Flow Alert renderer remains responsible for primary output
    }
  }

  function mount() {
    const preset = q('#flow-target-preset');
    const windowSelect = q('#flow-window');
    const refreshButton = q('#flow-refresh-button');
    preset?.addEventListener('change', () => void refresh());
    windowSelect?.addEventListener('change', () => void refresh());
    refreshButton?.addEventListener('click', () => window.setTimeout(() => void refresh(), 600));
    void refresh();
    window.setInterval(() => void refresh(), REFRESH_MS);
    window.addEventListener('pageshow', () => void refresh());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
