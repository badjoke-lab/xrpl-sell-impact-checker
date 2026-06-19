const crypto = require('node:crypto');

const USAGE_EVENT_NAMES = Object.freeze([
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

const USAGE_FEATURE_NAMES = Object.freeze([
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

const PROHIBITED_USAGE_FIELDS = Object.freeze([
  'ip',
  'ip_address',
  'client_ip',
  'user_agent',
  'cookie',
  'cookies',
  'fingerprint',
  'wallet',
  'wallet_address',
  'account',
  'referrer',
  'referrer_url',
  'raw_issuer',
  'issuer',
  'currency',
  'request_body',
  'response_body',
  'authorization',
  'authorization_header',
]);

const USAGE_RETENTION = Object.freeze({
  hourlyDays: 90,
  dailyDays: 400,
  rawEventRetention: 'forbidden',
  pairHashAlgorithm: 'sha256',
  pairHashEncoding: 'hex',
  pairHashLength: 64,
});

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase();
}

function pairKeyHash(currency, issuer) {
  const normalizedCurrency = normalizeToken(currency).toUpperCase();
  const normalizedIssuer = normalizeToken(issuer);
  if (!normalizedCurrency || !normalizedIssuer) return '';
  return crypto.createHash('sha256').update(`${normalizedCurrency}:${normalizedIssuer}`).digest('hex');
}

function isPairKeyHash(value) {
  return value === '' || /^[a-f0-9]{64}$/.test(String(value));
}

function findProhibitedFields(value, path = '') {
  if (!value || typeof value !== 'object') return [];
  const matches = [];
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizeToken(key);
    const childPath = path ? `${path}.${key}` : key;
    if (PROHIBITED_USAGE_FIELDS.includes(normalized)) matches.push(childPath);
    if (child && typeof child === 'object') matches.push(...findProhibitedFields(child, childPath));
  }
  return matches;
}

function validateAggregateDimensions(input = {}) {
  const eventName = normalizeToken(input.eventName || input.event_name);
  const featureName = normalizeToken(input.featureName || input.feature_name);
  const pairHash = normalizeToken(input.pairKeyHash || input.pair_key_hash);
  const prohibited = findProhibitedFields(input);

  return {
    ok: prohibited.length === 0
      && USAGE_EVENT_NAMES.includes(eventName)
      && USAGE_FEATURE_NAMES.includes(featureName)
      && isPairKeyHash(pairHash),
    eventName,
    featureName,
    pairKeyHash: pairHash,
    prohibited,
  };
}

module.exports = {
  USAGE_EVENT_NAMES,
  USAGE_FEATURE_NAMES,
  PROHIBITED_USAGE_FIELDS,
  USAGE_RETENTION,
  pairKeyHash,
  isPairKeyHash,
  findProhibitedFields,
  validateAggregateDimensions,
};
