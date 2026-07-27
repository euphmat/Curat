(function attachFolderDisplay(root) {
  "use strict";

  const ROMAN_PATTERN =
    /^(?=[MDCLXVI]+$)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/i;
  const ASCII_NAME_PATTERN = /^[\x20-\x7E]+$/;
  const ICON_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const COLOR_ICON_PREFIXES = [
    "fluent-emoji-flat",
    "fluent-emoji",
    "noto",
    "twemoji",
    "openmoji",
    "emojione",
    "fxemoji",
  ];

  function formatAsciiWord(word) {
    if (/^\d+$/.test(word)) return word;
    if (ROMAN_PATTERN.test(word)) return word.toUpperCase();
    if (/[A-Z]/.test(word.slice(1)) && /[a-z]/.test(word)) return word;
    const lower = word.toLocaleLowerCase("en");
    return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  }

  function toUpperCamelCase(value) {
    const name = String(value || "").normalize("NFKC").trim();
    if (!name || !ASCII_NAME_PATTERN.test(name) || !/[A-Za-z]/.test(name)) return name;
    const words = name.match(/[A-Za-z]+|\d+/g) || [];
    return words.map(formatAsciiWord).join("");
  }

  function isValidIconName(value) {
    return ICON_NAME_PATTERN.test(String(value || ""));
  }

  function isColorIconName(value) {
    if (!isValidIconName(value)) return false;
    return COLOR_ICON_PREFIXES.includes(String(value).split(":")[0]);
  }

  function iconifySvgUrl(value) {
    if (!isValidIconName(value)) return "";
    const [prefix, name] = value.split(":");
    return `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`;
  }

  root.CuratFolderDisplay = {
    toUpperCamelCase,
    isValidIconName,
    isColorIconName,
    iconifySvgUrl,
    COLOR_ICON_PREFIXES,
  };
})(typeof window !== "undefined" ? window : globalThis);
