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
  if (!address) {
    setStatus("Address unavailable.", true);
    return;
  }

  const text = address.textContent.trim();
  if (!text) {
    setStatus("Address unavailable.", true);
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      setStatus("Address copied.");
      return;
    }

    const success = await fallbackCopy(text);
    if (success) {
      setStatus("Address copied.");
    } else {
      setStatus("Copy failed. Please copy manually.", true);
    }
  } catch (error) {
    setStatus("Copy failed. Please copy manually.", true);
  }
};

copyButton?.addEventListener("click", handleCopy);
