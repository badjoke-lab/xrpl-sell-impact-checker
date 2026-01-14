import { loadDictionary, t } from "./src/i18n/index.js";
import { normalizeCurrencyInput } from "./shared/normalizeCurrency.js";

const BOOK_OFFERS_API = "/api/book-offers";
const AMM_INFO_API = "/api/amm-info";

const getTranslationOrFallback = (key, fallback = "…") => {
  const value = t(key);
  if (!value || value.startsWith("[[")) {
    return fallback;
  }
  return value;
};

const API_ERROR_CODES = new Set([
  "missing_params",
  "xrp_not_supported",
  "issueMalformed",
  "no_liquidity",
  "upstream_fail",
]);

const extractApiErrorCode = (error) => {
  if (!error) {
    return null;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object") {
    if (typeof error.error === "string") {
      return error.error;
    }
    if (typeof error.code === "string") {
      return error.code;
    }
  }
  return null;
};

const extractApiErrorMessage = (error) => {
  if (!error || typeof error !== "object") {
    return null;
  }
  if (typeof error.error_message === "string") {
    return error.error_message;
  }
  if (typeof error.message === "string") {
    return error.message;
  }
  return null;
};

const resolveUiErrorKey = (code) => {
  if (API_ERROR_CODES.has(code)) {
    return code;
  }
  if (code === "timeout") {
    return "fetch_timeout";
  }
  if (code === "rpc_error") {
    return "fetch_failed";
  }
  if (code === "connect_failed") {
    return "network_unreachable";
  }
  return "default";
};

const buildErrorLines = ({ code, message }) => {
  const uiKey = resolveUiErrorKey(code);
  const title = getTranslationOrFallback(`errors.${uiKey}.title`, message || "Error");
  const hintBase = getTranslationOrFallback(`errors.${uiKey}.hint`, "");
  const hint =
    message && hintBase && !hintBase.includes(message)
      ? `${hintBase} (${message})`
      : hintBase || message || "";
  return { title, hint };
};

const showApiError = ({ code, message }) => {
  const { title, hint } = buildErrorLines({ code, message });
  showInputError(title, hint);
};

/** xrp_not_supported_ui */
function showInputError(title, hint = "") {
  const message = hint ? `${title}\n${hint}` : title;

  // Use the existing status line first (this app already has ".status")
  const status = document.querySelector(".status");
  if (status) {
    status.textContent = message;
    status.hidden = false;
    status.classList?.add?.("error");
    return;
  }

  // Fallback: banners (some are hidden by default)
  const banner =
    document.querySelector("#i18n-error-banner") ||
    document.querySelector(".error-banner") ||
    null;

  if (banner) {
    banner.hidden = false;
    banner.textContent = message;
    banner.classList?.add?.("error");
    return;
  }

  // Last resort
  alert(message);
}


const ORDERBOOK_API_ENDPOINT = {
  id: "orderbook-api",
  url: BOOK_OFFERS_API,
  labelKey: "endpoints.api.label",
};
const ORDERBOOK_API_RETRIES = 2;

const REQUEST_TIMEOUT_MS = 6000;
const DEFAULT_LIMIT = 50;
const FIAT_STORAGE_KEY = "fiat-currency";
const DEFAULT_FIAT = "USD";
const SHARE_URL_DEBOUNCE_MS = 200;
const MAX_AMOUNT = 1_000_000_000;
const LIMIT_MIN = 1;
const LIMIT_MAX = 200;
const THRESHOLD_VALUES = new Set([1, 2, 5, 10, 20]);
const DEFAULT_SLIPPAGE_PERCENT = 5;
const DEFAULT_THIN_CUTOFF_PERCENT = 20;
const FIAT_VALUES = new Set(["USD", "JPY"]);
const DEBUG_QUERY_PARAM = "debug";
const DEBUG_RESPONSE_LIMIT = 600;
const VENUE_CLOB = "CLOB";
const VENUE_AMM = "AMM";
const TOKEN_PRESETS_URL = "./data/token-presets.json";
const RECENT_TOKENS_STORAGE_KEY = "xsic.recentTokens.v1";
const MAX_RECENT_TOKENS = 10;
const DEFAULT_TOKEN = {
  currency: "ARMY",
  issuer: "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq",
};
const EXAMPLE_CANDIDATES = [
  DEFAULT_TOKEN,
  {
    currency: "USD",
    issuer: "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq",
  },
  {
    currency: "EUR",
    issuer: "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq",
  },
  {
    currency: "BTC",
    issuer: "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq",
  },
];

const applyTranslations = () => {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const { i18n } = element.dataset;
    element.textContent = getTranslationOrFallback(i18n);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    if ("placeholder" in element) {
      element.placeholder = getTranslationOrFallback(key);
    }
  });

  document.querySelectorAll("[data-i18n-value]").forEach((element) => {
    const key = element.dataset.i18nValue;
    if ("value" in element) {
      element.value = getTranslationOrFallback(key);
    }
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    const key = element.dataset.i18nAriaLabel;
    element.setAttribute("aria-label", getTranslationOrFallback(key));
  });
};

const i18nErrorBanner = document.querySelector("#i18n-error-banner");

const showI18nError = () => {
  if (!i18nErrorBanner) {
    return;
  }
  const message = getTranslationOrFallback(
    "errors.i18n_failed",
    "Translations failed to load. Please refresh the page."
  );
  i18nErrorBanner.textContent = message;
  i18nErrorBanner.hidden = false;
};

const initI18n = async () => {
  applyTranslations();
  try {
    const url = await loadDictionary();
    applyTranslations();
    if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      console.info("i18n loaded", url.href);
    }
  } catch (error) {
    applyTranslations();
    showI18nError();
  }
};

document.addEventListener("DOMContentLoaded", () => {
  void initI18n().finally(() => {
    resetResults();
  });
});

const statusLine = document.querySelector(".status");
const statusEndpointLine = document.querySelector(".status-endpoint");
const errorBanner = document.querySelector(".error-banner");
const estimateButton = document.querySelector(".primary-button");
const tryExampleButton = document.querySelector("#try-example");
const resetButton = document.querySelector("#reset-inputs");
const currencyInput = document.querySelector("#currency-input");
const issuerInput = document.querySelector("#issuer-input");
const tokenSuggestionInput = document.querySelector("#token-suggest-input");
const tokenSuggestionList = document.querySelector("#token-suggestions");
const amountInput = document.querySelector("#sell-amount-input");
const limitInput = document.querySelector("#limit-input");
const fiatCurrencySelect = document.querySelector("#fiat-currency-select");
const impactThresholdSelect = document.querySelector("#impact-threshold-select");
const thinCutoffInput = document.querySelector("#thin-cutoff-input");
const limitNote = document.querySelector("#limit-note");
const copyLinkButton = document.querySelector("#copy-link");
const shareLoadNote = document.querySelector("#share-load-note");
const shareToast = document.querySelector("#share-toast");
const estimateProgress = document.querySelector("#estimate-progress");
const exampleStatus = document.querySelector("#example-status");
const fieldErrors = {
  currency: document.querySelector('[data-error-for="currency"]'),
  issuer: document.querySelector('[data-error-for="issuer"]'),
  amount: document.querySelector('[data-error-for="amount"]'),
  limit: document.querySelector('[data-error-for="limit"]'),
};
const resultSellability = document.querySelector('[data-result="sellability"]');
const resultFilledLine = document.querySelector('[data-result="filled-line"]');
const resultDataFetched = document.querySelector('[data-result="data-fetched"]');
const resultEndpoint = document.querySelector('[data-result="endpoint"]');
const resultEndpointDetails = document.querySelector(
  '[data-result="endpoint-details"]'
);
const resultOrderCount = document.querySelector('[data-result="order-count"]');
const resultBestPrice = document.querySelector('[data-result="best-price"]');
const resultWorstPrice = document.querySelector('[data-result="worst-price"]');
const resultLiquiditySplitLabel = document.querySelector(
  '[data-result="liquidity-split-label"]'
);
const resultLiquiditySplit = document.querySelector('[data-result="liquidity-split"]');
const resultAmmReserves = document.querySelector('[data-result="amm-reserves"]');
const resultAmmFee = document.querySelector('[data-result="amm-fee"]');
const resultReceive = document.querySelector('[data-result="receive"]');
const resultFiatRate = document.querySelector('[data-result="fiat-rate"]');
const resultFiatWarning = document.querySelector('[data-result="fiat-warning"]');
const resultSlippage = document.querySelector('[data-result="slippage"]');
const resultSlippageHelp = document.querySelector('[data-result="slippage-help"]');
const resultWhyLine = document.querySelector('[data-result="why"]');
const resultWarning = document.querySelector('[data-result="warning"]');
const resultMaxSellLabel = document.querySelector('[data-result="max-sell-label"]');
const resultMaxSellValue = document.querySelector('[data-result="max-sell-value"]');
const resultMaxSellNote = document.querySelector('[data-result="max-sell-note"]');
const resultUsedVenueSummary = document.querySelector('[data-result="used-venue-summary"]');
const resultUsedVenueDetails = document.querySelector('[data-result="used-venue-details"]');
const resultUsedVenueNote = document.querySelector('[data-result="used-venue-note"]');
const impactChart = document.querySelector("#impact-chart");
const depthChart = document.querySelector("#depth-chart");
const impactChartNote = document.querySelector('[data-result="impact-note"]');
const depthChartNote = document.querySelector('[data-result="depth-note"]');
const impactChartSummary = document.querySelector('[data-result="impact-summary"]');
const depthChartSummary = document.querySelector('[data-result="depth-summary"]');
const debugPanel = document.querySelector("#debug-panel");
const debugCopyButton = document.querySelector("#debug-copy");
const debugCopyStatus = document.querySelector('[data-debug="copy-status"]');
const debugLastRequest = document.querySelector('[data-debug="last-request"]');
const debugRequestPayload = document.querySelector('[data-debug="request-payload"]');
const debugEndpointUsed = document.querySelector('[data-debug="endpoint-used"]');
const debugUpstreamStatus = document.querySelector('[data-debug="upstream-status"]');
const debugStatus = document.querySelector('[data-debug="status"]');
const debugElapsed = document.querySelector('[data-debug="elapsed-ms"]');
const debugOffersCount = document.querySelector('[data-debug="offers-count"]');
const debugError = document.querySelector('[data-debug="error"]');
const debugRawResponse = document.querySelector('[data-debug="raw-response"]');
const debugResponseKeys = document.querySelector('[data-debug="response-keys"]');
const debugValidateTiming = document.querySelector('[data-debug="validate-ms"]');
const debugNetworkTiming = document.querySelector('[data-debug="network-ms"]');
const debugParseTiming = document.querySelector('[data-debug="parse-ms"]');
const debugClobMax = document.querySelector('[data-debug="clob-max"]');
const debugAmmMax = document.querySelector('[data-debug="amm-max"]');
const debugClobShare = document.querySelector('[data-debug="clob-share"]');
const debugVenue = document.querySelector('[data-debug="venue"]');
const debugVenueReason = document.querySelector('[data-debug="venue-reason"]');

let currentEndpointIndex = 0;
let lastReceiveXrp = 0;
let lastSortedOffers = null;
let lastBestPrice = 0;
let lastCurrency = "";
let lastFiatRate = null;
let lastSimulation = null;
let lastMaxSellResult = null;
let lastAmmReserves = null;
let lastAmmAvailable = false;
let lastAmmMaxSell = 0;
let lastShouldFetchAmm = false;
let lastOffersHash = "";
let lastFetchedAt = null;
let lastEndpointLabel = "";
let lastUsedVenue = VENUE_CLOB;
let lastDisplaySimulation = null;
let lastDisplayMaxSellResult = null;
let lastAmmMaxSellResult = null;
let chartUpdateTimer = null;
let pendingChartPayload = null;
let shareUrlTimer = null;
let shareToastTimer = null;
let isApplyingShareParams = false;
const isDebugEnabled = new URLSearchParams(window.location.search).get(DEBUG_QUERY_PARAM) === "1";
const debugState = {
  lastRequestTime: null,
  lastRequestUrl: BOOK_OFFERS_API,
  requestPayload: null,
  responseStatus: null,
  endpointUsed: null,
  upstreamStatus: null,
  elapsedMs: null,
  offersCount: null,
  error: null,
  rawResponse: null,
  responseKeys: null,
  timestamp: null,
  clobMax: null,
  ammMax: null,
  clobSharePct: null,
  venue: null,
  venueReason: null,
  timings: {
    validateMs: null,
    networkMs: null,
    parseMs: null,
  },
};

if (debugPanel) {
  debugPanel.hidden = !isDebugEnabled;
}

const setStatus = (key, params) => {
  if (statusLine) {
    statusLine.textContent = t(key, params);
    statusLine.hidden = false;
    statusLine.classList?.remove?.("error");
  }
};

const setEstimateButtonBusy = (isBusy) => {
  if (!estimateButton) {
    return;
  }
  estimateButton.disabled = isBusy;
  estimateButton.textContent = t(isBusy ? "actions.estimating" : "actions.estimate");
  if (estimateProgress) {
    estimateProgress.hidden = !isBusy;
  }
};

const setError = (message) => {
  if (!errorBanner) {
    return;
  }
  errorBanner.textContent = message || "";
  errorBanner.hidden = !message;
};

const setEndpointNotice = (message) => {
  if (!statusEndpointLine) {
    return;
  }

  statusEndpointLine.textContent = message || "";
  statusEndpointLine.hidden = !message;
};

const formatIssuerShort = (issuer) => {
  if (!issuer) {
    return "";
  }
  return `${issuer.slice(0, 5)}...`;
};

const normalizePresetToken = (item) => {
  if (!item || typeof item !== "object") {
    return null;
  }
  const label = typeof item.label === "string" ? item.label.trim() : "";
  const issuer = typeof item.issuer === "string" ? item.issuer.trim() : "";
  const rawCurrency = typeof item.currency === "string" ? item.currency.trim() : "";
  if (!label || !issuer || !rawCurrency) {
    return null;
  }
  const normalized = normalizeCurrencyInput(rawCurrency);
  const currency = normalized.currencyNormalized || normalized.currencyInput?.trim() || "";
  if (!currency || currency === "XRP") {
    return null;
  }
  return {
    label,
    currency,
    issuer,
  };
};

const normalizeRecentToken = (item) => {
  if (!item || typeof item !== "object") {
    return null;
  }
  const label = typeof item.label === "string" ? item.label.trim() : "";
  const issuer = typeof item.issuer === "string" ? item.issuer.trim() : "";
  const rawCurrency = typeof item.currency === "string" ? item.currency.trim() : "";
  if (!issuer || !rawCurrency) {
    return null;
  }
  const normalized = normalizeCurrencyInput(rawCurrency);
  const currency = normalized.currencyNormalized || normalized.currencyInput?.trim() || "";
  if (!currency || currency === "XRP") {
    return null;
  }
  return {
    label: label || formatCurrencyForDisplay(currency),
    currency,
    issuer,
  };
};

