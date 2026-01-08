export const DEFAULT_LANG = "en";

const dictionaries = {
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

export const t = (key, params) => {
  const dictionary = dictionaries[DEFAULT_LANG];
  const value = findValue(dictionary, key);

  if (typeof value !== "string") {
    return `[[${key}]]`;
  }

  if (!params) {
    return value;
  }

  return interpolate(value, params);
};

export const loadDictionary = async () => {
  const url = new URL("./en.json", import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load dictionary (${response.status})`);
  }
  const data = await response.json();
  dictionaries[DEFAULT_LANG] = data;
  return url;
};
