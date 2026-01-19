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

export default copyToClipboard;