const getTokenKey = (token) =>
  `${String(token.currency).toUpperCase()}|${String(token.issuer).toUpperCase()}`;
const getTokenLabel = (token) =>
  token.label?.trim() || formatCurrencyForDisplay(token.currency);
const getTokenOptionValue = (token) => {
  const issuerShort = formatIssuerShort(token.issuer);
  return issuerShort ? `${getTokenLabel(token)} (${issuerShort})` : getTokenLabel(token);
};

let presetTokenSuggestions = [];
let recentTokenSuggestions = [];
let tokenSuggestionIndex = new Map();

const buildExampleLabel = (candidate) =>
  `${candidate.currency} (issuer ${formatIssuerShort(candidate.issuer)})`;

const setExampleStatus = (message) => {
  if (!exampleStatus) {
    return;
  }
  exampleStatus.textContent = message || "";
  exampleStatus.hidden = !message;
};

const loadRecentTokenSuggestions = () => {
  try {
    const raw = localStorage.getItem(RECENT_TOKENS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(normalizeRecentToken)
      .filter((token) => token && token.currency && token.issuer);
  } catch (error) {
    return [];
  }
};

const findPresetLabel = ({ currency, issuer }) => {
  const key = getTokenKey({ currency, issuer });
  const match = presetTokenSuggestions.find((token) => getTokenKey(token) === key);
  return match?.label || "";
};

const renderTokenSuggestionOptions = () => {
  if (!tokenSuggestionList) {
    return;
  }
  tokenSuggestionList.innerHTML = "";
  tokenSuggestionIndex = new Map();

  const seen = new Set();
  const addTokenOption = (token) => {
    const key = getTokenKey(token);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const option = document.createElement("option");
    const optionValue = getTokenOptionValue(token);
    option.value = optionValue;
    option.dataset.currency = token.currency;
    option.dataset.issuer = token.issuer;
    tokenSuggestionIndex.set(optionValue, token);
    tokenSuggestionList.appendChild(option);
  };

  recentTokenSuggestions.forEach(addTokenOption);
  presetTokenSuggestions.forEach(addTokenOption);
};

const saveRecentTokenSuggestion = ({ currency, issuer, label }) => {
  if (!currency || !issuer) {
    return;
  }
  const normalizedCurrencyResult = normalizeCurrencyInput(currency);
  const normalizedCurrency =
    normalizedCurrencyResult.currencyNormalized ||
    normalizedCurrencyResult.currencyInput?.trim() ||
    "";
  if (!normalizedCurrency || normalizedCurrency === "XRP") {
    return;
  }
  const resolvedLabel =
    label || findPresetLabel({ currency: normalizedCurrency, issuer }) || getTokenLabel({
      currency: normalizedCurrency,
      issuer,
      label,
    });
  const tokenRecord = {
    label: resolvedLabel,
    currency: normalizedCurrency,
    issuer,
  };
  const key = getTokenKey(tokenRecord);
  const deduped = recentTokenSuggestions.filter(
    (item) => getTokenKey(item) !== key
  );
  recentTokenSuggestions = [tokenRecord, ...deduped].slice(0, MAX_RECENT_TOKENS);
  try {
    localStorage.setItem(RECENT_TOKENS_STORAGE_KEY, JSON.stringify(recentTokenSuggestions));
  } catch (error) {
    // Ignore storage failures.
  }
  renderTokenSuggestionOptions();
};

const applyTokenSuggestion = (token) => {
  if (!currencyInput || !issuerInput) {
    return;
  }
  currencyInput.value = token.currency;
  issuerInput.value = token.issuer;
  setFieldError("currency", null);
  setFieldError("issuer", null);
  saveRecentTokenSuggestion(token);
  handleShareInputChange();
  currencyInput.focus();
};

const setFieldError = (key, message) => {
  const element = fieldErrors[key];
  if (!element) {
    return;
  }

  element.textContent = message || "";
  element.hidden = !message;
};

const setLimitNote = (message) => {
  if (!limitNote) {
    return;
  }
  limitNote.textContent = message || "";
  limitNote.hidden = !message;
};

const truncateDebugText = (value, limit) => {
  if (!value) {
    return "—";
  }
  const text = String(value);
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}…`;
};

const formatDebugMs = (value) => {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return `${Math.round(value)} ms`;
};

const formatDebugNumber = (value) => {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return formatNumber(value, { maximumFractionDigits: 6 });
};

const formatDebugPercent = (value) => {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return formatPercent(value, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const setDebugValue = (element, value) => {
  if (!element) {
    return;
  }
  element.textContent = prettifyHexCurrencyInText(value ?? "—");
};

const formatDebugJson = (value) => {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
};

const formatLastRequest = (url, time) => {
  if (url && time) {
    return `${url} @ ${time}`;
  }
  return url || time || "—";
};

const buildResponseKeysExcerpt = (rawResponse) => {
  if (!rawResponse || typeof rawResponse !== "object") {
    return "—";
  }
  const keys = Object.keys(rawResponse);
  if (keys.length === 0) {
    return "—";
  }
  const maxKeys = 8;
  const truncatedKeys = keys.slice(0, maxKeys);
  const formattedKeys = truncatedKeys.map((key) => {
    if (key !== "offers") {
      return key;
    }
    if (Array.isArray(rawResponse.offers)) {
      return `offers(${rawResponse.offers.length})`;
    }
    return "offers";
  });
  const suffix = keys.length > maxKeys ? ` +${keys.length - maxKeys} more` : "";
  return `${formattedKeys.join(", ")}${suffix}`;
};

const updateDebugPanel = (updates = {}) => {
  if (!isDebugEnabled || !debugPanel) {
    return;
  }

  if (debugPanel.hidden) {
    debugPanel.hidden = false;
  }

  if (updates.timings) {
    debugState.timings = {
      ...debugState.timings,
      ...updates.timings,
    };
  }

  Object.entries(updates).forEach(([key, value]) => {
    if (key === "timings") {
      return;
    }
    if (value !== undefined) {
      debugState[key] = value;
    }
  });

  if (updates.rawResponse !== undefined && updates.responseKeys === undefined) {
    debugState.responseKeys = buildResponseKeysExcerpt(debugState.rawResponse);
  }

  setDebugValue(
    debugLastRequest,
    formatLastRequest(debugState.lastRequestUrl, debugState.lastRequestTime)
  );
  setDebugValue(debugRequestPayload, formatDebugJson(debugState.requestPayload));
  setDebugValue(debugEndpointUsed, debugState.endpointUsed);
  setDebugValue(debugUpstreamStatus, debugState.upstreamStatus);
  setDebugValue(debugStatus, debugState.responseStatus);
  setDebugValue(debugElapsed, formatDebugMs(debugState.elapsedMs));
  setDebugValue(debugOffersCount, debugState.offersCount ?? "—");
  setDebugValue(debugError, debugState.error);
  setDebugValue(debugRawResponse, formatDebugJson(debugState.rawResponse));
  setDebugValue(debugResponseKeys, debugState.responseKeys);
  setDebugValue(debugClobMax, formatDebugNumber(debugState.clobMax));
  setDebugValue(debugAmmMax, formatDebugNumber(debugState.ammMax));
  setDebugValue(debugClobShare, formatDebugPercent(debugState.clobSharePct));
  setDebugValue(debugVenue, debugState.venue ?? "—");
  setDebugValue(debugVenueReason, debugState.venueReason ?? "—");
  setDebugValue(debugValidateTiming, formatDebugMs(debugState.timings.validateMs));
  setDebugValue(debugNetworkTiming, formatDebugMs(debugState.timings.networkMs));
  setDebugValue(debugParseTiming, formatDebugMs(debugState.timings.parseMs));
};

const buildDebugPayload = () => ({
  input: debugState.requestPayload,
  endpointUsed: debugState.endpointUsed,
  elapsedMs: debugState.elapsedMs,
  offersCount: debugState.offersCount,
  clobMax: debugState.clobMax,
  ammMax: debugState.ammMax,
  clobSharePct: debugState.clobSharePct,
  venue: debugState.venue,
  venueReason: debugState.venueReason,
  error: debugState.error,
  timestamp: debugState.timestamp,
});

const buildDebugText = () => JSON.stringify(buildDebugPayload(), null, 2);

const buildExampleAttemptSummary = (attempts) => {
  if (!Array.isArray(attempts) || attempts.length === 0) {
    return "";
  }
  return attempts
    .map((attempt) => {
      const label = buildExampleLabel(attempt.candidate);
      if (attempt.error) {
        const code = attempt.error?.code || "error";
        const message = attempt.error?.message || "Request failed";
        return `${label} -> ${code}: ${message}`;
      }
      if (Number.isFinite(attempt.offersCount)) {
        return `${label} -> offers=${attempt.offersCount}`;
      }
      return `${label} -> offers=unknown`;
    })
    .join("; ");
};

const clearFieldErrors = () => {
  Object.keys(fieldErrors).forEach((key) => setFieldError(key, null));
  setLimitNote(null);
};

const formatNumber = (value, options = {}) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
    ...options,
  }).format(value);

const formatCompactNumber = (value, options = {}) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
    ...options,
  }).format(value);



function decodeCurrencyHexToAscii(hex) {
  if (typeof hex !== "string") return "";
  const v = hex.trim();
  if (!/^[0-9A-Fa-f]{40}$/.test(v)) return v;
  const bytes = v.match(/.{2}/g).map((b) => parseInt(b, 16));
  let out = "";
  for (const b of bytes) {
    if (b === 0x00) continue;
    if (b >= 0x20 && b <= 0x7e) out += String.fromCharCode(b);
  }
  return out.trim();
}

function formatCurrencyForDisplay(code) {
  if (code == null) return "";
  const raw = String(code).trim();
  if (!raw) return "";
  if (/^[0-9A-Fa-f]{40}$/.test(raw)) {
    const decoded = decodeCurrencyHexToAscii(raw);
    return decoded ? decoded.toUpperCase() : raw.toUpperCase();
  }
  return raw.toUpperCase();
}

function prettifyHexCurrencyInText(text) {
  if (text == null) return text;
  return String(text).replace(/\b([0-9A-Fa-f]{40})\b/g, (m) => {
    const decoded = decodeCurrencyHexToAscii(m);
    return decoded ? decoded.toUpperCase() : m.toUpperCase();
  });
}

const formatPercent = (
  value,
  { minimumFractionDigits = 1, maximumFractionDigits = 2 } = {}
) =>
  `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value)}%`;

let requestIdCounter = 0;
const nextRequestId = () => {
  requestIdCounter += 1;
  return requestIdCounter;
};

const CHART_DIMENSIONS = {
  width: 320,
  height: 200,
  padding: { top: 16, right: 16, bottom: 28, left: 40 },
};

const createSvgElement = (tag, attributes = {}) => {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
};

const clearSvg = (svg) => {
  if (!svg) {
    return;
  }
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }
};

const scaleValue = (value, domainMin, domainMax, rangeMin, rangeMax) => {
  if (!Number.isFinite(value)) {
    return rangeMin;
  }
  if (domainMax === domainMin) {
    return (rangeMin + rangeMax) / 2;
  }
  const ratio = (value - domainMin) / (domainMax - domainMin);
  return rangeMin + ratio * (rangeMax - rangeMin);
};

const FIAT_CACHE_TTL_MS = 120000;
const FIAT_RATE_SOURCE = "coingecko";
const fiatCache = new Map();

const formatFiatAmount = (value, fiat) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: fiat,
    maximumFractionDigits: fiat === "JPY" ? 0 : 2,
  }).format(value);

const formatFiatRate = (value, fiat) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: fiat,
    maximumFractionDigits: fiat === "JPY" ? 2 : 4,
  }).format(value);

const formatTime = (timestamp) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);

const sanitizeCurrency = (value) => {
  const result = normalizeCurrencyInput(value);
  if (result.error) {
    return null;
  }
  return result.currencyNormalized || null;
};

const sanitizeIssuer = (value) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const issuerLooksValid = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(trimmed);
  return issuerLooksValid ? trimmed : null;
};

const sanitizeAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const clamped = clampNumber(parsed, 0, MAX_AMOUNT);
  if (clamped <= 0) {
    return null;
  }
  return clamped;
};

const sanitizeLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const clamped = clampNumber(Math.round(parsed), LIMIT_MIN, LIMIT_MAX);
  return clamped;
};

const sanitizeThreshold = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !THRESHOLD_VALUES.has(parsed)) {
    return null;
  }
  return parsed;
};

const sanitizeThinCutoff = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return clampNumber(parsed, 0, 100);
};

const sanitizeFiat = (value) => {
  if (!value) {
    return null;
  }
  const upper = value.trim().toUpperCase();
  return FIAT_VALUES.has(upper) ? upper : null;
};

const getCurrencyErrorMessage = (currencyResult) => {
  if (!currencyResult?.error) {
    return null;
  }
  switch (currencyResult.error.code) {
    case "empty":
      return t("errors.currency_required");
    case "non_ascii":
      return t("errors.currency_non_ascii");
    case "hex_invalid":
      return t("errors.currency_hex_invalid");
    case "invalid_length":
    default:
      return t("errors.currency_invalid_length");
  }
};

const setResultText = (element, text) => {
  if (element) {
    element.textContent = prettifyHexCurrencyInText(text);
  }
};

const getImpactThresholdPct = () => {
  const raw = impactThresholdSelect?.value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_SLIPPAGE_PERCENT;
};

const getThinCutoffPct = () => {
  const raw = thinCutoffInput?.value;
  if (raw === "" || raw === null || raw === undefined) {
    return DEFAULT_THIN_CUTOFF_PERCENT;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_THIN_CUTOFF_PERCENT;
  }
  return clampNumber(parsed, 0, 100);
};

const updateImpactThresholdHelp = (thresholdPct) => {
  const helper = document.querySelector("#impact-threshold-help");
  if (!helper) {
    return;
  }
  helper.textContent = t("fields.impact_threshold.helper_dynamic", {
    threshold: formatPercent(thresholdPct, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }),
  });
};

const updateMaxSellLabel = (thresholdPct) => {
  setResultText(
    resultMaxSellLabel,
    t("results.max_sell.label", {
      threshold: formatPercent(thresholdPct, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
    })
  );
};

const updateLiquiditySplitLabel = (thresholdPct) => {
  setResultText(
    resultLiquiditySplitLabel,
    t("details.liquidity_split", {
      threshold: formatPercent(thresholdPct, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
    })
  );
};

const setShareLoadNote = (visible) => {
  if (!shareLoadNote) {
    return;
  }
  shareLoadNote.hidden = !visible;
};

const clearShareParams = () => {
  const url = new URL(window.location.href);
  url.search = "";
  history.replaceState(null, "", url.toString());
};

const showShareToast = (message) => {
  if (!shareToast) {
    return;
  }
  if (shareToastTimer) {
    clearTimeout(shareToastTimer);
  }
  shareToast.textContent = message || "";
  shareToast.hidden = !message;
  if (message) {
    shareToastTimer = setTimeout(() => {
      shareToast.hidden = true;
      shareToast.textContent = "";
    }, 2000);
  }
};

const getShareInputState = () => {
  const currency = sanitizeCurrency(currencyInput?.value || "");
  const amount = sanitizeAmount(amountInput?.value);
  const threshold = sanitizeThreshold(impactThresholdSelect?.value);
  const thinCutoff = sanitizeThinCutoff(thinCutoffInput?.value);
  const fiat = sanitizeFiat(fiatCurrencySelect?.value);
  const limitRaw = limitInput?.value;
  const limit =
    limitRaw === "" || limitRaw === null || limitRaw === undefined
      ? null
      : sanitizeLimit(limitRaw);
  const issuer = sanitizeIssuer(issuerInput?.value || "");
  return {
    currency,
    issuer,
    amount,
    limit,
    threshold,
    thinCutoff,
    fiat,
  };
};

const buildShareParams = () => {
  const params = new URLSearchParams();
  const { currency, issuer, amount, limit, threshold, thinCutoff, fiat } =
    getShareInputState();
  const hasPrimary = Boolean(currency || amount);
  if (!hasPrimary) {
    return params;
  }
  if (currency) {
    params.set("currency", currency);
  }
  if (currency && currency !== "XRP" && issuer) {
    params.set("issuer", issuer);
  }
  if (amount) {
    params.set("amount", String(amount));
  }
  const resolvedLimit = limit ?? DEFAULT_LIMIT;
  params.set("limit", String(resolvedLimit));
  const resolvedThreshold = threshold ?? getImpactThresholdPct();
  if (resolvedThreshold) {
    params.set("threshold", String(resolvedThreshold));
    params.set("slippage", String(resolvedThreshold));
    params.set("slippagePercent", String(resolvedThreshold));
  }
  const resolvedThinCutoff = thinCutoff ?? getThinCutoffPct();
  if (resolvedThinCutoff !== null && resolvedThinCutoff !== undefined) {
    params.set("thin", String(resolvedThinCutoff));
    params.set("thinCutoffPercent", String(resolvedThinCutoff));
  }
  const resolvedFiat = fiat ?? DEFAULT_FIAT;
  if (resolvedFiat) {
    params.set("fiat", resolvedFiat);
  }
  return params;
};

const updateShareUrl = () => {
  const params = buildShareParams();
  const url = new URL(window.location.href);
  const search = params.toString();
  url.search = search ? `?${search}` : "";
  history.replaceState(null, "", url);
};

const scheduleShareUrlUpdate = ({ immediate = false } = {}) => {
  if (isApplyingShareParams) {
    return;
  }
  if (shareUrlTimer) {
    clearTimeout(shareUrlTimer);
    shareUrlTimer = null;
  }
  if (immediate) {
    updateShareUrl();
    return;
  }
  shareUrlTimer = setTimeout(() => {
    shareUrlTimer = null;
    updateShareUrl();
  }, SHARE_URL_DEBOUNCE_MS);
};

const copyToClipboard = async (value) => {
  if (!value) {
    return false;
  }
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      // Fall back to legacy approach.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, value.length);
  let success = false;
  try {
    success = document.execCommand("copy");
  } catch (error) {
    success = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return success;
};

const applyShareParamsFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  if (params.size === 0) {
    return;
  }

  let hadInvalidParam = false;
  const currencyParam = params.get("currency");
  const issuerParam = params.get("issuer");
  const amountParam = params.get("amount");
  const limitParam = params.get("limit");
  const slippageParam =
    params.get("slippagePercent") ?? params.get("slippage") ?? params.get("threshold");
  const thinCutoffParam = params.get("thinCutoffPercent") ?? params.get("thin");
  const fiatParam = params.get("fiat");

  const currencyResult = currencyParam ? normalizeCurrencyInput(currencyParam) : null;
  const currency = currencyResult?.error ? null : currencyResult?.currencyNormalized ?? null;
  if (currencyParam && !currency) {
    hadInvalidParam = true;
  }

  const amount = amountParam ? sanitizeAmount(amountParam) : null;
  if (amountParam && !amount) {
    hadInvalidParam = true;
  }

  const limit = limitParam ? sanitizeLimit(limitParam) : null;
  if (limitParam && !limit) {
    hadInvalidParam = true;
  }

  const threshold = slippageParam ? sanitizeThreshold(slippageParam) : null;
  if (slippageParam && !threshold) {
    hadInvalidParam = true;
  }

  const thinCutoff = thinCutoffParam ? sanitizeThinCutoff(thinCutoffParam) : null;
  if (thinCutoffParam && thinCutoff === null) {
    hadInvalidParam = true;
  }

  const fiat = fiatParam ? sanitizeFiat(fiatParam) : null;
  if (fiatParam && !fiat) {
    hadInvalidParam = true;
  }

  let issuer = issuerParam ? sanitizeIssuer(issuerParam) : null;
  if (issuerParam && !issuer) {
    hadInvalidParam = true;
  }

  if (currency === "XRP") {
    issuer = null;
  }

  isApplyingShareParams = true;
  if (currencyInput && currencyParam) {
    currencyInput.value = String(currencyParam).trim().toUpperCase();
  }
  if (amountInput && amount) {
    amountInput.value = String(amount);
  }
  if (limitInput && limit) {
    limitInput.value = String(limit);
  }
  if (impactThresholdSelect && threshold) {
    impactThresholdSelect.value = String(threshold);
    updateMaxSellLabel(threshold);
    updateImpactThresholdHelp(threshold);
    updateLiquiditySplitLabel(threshold);
  }
  if (thinCutoffInput && thinCutoff !== null) {
    thinCutoffInput.value = String(thinCutoff);
  }
  if (fiatCurrencySelect && fiat) {
    fiatCurrencySelect.value = fiat;
    try {
      localStorage.setItem(FIAT_STORAGE_KEY, fiat);
    } catch (error) {
      // Ignore storage failures.
    }
  }
  if (issuerInput) {
    issuerInput.value = issuer || "";
  }
  isApplyingShareParams = false;

  const hasValidScenario =
    Boolean(currency && amount) && (currency === "XRP" || Boolean(issuer));
  if (!hadInvalidParam && hasValidScenario) {
    setShareLoadNote(true);
  }

  scheduleShareUrlUpdate({ immediate: true });
};

const setFiatWarning = (message) => {
  if (!resultFiatWarning) {
    return;
  }
  resultFiatWarning.textContent = message || "";
  resultFiatWarning.hidden = !message;
};

const resetResults = () => {
  const placeholder = getTranslationOrFallback("common.placeholder", "…");
  setResultText(resultSellability, placeholder);
  setResultText(resultFilledLine, placeholder);
  setResultText(resultDataFetched, placeholder);
  setResultText(resultEndpoint, placeholder);
  setResultText(resultEndpointDetails, placeholder);
  setResultText(resultOrderCount, placeholder);
  setResultText(resultBestPrice, placeholder);
  setResultText(resultWorstPrice, placeholder);
  updateLiquiditySplitLabel(getImpactThresholdPct());
  setResultText(resultLiquiditySplit, placeholder);
  setResultText(resultAmmReserves, placeholder);
  setResultText(resultAmmFee, placeholder);
  setResultText(resultReceive, placeholder);
  setResultText(resultSlippage, placeholder);
  setResultText(resultSlippageHelp, getTranslationOrFallback("results.slippage.help"));
  setResultText(resultWhyLine, "");
  setResultText(resultUsedVenueSummary, placeholder);
  setResultText(resultUsedVenueDetails, placeholder);
  setResultText(resultUsedVenueNote, "");
  setResultText(resultFiatRate, t("results.receive.fiat_pending"));
  setFiatWarning(null);
  lastReceiveXrp = 0;
  lastSortedOffers = null;
  lastBestPrice = 0;
  lastCurrency = "";
  updateMaxSellLabel(getImpactThresholdPct());
  updateImpactThresholdHelp(getImpactThresholdPct());
  setResultText(resultMaxSellValue, placeholder);
  setResultText(resultMaxSellNote, "");
  if (resultWarning) {
    resultWarning.hidden = true;
    resultWarning.textContent = "";
  }
  lastFiatRate = null;
  lastSimulation = null;
  lastMaxSellResult = null;
  lastAmmReserves = null;
  lastAmmAvailable = false;
  lastAmmMaxSell = 0;
  lastShouldFetchAmm = false;
  lastOffersHash = "";
  lastFetchedAt = null;
  lastEndpointLabel = "";
  lastUsedVenue = VENUE_CLOB;
  lastDisplaySimulation = null;
  lastDisplayMaxSellResult = null;
  lastAmmMaxSellResult = null;
  scheduleChartsUpdate(
    { offers: null, simulation: null, maxSellResult: null, currency: "" },
    { immediate: true }
  );
};

const getFiatCacheKey = (fiat) => `xrp-fiat-rate:${fiat}`;

const readFiatCache = (fiat) => {
  if (fiatCache.has(fiat)) {
    return fiatCache.get(fiat);
  }

  try {
    const raw = localStorage.getItem(getFiatCacheKey(fiat));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.rate !== "number") {
      return null;
    }
    fiatCache.set(fiat, parsed);
    return parsed;
  } catch (error) {
    return null;
  }
};

const writeFiatCache = (fiat, payload) => {
  fiatCache.set(fiat, payload);
  try {
    localStorage.setItem(getFiatCacheKey(fiat), JSON.stringify(payload));
  } catch (error) {
    // Ignore storage failures.
  }
};

const fetchXrpFiatRate = async (fiat) => {
  const cached = readFiatCache(fiat);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < FIAT_CACHE_TTL_MS) {
    return { ...cached, isStale: false, status: "cached" };
  }

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=${fiat.toLowerCase()}`
    );
    if (!response.ok) {
      throw new Error(`Fiat HTTP ${response.status}`);
    }
    const data = await response.json();
    const rate = data?.ripple?.[fiat.toLowerCase()];
    if (!Number.isFinite(rate)) {
      throw new Error("Fiat rate missing");
    }
    const payload = {
      rate,
      fetchedAt: now,
      source: FIAT_RATE_SOURCE,
    };
    writeFiatCache(fiat, payload);
    return { ...payload, isStale: false, status: "live" };
  } catch (error) {
    if (cached) {
      return { ...cached, isStale: true, status: "stale" };
    }
    return null;
  }
};

