(function () {
  const LITE_MODE_KEY = 'xsic:lite-mode';

  function clearElement(el) {
    if (el) el.innerHTML = '';
  }

  function asElement(elOrSelector) {
    if (!elOrSelector) return null;
    if (typeof elOrSelector === 'string') return document.querySelector(elOrSelector);
    return elOrSelector;
  }

  function createStateCard(kind, title, body) {
    const wrap = document.createElement('section');
    wrap.className = `ui-state ui-state--${kind}`;

    const heading = document.createElement('h3');
    heading.className = 'ui-state__title';
    heading.textContent = title;

    const message = document.createElement('p');
    message.className = 'ui-state__body';
    message.textContent = body;

    wrap.append(heading, message);
    return wrap;
  }

  function renderStatusStrip({ status, checkedAt, details } = {}) {
    const roots = Array.from(document.querySelectorAll('[data-status-strip="health"]'));
    const labelMap = { ok: 'OK', stale: 'stale', down: 'down' };
    const statusLabel = labelMap[status] || 'down';

    roots.forEach((root) => {
      const statusNode = root.querySelector('[data-health="status"]');
      const checkedNode = root.querySelector('[data-health="last-refresh"]');
      const detailsNode = root.querySelector('[data-health="details"]');

      if (statusNode) statusNode.textContent = statusLabel;
      if (checkedNode) checkedNode.textContent = checkedAt || '—';
      if (detailsNode) {
        try {
          detailsNode.textContent = JSON.stringify(details || {}, null, 2);
        } catch {
          detailsNode.textContent = '{}';
        }
      }
    });
  }

  function renderEmptyState(el, { title = 'No data yet', body = 'No records to show.', actions = [] } = {}) {
    const mount = asElement(el);
    if (!mount) return;
    clearElement(mount);

    const card = createStateCard('empty', title, body);
    if (actions.length) {
      const actionWrap = document.createElement('div');
      actionWrap.className = 'ui-state__actions';
      actions.forEach((action) => {
        const link = document.createElement('a');
        link.className = 'secondary-button';
        link.textContent = action.label || 'Open';
        link.href = action.href || '#';
        actionWrap.appendChild(link);
      });
      card.appendChild(actionWrap);
    }

    mount.appendChild(card);
  }

  function renderErrorState(el, { title = 'Something went wrong', body = 'Please try again.', retryLabel = 'Retry', onRetry } = {}) {
    const mount = asElement(el);
    if (!mount) return;
    clearElement(mount);

    const card = createStateCard('error', title, body);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'secondary-button';
    retry.textContent = retryLabel;
    retry.addEventListener('click', () => {
      if (typeof onRetry === 'function') onRetry();
    });
    card.appendChild(retry);

    mount.appendChild(card);
  }

  function renderLoadingState(el, { label = 'Loading…' } = {}) {
    const mount = asElement(el);
    if (!mount) return;
    clearElement(mount);

    const card = createStateCard('loading', label, 'Please wait while we prepare this view.');
    card.setAttribute('aria-busy', 'true');
    mount.appendChild(card);
  }

  function getLiteMode() {
    try {
      return window.localStorage.getItem(LITE_MODE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function setLiteMode(v) {
    const enabled = Boolean(v);
    try {
      window.localStorage.setItem(LITE_MODE_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
    document.documentElement.classList.toggle('lite-mode', enabled);
    window.dispatchEvent(new CustomEvent('xsic:lite-mode-change', { detail: { enabled } }));
    return enabled;
  }

  document.documentElement.classList.toggle('lite-mode', getLiteMode());

  window.XSICUiKit = {
    renderStatusStrip,
    renderEmptyState,
    renderErrorState,
    renderLoadingState,
    getLiteMode,
    setLiteMode,
  };
})();
