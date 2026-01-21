import {
  applyTranslations,
  bindLanguageSwitcher,
  getActiveLang,
  loadDictionary,
  resolvePreferredLang,
  setActiveLang,
  storeLang,
} from "./index.js";

export const initI18nPage = async ({ updateUrl = true, onChange } = {}) => {
  const preferredLang = resolvePreferredLang();
  if (preferredLang) {
    setActiveLang(preferredLang);
    storeLang(preferredLang);
  }

  await loadDictionary(getActiveLang());
  applyTranslations();
  bindLanguageSwitcher({ onChange, updateUrl });
};