const updateFiatDisplay = ({ receiveXrp, fiatRate }) => {
  const fiat = fiatCurrencySelect?.value || DEFAULT_FIAT;
  lastReceiveXrp = receiveXrp;
  lastFiatRate = fiatRate;
  const formattedXrp = formatNumber(receiveXrp, { maximumFractionDigits: 6 });

  if (fiatRate && Number.isFinite(fiatRate.rate)) {
    const fiatAmount = formatFiatAmount(receiveXrp * fiatRate.rate, fiat);
    setResultText(
      resultReceive,
      t("results.receive.with_fiat", {
        amount: formattedXrp,
        fiat: fiatAmount,
      })
    );
    const statusLabel = t(`results.receive.rate_status.${fiatRate.status ?? "live"}`);
    setResultText(
      resultFiatRate,
      t("results.receive.rate_line", {
        rate: formatFiatRate(fiatRate.rate, fiat),
        time: formatTime(fiatRate.fetchedAt),
        status: statusLabel,
      })
    );
    setFiatWarning(null);
    if (lastSortedOffers && lastDisplaySimulation) {
      scheduleChartsUpdate({
        offers: lastSortedOffers,
        simulation: lastDisplaySimulation,
        maxSellResult: lastDisplayMaxSellResult,
        currency: lastCurrency,
        venue: lastUsedVenue,
        ammReserves: lastAmmReserves,
      });
    }
    return;
  }

  setResultText(
    resultReceive,
    t("results.receive.with_fiat", {
      amount: formattedXrp,
      fiat: t("results.receive.fiat_unavailable"),
    })
  );
  setResultText(resultFiatRate, t("results.receive.rate_unavailable"));
  setFiatWarning(t("results.receive.fiat_warning"));
  if (lastSortedOffers && lastDisplaySimulation) {
    scheduleChartsUpdate({
      offers: lastSortedOffers,
      simulation: lastDisplaySimulation,
      maxSellResult: lastDisplayMaxSellResult,
      currency: lastCurrency,
      venue: lastUsedVenue,
      ammReserves: lastAmmReserves,
    });
  }
};

const refreshFiatEstimate = async (receiveXrp) => {
  const fiat = fiatCurrencySelect?.value || DEFAULT_FIAT;
  const fiatRate = await fetchXrpFiatRate(fiat);
  updateFiatDisplay({ receiveXrp, fiatRate });
};

const getOfferAmount = (offer, key) => {
  const fundedKey = `${key}_funded`;
  const fundedKeyCamel = `${key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())}Funded`;
  if (Object.prototype.hasOwnProperty.call(offer, fundedKey)) {
    return offer[fundedKey];
  }
  if (Object.prototype.hasOwnProperty.call(offer, fundedKeyCamel)) {
    return offer[fundedKeyCamel];
  }
  return offer?.[key] ?? null;
};

