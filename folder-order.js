(function attachFolderOrdering(root) {
  "use strict";

  const folderNameCollator = new Intl.Collator("ja", {
    numeric: true,
    sensitivity: "base",
  });
  const ROMAN_PATTERN =
    /^(?=[MDCLXVI]+$)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;
  const TRAILING_ROMAN_PATTERN =
    /^(.*?)[\s_.:/\-‐‑‒–—―]+([ivxlcdm]+)$/i;

  function romanToNumber(value) {
    const roman = String(value || "").normalize("NFKC").toUpperCase();
    if (!roman || !ROMAN_PATTERN.test(roman)) return null;

    const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0;
    let previous = 0;
    for (const character of [...roman].reverse()) {
      const number = values[character];
      total += number < previous ? -number : number;
      previous = Math.max(previous, number);
    }
    return total;
  }

  function folderSortKey(value) {
    const name = String(value || "").normalize("NFKC").trim();
    const romanMatch = name.match(TRAILING_ROMAN_PATTERN);
    const installment = romanMatch ? romanToNumber(romanMatch[2]) : null;
    const baseName = installment === null ? name : romanMatch[1];

    return {
      name,
      baseName: baseName
        .toLocaleLowerCase("ja")
        .replace(/[\s_.:/\-‐‑‒–—―]+/g, ""),
      installment,
    };
  }

  function compareFolderNames(left, right) {
    const leftKey = folderSortKey(left);
    const rightKey = folderSortKey(right);
    const baseOrder = folderNameCollator.compare(leftKey.baseName, rightKey.baseName);
    if (baseOrder) return baseOrder;

    if (leftKey.installment !== null || rightKey.installment !== null) {
      const installmentOrder =
        (leftKey.installment ?? 0) - (rightKey.installment ?? 0);
      if (installmentOrder) return installmentOrder;
    }

    return folderNameCollator.compare(leftKey.name, rightKey.name);
  }

  root.CuratFolderOrder = {
    romanToNumber,
    folderSortKey,
    compareFolderNames,
  };
})(typeof window !== "undefined" ? window : globalThis);
