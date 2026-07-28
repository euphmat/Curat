(function attachRecommendations(root) {
  "use strict";

  const GENERIC_SEARCH_TERMS = new Set([
    "",
    "名称未設定",
    "未分類",
    "プレイリスト",
    "playlist",
  ]);
  const RECOMMENDATION_TYPES = Object.freeze([
    "new-channel",
    "known-channel",
    "new-game",
    "new-game-new-channel",
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
    const isNewGame = candidate?.gameRelationship === "new";
    const isNewChannel = candidate?.channelRelationship === "new";
    if (isNewGame && isNewChannel) return "new-game-new-channel";
    if (isNewGame) return "new-game";
    return isNewChannel ? "new-channel" : "known-channel";
  }

  function recommendationGameKey(candidate) {
    const projectName = normalizeRecommendationText(candidate?.matchedProjectName);
    if (projectName) return `project:${projectName}`;
    const rawTitle = String(candidate?.title || "")
      .normalize("NFKC")
      .toLocaleLowerCase();
    const originalTitle = normalizeRecommendationText(rawTitle);
    if (!originalTitle) return "";
    const channelTitle = String(candidate?.channelTitle || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .trim();
    let title = rawTitle;
    if (channelTitle.length >= 2) title = title.replaceAll(channelTitle, " ");
    title = title
      .replace(/実況(?:プレイ)?/gu, " ")
      .replace(/\b(?:full\s+)?(?:gameplay|playthrough|playlist)\b/giu, " ")
      .replace(/\blet['’]?\s*s\s+play\b/giu, " ")
      .replace(/\b(?:part|pt|episode|ep)[\s#.:_-]*\d+\b.*$/giu, " ")
      .replace(/(?:パート|その|第)\s*[0-9〇零一二三四五六七八九十]+\s*(?:話|回)?\s*$/gu, " ")
      .trim();
    return `title:${normalizeRecommendationText(title) || originalTitle}`;
  }

  function recommendationChannelKey(candidate) {
    const channelId = String(candidate?.channelId || "").trim();
    if (channelId) return `id:${channelId}`;
    const channelTitle = normalizeRecommendationText(candidate?.channelTitle);
    return channelTitle ? `title:${channelTitle}` : "";
  }

  function recommendationPlaylistKey(candidate) {
    const playlistId = String(candidate?.id || "").trim();
    return playlistId ? `id:${playlistId}` : "";
  }

  // Keep the old export name while existing saved data and integrations migrate
  // from the earlier "video" wording to the accurate playlist wording.
  const recommendationVideoKey = recommendationPlaylistKey;

  function isRecommendationDismissed(candidate, dismissals = {}) {
    const dismissedPlaylists = new Set(
      [
        ...(Array.isArray(dismissals.playlists) ? dismissals.playlists : []),
        ...(Array.isArray(dismissals.videos) ? dismissals.videos : []),
      ],
    );
    const dismissedGames = new Set(
      Array.isArray(dismissals.games) ? dismissals.games : [],
    );
    const dismissedChannels = new Set(
      Array.isArray(dismissals.channels) ? dismissals.channels : [],
    );
    return (
      dismissedPlaylists.has(recommendationPlaylistKey(candidate)) ||
      dismissedGames.has(recommendationGameKey(candidate)) ||
      dismissedChannels.has(recommendationChannelKey(candidate))
    );
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
      matchedProjectName: matchingProject?.name || "",
      reasons: uniqueValues(reasons).slice(0, 2),
    };
    return {
      ...scoredCandidate,
      playlistKey: recommendationPlaylistKey(scoredCandidate),
      videoKey: recommendationPlaylistKey(scoredCandidate),
      gameKey: recommendationGameKey(scoredCandidate),
      channelKey: recommendationChannelKey(scoredCandidate),
      recommendationType: recommendationType(scoredCandidate),
    };
  }

  function diversifyRecommendationGames(candidates) {
    const groups = new Map();
    for (const candidate of candidates) {
      // Keep candidates whose game cannot be identified separate instead of
      // accidentally treating every unknown title as the same game.
      const gameKey = candidate.gameKey || recommendationGameKey(candidate);
      const key = gameKey || `playlist:${candidate.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(candidate);
    }

    const diversified = [];
    const queues = [...groups.values()];
    while (queues.some((queue) => queue.length)) {
      for (const queue of queues) {
        const candidate = queue.shift();
        if (candidate) diversified.push(candidate);
      }
    }
    return diversified;
  }

  function rankRecommendationCandidates(
    candidates,
    profile,
    limit = 12,
    dismissals = {},
  ) {
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
      .filter((candidate) => !isRecommendationDismissed(candidate, dismissals))
      .filter((candidate) => candidate.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          (Number(right.itemCount) || 0) - (Number(left.itemCount) || 0) ||
          left.title.localeCompare(right.title, "ja"),
      );

    // Take turns across all four mutually exclusive tabs so one relationship
    // cannot crowd the other discovery paths out of a limited result set.
    const queues = RECOMMENDATION_TYPES.map((type) =>
      diversifyRecommendationGames(
        ranked.filter((candidate) => candidate.recommendationType === type),
      ),
    );
    const selected = [];
    const selectedIds = new Set();
    const selectCandidate = (candidate) => {
      if (!candidate || selected.length >= limit || selectedIds.has(candidate.id)) return;
      selected.push(candidate);
      selectedIds.add(candidate.id);
    };

    while (
      selected.length < limit &&
      queues.some((queue) => queue.length)
    ) {
      for (const queue of queues) {
        selectCandidate(queue.shift());
        if (selected.length >= limit) break;
      }
    }
    return selected;
  }

  function rankRecommendationCandidatesByType(
    candidates,
    profile,
    limitPerType = 8,
    dismissals = {},
    previousIds = [],
  ) {
    if (limitPerType <= 0) return [];
    const ranked = rankRecommendationCandidates(
      candidates,
      profile,
      Number.MAX_SAFE_INTEGER,
      dismissals,
    );
    const previous = new Set(
      (Array.isArray(previousIds) ? previousIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    );
    const selected = [];

    for (const type of RECOMMENDATION_TYPES) {
      const candidatesForType = diversifyRecommendationGames(
        ranked.filter((candidate) => candidate.recommendationType === type),
      );
      const fresh = candidatesForType.filter(
        (candidate) => !previous.has(candidate.id),
      );
      const repeated = candidatesForType.filter((candidate) =>
        previous.has(candidate.id),
      );
      selected.push(...[...fresh, ...repeated].slice(0, limitPerType));
    }
    return selected;
  }

  root.CuratRecommendations = {
    RECOMMENDATION_TYPES,
    normalizeRecommendationText,
    buildRecommendationProfile,
    recommendationType,
    recommendationGameKey,
    recommendationChannelKey,
    recommendationPlaylistKey,
    recommendationVideoKey,
    isRecommendationDismissed,
    scoreRecommendationCandidate,
    rankRecommendationCandidates,
    rankRecommendationCandidatesByType,
  };
})(typeof window !== "undefined" ? window : globalThis);