const parseAmount = (amount) => {
  if (amount === null || amount === undefined) {
    return 0;
  }

  if (typeof amount === "string") {
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed / 1_000_000 : 0;
  }

  if (typeof amount === "number") {
    return Number.isFinite(amount) ? amount : 0;
  }

  if (typeof amount === "object" && "value" in amount) {
    const parsed = Number(amount.value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const normalizeOffers = (offers) => {
  if (!Array.isArray(offers)) {
    return [];
  }

  return offers.map((offer) => {
    const takerGets = getOfferAmount(offer, "taker_gets");
    const takerPays = getOfferAmount(offer, "taker_pays");
    const availableTokenAmount = parseAmount(takerGets);
    const availableXrpAmount = parseAmount(takerPays);
    const price =
      availableTokenAmount > 0 ? availableXrpAmount / availableTokenAmount : 0;

    return {
      account: offer?.Account ?? offer?.account ?? null,
      price,
      availableTokenAmount,
      availableXrpAmount,
    };
  });
};

const buildBookOffersUrl = ({ currency, issuer, limit }) => {
  const url = new URL(BOOK_OFFERS_API, window.location.origin);
  url.searchParams.set("currency", currency);
  url.searchParams.set("issuer", issuer ?? "");
  if (limit !== null && limit !== undefined && limit !== "") {
    url.searchParams.set("limit", String(limit));
  }
  return url.toString();
};

const requestBookOffers = async ({ payload }) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const timings = {
    networkMs: null,
    parseMs: null,
  };
  let responseSnippet = null;
  let statusCode = null;
  let rawResponse = null;

  try {
    const requestUrl = buildBookOffersUrl(payload);
    const networkStart = performance.now();
    const response = await fetch(requestUrl, {
      method: "GET",
      signal: controller.signal,
    });
    timings.networkMs = performance.now() - networkStart;
    statusCode = response.status;

    let data;
    const parseStart = performance.now();
    try {
      data = await response.json();
    } catch (error) {
      timings.parseMs = performance.now() - parseStart;
      responseSnippet = "Failed to parse JSON response.";
      const parseError = error instanceof Error ? error : new Error("Parse failed");
      parseError.code = "rpc_error";
      parseError.debugInfo = {
        responseSnippet,
        statusCode,
        timings,
      };
      throw parseError;
    }
    timings.parseMs = performance.now() - parseStart;
    rawResponse = data;
    responseSnippet = truncateDebugText(JSON.stringify(data), DEBUG_RESPONSE_LIMIT);

    if (!response.ok || !data?.ok) {
      const apiErrorCode = extractApiErrorCode(data?.error) || "upstream_fail";
      const apiMessage =
        data?.message || extractApiErrorMessage(data?.error) || data?.error || null;
      const rpcError = new Error(apiMessage || "Request failed");
      rpcError.code = apiErrorCode;
      rpcError.response = data;
      rpcError.debugInfo = {
        responseSnippet,
        statusCode,
        timings,
        endpointUsed: data?.endpointUsed ?? null,
        rawResponse,
      };
      throw rpcError;
    }

    return {
      data,
      debugInfo: {
        responseSnippet,
        statusCode,
        timings,
        endpointUsed: data?.endpointUsed ?? null,
        rawResponse,
      },
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Request timed out");
      timeoutError.code = "timeout";
      timeoutError.debugInfo = {
        responseSnippet: "Request timed out.",
        statusCode,
        timings,
        endpointUsed: null,
        rawResponse,
      };
      throw timeoutError;
    }
    if (error?.code) {
      throw error;
    }
    const networkError = error instanceof Error ? error : new Error("Network error");
    networkError.code = "connect_failed";
    networkError.debugInfo = {
      responseSnippet: "Network connection failed.",
      statusCode,
      timings,
      endpointUsed: null,
      rawResponse,
    };
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
  }
};

const findExampleCandidate = async () => {
  const attempts = [];
  for (const candidate of EXAMPLE_CANDIDATES) {
    const payload = {
      currency: candidate.currency,
      issuer: candidate.issuer,
      limit: DEFAULT_LIMIT,
    };
    const requestTimestamp = Date.now();
    const requestUrl = buildBookOffersUrl(payload);
    var fetchStart = performance.now();

    updateDebugPanel({
      lastRequestTime: formatTime(requestTimestamp),
      lastRequestUrl: requestUrl,
      requestPayload: payload,
      responseStatus: "pending",
      endpointUsed: null,
      upstreamStatus: null,
      error: null,
      rawResponse: null,
      offersCount: null,
      elapsedMs: null,
    });

    try {
      const response = await requestBookOffers({ payload });
      const offersCount = Array.isArray(response?.data?.offers)
        ? response.data.offers.length
        : 0;

      updateDebugPanel({
        responseStatus: "success",
        endpointUsed: response.debugInfo?.endpointUsed ?? null,
        upstreamStatus: response.debugInfo?.statusCode ?? null,
        error: null,
        rawResponse: response.debugInfo?.rawResponse ?? null,
        offersCount,
        elapsedMs: performance.now() - fetchStart,
        timings: {
          networkMs: response.debugInfo?.timings?.networkMs ?? null,
          parseMs: response.debugInfo?.timings?.parseMs ?? null,
        },
      });

      attempts.push({ candidate, offersCount });
      if (offersCount > 0) {
        return { candidate, attempts };
      }
    } catch (error) {
      attempts.push({ candidate, error });
      updateDebugPanel({
        responseStatus: "fail",
        endpointUsed: error?.debugInfo?.endpointUsed ?? null,
        upstreamStatus: error?.debugInfo?.statusCode ?? null,
        error: `${error?.code || "error"}: ${error?.message || "Request failed"}`,
        rawResponse: error?.debugInfo?.rawResponse ?? null,
        offersCount: null,
        elapsedMs: performance.now() - fetchStart,
        timings: {
          networkMs: error?.debugInfo?.timings?.networkMs ?? null,
          parseMs: error?.debugInfo?.timings?.parseMs ?? null,
        },
      });
    }
  }
  return { candidate: DEFAULT_TOKEN, attempts };
};

const fetchBookOffers = async ({ currency, issuer, limit = DEFAULT_LIMIT }) => {
  const payload = {
    currency,
    issuer,
    limit,
  };

  const attemptedEndpoints = [];
  const errors = [];
  let lastDebugInfo = null;

  for (let attempt = 0; attempt < ORDERBOOK_API_RETRIES; attempt += 1) {
    attemptedEndpoints.push({
      ...ORDERBOOK_API_ENDPOINT,
      attempt: attempt + 1,
    });
    try {
      const response = await requestBookOffers({
        payload,
      });
      const offers = normalizeOffers(response?.data?.offers);
      return {
        offers,
        endpointIndex: 0,
        attemptedEndpoints,
        debugInfo: response?.debugInfo ?? null,
      };
    } catch (error) {
      lastDebugInfo = error?.debugInfo ?? lastDebugInfo;
      errors.push(error);
    }
  }

  const errorCodes = errors.map((error) => error?.code).filter(Boolean);
  const allRpc = errorCodes.length > 0 && errorCodes.every((code) => code === "rpc_error");
  const anyTimeout = errorCodes.some((code) => code === "timeout");
  const combinedError = new Error("All requests failed");
  combinedError.code = allRpc ? "rpc_error" : anyTimeout ? "timeout" : "connect_failed";
  combinedError.debugInfo = lastDebugInfo;
  throw combinedError;
};

const sortOffersByPrice = (offers) =>
  [...offers].sort((a, b) => b.price - a.price);

const filterValidOffers = (offers) =>
  Array.isArray(offers)
    ? offers.filter(
        (offer) =>
          Number.isFinite(offer.availableTokenAmount) &&
          Number.isFinite(offer.availableXrpAmount) &&
          offer.availableTokenAmount > 0 &&
          offer.availableXrpAmount > 0 &&
          offer.price > 0
      )
    : [];

const simulateSellIntoOrderbook = ({ sellAmount, offers }) => {
  const requestedToken = sellAmount;
  let filledToken = 0;
  let receiveXrp = 0;
  let topConsumedOffersCount = 0;

  for (const offer of offers) {
    if (filledToken >= requestedToken) {
      break;
    }

    if (
      !Number.isFinite(offer.availableTokenAmount) ||
      !Number.isFinite(offer.availableXrpAmount) ||
      offer.availableTokenAmount <= 0 ||
      offer.availableXrpAmount <= 0 ||
      offer.price <= 0
    ) {
      continue;
    }

    const remaining = requestedToken - filledToken;
    const tokenToSell = Math.min(remaining, offer.availableTokenAmount);
    if (tokenToSell <= 0) {
      continue;
    }

    const xrpFromOffer =
      (tokenToSell / offer.availableTokenAmount) * offer.availableXrpAmount;

    filledToken += tokenToSell;
    receiveXrp += xrpFromOffer;
    topConsumedOffersCount += 1;
  }

  const fillRate = requestedToken > 0 ? filledToken / requestedToken : 0;
  const fillRatePct = fillRate * 100;
  const effectivePrice = filledToken > 0 ? receiveXrp / filledToken : 0;

  return {
    filledToken,
    requestedToken,
    fillRate,
    fillRatePct,
    receiveXrp,
    effectivePrice,
    topConsumedOffersCount,
  };
};

const computeMaxSellUnderThreshold = ({
  offers,
  thresholdPct,
  referencePrice,
  maxIterations = 24,
}) => {
  if (!Array.isArray(offers) || offers.length === 0) {
    return { status: "not_available" };
  }

  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    return { status: "not_available" };
  }

  const validOffers = filterValidOffers(offers);

  const totalLiquidity = validOffers.reduce(
    (sum, offer) => sum + offer.availableTokenAmount,
    0
  );

  if (!Number.isFinite(totalLiquidity) || totalLiquidity <= 0) {
    return { status: "not_available" };
  }

  const fullSimulation = simulateSellIntoOrderbook({
    sellAmount: totalLiquidity,
    offers: validOffers,
  });
  const canFullyFill =
    fullSimulation.requestedToken > 0 &&
    fullSimulation.filledToken >= fullSimulation.requestedToken;

  if (!canFullyFill) {
    return { status: "not_available" };
  }

  let low = 0;
  let high = totalLiquidity;
  let lastOkSimulation = simulateSellIntoOrderbook({ sellAmount: 0, offers: validOffers });
  let lastOkAmount = 0;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const mid = (low + high) / 2;
    if (mid <= 0) {
      low = mid;
      continue;
    }

    const simulation = simulateSellIntoOrderbook({
      sellAmount: mid,
      offers: validOffers,
    });
    const isFullFill =
      simulation.requestedToken > 0 &&
      simulation.filledToken >= simulation.requestedToken;

    let isOk = false;
    if (isFullFill && simulation.effectivePrice > 0) {
      const rawSlippagePct =
        ((referencePrice - simulation.effectivePrice) / referencePrice) * 100;
      const slippagePct = Math.max(0, rawSlippagePct);
      isOk = slippagePct <= thresholdPct;
    }

    if (isOk) {
      low = mid;
      lastOkSimulation = simulation;
      lastOkAmount = mid;
    } else {
      high = mid;
    }
  }

  return {
    status: "available",
    maxSellAmount: lastOkAmount,
    simulation: lastOkSimulation,
  };
};


const fetchAmmInfo = async ({ currency, issuer }) => {
  const url = new URL(AMM_INFO_API, window.location.href);
  url.searchParams.set("currency", String(currency || "").toUpperCase());
  url.searchParams.set("issuer", String(issuer || ""));
  const res = await fetch(url.toString(), { method: "GET" });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: "non_json_response", rawText: text?.slice?.(0, 600) };
  }
};

const parseAmmReserves = ({ amm, currency, issuer }) => {
  if (!amm) return null;

  const a1 = amm.amount ?? amm.asset1 ?? null;
  const a2 = amm.amount2 ?? amm.asset2 ?? null;

  const parseXrp = (x) => {
    if (typeof x === "string") {
      const drops = Number(x);
      if (!Number.isFinite(drops)) return null;
      return drops / 1_000_000;
    }
    if (x && typeof x === "object" && String(x.currency || "").toUpperCase() === "XRP") {
      const v = Number(x.value);
      return Number.isFinite(v) ? v : null;
    }
    return null;
  };

  const parseIou = (x) => {
    if (x && typeof x === "object") {
      const v = Number(x.value);
      return Number.isFinite(v) ? v : null;
    }
    return null;
  };

  // determine which side is XRP
  const xrp1 = parseXrp(a1);
  const xrp2 = parseXrp(a2);

  let xrpReserve = null;
  let tokenReserve = null;

  if (xrp1 != null) {
    xrpReserve = xrp1;
    tokenReserve = parseIou(a2);
  } else if (xrp2 != null) {
    xrpReserve = xrp2;
    tokenReserve = parseIou(a1);
  }

  if (!Number.isFinite(xrpReserve) || !Number.isFinite(tokenReserve) || xrpReserve <= 0 || tokenReserve <= 0) {
    return null;
  }

  const tradingFee = Number(amm.trading_fee ?? amm.tradingFee ?? 0);
  const feePct = Number.isFinite(tradingFee) ? tradingFee / 100000 : 0;

  return { xrpReserve, tokenReserve, feePct };
};

const simulateSellIntoAmm = ({ sellAmount, reserves }) => {
  const sell = Number(sellAmount);
  if (!reserves || !Number.isFinite(sell) || sell <= 0) {
    return { ok: false, receivedXrp: 0, avgPrice: 0, slippagePct: null, spotPrice: null };
  }

  const { xrpReserve: Y, tokenReserve: X, feePct } = reserves;
  const spotPrice = Y / X; // XRP per token
  const dxEff = sell * (1 - Math.max(0, Math.min(1, feePct)));
  const k = X * Y;

  const newX = X + dxEff;
  const newY = k / newX;
  const out = Math.max(0, Y - newY);

  const avgPrice = out / sell;
  const rawSlip = spotPrice > 0 ? ((spotPrice - avgPrice) / spotPrice) * 100 : null;
  const slippagePct = rawSlip == null ? null : Math.max(0, rawSlip);

  return { ok: true, receivedXrp: out, avgPrice, slippagePct, spotPrice };
};

const findMaxSellWithinThresholdAmm = ({ reserves, thresholdPct }) => {
  if (!reserves) return { ok: false, maxSell: 0 };

  const thr = Number(thresholdPct);
  if (!Number.isFinite(thr) || thr <= 0) return { ok: false, maxSell: 0 };

  let lo = 0;
  let hi = reserves.tokenReserve * 0.99; // practical cap

  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const sim = simulateSellIntoAmm({ sellAmount: mid, reserves });
    if (!sim.ok || sim.slippagePct == null) {
      hi = mid;
      continue;
    }
    if (sim.slippagePct <= thr) lo = mid;
    else hi = mid;
  }
  return { ok: true, maxSell: lo };
};

const buildAmmMaxSellResult = ({ reserves, thresholdPct }) => {
  const result = findMaxSellWithinThresholdAmm({ reserves, thresholdPct });
  if (!result.ok || !Number.isFinite(result.maxSell) || result.maxSell <= 0) {
    return { status: "not_available" };
  }
  const simulation = simulateSellIntoAmm({ sellAmount: result.maxSell, reserves });
  if (!simulation.ok) {
    return { status: "not_available" };
  }
  return {
    status: "available",
    maxSellAmount: result.maxSell,
    simulation: {
      receiveXrp: simulation.receivedXrp,
    },
  };
};

