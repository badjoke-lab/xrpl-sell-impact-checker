(() => {
  const API = '/api/exit-coverage';
  const STATE_ORDER = { dual: 0, 'book-only': 1, 'amm-only': 2, none: 3 };
  let selectedKey = null;
  let lastRows = [];

  function q(selector) {
    return document.querySelector(selector);
  }

  function setText(node, value) {
    if (node) node.textContent = value ?? '';
  }

  function stateLabel(state) {
    if (state === 'dual') return 'Book + AMM';
    if (state === 'book-only') return 'Book only';
    if (state === 'amm-only') return 'AMM only';
    return 'No XRP exit observed';
  }

  function stateClass(state) {
    if (state === 'dual') return 'state-dual';
    if (state === 'book-only') return 'state-book-only';
    if (state === 'amm-only') return 'state-amm-only';
    return 'state-none';
  }

  function compactMiddle(value, lead = 10, tail = 6) {
    const text = String(value || '');
    if (!text) return '—';
    if (text.length <= lead + tail + 1) return text;
    return `${text.slice(0, lead)}…${text.slice(-tail)}`;
  }

  function displayCurrencyCompact(value) {
    const text = String(value || '');
    if (!text) return '—';
    if (/^[A-Z]{3,6}$/.test(text)) return text;
    return compactMiddle(text, 10, 8);
  }

  function displayIssuerCompact(value) {
    return compactMiddle(value, 10, 6);
  }

  function sortRows(rows) {
    return [...(rows || [])].sort((a, b) => {
      const byState = (STATE_ORDER[a.state] ?? 99) - (STATE_ORDER[b.state] ?? 99);
      if (byState !== 0) return byState;
      return String(a.currency || '').localeCompare(String(b.currency || ''));
    });
  }

  function formatCheckedAt(value) {
    if (!value) return 'checked: unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return `checked: ${value}`;
    return `checked: ${date.toLocaleString([], { hour12: false })}`;
  }

  function renderSummary(payload) {
    const summary = payload.summary || {};
    setText(q('#summary-total'), String(summary.total ?? 0));
    setText(q('#summary-dual'), String(summary.dual ?? 0));
    setText(q('#summary-book-only'), String(summary.bookOnly ?? 0));
    setText(q('#summary-amm-only'), String(summary.ammOnly ?? 0));
    setText(q('#summary-none'), String(summary.none ?? 0));
    setText(q('#summary-issuer-check'), payload.issuerCheck?.ok ? 'passed' : 'failed');
    setText(q('#summary-issuer-note'), payload.issuerCheck?.note || '—');
  }

  function renderTable(payload) {
    const body = q('#coverage-rows');
    const empty = q('#coverage-empty');
    const note = q('#table-head-note');
    if (!body) return;
    body.innerHTML = '';
    lastRows = sortRows(payload.rows || []);

    if (!lastRows.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = payload.invalid ? 'Invalid issuer response.' : 'No candidate rows.';
      }
      setText(note, payload.invalid ? 'Invalid issuer response.' : 'No candidate rows.');
      return;
    }

    if (empty) empty.hidden = true;
    setText(note, `${lastRows.length} API rows · ${payload.source || 'runtime'}`);

    if (!selectedKey || !lastRows.some((row) => row.key === selectedKey)) selectedKey = lastRows[0]?.key || null;

    for (const row of lastRows) {
      const tr = document.createElement('tr');
      if (row.key === selectedKey) tr.classList.add('is-selected');
      tr.innerHTML = `
        <td><span class="coverage-state-badge ${stateClass(row.state)}">${stateLabel(row.state)}</span></td>
        <td class="mono" title="${row.currency || ''}">${displayCurrencyCompact(row.currency)}</td>
        <td class="mono" title="${row.issuer || ''}">${displayIssuerCompact(row.issuer)}</td>
        <td>${row.bookPresent ? 'Yes' : 'No'}</td>
        <td>${row.ammPresent ? 'Yes' : 'No'}</td>
        <td><a class="row-open-link" href="${row.sellImpactUrl || '/apps/sell-impact/'}" target="_blank" rel="noopener">open</a></td>
      `;
      tr.addEventListener('click', () => {
        selectedKey = row.key;
        renderTable(payload);
        renderDetail(payload);
      });
      tr.querySelector('.row-open-link')?.addEventListener('click', (event) => event.stopPropagation());
      body.appendChild(tr);
    }
  }

  function renderDetail(payload) {
    const rows = payload.rows || [];
    const row = rows.find((item) => item.key === selectedKey) || rows[0];
    const badge = q('#detail-state-badge');

    if (payload.invalid) {
      if (badge) {
        badge.className = 'coverage-state-badge state-none';
        badge.textContent = 'Invalid issuer';
      }
      setText(q('#detail-title'), 'Issuer check failed');
      setText(q('#detail-subtitle'), payload.invalidReason || 'Invalid issuer');
      setText(q('#detail-currency'), '—');
      setText(q('#detail-issuer'), payload.issuer || '—');
      setText(q('#detail-book'), '—');
      setText(q('#detail-amm'), '—');
      setText(q('#detail-key'), '—');
      setText(q('#detail-explanation'), 'The issuer input is malformed or rejected by the runtime API.');
      const list = q('#detail-evidence-list');
      if (list) list.innerHTML = '<li>Expected failure: 404 / actMalformed.</li>';
      const link = q('#sell-impact-link');
      if (link) link.href = '/apps/sell-impact/';
      return;
    }

    if (!row) {
      if (badge) {
        badge.className = 'coverage-state-badge state-none';
        badge.textContent = 'No selection';
      }
      setText(q('#detail-title'), 'Coverage detail');
      setText(q('#detail-subtitle'), 'No candidate rows are available.');
      setText(q('#detail-currency'), '—');
      setText(q('#detail-issuer'), payload.issuer || '—');
      setText(q('#detail-book'), '—');
      setText(q('#detail-amm'), '—');
      setText(q('#detail-key'), '—');
      setText(q('#detail-explanation'), 'Nothing to inspect yet.');
      const list = q('#detail-evidence-list');
      if (list) list.innerHTML = '<li>No candidate rows were produced.</li>';
      return;
    }

    selectedKey = row.key;
    if (badge) {
      badge.className = `coverage-state-badge ${stateClass(row.state)}`;
      badge.textContent = stateLabel(row.state);
    }
    setText(q('#detail-title'), displayCurrencyCompact(row.currency));
    setText(q('#detail-subtitle'), row.state === 'dual'
      ? 'Both XRP exit route families are available.'
      : row.state === 'book-only'
        ? 'Orderbook exit exists, but AMM was not observed.'
        : row.state === 'amm-only'
          ? 'AMM exit exists, but live book was not observed.'
          : 'No XRP exit route was observed for this row.');
    setText(q('#detail-currency'), row.currency || '—');
    setText(q('#detail-issuer'), row.issuer || '—');
    setText(q('#detail-book'), row.bookPresent ? 'Yes' : 'No');
    setText(q('#detail-amm'), row.ammPresent ? 'Yes' : 'No');
    setText(q('#detail-key'), row.key || '—');
    setText(q('#detail-explanation'), `Coverage only. Runtime source: ${payload.source || 'unknown'}. Continue in Sell Impact for execution quality.`);
    const list = q('#detail-evidence-list');
    if (list) list.innerHTML = (row.evidence || ['API row returned without extra evidence.']).map((item) => `<li>${item}</li>`).join('');
    const link = q('#sell-impact-link');
    if (link) link.href = row.sellImpactUrl || '/apps/sell-impact/';
  }

  function renderMeta(payload) {
    const freshness = payload.freshness || {};
    const ledger = payload.observedLedger || {};
    setText(q('#proof-chip'), `runtime: ${payload.label || payload.key || 'coverage'}`);
    setText(q('#ledger-chip'), `ledger: ${freshness.observedLedgerIndex || ledger.index || '—'}`);
    setText(q('#source-chip'), `source: ${payload.source || 'api'} / ${freshness.state || 'unknown'}`);
    setText(q('#issuer-chip'), `issuer: ${payload.issuer || '—'}`);
    setText(q('#run-status'), payload.invalid ? 'INVALID ISSUER' : 'API READY');
    setText(q('#debug-preset'), payload.key || '—');
    setText(q('#debug-issuer'), payload.issuer || '—');
    setText(q('#debug-ledger'), `${freshness.observedLedgerHash || ledger.hash || '—'} / ${freshness.observedLedgerIndex || ledger.index || '—'}`);
    setText(q('#debug-json'), JSON.stringify({
      source: payload.source,
      freshness: payload.freshness,
      issuerCheck: payload.issuerCheck,
      summary: payload.summary,
      allRowsHaveSellImpactUrl: payload.allRowsHaveSellImpactUrl,
      selectedKey,
    }, null, 2));
    const note = q('#table-head-note');
    if (note && payload.freshness?.checkedAt) note.textContent = `${note.textContent} · ${formatCheckedAt(payload.freshness.checkedAt)}`;
  }

  function applyPayload(payload) {
    if (!payload) return;
    const banner = q('#page-error-banner');
    if (banner) banner.hidden = true;
    renderSummary(payload);
    renderTable(payload);
    renderDetail(payload);
    renderMeta(payload);
  }

  async function loadFromApi() {
    const preset = q('#preset-select')?.value || 'expanded';
    const issuer = q('#issuer-input')?.value || '';
    const status = q('#run-status');
    setText(status, 'API LOADING');
    const url = `${API}?preset=${encodeURIComponent(preset)}&issuer=${encodeURIComponent(issuer)}`;
    try {
      const res = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
      const payload = await res.json().catch(() => null);
      if (!payload) throw new Error('invalid_json');
      applyPayload(payload);
    } catch (error) {
      const banner = q('#page-error-banner');
      if (banner) {
        banner.hidden = false;
        banner.textContent = `Exit Coverage API failed: ${error instanceof Error ? error.message : 'unknown_error'}`;
      }
      setText(status, 'API ERROR');
    }
  }

  function mount() {
    q('#run-button')?.addEventListener('click', () => window.setTimeout(() => void loadFromApi(), 0));
    q('#preset-select')?.addEventListener('change', () => window.setTimeout(() => void loadFromApi(), 0));
    q('#reset-button')?.addEventListener('click', () => window.setTimeout(() => void loadFromApi(), 0));
    void loadFromApi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
