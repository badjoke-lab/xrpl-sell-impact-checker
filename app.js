import { loadDictionary, t } from "./src/i18n/index.js";

const ENDPOINTS = [
  {
    labelKey: "endpoints.primary.label",
    url: "https://s1.ripple.com:51234",
  },
  {
    labelKey: "endpoints.secondary.label",
    url: "https://s2.ripple.com:51234",
  },
];

const REQUEST_TIMEOUT_MS = 8000;
const RETRY_BACKOFF_MS = 400;
const DEFAULT_LIMIT = 50;
const FIAT_STORAGE_KEY = "fiat-currency";
const DEFAULT_FIAT = "USD";
const SHARE_URL_DEBOUNCE_MS = 200;
const MAX_AMOUNT = 1_000_000_000;
const LIMIT_MIN = 1;
const LIMIT_MAX = 200;
const THRESHOLD_VALUES = new Set([1, 2, 5, 10, 20]);
const FIAT_VALUES = new Set(["USD", "JPY"]);

const getTranslationOrFallback = (key, fallback = "…") => {
  const value = t(key);
  if (!value || value.startsWith("[[")) {
    return fallback;
  }
  return value;
};

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
const currencyInput = document.querySelector("#currency-input");
const issuerInput = document.querySelector("#issuer-input");
const amountInput = document.querySelector("#sell-amount-input");
const limitInput = document.querySelector("#limit-input");
const fiatCurrencySelect = document.querySelector("#fiat-currency-select");
const impactThresholdSelect = document.querySelector("#impact-threshold-select");
const limitNote = document.querySelector("#limit-note");
const copyLinkButton = document.querySelector("#copy-link");
const shareLoadNote = document.querySelector("#share-load-note");
const shareToast = document.querySelector("#share-toast");
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
const impactChart = document.querySelector("#impact-chart");
const depthChart = document.querySelector("#depth-chart");
const impactChartNote = document.querySelector('[data-result="impact-note"]');
const depthChartNote = document.querySelector('[data-result="depth-note"]');
const impactChartSummary = document.querySelector('[data-result="impact-summary"]');
const depthChartSummary = document.querySelector('[data-result="depth-summary"]');

