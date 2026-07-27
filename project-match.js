(function attachProjectMatching(root) {
  "use strict";

  const DEFAULT_THRESHOLD = 0.78;
  const DEFAULT_MARGIN = 0.05;

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
    return {
      score: Math.max(editScore, fzfScore),
      exact: false,
      normalizedTerm,
      threshold: thresholdForLength(termLength, baseThreshold),
    };
  }

  function classifyProject(
    playlistTitle,
    projects,
    { threshold = DEFAULT_THRESHOLD, margin = DEFAULT_MARGIN } = {},
  ) {
    const projectMatches = (Array.isArray(projects) ? projects : [])
      .map((project) => {
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
    classifyProject,
    rememberLearnedAlias,
  };
})(typeof window !== "undefined" ? window : globalThis);