const computeClobSlippagePct = ({ simulation, bestPrice }) => {
  if (
    !simulation ||
    !Number.isFinite(bestPrice) ||
    bestPrice <= 0 ||
    simulation.filledToken < simulation.requestedToken ||
    simulation.effectivePrice <= 0
  ) {
    return null;
  }
  return Math.max(0, ((bestPrice - simulation.effectivePrice) / bestPrice) * 100);
};

const canClobFillWithinSlippage = ({
  simulation,
  bestPrice,
  thresholdPct,
}) => {
  const slippagePct = computeClobSlippagePct({ simulation, bestPrice });
  return slippagePct !== null && slippagePct <= thresholdPct;
};

const decideVenue = ({ clobMax, ammMax, hasAmm, thinCutoffPct, clobCanFill }) => {
  if (!hasAmm) {
    return {
      venue: VENUE_CLOB,
      reason: "AMM missing.",
      clobSharePct: 100,
    };
  }

  const total = clobMax + ammMax;
  const clobSharePct = total > 0 ? (clobMax / total) * 100 : 0;

  if (clobSharePct < thinCutoffPct) {
    return {
      venue: VENUE_AMM,
      reason: "CLOB share below thin cutoff.",
      clobSharePct,
    };
  }

  if (clobCanFill) {
    return {
      venue: VENUE_CLOB,
      reason: "CLOB fills within slippage threshold.",
      clobSharePct,
    };
  }

  return {
    venue: VENUE_AMM,
    reason: "CLOB exceeds slippage threshold.",
    clobSharePct,
  };
};

const buildImpactSamples = ({ offers, sellAmount, sampleCount = 20 }) => {
  const validOffers = filterValidOffers(offers);
  const totalLiquidity = validOffers.reduce(
    (sum, offer) => sum + offer.availableTokenAmount,
    0
  );

  if (!Number.isFinite(totalLiquidity) || totalLiquidity <= 0) {
    return { samples: [], totalLiquidity };
  }

  const cap = Math.min(Math.max(sellAmount * 2, sellAmount), totalLiquidity);
  const points = [];
  const totalPoints = Math.max(2, Math.min(sampleCount, 30));

  for (let index = 0; index < totalPoints; index += 1) {
    const ratio = totalPoints === 1 ? 0 : index / (totalPoints - 1);
    const amount = cap * ratio;
    const simulation = simulateSellIntoOrderbook({
      sellAmount: amount,
      offers: validOffers,
    });
    points.push({
      sellAmount: amount,
      receiveXrp: simulation.receiveXrp,
      filledToken: simulation.filledToken,
      isPartial: simulation.filledToken < simulation.requestedToken,
    });
  }

  return { samples: points, totalLiquidity };
};

const buildAmmImpactSamples = ({ reserves, sellAmount, sampleCount = 20 }) => {
  const total = Number(sellAmount);
  if (!reserves || !Number.isFinite(total) || total <= 0) {
    return { samples: [], totalLiquidity: 0 };
  }
  const totalPoints = Math.max(2, Math.min(sampleCount, 30));
  const points = [];

  for (let index = 1; index <= totalPoints; index += 1) {
    const amount = (total * index) / totalPoints;
    const simulation = simulateSellIntoAmm({ sellAmount: amount, reserves });
    if (!simulation.ok) {
      continue;
    }
    points.push({
      sellAmount: amount,
      receiveXrp: simulation.receivedXrp,
      filledToken: amount,
      isPartial: false,
    });
  }

  return { samples: points, totalLiquidity: total };
};

const getOffersHash = (offers) => {
  if (!Array.isArray(offers) || offers.length === 0) {
    return "empty";
  }
  const rounded = (value) =>
    Number.isFinite(value) ? Math.round(value * 1e6) : 0;
  let hash = 7;
  for (const offer of offers) {
    hash = (hash * 31 + rounded(offer.availableTokenAmount)) % 1_000_000_007;
    hash = (hash * 31 + rounded(offer.availableXrpAmount)) % 1_000_000_007;
    hash = (hash * 31 + rounded(offer.price)) % 1_000_000_007;
  }
  return String(hash);
};

const getAmmCacheKey = ({ reserves, sellAmount, sampleCount }) => {
  if (!reserves) {
    return "empty";
  }
  const rounded = (value) =>
    Number.isFinite(value) ? Math.round(value * 1e6) : 0;
  return [
    rounded(reserves.tokenReserve),
    rounded(reserves.xrpReserve),
    rounded(reserves.feePct),
    rounded(sellAmount),
    sampleCount,
  ].join(":");
};

const impactSampleCache = new Map();
const ammSampleCache = new Map();

const buildDepthSeries = ({ offers }) => {
  const validOffers = filterValidOffers(offers);
  const points = [{ token: 0, xrp: 0 }];
  let totalToken = 0;
  let totalXrp = 0;

  validOffers.forEach((offer) => {
    totalToken += offer.availableTokenAmount;
    totalXrp += offer.availableXrpAmount;
    points.push({ token: totalToken, xrp: totalXrp });
  });

  return { points, totalToken, totalXrp, hasLiquidity: totalToken > 0 };
};

const buildAmmDepthSeries = ({ reserves, sellAmount, sampleCount = 20 }) => {
  const { samples, totalLiquidity } = buildAmmImpactSamples({
    reserves,
    sellAmount,
    sampleCount,
  });
  if (!samples.length || totalLiquidity <= 0) {
    return { points: [], totalToken: 0, totalXrp: 0, hasLiquidity: false };
  }
  const points = [{ token: 0, xrp: 0 }];
  samples.forEach((sample) => {
    points.push({ token: sample.sellAmount, xrp: sample.receiveXrp });
  });
  const lastPoint = points[points.length - 1];
  return {
    points,
    totalToken: lastPoint.token,
    totalXrp: lastPoint.xrp,
    hasLiquidity: lastPoint.token > 0,
  };
};

const buildConsumedDepth = ({ offers, sellAmount }) => {
  const validOffers = filterValidOffers(offers);
  const points = [{ token: 0, xrp: 0 }];
  let remaining = sellAmount;
  let cumulativeToken = 0;
  let cumulativeXrp = 0;

  for (const offer of validOffers) {
    if (remaining <= 0) {
      break;
    }
    const tokenToSell = Math.min(remaining, offer.availableTokenAmount);
    if (tokenToSell <= 0) {
      continue;
    }
    const xrpFromOffer =
      (tokenToSell / offer.availableTokenAmount) * offer.availableXrpAmount;
    cumulativeToken += tokenToSell;
    cumulativeXrp += xrpFromOffer;
    points.push({ token: cumulativeToken, xrp: cumulativeXrp });
    remaining -= tokenToSell;
  }

  return { points, filledToken: cumulativeToken, receiveXrp: cumulativeXrp };
};

const renderChartFrame = ({ svg, xLabel, yLabel }) => {
  const { width, height, padding } = CHART_DIMENSIONS;
  const axisLeft = padding.left;
  const axisRight = width - padding.right;
  const axisTop = padding.top;
  const axisBottom = height - padding.bottom;

  svg.appendChild(
    createSvgElement("line", {
      x1: axisLeft,
      y1: axisTop,
      x2: axisLeft,
      y2: axisBottom,
      class: "chart__axis",
    })
  );
  svg.appendChild(
    createSvgElement("line", {
      x1: axisLeft,
      y1: axisBottom,
      x2: axisRight,
      y2: axisBottom,
      class: "chart__axis",
    })
  );

  [0.25, 0.5, 0.75].forEach((ratio) => {
    const y = axisTop + (axisBottom - axisTop) * ratio;
    svg.appendChild(
      createSvgElement("line", {
        x1: axisLeft,
        y1: y,
        x2: axisRight,
        y2: y,
        class: "chart__grid",
      })
    );
  });

  svg.appendChild(
    createSvgElement("text", {
      x: axisLeft,
      y: axisTop - 4,
      class: "chart__label",
    })
  ).textContent = yLabel;

  svg.appendChild(
    createSvgElement("text", {
      x: axisRight,
      y: height - 6,
      class: "chart__label",
      "text-anchor": "end",
    })
  ).textContent = xLabel;
};

const renderAxisTicks = ({ svg, maxX, maxY }) => {
  const { width, height, padding } = CHART_DIMENSIONS;
  const axisLeft = padding.left;
  const axisRight = width - padding.right;
  const axisTop = padding.top;
  const axisBottom = height - padding.bottom;
  const tickCount = 2;

  for (let i = 0; i <= tickCount; i += 1) {
    const value = (maxY / tickCount) * i;
    const y = scaleValue(value, 0, maxY, axisBottom, axisTop);
    svg.appendChild(
      createSvgElement("text", {
        x: axisLeft - 6,
        y,
        class: "chart__tick",
        "text-anchor": "end",
        "dominant-baseline": "middle",
      })
    ).textContent = formatCompactNumber(value, {
      maximumFractionDigits: value < 1 ? 2 : 1,
    });
  }

  for (let i = 0; i <= tickCount; i += 1) {
    const value = (maxX / tickCount) * i;
    const x = scaleValue(value, 0, maxX, axisLeft, axisRight);
    svg.appendChild(
      createSvgElement("text", {
        x,
        y: axisBottom + 14,
        class: "chart__tick",
        "text-anchor": i === 0 ? "start" : i === tickCount ? "end" : "middle",
      })
    ).textContent = formatCompactNumber(value, {
      maximumFractionDigits: value < 1 ? 2 : 1,
    });
  }
};

const renderChartLegend = ({ svg, labels }) => {
  if (!labels || labels.length === 0) {
    return;
  }
  const { width, padding } = CHART_DIMENSIONS;
  const startX = width - padding.right - 4;
  const startY = padding.top + 6;
  const lineHeight = 14;

  labels.forEach((label, index) => {
    const y = startY + index * lineHeight;
    svg.appendChild(
      createSvgElement("circle", {
        cx: startX - 52,
        cy: y - 4,
        r: 3.5,
        class: label.className,
      })
    );
    svg.appendChild(
      createSvgElement("text", {
        x: startX,
        y,
        class: "chart__legend",
        "text-anchor": "end",
      })
    ).textContent = label.text;
  });
};

const renderEmptyState = ({ svg, message }) => {
  if (!svg) {
    return;
  }
  const { width, height } = CHART_DIMENSIONS;
  svg.appendChild(
    createSvgElement("text", {
      x: width / 2,
      y: height / 2,
      class: "chart__empty",
      "text-anchor": "middle",
      "dominant-baseline": "middle",
    })
  ).textContent = message;
};

