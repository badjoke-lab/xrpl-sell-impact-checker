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
  void initI18n();
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
const limitNote = document.querySelector("#limit-note");
const fieldErrors = {
  currency: document.querySelector('[data-error-for="currency"]'),
  issuer: document.querySelector('[data-error-for="issuer"]'),
  amount: document.querySelector('[data-error-for="amount"]'),
  limit: document.querySelector('[data-error-for="limit"]'),
};
const resultSellability = document.querySelector('[data-result="sellability"]');
const resultFilledLine = document.querySelector('[data-result="filled-line"]');
const resultReceive = document.querySelector('[data-result="receive"]');
const resultSlippage = document.querySelector('[data-result="slippage"]');
const resultSlippageHelp = document.querySelector('[data-result="slippage-help"]');
const resultWhyLine = document.querySelector('[data-result="why"]');
const resultWarning = document.querySelector('[data-result="warning"]');

let currentEndpointIndex = 0;

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

const formatPercent = (
  value,
  { minimumFractionDigits = 1, maximumFractionDigits = 2 } = {}
) =>
  `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value)}%`;

const setResultText = (element, text) => {
  if (element) {
    element.textContent = text;
  }
};

const resetResults = () => {
  const placeholder = getTranslationOrFallback("common.placeholder", "…");
  setResultText(resultSellability, placeholder);
  setResultText(resultFilledLine, placeholder);
  setResultText(resultReceive, placeholder);
  setResultText(resultSlippage, placeholder);
  setResultText(resultSlippageHelp, getTranslationOrFallback("results.slippage.help"));
  setResultText(resultWhyLine, "");
  if (resultWarning) {
    resultWarning.hidden = true;
    resultWarning.textContent = "";
  }
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

  setResultText(
    resultReceive,
    t("results.receive.value", {
      amount: formatNumber(simulation.receiveXrp, {
        maximumFractionDigits: 6,
      }),
      currency: "XRP",
    })
  );

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
  estimateButton?.scrollIntoView({ behavior: "smooth", block: "center" });
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

    setStatus("status.done");
  } catch (error) {
    setStatus("status.error");
    setError(t("errors.fetch_failed"));
    resetResults();
  }
});