let currentEndpointIndex = 0;
let lastReceiveXrp = 0;
let lastSortedOffers = null;
let lastBestPrice = 0;
let lastCurrency = "";
let lastFiatRate = null;
let lastSimulation = null;
let lastMaxSellResult = null;
let lastOffersHash = "";
let lastFetchedAt = null;
let lastEndpointLabel = "";
let chartUpdateTimer = null;
let pendingChartPayload = null;
let shareUrlTimer = null;
let shareToastTimer = null;
let isApplyingShareParams = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const setStatus = (key, params) => {
  if (statusLine) {
    statusLine.textContent = t(key, params);
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

const formatPercent = (
  value,
  { minimumFractionDigits = 1, maximumFractionDigits = 2 } = {}
) =>
  `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value)}%`;

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
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const upper = trimmed.toUpperCase();
  const isHexCurrency = /^[A-F0-9]{40}$/.test(upper);
  const isShortCurrency = /^[A-Z0-9]{3}$/.test(upper);
  if (!isHexCurrency && !isShortCurrency) {
    return null;
  }
  return upper;
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

const sanitizeFiat = (value) => {
  if (!value) {
    return null;
  }
  const upper = value.trim().toUpperCase();
  return FIAT_VALUES.has(upper) ? upper : null;
};

const setResultText = (element, text) => {
  if (element) {
    element.textContent = text;
  }
};

const getImpactThresholdPct = () => {
  const raw = impactThresholdSelect?.value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
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

const setShareLoadNote = (visible) => {
  if (!shareLoadNote) {
    return;
  }
  shareLoadNote.hidden = !visible;
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
    fiat,
  };
};

const buildShareParams = () => {
  const params = new URLSearchParams();
  const { currency, issuer, amount, limit, threshold, fiat } = getShareInputState();
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
  const thresholdParam = params.get("threshold");
  const fiatParam = params.get("fiat");

  const currency = currencyParam ? sanitizeCurrency(currencyParam) : null;
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

  const threshold = thresholdParam ? sanitizeThreshold(thresholdParam) : null;
  if (thresholdParam && !threshold) {
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
  if (currencyInput && currency) {
    currencyInput.value = currency;
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
  setResultText(resultReceive, placeholder);
  setResultText(resultSlippage, placeholder);
  setResultText(resultSlippageHelp, getTranslationOrFallback("results.slippage.help"));
  setResultText(resultWhyLine, "");
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
  lastOffersHash = "";
  lastFetchedAt = null;
  lastEndpointLabel = "";
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
    if (lastSortedOffers && lastSimulation) {
      scheduleChartsUpdate({
        offers: lastSortedOffers,
        simulation: lastSimulation,
        maxSellResult: lastMaxSellResult,
        currency: lastCurrency,
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
  if (lastSortedOffers && lastSimulation) {
    scheduleChartsUpdate({
      offers: lastSortedOffers,
      simulation: lastSimulation,
      maxSellResult: lastMaxSellResult,
      currency: lastCurrency,
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

const fetchWithTimeout = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Request timed out");
      timeoutError.code = "timeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const isRetryableError = (error, response) => {
  if (response?.status >= 500) {
    return true;
  }

  if (error?.code === "timeout") {
    return true;
  }

  return error instanceof TypeError;
};

const requestBookOffers = async ({ endpointUrl, payload }) => {
  const response = await fetchWithTimeout(
    endpointUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    REQUEST_TIMEOUT_MS
  );

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.response = response;
    throw error;
  }

  return response.json();
};

const requestWithRetry = async ({ endpointUrl, payload, attempts = 2 }) => {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await requestBookOffers({ endpointUrl, payload });
      return response;
    } catch (error) {
      const response = error?.response;
      lastError = error;
      if (attempt < attempts - 1 && isRetryableError(error, response)) {
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      throw error;
    }
  }

  throw lastError;
};

const fetchBookOffers = async ({ currency, issuer, amount, limit = DEFAULT_LIMIT }) => {
  const takerGets = currency === "XRP" ? "XRP" : { currency, issuer };
  const payload = {
    method: "book_offers",
    params: [
      {
        taker_gets: takerGets,
        taker_pays: "XRP",
        limit,
      },
    ],
  };

  let response = null;
  let endpointIndex = 0;

  try {
    response = await requestWithRetry({
      endpointUrl: ENDPOINTS[0].url,
      payload,
      attempts: 2,
    });
    endpointIndex = 0;
  } catch (error) {
    if (!isRetryableError(error, error?.response)) {
      throw error;
    }
    response = await requestWithRetry({
      endpointUrl: ENDPOINTS[1].url,
      payload,
      attempts: 1,
    });
    endpointIndex = 1;
  }

  const offers = normalizeOffers(response?.result?.offers);
  return {
    offers,
    endpointIndex,
  };
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

const impactSampleCache = new Map();

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
}) => {
  updateMaxSellLabel(thresholdPct);

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

const updateResultsSummary = ({ simulation, bestPrice }) => {
  const hasLiquidity = simulation.filledToken > 0;
  const isFullFill = hasLiquidity && simulation.filledToken >= simulation.requestedToken;
  const isPartialFill =
    hasLiquidity && simulation.filledToken < simulation.requestedToken;
  const filledLine = t("results.sellability.filled_line", {
    filled: formatNumber(simulation.filledToken),
    requested: formatNumber(simulation.requestedToken),
    pct: formatPercent(simulation.fillRatePct),
  });

  if (!hasLiquidity) {
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
    } else if (!hasLiquidity) {
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

  if (isFullFill && bestPrice > 0 && simulation.effectivePrice > 0) {
    const rawSlippagePct = ((bestPrice - simulation.effectivePrice) / bestPrice) * 100;
    const slippagePct = Math.max(0, rawSlippagePct);
    setResultText(resultSlippage, formatPercent(slippagePct));
    if (resultWarning && slippagePct >= 10) {
      resultWarning.textContent = t("results.warnings.high_slippage");
      resultWarning.hidden = false;
    }
  } else {
    setResultText(resultSlippage, t("common.not_available"));
  }

  setResultText(resultSlippageHelp, t("results.slippage.help"));
  setResultText(
    resultWhyLine,
    t("results.why_line", { count: simulation.topConsumedOffersCount })
  );
};

function setChartNote(element, message) {
  if (!element) {
    return;
  }
  element.textContent = message || "";
  element.hidden = !message;
}

function renderCharts({ offers, simulation, maxSellResult, currency }) {
  if (!impactChart || !depthChart) {
    return;
  }

  if (!offers || offers.length === 0 || !simulation) {
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
  const isPartial = simulation.filledToken < simulation.requestedToken;
  const receiveLabel = hasFiat
    ? formatFiatAmount(simulation.receiveXrp * rate, fiat)
    : t("graphs.impact.receive_xrp", {
        amount: formatNumber(simulation.receiveXrp, { maximumFractionDigits: 6 }),
      });

  const thresholdPct = getImpactThresholdPct();
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
  const { samples, totalLiquidity } = cachedSample;
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

  const depthSeries = buildDepthSeries({ offers });
  const consumedSeries = buildConsumedDepth({
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

const validateInputs = ({ currency, issuer, amount, limit }) => {
  const errors = {};

  if (!currency) {
    errors.currency = t("errors.currency_required");
  } else {
    const isHexCurrency = /^[a-fA-F0-9]{40}$/.test(currency);
    const isShortCurrency = /^[A-Za-z0-9]{3}$/.test(currency);

    if (!isHexCurrency && !isShortCurrency) {
      errors.currency = t("errors.currency_invalid");
    }
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

const handleShareInputChange = () => {
  setShareLoadNote(false);
  scheduleShareUrlUpdate();
};

currencyInput?.addEventListener("input", handleShareInputChange);
issuerInput?.addEventListener("input", handleShareInputChange);
amountInput?.addEventListener("input", handleShareInputChange);
limitInput?.addEventListener("input", handleShareInputChange);

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
  if (lastSortedOffers && lastBestPrice > 0) {
    void updateMaxSellResults({
      offers: lastSortedOffers,
      thresholdPct: getImpactThresholdPct(),
      referencePrice: lastBestPrice,
      currency: lastCurrency,
      result: lastMaxSellResult,
    });
  }
  setShareLoadNote(false);
  scheduleShareUrlUpdate();
});

impactThresholdSelect?.addEventListener("change", () => {
  const thresholdPct = getImpactThresholdPct();
  updateMaxSellLabel(thresholdPct);
  updateImpactThresholdHelp(thresholdPct);
  if (!lastSortedOffers || lastBestPrice <= 0 || !lastSimulation) {
    return;
  }
  const result = computeMaxSellUnderThreshold({
    offers: lastSortedOffers,
    thresholdPct,
    referencePrice: lastBestPrice,
  });
  lastMaxSellResult = result;
  void updateMaxSellResults({
    offers: lastSortedOffers,
    thresholdPct,
    referencePrice: lastBestPrice,
    currency: lastCurrency,
    result,
  });
  scheduleChartsUpdate({
    offers: lastSortedOffers,
    simulation: lastSimulation,
    maxSellResult: lastMaxSellResult,
    currency: lastCurrency,
  });
  setShareLoadNote(false);
  scheduleShareUrlUpdate();
});

tryExampleButton?.addEventListener("click", () => {
  if (currencyInput) {
    currencyInput.value = "DEM";
  }
  if (issuerInput) {
    issuerInput.value = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
  }
  if (amountInput) {
    amountInput.value = "1000";
  }
  clearFieldErrors();
  setError(null);
  setShareLoadNote(false);
  scheduleShareUrlUpdate({ immediate: true });
  estimateButton?.scrollIntoView({ behavior: "smooth", block: "center" });
});

copyLinkButton?.addEventListener("click", async () => {
  scheduleShareUrlUpdate({ immediate: true });
  const success = await copyToClipboard(window.location.href);
  showShareToast(t(success ? "status.copy_success" : "status.copy_failed"));
});

estimateButton?.addEventListener("click", async () => {
  const currencyRaw = currencyInput?.value?.trim() || "";
  const currency = currencyRaw.toUpperCase();
  const issuer = issuerInput?.value?.trim() || "";
  const amountValue = amountInput?.value ? Number(amountInput.value) : 0;
  const limitValue =
    limitInput?.value === "" || limitInput?.value === undefined
      ? ""
      : Number(limitInput?.value);

  setStatus("status.validating");
  setError(null);
  setEndpointNotice(null);
  clearFieldErrors();
  resetResults();

  const { errors, normalizedLimit, limitWasAutofixed } = validateInputs({
    currency,
    issuer,
    amount: amountValue,
    limit: limitValue,
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
    return;
  }

  setStatus("status.fetching");

  try {
    const previousEndpointIndex = currentEndpointIndex;
    const { offers, endpointIndex } = await fetchBookOffers({
      currency,
      issuer,
      amount: amountValue,
      limit: normalizedLimit,
    });

    currentEndpointIndex = endpointIndex;
    const endpointLabel = t(ENDPOINTS[endpointIndex].labelKey);
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

    const endpointNoticeKey =
      endpointIndex !== previousEndpointIndex
        ? "status.endpoint_switched"
        : "status.endpoint_in_use";

    setEndpointNotice(
      t(endpointNoticeKey, {
        endpointLabel,
      })
    );

    setStatus("status.simulating");

    const sortedOffers = sortOffersByPrice(offers);
    const bestPrice = sortedOffers.find((offer) => offer.price > 0)?.price ?? 0;
    const simulation = simulateSellIntoOrderbook({
      sellAmount: amountValue,
      offers: sortedOffers,
    });

    updateResultsSummary({
      simulation,
      bestPrice,
    });
    void refreshFiatEstimate(simulation.receiveXrp);
    lastSortedOffers = sortedOffers;
    lastOffersHash = getOffersHash(sortedOffers);
    lastBestPrice = bestPrice;
    lastCurrency = currency;
    lastSimulation = simulation;
    const maxSellResult = computeMaxSellUnderThreshold({
      offers: sortedOffers,
      thresholdPct: getImpactThresholdPct(),
      referencePrice: bestPrice,
    });
    lastMaxSellResult = maxSellResult;
    void updateMaxSellResults({
      offers: sortedOffers,
      thresholdPct: getImpactThresholdPct(),
      referencePrice: bestPrice,
      currency,
      result: maxSellResult,
    });
    scheduleChartsUpdate(
      {
        offers: sortedOffers,
        simulation,
        maxSellResult,
        currency,
      },
      { immediate: true }
    );

    setStatus("status.done");
  } catch (error) {
    setStatus("status.error");
    setError(t("errors.fetch_failed"));
    resetResults();
  }
});