const renderImpactChart = ({
  svg,
  samples,
  currentPoint,
  maxPoint,
  isPartial,
  fiatRate,
  fiat,
  thresholdPct,
}) => {
  if (!svg) {
    return;
  }
  clearSvg(svg);

  const { width, height, padding } = CHART_DIMENSIONS;
  const axisLeft = padding.left;
  const axisRight = width - padding.right;
  const axisTop = padding.top;
  const axisBottom = height - padding.bottom;

  if (!samples || samples.length === 0) {
    renderChartFrame({
      svg,
      xLabel: t("graphs.impact.axis_sell"),
      yLabel: t("graphs.impact.axis_receive"),
    });
    renderEmptyState({ svg, message: t("graphs.empty.no_liquidity") });
    return;
  }

  const maxX = Math.max(
    ...samples.map((point) => point.sellAmount),
    currentPoint?.sellAmount ?? 0,
    maxPoint?.sellAmount ?? 0
  );
  const rate = fiatRate?.rate ?? null;
  const hasFiat = Number.isFinite(rate);
  const values = samples.map((point) => point.receiveXrp * (hasFiat ? rate : 1));
  const maxY = Math.max(...values, currentPoint?.receiveValue ?? 0, 1);

  renderChartFrame({
    svg,
    xLabel: t("graphs.impact.axis_sell"),
    yLabel: hasFiat
      ? t("graphs.impact.axis_receive_fiat", { fiat })
      : t("graphs.impact.axis_receive_xrp"),
  });
  renderAxisTicks({ svg, maxX, maxY });

  const path = samples
    .map((point, index) => {
      const x = scaleValue(point.sellAmount, 0, maxX, axisLeft, axisRight);
      const y = scaleValue(
        point.receiveXrp * (hasFiat ? rate : 1),
        0,
        maxY,
        axisBottom,
        axisTop
      );
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const fillPath = `${path} L ${scaleValue(
    samples[samples.length - 1].sellAmount,
    0,
    maxX,
    axisLeft,
    axisRight
  )} ${axisBottom} L ${axisLeft} ${axisBottom} Z`;

  svg.appendChild(createSvgElement("path", { d: fillPath, class: "chart__fill" }));
  svg.appendChild(createSvgElement("path", { d: path, class: "chart__line" }));

  const legendItems = [
    {
      text: t("graphs.legend.your_amount"),
      className: "chart__legend-marker chart__marker",
    },
  ];

  if (maxPoint && Number.isFinite(maxPoint.sellAmount)) {
    const x = scaleValue(maxPoint.sellAmount, 0, maxX, axisLeft, axisRight);
    svg.appendChild(
      createSvgElement("line", {
        x1: x,
        y1: axisTop,
        x2: x,
        y2: axisBottom,
        class: "chart__line--accent",
      })
    );
    svg.appendChild(
      createSvgElement("circle", {
        cx: x,
        cy: scaleValue(maxPoint.receiveValue, 0, maxY, axisBottom, axisTop),
        r: 4.5,
        class: "chart__marker chart__marker--secondary",
      })
    );
    legendItems.push({
      text: t("graphs.legend.max_under", {
        threshold: formatPercent(thresholdPct, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }),
      }),
      className: "chart__legend-marker chart__marker chart__marker--secondary",
    });
  }

  if (currentPoint && Number.isFinite(currentPoint.sellAmount)) {
    const x = scaleValue(currentPoint.sellAmount, 0, maxX, axisLeft, axisRight);
    const y = scaleValue(currentPoint.receiveValue, 0, maxY, axisBottom, axisTop);
    svg.appendChild(
      createSvgElement("circle", {
        cx: x,
        cy: y,
        r: 5,
        class: `chart__marker${isPartial ? " chart__marker--alert" : ""}`,
      })
    );
    if (isPartial) {
      svg.appendChild(
        createSvgElement("line", {
          x1: x,
          y1: axisTop,
          x2: x,
          y2: axisBottom,
          class: "chart__line--alert",
        })
      );
      svg.appendChild(
        createSvgElement("text", {
          x: Math.min(x + 6, axisRight - 4),
          y: axisTop + 12,
          class: "chart__note-inline",
          "text-anchor": x + 6 > axisRight - 4 ? "end" : "start",
        })
      ).textContent = t("graphs.liquidity_end");
    }
  }

  renderChartLegend({ svg, labels: legendItems });
};

const renderDepthChart = ({ svg, depthSeries, consumedSeries, isPartial }) => {
  if (!svg) {
    return;
  }
  clearSvg(svg);

  const { width, height, padding } = CHART_DIMENSIONS;
  const axisLeft = padding.left;
  const axisRight = width - padding.right;
  const axisTop = padding.top;
  const axisBottom = height - padding.bottom;

  if (!depthSeries || depthSeries.points.length <= 1) {
    renderChartFrame({
      svg,
      xLabel: t("graphs.depth.axis_sell"),
      yLabel: t("graphs.depth.axis_receive"),
    });
    renderEmptyState({ svg, message: t("graphs.empty.no_liquidity") });
    return;
  }

  const maxX = Math.max(depthSeries.totalToken, consumedSeries?.filledToken ?? 0, 1);
  const maxY = Math.max(depthSeries.totalXrp, consumedSeries?.receiveXrp ?? 0, 1);

  renderChartFrame({
    svg,
    xLabel: t("graphs.depth.axis_sell"),
    yLabel: t("graphs.depth.axis_receive"),
  });
  renderAxisTicks({ svg, maxX, maxY });

  const stepPath = depthSeries.points
    .map((point, index) => {
      const x = scaleValue(point.token, 0, maxX, axisLeft, axisRight);
      const y = scaleValue(point.xrp, 0, maxY, axisBottom, axisTop);
      if (index === 0) {
        return `M ${x} ${y}`;
      }
      const prev = depthSeries.points[index - 1];
      const prevX = scaleValue(prev.token, 0, maxX, axisLeft, axisRight);
      const prevY = scaleValue(prev.xrp, 0, maxY, axisBottom, axisTop);
      return `L ${prevX} ${y} L ${x} ${y}`;
    })
    .join(" ");

  const fullAreaPath = `${stepPath} L ${axisRight} ${axisBottom} L ${axisLeft} ${axisBottom} Z`;
  svg.appendChild(
    createSvgElement("path", { d: fullAreaPath, class: "chart__area--remaining" })
  );
  svg.appendChild(createSvgElement("path", { d: stepPath, class: "chart__line" }));

  if (consumedSeries && consumedSeries.points.length > 1) {
    const consumedPath = consumedSeries.points
      .map((point, index) => {
        const x = scaleValue(point.token, 0, maxX, axisLeft, axisRight);
        const y = scaleValue(point.xrp, 0, maxY, axisBottom, axisTop);
        if (index === 0) {
          return `M ${x} ${y}`;
        }
        const prev = consumedSeries.points[index - 1];
        const prevX = scaleValue(prev.token, 0, maxX, axisLeft, axisRight);
        return `L ${prevX} ${y} L ${x} ${y}`;
      })
      .join(" ");
    const consumedArea = `${consumedPath} L ${scaleValue(
      consumedSeries.points[consumedSeries.points.length - 1].token,
      0,
      maxX,
      axisLeft,
      axisRight
    )} ${axisBottom} L ${axisLeft} ${axisBottom} Z`;
    svg.appendChild(
      createSvgElement("path", { d: consumedArea, class: "chart__area--consumed" })
    );
    svg.appendChild(createSvgElement("path", { d: consumedPath, class: "chart__line" }));

    const lastPoint = consumedSeries.points[consumedSeries.points.length - 1];
    const markerX = scaleValue(lastPoint.token, 0, maxX, axisLeft, axisRight);
    const markerY = scaleValue(lastPoint.xrp, 0, maxY, axisBottom, axisTop);
    svg.appendChild(
      createSvgElement("circle", {
        cx: markerX,
        cy: markerY,
        r: 5,
        class: `chart__marker${isPartial ? " chart__marker--alert" : ""}`,
      })
    );
    if (isPartial) {
      svg.appendChild(
        createSvgElement("line", {
          x1: markerX,
          y1: axisTop,
          x2: markerX,
          y2: axisBottom,
          class: "chart__line--alert",
        })
      );
      svg.appendChild(
        createSvgElement("text", {
          x: Math.min(markerX + 6, axisRight - 4),
          y: axisTop + 12,
          class: "chart__note-inline",
          "text-anchor": markerX + 6 > axisRight - 4 ? "end" : "start",
        })
      ).textContent = t("graphs.liquidity_end");
    }
  }
};

const updateMaxSellResults = async ({
  offers,
  thresholdPct,
  referencePrice,
  currency,
  result: precomputedResult,
  venue = VENUE_CLOB,
  ammReserves = null,
}) => {
  updateMaxSellLabel(thresholdPct);

  if (venue === VENUE_AMM) {
    const result =
      precomputedResult ?? buildAmmMaxSellResult({ reserves: ammReserves, thresholdPct });
    if (result.status !== "available") {
      setResultText(resultMaxSellValue, t("results.max_sell.not_available"));
      setResultText(resultMaxSellNote, "");
      return;
    }
    const tokenAmount = formatNumber(result.maxSellAmount, {
      maximumFractionDigits: 6,
    });
    const xrpAmount = formatNumber(result.simulation.receiveXrp, {
      maximumFractionDigits: 6,
    });
    const fiat = fiatCurrencySelect?.value || DEFAULT_FIAT;
    const fiatRate = await fetchXrpFiatRate(fiat);

    if (fiatRate && Number.isFinite(fiatRate.rate)) {
      const fiatAmount = formatFiatAmount(
        result.simulation.receiveXrp * fiatRate.rate,
        fiat
      );
      setResultText(
        resultMaxSellValue,
        t("results.max_sell.value_with_fiat", {
          amount: tokenAmount,
          currency,
          fiat: fiatAmount,
        })
      );
      setResultText(
        resultMaxSellNote,
        t("results.max_sell.xrp_line", {
          amount: xrpAmount,
        })
      );
      return;
    }

    setResultText(
      resultMaxSellValue,
      t("results.max_sell.value_with_xrp", {
        amount: tokenAmount,
        currency,
        xrp: xrpAmount,
      })
    );
    setResultText(resultMaxSellNote, t("results.max_sell.fiat_unavailable"));
    return;
  }

  if (!offers || offers.length === 0) {
    setResultText(resultMaxSellValue, t("results.max_sell.not_available"));
    setResultText(resultMaxSellNote, "");
    return;
  }

  const result =
    precomputedResult ??
    computeMaxSellUnderThreshold({
      offers,
      thresholdPct,
      referencePrice,
    });

  if (result.status !== "available") {
    setResultText(resultMaxSellValue, t("results.max_sell.not_available"));
    setResultText(resultMaxSellNote, "");
    return;
  }

  const tokenAmount = formatNumber(result.maxSellAmount, { maximumFractionDigits: 6 });
  const xrpAmount = formatNumber(result.simulation.receiveXrp, {
    maximumFractionDigits: 6,
  });
  const fiat = fiatCurrencySelect?.value || DEFAULT_FIAT;
  const fiatRate = await fetchXrpFiatRate(fiat);

  if (fiatRate && Number.isFinite(fiatRate.rate)) {
    const fiatAmount = formatFiatAmount(result.simulation.receiveXrp * fiatRate.rate, fiat);
    setResultText(
      resultMaxSellValue,
      t("results.max_sell.value_with_fiat", {
        amount: tokenAmount,
        currency,
        fiat: fiatAmount,
      })
    );
    setResultText(
      resultMaxSellNote,
      t("results.max_sell.xrp_line", {
        amount: xrpAmount,
      })
    );
    return;
  }

  setResultText(
    resultMaxSellValue,
    t("results.max_sell.value_with_xrp", {
      amount: tokenAmount,
      currency,
      xrp: xrpAmount,
    })
  );
  setResultText(resultMaxSellNote, t("results.max_sell.fiat_unavailable"));
};

const updateResultsSummary = ({
  simulation,
  bestPrice,
  offersCount,
  venue = VENUE_CLOB,
  slippagePct = null,
}) => {
  const isAmm = venue === VENUE_AMM;
  const hasLiquidity = simulation.filledToken > 0;
  const isFullFill = hasLiquidity && simulation.filledToken >= simulation.requestedToken;
  const isPartialFill =
    hasLiquidity && simulation.filledToken < simulation.requestedToken;
  const filledLine = t("results.sellability.filled_line", {
    filled: formatNumber(simulation.filledToken),
    requested: formatNumber(simulation.requestedToken),
    pct: formatPercent(simulation.fillRatePct),
  });

  if (isAmm) {
    if (!hasLiquidity) {
      setResultText(resultSellability, t("results.sellability.none"));
    } else if (isPartialFill) {
      setResultText(resultSellability, t("results.sellability.partial"));
    } else {
      setResultText(resultSellability, t("results.sellability.full"));
    }
  } else if (offersCount === 0) {
    setResultText(resultSellability, t("results.sellability.empty"));
  } else if (!hasLiquidity) {
    setResultText(resultSellability, t("results.sellability.none"));
  } else if (isPartialFill) {
    setResultText(resultSellability, t("results.sellability.partial"));
  } else {
    setResultText(resultSellability, t("results.sellability.full"));
  }

  setResultText(resultFilledLine, filledLine);

  if (resultWarning) {
    if (isPartialFill) {
      resultWarning.textContent = t("results.warnings.partial", {
        pct: formatPercent(simulation.fillRatePct),
      });
      resultWarning.hidden = false;
    } else if (!hasLiquidity || (!isAmm && offersCount === 0)) {
      resultWarning.textContent = t("results.warnings.none");
      resultWarning.hidden = false;
    } else {
      resultWarning.hidden = true;
      resultWarning.textContent = "";
    }
  }

  const formattedXrp = formatNumber(simulation.receiveXrp, {
    maximumFractionDigits: 6,
  });
  setResultText(
    resultReceive,
    t("results.receive.with_fiat", {
      amount: formattedXrp,
      fiat: t("results.receive.fiat_loading"),
    })
  );
  setResultText(resultFiatRate, t("results.receive.fiat_pending"));
  setFiatWarning(null);

  const resolvedSlippage =
    slippagePct ??
    (isFullFill && bestPrice > 0 && simulation.effectivePrice > 0
      ? Math.max(0, ((bestPrice - simulation.effectivePrice) / bestPrice) * 100)
      : null);
  if (resolvedSlippage === null || resolvedSlippage === undefined) {
    setResultText(resultSlippage, t("common.not_available"));
  } else {
    setResultText(resultSlippage, formatPercent(resolvedSlippage));
    if (resultWarning && resolvedSlippage >= 10) {
      resultWarning.textContent = t("results.warnings.high_slippage");
      resultWarning.hidden = false;
    }
  }

  setResultText(resultSlippageHelp, t("results.slippage.help"));
  setResultText(
    resultWhyLine,
    isAmm
      ? t("results.why_line_amm")
      : t("results.why_line", { count: simulation.topConsumedOffersCount })
  );
};

const updateExecutionDetails = ({
  offers,
  bestPrice,
  worstPrice,
  attemptedEndpoints,
}) => {
  const orderCount = Array.isArray(offers) ? offers.length : null;
  if (Number.isFinite(orderCount)) {
    setResultText(resultOrderCount, formatNumber(orderCount));
  } else {
    setResultText(
      resultOrderCount,
      getTranslationOrFallback("common.placeholder", "…")
    );
  }

  if (orderCount > 0 && Number.isFinite(bestPrice) && bestPrice > 0) {
    setResultText(
      resultBestPrice,
      formatNumber(bestPrice, { maximumFractionDigits: 8 })
    );
  } else {
    setResultText(resultBestPrice, t("common.not_available"));
  }

  if (orderCount > 0 && Number.isFinite(worstPrice) && worstPrice > 0) {
    setResultText(
      resultWorstPrice,
      formatNumber(worstPrice, { maximumFractionDigits: 8 })
    );
  } else {
    setResultText(resultWorstPrice, t("common.not_available"));
  }

  if (Array.isArray(attemptedEndpoints) && attemptedEndpoints.length > 0) {
    const endpointTrail = attemptedEndpoints
      .map((endpoint, index) => {
        const attemptSuffix =
          attemptedEndpoints.length > 1 ? ` #${index + 1}` : "";
        return `${t(endpoint.labelKey)}${attemptSuffix} (${endpoint.url})`;
      })
      .join(" → ");
    setResultText(resultEndpointDetails, endpointTrail);
  } else {
    setResultText(
      resultEndpointDetails,
      getTranslationOrFallback("common.placeholder", "…")
    );
  }
};

const setUsedVenue = (venue) => {
  const placeholder = getTranslationOrFallback("common.placeholder", "…");
  const value = venue || placeholder;
  setResultText(resultUsedVenueSummary, value);
  setResultText(resultUsedVenueDetails, value);
  setResultText(resultUsedVenueNote, "");
};

const updateLiquidityBreakdown = ({
  thresholdPct = getImpactThresholdPct(),
  currency = lastCurrency,
} = {}) => {
  if (!resultLiquiditySplit || !resultAmmReserves || !resultAmmFee) {
    return;
  }

  updateLiquiditySplitLabel(thresholdPct);

  if (!lastShouldFetchAmm) {
    setResultText(resultLiquiditySplit, t("details.liquidity_split_not_applicable"));
    setResultText(resultAmmReserves, t("details.amm_not_applicable"));
    setResultText(resultAmmFee, t("details.amm_not_applicable"));
    return;
  }

  const clobMax =
    lastMaxSellResult?.status === "available" ? lastMaxSellResult.maxSellAmount : 0;
  const ammMax = Number.isFinite(lastAmmMaxSell) ? lastAmmMaxSell : 0;
  const total = clobMax + ammMax;

  if (!Number.isFinite(total) || total <= 0) {
    setResultText(resultLiquiditySplit, t("common.not_available"));
  } else {
    const clobSharePct = (clobMax / total) * 100;
    const ammSharePct = 100 - clobSharePct;
    const splitKey = lastAmmAvailable
      ? "details.liquidity_split_value"
      : "details.liquidity_split_value_no_amm";
    setResultText(
      resultLiquiditySplit,
      t(splitKey, {
        clob: formatPercent(clobSharePct, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 1,
        }),
        amm: formatPercent(ammSharePct, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 1,
        }),
      })
    );
  }

  if (!lastAmmAvailable || !lastAmmReserves) {
    setResultText(resultAmmReserves, t("details.amm_not_found"));
    setResultText(resultAmmFee, t("details.amm_not_found"));
    return;
  }

  const tokenAmount = formatNumber(lastAmmReserves.tokenReserve, {
    maximumFractionDigits: 6,
  });
  const xrpAmount = formatNumber(lastAmmReserves.xrpReserve, {
    maximumFractionDigits: 6,
  });
  setResultText(
    resultAmmReserves,
    t("details.amm_reserves_value", {
      token: tokenAmount,
      currency,
      xrp: xrpAmount,
    })
  );
  const feePct = Number.isFinite(lastAmmReserves.feePct) ? lastAmmReserves.feePct : 0;
  setResultText(
    resultAmmFee,
    formatPercent(feePct * 100, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  );
};

