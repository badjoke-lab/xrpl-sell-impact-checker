(() => {
  const PROOF_API = '/api/exit-coverage';
  const LIVE_API = '/api/exit-coverage-live';
  const ORDER = { dual: 0, 'book-only': 1, 'amm-only': 2, none: 3 };
  let selectedKey = null;
  let currentPayload = null;

  function q(selector) { return document.querySelector(selector); }
  function text(selector, value) { const node = q(selector); if (node) node.textContent = value ?? ''; }
  function compact(value, lead = 10, tail = 6) {
    const source = String(value || '');
    if (!source) return '—';
    return source.length <= lead + tail + 1 ? source : `${source.slice(0, lead)}…${source.slice(-tail)}`;
  }
  function stateLabel(state) {
    if (state === 'dual') return 'Book + AMM';
    if (state === 'book-only') return 'Book only';
    if (state === 'amm-only') return 'AMM only';
    return 'No XRP exit observed';
  }
  function stateClass(state) { return `state-${state === 'book-only' ? 'book-only' : state === 'amm-only' ? 'amm-only' : state === 'dual' ? 'dual' : 'none'}`; }
  function sortRows(rows) {
    return [...(rows || [])].sort((a, b) => (ORDER[a.state] ?? 99) - (ORDER[b.state] ?? 99) || String(a.currency || '').localeCompare(String(b.currency || '')));
  }
  function replaceList(node, items) {
    if (!node) return;
    node.replaceChildren();
    (items.length ? items : ['No evidence details available.']).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      node.appendChild(li);
    });
  }
  function buildUrl() {
    const preset = q('#preset-select')?.value || 'expanded';
    const issuer = String(q('#issuer-input')?.value || '').trim();
    const currency = String(q('#currency-input')?.value || '').trim();
    if (issuer && preset !== 'invalid' && preset !== 'empty') {
      const url = new URL(LIVE_API, location.origin);
      url.searchParams.set('issuer', issuer);
      if (currency) url.searchParams.set('currency', currency);
      return `${url.pathname}${url.search}`;
    }
    return `${PROOF_API}?preset=${encodeURIComponent(preset)}&issuer=${encodeURIComponent(issuer)}`;
  }

  function renderSummary(payload) {
    const summary = payload.summary || {};
    text('#summary-total', String(summary.total ?? 0));
    text('#summary-dual', String(summary.dual ?? 0));
    text('#summary-book-only', String(summary.bookOnly ?? 0));
    text('#summary-amm-only', String(summary.ammOnly ?? 0));
    text('#summary-none', String(summary.none ?? 0));
    if (payload.upstreamFailure) {
      text('#summary-issuer-check', 'unknown');
      text('#summary-issuer-note', 'upstream unavailable');
    } else {
      text('#summary-issuer-check', payload.issuerCheck?.ok ? 'passed' : 'failed');
      text('#summary-issuer-note', payload.issuerCheck?.note || '—');
    }
  }

  function createCell(value, className, title) {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    if (title) cell.title = title;
    cell.textContent = value;
    return cell;
  }

  function renderTable(payload) {
    const body = q('#coverage-rows');
    const empty = q('#coverage-empty');
    if (!body) return;
    body.replaceChildren();
    const rows = sortRows(payload.rows);
    if (!selectedKey || !rows.some((row) => row.key === selectedKey)) selectedKey = rows[0]?.key || null;

    if (!rows.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = payload.upstreamFailure
          ? 'Coverage sources are unavailable. No route state was inferred.'
          : payload.invalid ? 'Invalid issuer response.' : 'No candidate rows.';
      }
      text('#table-head-note', payload.upstreamFailure ? 'Upstream failure.' : payload.invalid ? 'Invalid issuer response.' : 'No candidate rows.');
      return;
    }

    if (empty) empty.hidden = true;
    text('#table-head-note', `${rows.length} rows · ${payload.source || 'runtime'}${payload.partial ? ' · partial' : ''}`);
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.tabIndex = 0;
      tr.dataset.rowKey = row.key;
      if (row.key === selectedKey) tr.classList.add('is-selected');

      const stateCell = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `coverage-state-badge ${stateClass(row.state)}`;
      badge.textContent = stateLabel(row.state);
      stateCell.appendChild(badge);
      tr.appendChild(stateCell);
      tr.appendChild(createCell(compact(row.currency, 10, 8), 'mono', row.currency));
      tr.appendChild(createCell(compact(row.issuer, 10, 6), 'mono', row.issuer));
      tr.appendChild(createCell(row.bookPresent ? 'Yes' : 'No'));
      tr.appendChild(createCell(row.ammPresent ? 'Yes' : 'No'));

      const openCell = document.createElement('td');
      const link = document.createElement('a');
      link.className = 'row-open-link';
      link.href = row.sellImpactUrl || `/apps/sell-impact/?currency=${encodeURIComponent(row.currency)}&issuer=${encodeURIComponent(row.issuer)}`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'open';
      link.addEventListener('click', (event) => event.stopPropagation());
      openCell.appendChild(link);
      tr.appendChild(openCell);

      const select = () => {
        selectedKey = row.key;
        renderTable(payload);
        renderDetail(payload);
      };
      tr.addEventListener('click', select);
      tr.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
      });
      body.appendChild(tr);
    });
  }

  function resetDetail(title, subtitle, issuer, explanation, evidence) {
    const badge = q('#detail-state-badge');
    if (badge) { badge.className = 'coverage-state-badge state-none'; badge.textContent = title; }
    text('#detail-title', title === 'Invalid issuer' ? 'Issuer check failed' : 'Coverage detail');
    text('#detail-subtitle', subtitle);
    text('#detail-currency', '—');
    text('#detail-issuer', issuer || '—');
    text('#detail-book', '—');
    text('#detail-amm', '—');
    text('#detail-key', '—');
    text('#detail-explanation', explanation);
    replaceList(q('#detail-evidence-list'), evidence);
    const link = q('#sell-impact-link');
    if (link) link.href = '/apps/sell-impact/';
  }

  function renderDetail(payload) {
    if (payload.upstreamFailure) {
      resetDetail('Coverage unavailable', 'Issuer validation or route sources could not be reached.', payload.issuer, 'No dual/book-only/amm-only/none state was inferred from failed sources.', [payload.error || 'upstream failure', ...(payload.failures || []).map((item) => JSON.stringify(item))]);
      return;
    }
    if (payload.invalid) {
      resetDetail('Invalid issuer', payload.invalidReason || 'Invalid issuer', payload.issuer, 'The input was rejected. This is separate from an upstream failure.', [payload.invalidReason || 'Input rejected.']);
      return;
    }
    const rows = payload.rows || [];
    const row = rows.find((item) => item.key === selectedKey) || rows[0];
    if (!row) {
      resetDetail('No selection', 'No candidate rows are available.', payload.issuer, 'Candidate discovery returned no rows.', ['No candidates were produced.']);
      return;
    }

    selectedKey = row.key;
    const badge = q('#detail-state-badge');
    if (badge) { badge.className = `coverage-state-badge ${stateClass(row.state)}`; badge.textContent = stateLabel(row.state); }
    text('#detail-title', compact(row.currency, 10, 8));
    text('#detail-subtitle', row.state === 'dual' ? 'Both XRP exit route families are available.' : row.state === 'book-only' ? 'Orderbook exit exists; AMM was confirmed absent.' : row.state === 'amm-only' ? 'AMM exit exists; live book was confirmed absent.' : 'Both route checks completed and no XRP exit was observed.');
    text('#detail-currency', row.currency || '—');
    text('#detail-issuer', row.issuer || '—');
    text('#detail-book', row.bookPresent ? 'Yes' : 'No');
    text('#detail-amm', row.ammPresent ? 'Yes' : 'No');
    text('#detail-key', row.key || '—');
    text('#detail-explanation', `Coverage only. Source: ${payload.source || 'unknown'} · freshness: ${payload.freshness?.state || 'unknown'}.`);
    replaceList(q('#detail-evidence-list'), row.evidence || []);
    const link = q('#sell-impact-link');
    if (link) link.href = row.sellImpactUrl || `/apps/sell-impact/?currency=${encodeURIComponent(row.currency)}&issuer=${encodeURIComponent(row.issuer)}`;
  }

  function renderMeta(payload, status) {
    const freshness = payload.freshness || {};
    const ledger = payload.observedLedger || {};
    text('#proof-chip', `runtime: ${payload.label || payload.key || 'coverage'}`);
    text('#ledger-chip', `ledger: ${freshness.observedLedgerIndex || ledger.index || '—'}`);
    text('#source-chip', `source: ${payload.source || 'api'} / ${freshness.state || 'unknown'}`);
    text('#issuer-chip', `issuer: ${payload.issuer || '—'}`);
    text('#run-status', payload.upstreamFailure ? 'UPSTREAM ERROR' : payload.invalid ? 'INVALID INPUT' : payload.partial ? 'PARTIAL' : 'READY');
    text('#debug-preset', payload.key || '—');
    text('#debug-issuer', payload.issuer || '—');
    text('#debug-ledger', `${freshness.observedLedgerHash || ledger.hash || '—'} / ${freshness.observedLedgerIndex || ledger.index || '—'}`);
    text('#debug-json', JSON.stringify({ httpStatus: status, source: payload.source, freshness, issuerCheck: payload.issuerCheck, summary: payload.summary, partial: payload.partial, failures: payload.failures, allRowsHaveSellImpactUrl: payload.allRowsHaveSellImpactUrl, selectedKey }, null, 2));
  }

  function apply(payload, status) {
    currentPayload = payload;
    const banner = q('#page-error-banner');
    if (banner) {
      const message = payload.upstreamFailure
        ? `Coverage sources unavailable (${status}). Route absence was not inferred.`
        : payload.partial ? 'Partial coverage: failed candidates were omitted rather than assigned a false route state.' : '';
      banner.hidden = !message;
      banner.textContent = message;
    }
    renderSummary(payload);
    renderTable(payload);
    renderDetail(payload);
    renderMeta(payload, status);
  }

  async function load() {
    text('#run-status', 'LOADING');
    try {
      const response = await fetch(buildUrl(), { cache: 'no-store', headers: { accept: 'application/json' } });
      const payload = await response.json().catch(() => null);
      if (!payload) throw new Error('invalid_json');
      apply(payload, response.status);
    } catch (error) {
      apply({ ok: false, upstreamFailure: true, invalid: false, issuer: q('#issuer-input')?.value || '', rows: [], summary: {}, source: 'client-fetch', freshness: { state: 'degraded', checkedAt: new Date().toISOString() }, error: error instanceof Error ? error.message : 'unknown_error' }, 0);
    }
  }

  function mount() {
    q('#run-button')?.addEventListener('click', () => setTimeout(load, 0));
    q('#preset-select')?.addEventListener('change', () => setTimeout(load, 0));
    q('#issuer-input')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') void load(); });
    q('#currency-input')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') void load(); });
    q('#reset-button')?.addEventListener('click', () => setTimeout(load, 0));
    void load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
