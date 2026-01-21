import { initI18nPage } from "../src/i18n/page.js";
import { t } from "../src/i18n/index.js";

const i18nReady = initI18nPage();
const address = document.querySelector("#donation-address");
const copyButton = document.querySelector("#copy-donation");
const copyStatus = document.querySelector("#copy-status");

const setStatus = (key, isError = false) => {
  if (!copyStatus) {
    return;
  }
  copyStatus.textContent = t(key);
  copyStatus.classList.toggle("status--success", !isError);
  copyStatus.classList.toggle("status--notice", false);
  copyStatus.classList.toggle("error", isError);
};

const fallbackCopy = async (text) => {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const success = document.execCommand("copy");
  document.body.removeChild(textarea);
  return success;
};

const handleCopy = async () => {
  await i18nReady;
  if (!address) {
    setStatus("pages.donate.address_unavailable", true);
    return;
  }

  const text = address.textContent.trim();
  if (!text) {
    setStatus("pages.donate.address_unavailable", true);
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      setStatus("pages.donate.copy_success");
      return;
    }

    const success = await fallbackCopy(text);
    if (success) {
      setStatus("pages.donate.copy_success");
    } else {
      setStatus("pages.donate.copy_failed", true);
    }
  } catch (error) {
    setStatus("pages.donate.copy_failed", true);
  }
};

copyButton?.addEventListener("click", handleCopy);
