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
const statusDebugLine = document.querySelector(".status-debug");
const statusEndpointLine = document.querySelector(".status-endpoint");
const errorBanner = document.querySelector(".error-banner");
const estimateButton = document.querySelector(".primary-button");
const currencyInput = document.querySelector("#token-input");
const issuerInput = document.querySelector("#issuer-input");
const amountInput = document.querySelector("#sell-amount-input");

let currentEndpointIndex = 0;
let lastOffersCount = null;

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

const setDebugLine = (count, endpointLabel) => {
  if (!statusDebugLine) {
    return;
  }

  if (count === null || count === undefined) {
    statusDebugLine.textContent = "";
    return;
  }

  statusDebugLine.textContent = t("status.fetched_offers", {
    count,
    endpointLabel,
  });
};

const setEndpointNotice = (message) => {
  if (!statusEndpointLine) {
    return;
  }

  statusEndpointLine.textContent = message || "";
  statusEndpointLine.hidden = !message;
};

const normalizeOffers = (offers) => {
  if (!Array.isArray(offers)) {
    return [];
  }

  return offers.map((offer) => ({
    account: offer?.Account ?? offer?.account ?? null,
    takerGets: offer?.taker_gets ?? null,
    takerPays: offer?.taker_pays ?? null,
    quality: offer?.quality ?? null,
  }));
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

    lastOffersCount = offers.length;
    setDebugLine(lastOffersCount, endpointLabel);
    setStatus("status.done");
  } catch (error) {
    setStatus("status.error");
    setError(t("errors.fetch_failed"));
    if (lastOffersCount !== null) {
      const endpointLabel = t(ENDPOINTS[currentEndpointIndex].labelKey);
      setDebugLine(lastOffersCount, endpointLabel);
      setEndpointNotice(
        t("status.endpoint_in_use", {
          endpointLabel,
        })
      );
    }
  }
});
