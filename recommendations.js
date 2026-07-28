(function attachRecommendations(root) {
  "use strict";

  const GENERIC_SEARCH_TERMS = new Set([
    "",
    "名称未設定",
    "未分類",
    "プレイリスト",
    "playlist",
  ]);

  function normalizeRecommendationText(value = "") {
    return String(value)
      .normalize("NFKC")
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function uniqueValues(values) {
    const seen = new Set();
    return values.filter((value) => {
      const normalized = normalizeRecommendationText(value);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }

  function incrementSignal(map, key, value) {
    const normalized = normalizeRecommendationText(key);
    if (!normalized) return;
    const existing = map.get(normalized);
    if (existing) {
      existing.count += 1;
      return;
    }
    map.set(normalized, { ...value, count: 1, normalized });
  }

  function buildRecommendationProfile(seriesList, projects = []) {
    const series = Array.isArray(seriesList) ? seriesList : [];
    const projectRules = new Map(
      (Array.isArray(projects) ? projects : [])
        .filter((project) => project?.name)
        .map((project) => [project.name, project]),
    );
    const projectSignals = new Map();
    const channelSignals = new Map();

    for (const item of series) {
      const projectName = String(item?.project || item?.title || "").trim();
      if (projectName && !GENERIC_SEARCH_TERMS.has(projectName)) {
        const rule = projectRules.get(projectName);
        incrementSignal(projectSignals, projectName, {
          name: projectName,
          aliases: uniqueValues([
            ...(rule?.aliases || []),
            ...(rule?.learnedAliases || []),
          ]),
        });
      }

      const channelKey = item?.channelId || item?.channelTitle;
      if (channelKey) {
        incrementSignal(channelSignals, channelKey, {
          id: String(item?.channelId || ""),
          title: String(item?.channelTitle || ""),
        });
      }
    }

    const byCountThenName = (left, right) =>
      right.count - left.count || left.name?.localeCompare(right.name, "ja") || 0;
    const projectList = [...projectSignals.values()].sort(byCountThenName);
    const channelList = [...channelSignals.values()].sort(
      (left, right) =>
        right.count - left.count || left.title.localeCompare(right.title, "ja"),
    );

    return {
      registeredIds: new Set(series.map((item) => String(item?.id || "")).filter(Boolean)),
      projects: projectList,
      channels: channelList,
      searchTerms: projectList.map((project) => project.name),
    };
  }

  function candidateText(candidate) {
    return normalizeRecommendationText(
      `${candidate?.title || ""} ${candidate?.description || ""}`,
    );
  }

  function channelMatches(candidate, channel) {
    if (channel.id && candidate.channelId) return channel.id === candidate.channelId;
    return Boolean(
      channel.title &&
        normalizeRecommendationText(channel.title) ===
          normalizeRecommendationText(candidate.channelTitle),
    );
  }

  function recommendationType(candidate) {
    if (candidate?.gameRelationship === "new") return "new-game";
    return candidate?.channelRelationship === "new"
      ? "new-channel"
      : "known-channel";
  }

  function scoreRecommendationCandidate(candidate, profile) {
    const text = candidateText(candidate);
    let score = 0;
    const reasons = [];

    const matchingChannel = profile.channels.find((channel) =>
      channelMatches(candidate, channel),
    );
    if (matchingChannel) {
      score += 44 + Math.min(12, matchingChannel.count * 3);
      reasons.push(`登録済みの「${matchingChannel.title || candidate.channelTitle}」と同じ投稿者`);
    }

    let matchingProject = null;
    for (const project of profile.projects) {
      const terms = [project.name, ...(project.aliases || [])];
      if (
        terms.some((term) => {
          const normalized = normalizeRecommendationText(term);
          return normalized.length >= 2 && text.includes(normalized);
        }) ||
        candidate.sourceProjectNames?.has(project.name)
      ) {
        matchingProject = project;
        break;
      }
    }
    if (matchingProject) {
      score += 38 + Math.min(10, matchingProject.count * 2);
      reasons.push(`登録済みの「${matchingProject.name}」に関連`);
    } else if (matchingChannel) {
      reasons.push("ライブラリにないゲームの候補");
    }

    const itemCount = Number(candidate.itemCount) || 0;
    if (itemCount >= 2) score += Math.min(14, Math.round(Math.log2(itemCount + 1) * 3));
    if (/(実況|ゲームプレイ|playthrough|gameplay|let'?s play)/iu.test(candidate.title || "")) {
      score += 7;
    }
    if (itemCount <= 1) score -= 12;

    const scoredCandidate = {
      ...candidate,
      score,
      channelRelationship: matchingChannel ? "known" : "new",
      gameRelationship: matchingProject ? "known" : "new",
      reasons: uniqueValues(reasons).slice(0, 2),
    };
    return {
      ...scoredCandidate,
      recommendationType: recommendationType(scoredCandidate),
    };
  }

  function rankRecommendationCandidates(candidates, profile, limit = 12) {
    if (limit <= 0) return [];
    const seen = new Set();
    const ranked = (Array.isArray(candidates) ? candidates : [])
      .filter((candidate) => {
        const id = String(candidate?.id || "");
        if (!id || profile.registeredIds.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((candidate) => scoreRecommendationCandidate(candidate, profile))
      .filter((candidate) => candidate.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          (Number(right.itemCount) || 0) - (Number(left.itemCount) || 0) ||
          left.title.localeCompare(right.title, "ja"),
      );

    // Keep each discovery tab useful before filling the remaining slots by
    // overall relevance.
    const newChannelCandidates = ranked.filter(
      (candidate) => candidate.recommendationType === "new-channel",
    );
    const newGameCandidates = ranked.filter(
      (candidate) => candidate.recommendationType === "new-game",
    );
    const selected = [
      ...newChannelCandidates.slice(0, Math.max(1, Math.ceil(limit * 0.5))),
      ...newGameCandidates.slice(0, Math.max(1, Math.ceil(limit * 0.25))),
    ].slice(0, limit);
    const selectedIds = new Set(selected.map((candidate) => candidate.id));
    for (const candidate of ranked) {
      if (selected.length >= limit) break;
      if (selectedIds.has(candidate.id)) continue;
      selected.push(candidate);
      selectedIds.add(candidate.id);
    }
    return selected;
  }

  root.CuratRecommendations = {
    normalizeRecommendationText,
    buildRecommendationProfile,
    recommendationType,
    scoreRecommendationCandidate,
    rankRecommendationCandidates,
  };
})(typeof window !== "undefined" ? window : globalThis);
