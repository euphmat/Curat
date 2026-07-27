(function attachProjectMatching(root) {
  "use strict";

  const DEFAULT_THRESHOLD = 0.78;
  const DEFAULT_MARGIN = 0.05;
  const KANA_ROMAJI = {
    きゃ: "kya", きゅ: "kyu", きょ: "kyo",
    しゃ: "sha", しゅ: "shu", しょ: "sho",
    ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
    にゃ: "nya", にゅ: "nyu", にょ: "nyo",
    ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo",
    みゃ: "mya", みゅ: "myu", みょ: "myo",
    りゃ: "rya", りゅ: "ryu", りょ: "ryo",
    ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
    じゃ: "ja", じゅ: "ju", じょ: "jo",
    びゃ: "bya", びゅ: "byu", びょ: "byo",
    ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
    ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo",
    うぃ: "wi", うぇ: "we", うぉ: "wo",
    てぃ: "ti", でぃ: "di", とぅ: "tu", どぅ: "du",
    しぇ: "she", じぇ: "je", ちぇ: "che",
    くぁ: "kwa", くぃ: "kwi", くぇ: "kwe", くぉ: "kwo",
    ぐぁ: "gwa", ぐぃ: "gwi", ぐぇ: "gwe", ぐぉ: "gwo",
    ゔぁ: "va", ゔぃ: "vi", ゔぇ: "ve", ゔぉ: "vo",
    あ: "a", い: "i", う: "u", え: "e", お: "o",
    か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
    さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
    た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
    な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
    は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
    ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
    や: "ya", ゆ: "yu", よ: "yo",
    ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
    わ: "wa", を: "o", ん: "n",
    が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
    ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
    だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
    ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
    ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
    ゔ: "vu",
  };

  function normalizeForProjectMatch(value = "") {
    return String(value)
      .normalize("NFKC")
      .toLocaleLowerCase("ja")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/(?:ゲーム)?実況(?:プレイ)?|プレイ動画|配信|初見/gu, " ")
      .replace(/[\u30a1-\u30f6]/g, (char) =>
        String.fromCharCode(char.charCodeAt(0) - 0x60),
      )
      .replace(/[‐‑‒–—―ーｰ]/g, "-")
      .replace(/\b(?:the|a|an|gameplay|playthrough|playlist|live|stream)\b/gu, " ")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function romanizeKana(value = "") {
    const source = String(value)
      .normalize("NFKC")
      .toLocaleLowerCase("ja")
      .replace(/[\u30a1-\u30f6]/g, (char) =>
        String.fromCharCode(char.charCodeAt(0) - 0x60),
      );
    let result = "";
    let geminate = false;

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (character === "っ") {
        geminate = true;
        continue;
      }
      if (character === "ー") continue;

      const pair = source.slice(index, index + 2);
      let romaji = KANA_ROMAJI[pair];
      if (romaji) index += 1;
      else romaji = KANA_ROMAJI[character] || character;

      if (geminate && /^[a-z]/u.test(romaji)) romaji = romaji[0] + romaji;
      geminate = false;
      result += romaji;
    }
    return result;
  }

  // 外来語では挿入母音や L/R、Q/K などの差が大きいため、子音を中心に発音を比較する。
  // 通常の表記一致より誤判定しやすいので、異なる文字体系間だけ補助的に利用する。
  function phoneticKey(value = "") {
    return romanizeKana(value)
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/(?:ゲーム)?実況(?:プレイ)?|プレイ動画|配信|初見/gu, " ")
      .replace(/\b(?:the|a|an|gameplay|playthrough|playlist|live|stream)\b/gu, " ")
      .replace(/ph/gu, "f")
      .replace(/qu/gu, "k")
      .replace(/ck/gu, "k")
      .replace(/x/gu, "ks")
      .replace(/[qclv]/gu, (character) => ({ q: "k", c: "k", l: "r", v: "b" })[character])
      .replace(/[aeiouy]/gu, "")
      .replace(/[^a-z0-9]+/gu, "");
  }

  function usesDifferentWritingSystems(left, right) {
    const hasKana = (value) => /[\u3040-\u30ff]/u.test(String(value));
    const hasLatin = (value) => /[a-z]/iu.test(String(value));
    return (hasKana(left) && hasLatin(right)) || (hasLatin(left) && hasKana(right));
  }

  function tokenizeForInstallmentCheck(value = "") {
    const normalized = String(value)
      .replace(/([\u2160-\u2188])/gu, " $1 ")
      .normalize("NFKC")
      .toLocaleLowerCase("ja")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/#\s*\d+/gu, " ")
      .replace(/(?:ゲーム)?実況(?:プレイ)?|プレイ動画|配信|初見/gu, " ")
      .replace(/[\u30a1-\u30f6]/g, (char) =>
        String.fromCharCode(char.charCodeAt(0) - 0x60),
      )
      .replace(/([\p{L}])(\p{N})/gu, "$1 $2")
      .replace(/(\p{N})([\p{L}])/gu, "$1 $2")
      .replace(/\b(?:the|a|an|gameplay|playthrough|playlist|live|stream)\b/gu, " ");
    return normalized.match(/[\p{L}\p{N}]+/gu) || [];
  }

  function parseInstallmentNumber(token) {
    if (/^\d+$/u.test(token)) {
      const value = Number(token);
      return Number.isSafeInteger(value) && value > 0 ? value : null;
    }
    if (
      !/^(?=[mdclxvi]+$)m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/u.test(
        token,
      )
    ) {
      return null;
    }
    const values = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
    const numeralValue = [...token].reduce((total, character, index, characters) => {
      const value = values[character];
      return total + (value < (values[characters[index + 1]] || 0) ? -value : value);
    }, 0);
    return numeralValue <= 100 ? numeralValue : null;
  }

  function containsTokens(container, contained) {
    if (!contained.length || contained.length >= container.length) return false;
    if (parseInstallmentNumber(contained[contained.length - 1]) !== null) return false;
    for (let start = 0; start <= container.length - contained.length; start += 1) {
      if (!contained.every((token, index) => token === container[start + index])) continue;
      if (parseInstallmentNumber(container[start + contained.length]) !== null) return true;
    }
    return false;
  }

  function hasNumberedInstallmentConflict(left, right) {
    const leftTokens = tokenizeForInstallmentCheck(left);
    const rightTokens = tokenizeForInstallmentCheck(right);
    if (containsTokens(leftTokens, rightTokens) || containsTokens(rightTokens, leftTokens)) {
      return true;
    }

    const leftInstallments = leftTokens
      .map((token, index) => ({
        index,
        number: parseInstallmentNumber(token),
        stem: leftTokens.slice(0, index).join(""),
      }))
      .filter((item) => item.number !== null && item.stem.length >= 3);
    const rightInstallments = rightTokens
      .map((token, index) => ({
        index,
        number: parseInstallmentNumber(token),
        stem: rightTokens.slice(0, index).join(""),
      }))
      .filter((item) => item.number !== null && item.stem.length >= 3);

    const sameScriptConflict = leftInstallments.some((leftItem) =>
      rightInstallments.some(
        (rightItem) =>
          leftItem.stem === rightItem.stem && leftItem.number !== rightItem.number,
      ),
    );
    if (sameScriptConflict || !usesDifferentWritingSystems(left, right)) {
      return sameScriptConflict;
    }

    const crossScriptInstallments = (value) => {
      const tokens = String(value)
        .replace(/([\u2160-\u2188])/gu, " $1 ")
        .normalize("NFKC")
        .toLocaleLowerCase("ja")
        .replace(/#\s*\d+/gu, " ")
        .replace(/(?:ゲーム)?実況(?:プレイ)?|プレイ動画|配信|初見/gu, " ")
        .replace(/([\p{L}])(\p{N})/gu, "$1 $2")
        .replace(/(\p{N})([\p{L}])/gu, "$1 $2")
        .match(/[\p{L}\p{N}]+/gu) || [];
      return {
        tokens,
        installments: tokens
          .map((token, index) => ({
            number: parseInstallmentNumber(token),
            stem: tokens.slice(0, index).join(" "),
          }))
          .filter((item) => item.number !== null && phoneticKey(item.stem).length >= 5),
      };
    };
    const leftCross = crossScriptInstallments(left);
    const rightCross = crossScriptInstallments(right);
    const stemMatchesAcrossScripts = (leftStem, rightStem) => {
      const leftKey = phoneticKey(leftStem);
      const rightKey = phoneticKey(rightStem);
      if (leftKey.length < 5 || rightKey.length < 5) return false;
      return (
        Math.max(
          bestWindowSimilarity(leftKey, rightKey),
          bestWindowSimilarity(rightKey, leftKey),
        ) >= 0.9
      );
    };
    const leftWhole = leftCross.tokens.join(" ");
    const rightWhole = rightCross.tokens.join(" ");

    if (
      !leftCross.installments.length &&
      rightCross.installments.some((item) => stemMatchesAcrossScripts(leftWhole, item.stem))
    ) {
      return true;
    }
    if (
      !rightCross.installments.length &&
      leftCross.installments.some((item) => stemMatchesAcrossScripts(item.stem, rightWhole))
    ) {
      return true;
    }
    return leftCross.installments.some((leftItem) =>
      rightCross.installments.some(
        (rightItem) =>
          leftItem.number !== rightItem.number &&
          stemMatchesAcrossScripts(leftItem.stem, rightItem.stem),
      ),
    );
  }

  function levenshteinDistance(left, right) {
    const a = [...left];
    const b = [...right];
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let previous = [0, ...b.map((_, index) => index + 1)];

    for (let row = 0; row < a.length; row += 1) {
      const current = [row + 1];
      for (let column = 0; column < b.length; column += 1) {
        current.push(
          Math.min(
            current[column] + 1,
            previous[column + 1] + 1,
            previous[column] + (a[row] === b[column] ? 0 : 1),
          ),
        );
      }
      previous = current;
    }
    return previous[b.length];
  }

  function similarity(left, right) {
    const longest = Math.max([...left].length, [...right].length);
    return longest ? 1 - levenshteinDistance(left, right) / longest : 1;
  }

  function bestWindowSimilarity(term, title) {
    const query = [...term].slice(0, 80).join("");
    const queryCharacters = [...query];
    const target = [...title].slice(0, 180);
    const queryLength = queryCharacters.length;
    if (!queryLength || !target.length) return 0;
    if (title.includes(query)) return 1;

    // タイトル前後の文字は無視し、候補語に最も近い部分文字列との編集距離を O(mn) で求める。
    let previous = new Array(target.length + 1).fill(0);
    for (let row = 0; row < queryLength; row += 1) {
      const current = [row + 1];
      for (let column = 0; column < target.length; column += 1) {
        current.push(
          Math.min(
            current[column] + 1,
            previous[column + 1] + 1,
            previous[column] + (queryCharacters[row] === target[column] ? 0 : 1),
          ),
        );
      }
      previous = current;
    }
    return 1 - Math.min(...previous) / queryLength;
  }

  // fzf と同様に、文字の順序・連続性・一致範囲の密度を評価する。
  function subsequenceScore(term, title) {
    const query = [...term];
    const target = [...title];
    if (query.length < 3 || query.length > target.length) return 0;
    let queryIndex = 0;
    let firstMatch = -1;
    let lastMatch = -1;
    let adjacentMatches = 0;
    let previousMatch = -2;

    for (let index = 0; index < target.length && queryIndex < query.length; index += 1) {
      if (target[index] !== query[queryIndex]) continue;
      if (firstMatch < 0) firstMatch = index;
      if (index === previousMatch + 1) adjacentMatches += 1;
      previousMatch = index;
      lastMatch = index;
      queryIndex += 1;
    }
    if (queryIndex !== query.length) return 0;

    const span = lastMatch - firstMatch + 1;
    const density = query.length / span;
    const adjacency = query.length > 1 ? adjacentMatches / (query.length - 1) : 1;
    const coverage = query.length / target.length;
    return 0.48 + density * 0.24 + adjacency * 0.2 + Math.min(coverage, 0.4) * 0.2;
  }

  function thresholdForLength(length, baseThreshold) {
    if (length <= 3) return 0.9;
    if (length === 4) return 0.84;
    if (length <= 6) return Math.max(baseThreshold, 0.8);
    return baseThreshold;
  }

  function scoreTerm(title, term, baseThreshold) {
    const normalizedTitle = normalizeForProjectMatch(title);
    const normalizedTerm = normalizeForProjectMatch(term);
    const termLength = [...normalizedTerm].length;
    if (!normalizedTitle || termLength < 2) return null;
    if (hasNumberedInstallmentConflict(title, term)) return null;

    if (normalizedTitle === normalizedTerm) {
      return { score: 1, exact: true, normalizedTerm, threshold: 1 };
    }
    if (normalizedTitle.includes(normalizedTerm)) {
      return {
        score: 0.99 + Math.min(termLength / Math.max([...normalizedTitle].length, 1), 1) * 0.01,
        exact: true,
        normalizedTerm,
        threshold: 0.99,
      };
    }

    const editScore = bestWindowSimilarity(normalizedTerm, normalizedTitle) * 0.94;
    const fzfScore = subsequenceScore(normalizedTerm, normalizedTitle) * 0.9;
    let phoneticScore = 0;
    if (usesDifferentWritingSystems(title, term)) {
      const titlePhonetic = phoneticKey(title);
      const termPhonetic = phoneticKey(term);
      if (titlePhonetic.length >= 5 && termPhonetic.length >= 5) {
        phoneticScore =
          Math.max(
            bestWindowSimilarity(termPhonetic, titlePhonetic),
            bestWindowSimilarity(titlePhonetic, termPhonetic),
          ) * 0.98;
      }
    }
    return {
      score: Math.max(editScore, fzfScore, phoneticScore),
      exact: false,
      normalizedTerm,
      threshold: thresholdForLength(termLength, baseThreshold),
    };
  }

  function matchesProjectSearch(query, values) {
    const searchTerm = String(query || "").trim();
    if (!searchTerm) return true;
    const candidates = (Array.isArray(values) ? values : [values])
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const normalizedQuery = normalizeForProjectMatch(searchTerm);
    if (
      normalizedQuery &&
      candidates.some((value) =>
        normalizeForProjectMatch(value).includes(normalizedQuery),
      )
    ) {
      return true;
    }
    return candidates.some((value) => {
      const match = scoreTerm(value, searchTerm, DEFAULT_THRESHOLD);
      return match && match.score >= match.threshold;
    });
  }

  function classifyProject(
    playlistTitle,
    projects,
    { threshold = DEFAULT_THRESHOLD, margin = DEFAULT_MARGIN } = {},
  ) {
    const projectMatches = (Array.isArray(projects) ? projects : [])
      .map((project) => {
        const identityTerms = [project.name, ...(project.aliases || [])];
        if (identityTerms.some((term) => hasNumberedInstallmentConflict(playlistTitle, term))) {
          return null;
        }
        const terms = [
          { value: project.name, source: "name" },
          ...(project.aliases || []).map((value) => ({ value, source: "alias" })),
          ...(project.learnedAliases || []).map((value) => ({ value, source: "learned" })),
        ];
        const best = terms
          .map((term) => ({ ...term, ...scoreTerm(playlistTitle, term.value, threshold) }))
          .filter((match) => Number.isFinite(match.score))
          .sort(
            (left, right) =>
              Number(right.exact) - Number(left.exact) ||
              right.score - left.score ||
              [...right.normalizedTerm].length - [...left.normalizedTerm].length,
          )[0];
        return best ? { projectName: project.name, ...best } : null;
      })
      .filter(Boolean)
      .sort(
        (left, right) =>
          Number(right.exact) - Number(left.exact) ||
          right.score - left.score ||
          [...right.normalizedTerm].length - [...left.normalizedTerm].length,
      );

    const best = projectMatches[0];
    const runnerUp = projectMatches[1];
    const hasEnoughMargin =
      !runnerUp ||
      (best?.exact &&
        (!runnerUp.exact ||
          [...best.normalizedTerm].length > [...runnerUp.normalizedTerm].length)) ||
      best.score - runnerUp.score >= margin;
    if (best && best.score >= best.threshold && hasEnoughMargin) {
      return {
        projectName: best.projectName,
        createNew: false,
        confidence: best.score,
        matchType: best.exact ? "exact" : "fuzzy",
        matchedTerm: best.value,
        matchedSource: best.source,
      };
    }

    return {
      projectName: String(playlistTitle || "").trim() || "名称未設定",
      createNew: true,
      confidence: best?.score || 0,
      matchType: best && !hasEnoughMargin ? "ambiguous" : "new",
      matchedTerm: best?.value || "",
      matchedSource: best?.source || "",
    };
  }

  function rememberLearnedAlias(project, value, { limit = 30 } = {}) {
    if (!project) return false;
    const alias = String(value || "").trim().slice(0, 180);
    const normalized = normalizeForProjectMatch(alias);
    if (!normalized) return false;
    const knownTerms = [
      project.name,
      ...(project.aliases || []),
      ...(project.learnedAliases || []),
    ];
    if (knownTerms.some((term) => normalizeForProjectMatch(term) === normalized)) return false;
    project.learnedAliases = [alias, ...(project.learnedAliases || [])].slice(0, limit);
    return true;
  }

  root.CuratProjectMatch = {
    normalizeForProjectMatch,
    levenshteinDistance,
    similarity,
    subsequenceScore,
    phoneticKey,
    matchesProjectSearch,
    classifyProject,
    rememberLearnedAlias,
  };
})(typeof window !== "undefined" ? window : globalThis);
