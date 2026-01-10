const HEX_REGEX = /^[0-9A-F]{40}$/;
const ASCII_PRINTABLE_REGEX = /^[\x20-\x7E]+$/;

export const normalizeCurrencyInput = (input) => {
  const currencyInput = String(input ?? "");
  const trimmed = currencyInput.trim();

  if (!trimmed) {
    return {
      currencyInput,
      currencyNormalized: "",
      kind: null,
      error: { code: "empty" },
    };
  }

  const upper = trimmed.toUpperCase();

  if (trimmed.length === 3) {
    const isAsciiShort = /^[A-Za-z0-9]{3}$/.test(trimmed);
    if (!isAsciiShort) {
      return {
        currencyInput: upper,
        currencyNormalized: "",
        kind: null,
        error: { code: ASCII_PRINTABLE_REGEX.test(trimmed) ? "invalid_length" : "non_ascii" },
      };
    }
    return {
      currencyInput: upper,
      currencyNormalized: upper,
      kind: "3",
    };
  }

  if (HEX_REGEX.test(upper)) {
    return {
      currencyInput: upper,
      currencyNormalized: upper,
      kind: "hex",
    };
  }

  if (trimmed.length === 40) {
    return {
      currencyInput: upper,
      currencyNormalized: "",
      kind: null,
      error: { code: "hex_invalid" },
    };
  }

  if (trimmed.length >= 4 && trimmed.length <= 20) {
    if (!ASCII_PRINTABLE_REGEX.test(trimmed)) {
      return {
        currencyInput: upper,
        currencyNormalized: "",
        kind: null,
        error: { code: "non_ascii" },
      };
    }

    const bytes = new TextEncoder().encode(trimmed);
    const padded = new Uint8Array(20);
    padded.set(bytes);
    const hex = Array.from(padded)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    return {
      currencyInput: upper,
      currencyNormalized: hex,
      kind: "ascii",
    };
  }

  return {
    currencyInput: upper,
    currencyNormalized: "",
    kind: null,
    error: { code: "invalid_length" },
  };
};
