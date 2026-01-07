import { t } from "./src/i18n/index.js";

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

const applyTranslations = () => {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const { i18n } = element.dataset;
    element.textContent = t(i18n);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    if ("placeholder" in element) {
      element.placeholder = t(key);
    }
  });

  document.querySelectorAll("[data-i18n-value]").forEach((element) => {
    const key = element.dataset.i18nValue;
    if ("value" in element) {
      element.value = t(key);
    }
  });
};

applyTranslations();

const statusLine = document.querySelector(".status");
const statusEndpointLine = document.querySelector(".status-endpoint");
const errorBanner = document.querySelector(".error-banner");
const estimateButton = document.querySelector(".primary-button");
const currencyInput = document.querySelector("#token-input");
const issuerInput = document.querySelector("#issuer-input");
const amountInput = document.querySelector("#sell-amount-input");
const resultSellability = document.querySelector('[data-result="sellability"]');
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

const formatNumber = (value, options = {}) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
    ...options,
  }).format(value);

const formatPercent = (value) =>
  `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}%`;

const setResultText = (element, text) => {
  if (element) {
    element.textContent = text;
  }
};

const resetResults = () => {
  const placeholder = t("common.placeholder");
  setResultText(resultSellability, placeholder);
  setResultText(resultReceive, placeholder);
  setResultText(resultSlippage, placeholder);
  setResultText(resultSlippageHelp, t("results.slippage.help"));
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
  const effectivePrice = filledToken > 0 ? receiveXrp / filledToken : 0;

  return {
    filledToken,
    requestedToken,
    fillRate,
    receiveXrp,
    effectivePrice,
    topConsumedOffersCount,
  };
};

const updateResultsSummary = ({ simulation, bestPrice, currency }) => {
  const hasLiquidity = simulation.filledToken > 0;
  const isFullFill = hasLiquidity && simulation.filledToken >= simulation.requestedToken;
  const isPartialFill =
    hasLiquidity && simulation.filledToken < simulation.requestedToken;

  if (!hasLiquidity) {
    setResultText(resultSellability, t("results.sellability.none"));
  } else if (isPartialFill) {
    setResultText(
      resultSellability,
      t("results.sellability.partial_value", {
        filled: formatNumber(simulation.filledToken),
        requested: formatNumber(simulation.requestedToken),
        currency,
      })
    );
  } else {
    setResultText(resultSellability, t("results.sellability.full"));
  }

  if (resultWarning) {
    if (isPartialFill) {
      resultWarning.textContent = t("results.sellability.partial_warning");
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
    const slippagePct = ((bestPrice - simulation.effectivePrice) / bestPrice) * 100;
    setResultText(resultSlippage, formatPercent(slippagePct));
  } else {
    setResultText(resultSlippage, t("common.not_available"));
  }

  setResultText(resultSlippageHelp, t("results.slippage.help"));
  setResultText(
    resultWhyLine,
    t("results.why_line", { count: simulation.topConsumedOffersCount })
  );
};

const validateInputs = ({ currency, issuer, amount }) => {
  if (!currency) {
    return t("errors.currency_required");
  }

  const isHexCurrency = /^[a-fA-F0-9]{40}$/.test(currency);
  const isShortCurrency = /^[A-Za-z0-9]{3}$/.test(currency);

  if (!isHexCurrency && !isShortCurrency) {
    return t("errors.currency_invalid");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return t("errors.amount_required");
  }

  if (currency !== "XRP") {
    if (!issuer) {
      return t("errors.issuer_required");
    }
    const issuerLooksValid = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(issuer);
    if (!issuerLooksValid) {
      return t("errors.issuer_invalid");
    }
  }

  return null;
};

estimateButton?.addEventListener("click", async () => {
  const currencyRaw = currencyInput?.value?.trim() || "";
  const currency = currencyRaw.toUpperCase();
  const issuer = issuerInput?.value?.trim() || "";
  const amountValue = amountInput?.value ? Number(amountInput.value) : 0;

  setStatus("status.validating");
  setError(null);
  setEndpointNotice(null);
  resetResults();

  const validationError = validateInputs({ currency, issuer, amount: amountValue });
  if (validationError) {
    setStatus("status.validation_failed");
    setError(validationError);
    return;
  }

  setStatus("status.fetching");

  try {
    const previousEndpointIndex = currentEndpointIndex;
    const { offers, endpointIndex } = await fetchBookOffers({
      currency,
      issuer,
      amount: amountValue,
      limit: DEFAULT_LIMIT,
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
      currency,
    });

    setStatus("status.done");
  } catch (error) {
    setStatus("status.error");
    setError(t("errors.fetch_failed"));
    resetResults();
  }
});