function setChartNote(element, message) {
  if (!element) {
    return;
  }
  element.textContent = message || "";
  element.hidden = !message;
}

function renderCharts({
  offers,
  simulation,
  maxSellResult,
  currency,
  venue = VENUE_CLOB,
  ammReserves = null,
}) {
  if (!impactChart || !depthChart) {
    return;
  }

  const isAmm = venue === VENUE_AMM;

  if ((!simulation || (!isAmm && (!offers || offers.length === 0))) || (isAmm && !ammReserves)) {
    renderImpactChart({ svg: impactChart, samples: [] });
    renderDepthChart({ svg: depthChart, depthSeries: { points: [] } });
    setChartNote(impactChartNote, null);
    setChartNote(depthChartNote, null);
    setResultText(impactChartSummary, t("graphs.impact.summary_empty"));
    setResultText(depthChartSummary, t("graphs.depth.summary_empty"));
    return;
  }

  const fiat = fiatCurrencySelect?.value || DEFAULT_FIAT;
  const rate = lastFiatRate?.rate ?? null;
  const hasFiat = Number.isFinite(rate);
  const isPartial =
    !isAmm && simulation.filledToken < simulation.requestedToken;
  const receiveLabel = hasFiat
    ? formatFiatAmount(simulation.receiveXrp * rate, fiat)
    : t("graphs.impact.receive_xrp", {
        amount: formatNumber(simulation.receiveXrp, { maximumFractionDigits: 6 }),
      });

  const thresholdPct = getImpactThresholdPct();
  let samples = [];
  let totalLiquidity = 0;
  if (isAmm) {
    const sampleCount = 24;
    const chartSellAmount = Math.max(
      simulation.requestedToken,
      maxSellResult?.maxSellAmount ?? 0
    );
    const sampleCacheKey = getAmmCacheKey({
      reserves: ammReserves,
      sellAmount: chartSellAmount,
      sampleCount,
    });
    let cachedSample = ammSampleCache.get(sampleCacheKey);
    if (!cachedSample) {
      cachedSample = buildAmmImpactSamples({
        reserves: ammReserves,
        sellAmount: chartSellAmount,
        sampleCount,
      });
      ammSampleCache.set(sampleCacheKey, cachedSample);
    }
    ({ samples, totalLiquidity } = cachedSample);
  } else {
    const offersHash = lastOffersHash || getOffersHash(offers);
    const sampleCacheKey = `${offersHash}:${fiat}:${thresholdPct}:${simulation.requestedToken}`;
    let cachedSample = impactSampleCache.get(sampleCacheKey);
    if (!cachedSample) {
      cachedSample = buildImpactSamples({
        offers,
        sellAmount: simulation.requestedToken,
        sampleCount: 24,
      });
      impactSampleCache.set(sampleCacheKey, cachedSample);
    }
    ({ samples, totalLiquidity } = cachedSample);
  }
  if (samples.length === 0 || totalLiquidity <= 0) {
    renderImpactChart({ svg: impactChart, samples: [] });
    setChartNote(impactChartNote, t("graphs.impact.note_no_liquidity"));
    setResultText(impactChartSummary, t("graphs.impact.summary_empty"));
  }
  const currentSellAmount = isPartial ? simulation.filledToken : simulation.requestedToken;
  const currentReceiveValue = simulation.receiveXrp * (hasFiat ? rate : 1);
  const maxPoint =
    maxSellResult?.status === "available"
      ? {
          sellAmount: maxSellResult.maxSellAmount,
          receiveValue: maxSellResult.simulation.receiveXrp * (hasFiat ? rate : 1),
        }
      : null;

  if (samples.length > 0 && totalLiquidity > 0) {
    renderImpactChart({
      svg: impactChart,
      samples,
      currentPoint: {
        sellAmount: currentSellAmount,
        receiveValue: currentReceiveValue,
      },
      maxPoint,
      isPartial,
      fiatRate: lastFiatRate,
      fiat,
      thresholdPct,
    });

    if (simulation.filledToken <= 0 || isPartial) {
      setChartNote(
        impactChartNote,
        !hasFiat
          ? t("graphs.impact.note_insufficient_fiat_unavailable")
          : t("graphs.impact.note_insufficient")
      );
    } else if (!hasFiat) {
      setChartNote(impactChartNote, t("graphs.impact.note_fiat_unavailable"));
    } else {
      setChartNote(impactChartNote, null);
    }

    if (isPartial) {
      setResultText(
        impactChartSummary,
        t("graphs.impact.summary_partial", {
          filled: formatNumber(simulation.filledToken, { maximumFractionDigits: 6 }),
          requested: formatNumber(simulation.requestedToken, {
            maximumFractionDigits: 6,
          }),
          currency,
          receive: receiveLabel,
        })
      );
    } else {
      setResultText(
        impactChartSummary,
        t("graphs.impact.summary", {
          sell: formatNumber(simulation.requestedToken, { maximumFractionDigits: 6 }),
          currency,
          receive: receiveLabel,
        })
      );
    }
  }

  const depthSeries = isAmm
    ? buildAmmDepthSeries({
        reserves: ammReserves,
        sellAmount: Math.max(
          simulation.requestedToken,
          maxSellResult?.maxSellAmount ?? 0
        ),
        sampleCount: 24,
      })
    : buildDepthSeries({ offers });
  const consumedSeries = isAmm
    ? buildAmmDepthSeries({
        reserves: ammReserves,
        sellAmount: simulation.requestedToken,
        sampleCount: 24,
      })
    : buildConsumedDepth({
        offers,
        sellAmount: simulation.requestedToken,
      });

  if (!depthSeries.hasLiquidity) {
    renderDepthChart({ svg: depthChart, depthSeries: { points: [] } });
    setChartNote(depthChartNote, t("graphs.depth.note_no_liquidity"));
    setResultText(depthChartSummary, t("graphs.depth.summary_empty"));
    return;
  }

  renderDepthChart({
    svg: depthChart,
    depthSeries,
    consumedSeries,
    isPartial,
  });

  if (isPartial) {
    setChartNote(
      depthChartNote,
      !hasFiat
        ? t("graphs.depth.note_exhausted_fiat_unavailable")
        : t("graphs.depth.note_exhausted")
    );
  } else if (!hasFiat) {
    setChartNote(depthChartNote, t("graphs.depth.note_fiat_unavailable"));
  } else {
    setChartNote(depthChartNote, null);
  }

  const totalReceiveLabel = t("graphs.depth.receive_xrp", {
    amount: formatNumber(depthSeries.totalXrp, { maximumFractionDigits: 6 }),
  });
  if (isPartial) {
    setResultText(
      depthChartSummary,
      t("graphs.depth.summary_partial", {
        filled: formatNumber(simulation.filledToken, { maximumFractionDigits: 6 }),
        requested: formatNumber(simulation.requestedToken, { maximumFractionDigits: 6 }),
        currency,
        receive: receiveLabel,
      })
    );
  } else {
    setResultText(
      depthChartSummary,
      t("graphs.depth.summary", {
        total: formatNumber(depthSeries.totalToken, { maximumFractionDigits: 6 }),
        currency,
        receive: totalReceiveLabel,
        filled: formatNumber(simulation.filledToken, { maximumFractionDigits: 6 }),
      })
    );
  }
}

const scheduleChartsUpdate = (payload, { immediate = false } = {}) => {
  pendingChartPayload = payload;
  if (immediate) {
    if (chartUpdateTimer) {
      clearTimeout(chartUpdateTimer);
      chartUpdateTimer = null;
    }
    renderCharts(payload);
    return;
  }
  if (chartUpdateTimer) {
    return;
  }
  chartUpdateTimer = setTimeout(() => {
    chartUpdateTimer = null;
    renderCharts(pendingChartPayload);
  }, 120);
};

const validateInputs = ({ currencyResult, issuer, amount, limit }) => {
  const errors = {};

  const currency = currencyResult?.currencyNormalized || "";
  const currencyError = getCurrencyErrorMessage(currencyResult);
  if (currencyError) {
    errors.currency = currencyError;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = t("errors.amount_required");
  }

  if (!errors.currency && currency !== "XRP") {
    if (!issuer) {
      errors.issuer = t("errors.issuer_required");
    } else {
      const issuerLooksValid = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(issuer);
      if (!issuerLooksValid) {
        errors.issuer = t("errors.issuer_invalid");
      }
    }
  }

  let normalizedLimit = limit;
  let limitWasAutofixed = false;

  if (limit !== null && limit !== undefined && limit !== "") {
    if (!Number.isFinite(limit) || limit <= 0) {
      errors.limit = t("errors.limit_invalid");
      normalizedLimit = DEFAULT_LIMIT;
      limitWasAutofixed = true;
    }
  } else {
    normalizedLimit = DEFAULT_LIMIT;
  }

  return {
    errors,
    normalizedLimit,
    limitWasAutofixed,
  };
};

const bindFieldClear = (input, key) => {
  if (!input) {
    return;
  }
  input.addEventListener("input", () => {
    setFieldError(key, null);
    if (key === "limit") {
      setLimitNote(null);
    }
  });
};

bindFieldClear(currencyInput, "currency");
bindFieldClear(issuerInput, "issuer");
bindFieldClear(amountInput, "amount");
bindFieldClear(limitInput, "limit");
updateMaxSellLabel(getImpactThresholdPct());
updateImpactThresholdHelp(getImpactThresholdPct());
updateLiquiditySplitLabel(getImpactThresholdPct());

const initFiatSelection = () => {
  if (!fiatCurrencySelect) {
    return;
  }
  try {
    const stored = localStorage.getItem(FIAT_STORAGE_KEY);
    const preferred = stored || DEFAULT_FIAT;
    if (preferred) {
      fiatCurrencySelect.value = preferred;
    }
  } catch (error) {
    fiatCurrencySelect.value = DEFAULT_FIAT;
  }
};

initFiatSelection();
applyShareParamsFromUrl();
if (currencyInput && !currencyInput.value) {
  currencyInput.value = "";
}
if (issuerInput && !issuerInput.value) {
  issuerInput.value = "";
}

const resetInputs = () => {
  if (tokenSuggestionInput) {
    tokenSuggestionInput.value = "";
  }
  if (currencyInput) {
    currencyInput.value = "";
  }
  if (issuerInput) {
    issuerInput.value = "";
  }
  if (amountInput) {
    amountInput.value = "";
  }
  if (limitInput) {
    limitInput.value = String(DEFAULT_LIMIT);
  }
  if (impactThresholdSelect) {
    impactThresholdSelect.value = "5";
  }
  if (thinCutoffInput) {
    thinCutoffInput.value = String(DEFAULT_THIN_CUTOFF_PERCENT);
  }
  if (fiatCurrencySelect) {
    fiatCurrencySelect.value = DEFAULT_FIAT;
    try {
      localStorage.setItem(FIAT_STORAGE_KEY, DEFAULT_FIAT);
    } catch (error) {
      // Ignore storage failures.
    }
  }
  clearFieldErrors();
  setLimitNote(null);
  setError(null);
  setEndpointNotice(null);
  setShareLoadNote(false);
  showShareToast(null);
  setExampleStatus("");
  resetResults();
  setStatus("status.waiting");
  clearShareParams();
};

resetButton?.addEventListener("click", () => {
  resetInputs();
});

const handleShareInputChange = () => {
  setShareLoadNote(false);
  scheduleShareUrlUpdate();
};

const initTokenSuggestions = async () => {
  if (!tokenSuggestionInput || !tokenSuggestionList) {
    return;
  }
  recentTokenSuggestions = loadRecentTokenSuggestions();

  try {
    const response = await fetch(TOKEN_PRESETS_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Token presets not available");
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("Token presets invalid");
    }
    presetTokenSuggestions = payload
      .map(normalizePresetToken)
      .filter((token) => token && token.currency && token.issuer);
  } catch (error) {
    presetTokenSuggestions = [];
  }
  renderTokenSuggestionOptions();

  const handleSuggestionInput = () => {
    const value = tokenSuggestionInput.value.trim();
    if (!value) {
      return;
    }
    const token = tokenSuggestionIndex.get(value);
    if (!token) {
      return;
    }
    applyTokenSuggestion(token);
  };

  tokenSuggestionInput.addEventListener("input", handleSuggestionInput);
  tokenSuggestionInput.addEventListener("change", handleSuggestionInput);
};

void initTokenSuggestions();

currencyInput?.addEventListener("input", handleShareInputChange);
issuerInput?.addEventListener("input", handleShareInputChange);
amountInput?.addEventListener("input", handleShareInputChange);
limitInput?.addEventListener("input", handleShareInputChange);
thinCutoffInput?.addEventListener("input", handleShareInputChange);

fiatCurrencySelect?.addEventListener("change", () => {
  if (fiatCurrencySelect) {
    try {
      localStorage.setItem(FIAT_STORAGE_KEY, fiatCurrencySelect.value);
    } catch (error) {
      // Ignore storage failures.
    }
  }
  if (!lastReceiveXrp) {
    return;
  }
  setResultText(
    resultReceive,
    t("results.receive.with_fiat", {
      amount: formatNumber(lastReceiveXrp, { maximumFractionDigits: 6 }),
      fiat: t("results.receive.fiat_loading"),
    })
  );
  setResultText(resultFiatRate, t("results.receive.fiat_pending"));
  setFiatWarning(null);
  void refreshFiatEstimate(lastReceiveXrp);
  if (lastDisplaySimulation) {
    void updateMaxSellResults({
      offers: lastSortedOffers,
      thresholdPct: getImpactThresholdPct(),
      referencePrice: lastBestPrice,
      currency: lastCurrency,
      result: lastDisplayMaxSellResult,
      venue: lastUsedVenue,
      ammReserves: lastAmmReserves,
    });
  }
  setShareLoadNote(false);
  scheduleShareUrlUpdate();
});

