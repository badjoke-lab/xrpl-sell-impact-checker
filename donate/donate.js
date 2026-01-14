import copyToClipboard from "../shared/copyToClipboard.js";

const address = document.querySelector("#donation-address");
const copyButton = document.querySelector("#copy-donation");
const copyStatus = document.querySelector("#copy-status");

const setStatus = (message, isError = false) => {
  if (!copyStatus) {
    return;
  }
  copyStatus.textContent = message;
  copyStatus.classList.toggle("status--success", !isError);
  copyStatus.classList.toggle("status--notice", false);
  copyStatus.classList.toggle("error", isError);
};

const handleCopy = async () => {
  if (!address) {
    setStatus("Address unavailable.", true);
    return;
  }

  const text = address.textContent.trim();
  if (!text) {
    setStatus("Address unavailable.", true);
    return;
  }

  const success = await copyToClipboard(text);
  setStatus(success ? "Address copied." : "Copy failed. Please copy manually.", !success);
};

copyButton?.addEventListener("click", handleCopy);
