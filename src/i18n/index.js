export const DEFAULT_LANG = "en";
export const SUPPORTED_LANGS = new Set(["en", "ja"]);
export const LANG_STORAGE_KEY = "xsic.lang";

const dictionaries = {};
let currentLang = DEFAULT_LANG;

export const normalizeLang = (value) => {
  if (!value) {
    return null;
  }
  const trimmed = String(value).trim().toLowerCase();
  return SUPPORTED_LANGS.has(trimmed) ? trimmed : null;
};

export const getStoredLang = () => {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY);
  } catch (error) {
    return null;
  }
};

export const storeLang = (lang) => {
  const normalized = normalizeLang(lang);
  if (!normalized) {
    return;
  }
  try {
    localStorage.setItem(LANG_STORAGE_KEY, normalized);
  } catch (error) {
    // Ignore storage failures.
  }
};

const resolveNavigatorLang = () => {
  const raw =
    (Array.isArray(navigator.languages) && navigator.languages[0]) ||
    navigator.language ||
    "";
  const normalized = String(raw).toLowerCase();
  return normalized.startsWith("ja") ? "ja" : DEFAULT_LANG;
};

export const resolvePreferredLang = () => {
  const params = new URLSearchParams(window.location.search);
  const paramLang = normalizeLang(params.get("lang"));
  if (paramLang) {
    return paramLang;
  }

  const storedLang = normalizeLang(getStoredLang());
  if (storedLang) {
    return storedLang;
  }

  return resolveNavigatorLang();
};

const findValue = (dictionary, key) => {
  if (!dictionary || !key) {
    return undefined;
  }

  return key.split(".").reduce((value, segment) => {
    if (value && typeof value === "object" && segment in value) {
      return value[segment];
    }
    return undefined;
  }, dictionary);
};

const interpolate = (template, params = {}) =>
  template.replace(/\{(\w+)\}/g, (match, token) =>
    token in params ? String(params[token]) : match
  );

export const getActiveLang = () =>
  normalizeLang(document.documentElement.lang) || currentLang || DEFAULT_LANG;

export const setActiveLang = (lang) => {
  const normalized = normalizeLang(lang);
  if (!normalized) {
    return null;
  }
  currentLang = normalized;
  document.documentElement.lang = normalized;
  return normalized;
};

export const getTranslationOrFallback = (key, fallback = "…") => {
  const value = t(key);
  if (!value || value.startsWith("[[")) {
    return fallback;
  }
  return value;
};

export const t = (key, params, { lang } = {}) => {
  const resolvedLang = normalizeLang(lang) || getActiveLang() || DEFAULT_LANG;
  const dictionary = dictionaries[resolvedLang];
  const fallbackDictionary = dictionaries[DEFAULT_LANG];
  const value =
    findValue(dictionary, key) ?? findValue(fallbackDictionary, key);

  if (typeof value !== "string") {
    return `[[${key}]]`;
  }

  if (!params) {
    return value;
  }

  return interpolate(value, params);
};

const fetchDictionary = async (lang) => {
  if (dictionaries[lang]) {
    return dictionaries[lang];
  }
  const url = new URL(`./${lang}.json`, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load dictionary (${response.status})`);
  }
  const data = await response.json();
  dictionaries[lang] = data;
  return data;
};

export const loadDictionary = async (lang = getActiveLang()) => {
  const normalized = normalizeLang(lang) || DEFAULT_LANG;
  try {
    await fetchDictionary(normalized);
    return normalized;
  } catch (error) {
    if (normalized !== DEFAULT_LANG) {
      await fetchDictionary(DEFAULT_LANG);
      return DEFAULT_LANG;
    }
    throw error;
  }
};

export const applyTranslations = (root = document) => {
  if (!root) {
    return;
  }

  root.querySelectorAll("[data-i18n]").forEach((element) => {
    const { i18n } = element.dataset;
    const fallback = element.textContent || "";
    element.textContent = getTranslationOrFallback(i18n, fallback);
  });

  root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    if ("placeholder" in element) {
      element.placeholder = getTranslationOrFallback(
        key,
        element.getAttribute("placeholder") || ""
      );
    }
  });

  root.querySelectorAll("[data-i18n-value]").forEach((element) => {
    const key = element.dataset.i18nValue;
    if ("value" in element) {
      element.value = getTranslationOrFallback(
        key,
        element.getAttribute("value") || ""
      );
    }
  });

  root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    const key = element.dataset.i18nAriaLabel;
    element.setAttribute(
      "aria-label",
      getTranslationOrFallback(key, element.getAttribute("aria-label") || "")
    );
  });

  root.querySelectorAll("[data-i18n-content]").forEach((element) => {
    const key = element.dataset.i18nContent;
    const fallback = element.getAttribute("content") || "";
    element.setAttribute("content", getTranslationOrFallback(key, fallback));
  });
};

export const updateUrlLanguageParam = (lang) => {
  const normalized = normalizeLang(lang);
  const url = new URL(window.location.href);
  if (normalized) {
    url.searchParams.set("lang", normalized);
  } else {
    url.searchParams.delete("lang");
  }
  history.replaceState(null, "", url);
};

export const bindLanguageSwitcher = ({ onChange, updateUrl = true } = {}) => {
  const buttons = Array.from(document.querySelectorAll("[data-lang-switch]"));
  if (buttons.length === 0) {
    return null;
  }

  const syncButtons = () => {
    const activeLang = getActiveLang();
    buttons.forEach((button) => {
      const buttonLang = normalizeLang(button.dataset.langSwitch);
      const isActive = buttonLang === activeLang;
      button.classList.toggle("lang-switch__button--active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  };

  const handleClick = async (event) => {
    const button = event.currentTarget;
    const nextLang = normalizeLang(button?.dataset?.langSwitch);
    if (!nextLang || nextLang === getActiveLang()) {
      return;
    }
    setActiveLang(nextLang);
    storeLang(nextLang);
    await loadDictionary(nextLang);
    applyTranslations();
    if (updateUrl) {
      updateUrlLanguageParam(nextLang);
    }
    syncButtons();
    if (typeof onChange === "function") {
      onChange(nextLang);
    }
  };

  buttons.forEach((button) => {
    button.addEventListener("click", handleClick);
  });

  syncButtons();
  return { syncButtons };
};
