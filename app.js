import { t } from "./src/i18n/index.js";

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
const estimateButton = document.querySelector(".primary-button");

estimateButton?.addEventListener("click", () => {
  if (statusLine) {
    statusLine.textContent = t("status.queuedAt", {
      time: new Date().toLocaleTimeString(),
    });
  }
});
