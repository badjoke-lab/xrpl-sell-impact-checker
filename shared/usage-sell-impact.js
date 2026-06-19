import { hashPair } from '/shared/usage-metrics-policy.js';
import { emit } from '/shared/usage-metrics.js';

const button = document.querySelector('.controls-card button.primary-button');
const currency = document.querySelector('#currency-input');
const issuer = document.querySelector('#issuer-input');
const receive = document.querySelector('[data-result="receive"]');
const status = document.querySelector('.status');
const warning = document.querySelector('[data-result="warning"]');

if (button && currency && issuer && receive) {
  let active = null;
  let timeout = null;

  const finish = (eventName, outcome) => {
    if (!active || active.terminal) return;
    active.terminal = true;
    if (timeout) clearTimeout(timeout);
    void emit(eventName, { pairKeyHash: active.pairKeyHash, outcome });
  };

  button.addEventListener('click', async () => {
    if (timeout) clearTimeout(timeout);
    active = {
      pairKeyHash: await hashPair(currency.value, issuer.value),
      initialReceive: String(receive.textContent || '').trim(),
      terminal: false,
    };
    void emit('estimate_started', { pairKeyHash: active.pairKeyHash });
    timeout = setTimeout(() => finish('estimate_failed', 'error'), 60000);
  }, { capture: true });

  const observer = new MutationObserver(() => {
    if (!active || active.terminal) return;
    const statusText = String(status?.textContent || '').toLowerCase();
    const receiveText = String(receive.textContent || '').trim();
    const warningText = String(warning?.textContent || '').toLowerCase();
    const failed = status?.classList?.contains('error')
      || /error|failed|invalid|timeout|unavailable|no liquidity/.test(statusText);
    if (failed) return finish('estimate_failed', 'error');
    if (receiveText && receiveText !== '—' && receiveText !== active.initialReceive) {
      const degraded = /stale|partial|degraded/.test(`${statusText} ${warningText}`);
      finish('estimate_completed', degraded ? 'degraded' : 'success');
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
}
