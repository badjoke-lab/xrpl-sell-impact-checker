export const USAGE_EVENT_NAMES = Object.freeze([
  'page_view',
  'estimate_started',
  'estimate_completed',
  'estimate_failed',
  'pair_brief_opened',
  'open_liquidity',
  'open_flow',
  'open_exit_coverage',
  'open_exposure',
  'support_clicked',
  'watchlist_interest',
  'alert_interest',
  'batch_check_interest',
  'bulk_export_interest',
  'longer_history_interest',
]);

export const USAGE_FEATURE_NAMES = Object.freeze([
  'home',
  'apps',
  'sell-impact',
  'liquidity-pulse',
  'flow-alert',
  'exit-coverage-map',
  'exposure-graph',
  'token-heatmap',
  'pair-brief',
  'donate',
]);

export const USAGE_OUTCOMES = Object.freeze(['neutral', 'success', 'degraded', 'error']);

export const PROHIBITED_USAGE_FIELDS = Object.freeze([
  'ip', 'ip_address', 'client_ip', 'user_agent', 'cookie', 'cookies',
  'fingerprint', 'wallet', 'wallet_address', 'account', 'referrer',
  'referrer_url', 'raw_issuer', 'issuer', 'currency', 'request_body',
  'response_body', 'authorization', 'authorization_header', 'metadata',
]);

export const ALLOWED_USAGE_KEYS = Object.freeze([
  'eventName', 'featureName', 'pairKeyHash', 'outcome', 'synthetic',
]);

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

export function isPairKeyHash(value) {
  return value === '' || /^[a-f0-9]{64}$/.test(String(value || ''));
}

export function validateUsagePayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'invalid_payload' };
  }

  const keys = Object.keys(input);
  const prohibited = keys.filter((key) => PROHIBITED_USAGE_FIELDS.includes(normalize(key)));
  const unknown = keys.filter((key) => !ALLOWED_USAGE_KEYS.includes(key));
  const eventName = normalize(input.eventName);
  const featureName = normalize(input.featureName);
  const pairKeyHash = normalize(input.pairKeyHash);
  const outcome = normalize(input.outcome || 'neutral');

  if (prohibited.length) return { ok: false, error: 'prohibited_fields', prohibited };
  if (unknown.length) return { ok: false, error: 'unknown_fields', unknown };
  if (!USAGE_EVENT_NAMES.includes(eventName)) return { ok: false, error: 'invalid_event' };
  if (!USAGE_FEATURE_NAMES.includes(featureName)) return { ok: false, error: 'invalid_feature' };
  if (!USAGE_OUTCOMES.includes(outcome)) return { ok: false, error: 'invalid_outcome' };
  if (!isPairKeyHash(pairKeyHash)) return { ok: false, error: 'invalid_pair_hash' };
  if (typeof input.synthetic !== 'undefined' && typeof input.synthetic !== 'boolean') {
    return { ok: false, error: 'invalid_synthetic_flag' };
  }

  return {
    ok: true,
    value: { eventName, featureName, pairKeyHash, outcome, synthetic: input.synthetic === true },
  };
}

export async function hashPair(currency, issuer) {
  const normalizedCurrency = String(currency || '').trim().toUpperCase();
  const normalizedIssuer = String(issuer || '').trim().toLowerCase();
  if (!normalizedCurrency || !normalizedIssuer || !globalThis.crypto?.subtle) return '';
  const bytes = new TextEncoder().encode(`${normalizedCurrency}:${normalizedIssuer}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