impactThresholdSelect?.addEventListener("change", () => {
  const thresholdPct = getImpactThresholdPct();
  updateMaxSellLabel(thresholdPct);
  updateImpactThresholdHelp(thresholdPct);
  updateLiquiditySplitLabel(thresholdPct);
  if (!lastSortedOffers || !lastDisplaySimulation) {
    return;
  }
  const result = computeMaxSellUnderThreshold({
    offers: lastSortedOffers,
    thresholdPct,
    referencePrice: lastBestPrice,
  });
  lastMaxSellResult = result;
  let ammMaxSellResult = null;
  if (lastAmmReserves) {
    ammMaxSellResult = buildAmmMaxSellResult({
      reserves: lastAmmReserves,
      thresholdPct,
    });
    lastAmmMaxSellResult = ammMaxSellResult;
    lastAmmMaxSell =
      ammMaxSellResult?.status === "available" ? ammMaxSellResult.maxSellAmount : 0;
  } else {
    lastAmmMaxSellResult = null;
    lastAmmMaxSell = 0;
  }
  lastDisplayMaxSellResult =
    lastUsedVenue === VENUE_AMM ? ammMaxSellResult : result;
  void updateMaxSellResults({
    offers: lastSortedOffers,
    thresholdPct,
    referencePrice: lastBestPrice,
    currency: lastCurrency,
    result: lastDisplayMaxSellResult,
    venue: lastUsedVenue,
    ammReserves: lastAmmReserves,
  });
  scheduleChartsUpdate({
    offers: lastSortedOffers,
    simulation: lastDisplaySimulation,
    maxSellResult: lastDisplayMaxSellResult,
    currency: lastCurrency,
    venue: lastUsedVenue,
    ammReserves: lastAmmReserves,
  });
  updateLiquidityBreakdown({ thresholdPct });
  setShareLoadNote(false);
  scheduleShareUrlUpdate();
});

tryExampleButton?.addEventListener("click", () => {
  const runExampleLookup = async () => {
    if (!tryExampleButton) {
      return;
    }
    tryExampleButton.disabled = true;
    setError(null);
    setExampleStatus(null);

    const { candidate, attempts } = await findExampleCandidate();
    if (!candidate) {
      const summary = buildExampleAttemptSummary(attempts);
      updateDebugPanel({
        responseStatus: "fail",
        requestPayload: attempts.map((attempt) => ({
          currency: attempt.candidate.currency,
          issuer: attempt.candidate.issuer,
          offersCount: attempt.offersCount ?? null,
          error: attempt.error ? attempt.error.message : null,
        })),
        error: summary || "examples_unavailable",
        offersCount: null,
      });
      const unavailableMessage = t("status.examples_unavailable");
      setExampleStatus(unavailableMessage);
      setError(unavailableMessage);
      return;
    }

    if (currencyInput) {
      currencyInput.value = candidate.currency;
    }
    if (issuerInput) {
      issuerInput.value = candidate.issuer;
    }
    if (amountInput) {
      amountInput.value = "1000";
    }
    saveRecentTokenSuggestion({
      currency: candidate.currency,
      issuer: candidate.issuer,
      label: findPresetLabel(candidate),
    });
    clearFieldErrors();
    setError(null);
    setExampleStatus(t("status.example_selected", { label: buildExampleLabel(candidate) }));
    setShareLoadNote(false);
    scheduleShareUrlUpdate({ immediate: true });
    estimateButton?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  void runExampleLookup().finally(() => {
    if (tryExampleButton) {
      tryExampleButton.disabled = false;
    }
  });
});

copyLinkButton?.addEventListener("click", async () => {
  scheduleShareUrlUpdate({ immediate: true });
  const success = await copyToClipboard(window.location.href);
  showShareToast(t(success ? "status.copy_success" : "status.copy_failed"));
});

debugCopyButton?.addEventListener("click", async () => {
  if (!isDebugEnabled) {
    return;
  }
  const success = await copyToClipboard(buildDebugText());
  if (debugCopyStatus) {
    debugCopyStatus.textContent = success ? "Debug copied." : "Failed to copy debug.";
    debugCopyStatus.hidden = false;
  }
});

estimateButton?.addEventListener("click", async () => {
  if (estimateButton?.disabled) {
    return;
  }
  setEstimateButtonBusy(true);
  const estimateStart = performance.now();
  const currencyResult = normalizeCurrencyInput(currencyInput?.value ?? "");
  const currency = currencyResult.currencyNormalized || "";
  const issuer = issuerInput?.value?.trim() || "";

  // xrp_not_supported_ui: XRP alone is not a valid target in this tool
  if (String(currency).trim().toUpperCase() === "XRP" && !String(issuer).trim()) {
    showApiError({ code: "xrp_not_supported" });
    setEstimateButtonBusy(false);
    return;
  }

  const amountValue = amountInput?.value ? Number(amountInput.value) : 0;
  const limitValue =
    limitInput?.value === "" || limitInput?.value === undefined
      ? ""
      : Number(limitInput?.value);

  try {
    setStatus("status.validating");
    setError(null);
    setEndpointNotice(null);
    clearFieldErrors();
    resetResults();
    if (debugCopyStatus) {
      debugCopyStatus.hidden = true;
    }
    updateDebugPanel({
      requestPayload: {
        currencyInput: currencyResult.currencyInput ?? "",
        currencyNormalized: currency,
        currencyKind: currencyResult.kind ?? null,
        issuer,
        limit: limitValue,
      },
      responseStatus: "validating",
      endpointUsed: null,
      upstreamStatus: null,
      offersCount: null,
      clobMax: null,
      ammMax: null,
      clobSharePct: null,
      venue: null,
      venueReason: null,
      error: null,
      elapsedMs: null,
      rawResponse: null,
      timestamp: new Date().toISOString(),
    });

    const validateStart = performance.now();
    const { errors, normalizedLimit, limitWasAutofixed } = validateInputs({
      currencyResult,
      issuer,
      amount: amountValue,
      limit: limitValue,
    });
    const validateMs = performance.now() - validateStart;
    updateDebugPanel({
      timings: {
        validateMs,
      },
    });

    Object.entries(errors).forEach(([key, message]) => {
      if (message) {
        setFieldError(key, message);
      }
    });

    if (limitWasAutofixed) {
      if (limitInput) {
        limitInput.value = String(DEFAULT_LIMIT);
      }
      setLimitNote(t("notes.limit_autofix", { limit: DEFAULT_LIMIT }));
    }

    if (Object.keys(errors).length > 0) {
      setStatus("status.validation_failed");
      updateDebugPanel({
        responseStatus: "fail",
        error: "validation_failed",
        offersCount: null,
        elapsedMs: performance.now() - estimateStart,
      });
      return;
    }

    saveRecentTokenSuggestion({
      currency,
      issuer,
      label: findPresetLabel({ currency, issuer }),
    });
    setStatus("status.fetching_clob");
    const requestTimestamp = Date.now();
    const requestPayload = {
      currency,
      issuer,
      limit: normalizedLimit,
    };
    const shouldFetchAmm = currency !== "XRP" && Boolean(issuer);
    const clobPromise = fetchBookOffers({
      currency,
      issuer,
      limit: normalizedLimit,
    });
    const requestUrl = buildBookOffersUrl(requestPayload);
    var fetchStart = performance.now();
    updateDebugPanel({
      lastRequestTime: formatTime(requestTimestamp),
      lastRequestUrl: requestUrl,
      requestPayload: {
        currencyInput: currencyResult.currencyInput ?? "",
        currencyNormalized: currency,
        currencyKind: currencyResult.kind ?? null,
        issuer,
        limit: normalizedLimit,
      },
      responseStatus: "pending",
      endpointUsed: null,
      upstreamStatus: null,
      error: null,
      rawResponse: null,
      offersCount: null,
    });

    const { offers, endpointIndex, attemptedEndpoints, debugInfo } = await clobPromise;
    let ammInfo = null;
    if (shouldFetchAmm) {
      setStatus("status.fetching_amm");
      try {
        ammInfo = await fetchAmmInfo({ currency, issuer });
      } catch (error) {
        ammInfo = { ok: false, error: "fetch_failed", fetchError: error };
      }
    }

    currentEndpointIndex = endpointIndex;
    const endpointLabel = t(ORDERBOOK_API_ENDPOINT.labelKey);
    lastFetchedAt = Date.now();
    lastEndpointLabel = endpointLabel;
    setResultText(
      resultDataFetched,
      t("results.freshness.fetched_at", {
        time: formatTime(lastFetchedAt),
      })
    );
    setResultText(
      resultEndpoint,
      t("results.freshness.endpoint", {
        endpointLabel,
      })
    );

    setEndpointNotice(
      t("status.endpoint_in_use", {
        endpointLabel,
      })
    );

    setStatus("status.simulating");

    const sortedOffers = sortOffersByPrice(offers);
    const bestPrice = sortedOffers.find((offer) => offer.price > 0)?.price ?? 0;
    const worstPrice =
      sortedOffers.length > 0
        ? sortedOffers[sortedOffers.length - 1]?.price ?? 0
        : 0;
    const clobSimulation = simulateSellIntoOrderbook({
      sellAmount: amountValue,
      offers: sortedOffers,
    });
    const thresholdPct = getImpactThresholdPct();
    const maxSellResult = computeMaxSellUnderThreshold({
      offers: sortedOffers,
      thresholdPct,
      referencePrice: bestPrice,
    });
    lastMaxSellResult = maxSellResult;
    lastShouldFetchAmm = shouldFetchAmm;
    const ammReserves =
      shouldFetchAmm && ammInfo?.ok
        ? parseAmmReserves({ amm: ammInfo?.amm, currency, issuer })
        : null;
    lastAmmReserves = ammReserves;
    lastAmmAvailable = Boolean(ammReserves);
    const clobMax =
      maxSellResult?.status === "available" ? maxSellResult.maxSellAmount : 0;
    const clobSlippagePct = computeClobSlippagePct({
      simulation: clobSimulation,
      bestPrice,
    });
    const clobCanFill = canClobFillWithinSlippage({
      simulation: clobSimulation,
      bestPrice,
      thresholdPct,
    });
    let ammMax = 0;
    let ammSimulation = null;
    let ammMaxSellResult = null;
    if (ammReserves) {
      ammMaxSellResult = buildAmmMaxSellResult({
        reserves: ammReserves,
        thresholdPct,
      });
      lastAmmMaxSellResult = ammMaxSellResult;
      ammMax =
        ammMaxSellResult?.status === "available" ? ammMaxSellResult.maxSellAmount : 0;
      lastAmmMaxSell = ammMax;
      ammSimulation = simulateSellIntoAmm({
        sellAmount: amountValue,
        reserves: ammReserves,
      });
    } else {
      lastAmmMaxSell = 0;
      lastAmmMaxSellResult = null;
    }
    const thinCutoffPct = getThinCutoffPct();
    const decision = decideVenue({
      clobMax,
      ammMax,
      hasAmm: lastAmmAvailable,
      thinCutoffPct,
      clobCanFill,
    });
    let chosenVenue = decision.venue;
    let venueReason = decision.reason;
    let clobSharePct = decision.clobSharePct;
    let displaySimulation = clobSimulation;
    let displaySlippagePct = clobSlippagePct;
    if (chosenVenue === VENUE_AMM) {
      if (ammSimulation?.ok) {
        displaySimulation = {
          filledToken: amountValue,
          requestedToken: amountValue,
          fillRate: 1,
          fillRatePct: 100,
          receiveXrp: ammSimulation.receivedXrp,
          effectivePrice: ammSimulation.avgPrice,
          topConsumedOffersCount: 0,
        };
        displaySlippagePct = ammSimulation.slippagePct ?? null;
      } else {
        chosenVenue = VENUE_CLOB;
        venueReason = "AMM calc failed; falling back to CLOB.";
        displaySimulation = clobSimulation;
        displaySlippagePct = clobSlippagePct;
        clobSharePct = lastAmmAvailable ? clobSharePct : 100;
      }
    }

    setUsedVenue(chosenVenue);
    lastUsedVenue = chosenVenue;
    lastDisplaySimulation = displaySimulation;
    const displayMaxSellResult =
      chosenVenue === VENUE_AMM ? ammMaxSellResult : maxSellResult;
    lastDisplayMaxSellResult = displayMaxSellResult;
    setStatus("status.rendering");
    updateResultsSummary({
      simulation: displaySimulation,
      bestPrice,
      offersCount: sortedOffers.length,
      venue: chosenVenue,
      slippagePct: displaySlippagePct,
    });
    updateExecutionDetails({
      offers: sortedOffers,
      bestPrice,
      worstPrice,
      attemptedEndpoints,
    });
    void refreshFiatEstimate(displaySimulation.receiveXrp);
    lastSortedOffers = sortedOffers;
    lastOffersHash = getOffersHash(sortedOffers);
    lastBestPrice = bestPrice;
    lastCurrency = currency;
    lastSimulation = clobSimulation;
    void updateMaxSellResults({
      offers: sortedOffers,
      thresholdPct,
      referencePrice: bestPrice,
      currency,
      result: displayMaxSellResult,
      venue: chosenVenue,
      ammReserves: lastAmmReserves,
    });
    scheduleChartsUpdate(
      {
        offers: sortedOffers,
        simulation: displaySimulation,
        maxSellResult: displayMaxSellResult,
        currency,
        venue: chosenVenue,
        ammReserves: lastAmmReserves,
      },
      { immediate: true }
    );
    updateLiquidityBreakdown({ thresholdPct, currency });

    updateDebugPanel({
      responseStatus: "success",
      endpointUsed: debugInfo?.endpointUsed ?? null,
      upstreamStatus: debugInfo?.statusCode ?? null,
      clobMax,
      ammMax,
      clobSharePct,
      venue: chosenVenue,
      venueReason,
      error: null,
      rawResponse: debugInfo?.rawResponse ?? null,
      offersCount: sortedOffers.length,
      elapsedMs: performance.now() - fetchStart,
      timings: {
        networkMs: debugInfo?.timings?.networkMs ?? null,
        parseMs: debugInfo?.timings?.parseMs ?? null,
      },
    });
    setStatus("status.done");
  } catch (error) {
    const errorCode = error?.code || "default";
    showApiError({
      code: errorCode,
      message: error?.message || null,
    });
    setError(null);
    updateDebugPanel({
      responseStatus: "fail",
      endpointUsed: error?.debugInfo?.endpointUsed ?? null,
      upstreamStatus: error?.debugInfo?.statusCode ?? null,
      clobMax: null,
      ammMax: null,
      clobSharePct: null,
      venue: null,
      venueReason: null,
      error: `${errorCode}: ${error?.message || "Request failed"}`,
      rawResponse: error?.debugInfo?.rawResponse ?? null,
      offersCount: null,
      elapsedMs: performance.now() - fetchStart,
      timings: {
        networkMs: error?.debugInfo?.timings?.networkMs ?? null,
        parseMs: error?.debugInfo?.timings?.parseMs ?? null,
      },
    });
    resetResults();
    setResultText(
      resultSellability,
      t("results.sellability.error", { code: errorCode })
    );
  } finally {
    setEstimateButtonBusy(false);
  }
});
