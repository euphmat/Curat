const APP_VERSION = 1;
const DATA_KEY = "playlog:data:v1";
const CONFIG_KEY = "playlog:config:v1";
const DB_NAME = "playlog-file-handles";
const HANDLE_KEY = "save-file";
const API_BASE = "https://www.googleapis.com/youtube/v3";
const SIDEBAR_MIN_WIDTH = 300;
const SIDEBAR_MAX_WIDTH = 480;
const DETAIL_PIN_MEDIA = window.matchMedia("(min-width: 1100px)");
const { parseEpisodeOrder, sortPlaylistTasks } = window.PlaylogEpisodeSort;
const {
  normalizeForProjectMatch,
  classifyProject,
  rememberLearnedAlias,
} = window.CuratProjectMatch;

const defaultData = () => ({
  version: APP_VERSION,
  updatedAt: new Date().toISOString(),
  series: [],
  projects: [],
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name, className = "icon") =>
  `<svg class="${className}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

const elements = {
  form: $("#playlistForm"),
  url: $("#playlistUrl"),
  formMessage: $("#formMessage"),
  grid: $("#seriesGrid"),
  empty: $("#emptyState"),
  template: $("#seriesCardTemplate"),
  seriesStat: $("#seriesStat"),
  todoStat: $("#todoStat"),
  progressStat: $("#progressStat"),
  progressBar: $("#progressBar"),
  search: $("#searchInput"),
  syncAll: $("#syncAll"),
  deleteAll: $("#deleteAll"),
  detailSidebar: $("#detailSidebar"),
  detailContent: $("#detailContent"),
  settingsDialog: $("#settingsDialog"),
  apiKey: $("#apiKeyInput"),
  backupDialog: $("#backupDialog"),
  backupStatus: $("#backupStatus"),
  saveStatusTitle: $("#saveStatusTitle"),
  saveStatusCopy: $("#saveStatusCopy"),
  projectTree: $("#projectTree"),
  projectDialog: $("#projectDialog"),
  projectName: $("#projectNameInput"),
  projectAliases: $("#projectAliasesInput"),
  projectSearch: $("#projectSearch"),
  folderDialog: $("#folderDialog"),
  folderName: $("#folderNameInput"),
  folderAliases: $("#folderAliasesInput"),
  contextMenu: $("#treeContextMenu"),
  confirmDialog: $("#confirmDialog"),
  sidebar: $("#sidebar"),
  sidebarResizer: $("#sidebarResizer"),
  sidebarHide: $("#sidebarHide"),
  mobileMenu: $("#mobileMenu"),
};

let data = loadData();
let config = loadConfig();
let activeFilter = "all";
let detailSeriesId = null;
let saveFileHandle = null;
let fileSaveTimer = null;
let pendingPlaylistUrl = "";
let editingProjectSeriesId = null;
let editingProjectOriginalName = "";
let draggedSeriesId = null;
let activeDropProject = null;
let suppressPlaylistClickUntil = 0;
let detailReturnFocus = null;
let editingFolderOriginalName = null;
let selectedTreeKey = "";
let contextTarget = null;
let confirmResolver = null;

if (config.sidebarCollapsed && window.matchMedia("(min-width: 781px)").matches) {
  document.body.classList.add("sidebar-collapsed");
}
if (config.detailPinned && DETAIL_PIN_MEDIA.matches) {
  document.body.classList.add("detail-pinned");
}
if (Number.isFinite(config.sidebarWidth)) {
  const sidebarWidth = Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, config.sidebarWidth),
  );
  document.documentElement.style.setProperty(
    "--sidebar-width",
    `${sidebarWidth}px`,
  );
  elements.sidebarResizer.setAttribute("aria-valuenow", String(Math.round(sidebarWidth)));
}

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DATA_KEY));
    if (parsed && Array.isArray(parsed.series)) return migrateData(parsed);
  } catch (error) {
    console.warn("保存データの読み込みに失敗しました", error);
  }
  return defaultData();
}

function migrateData(saved) {
  const migratedSeries = saved.series.map((series) => ({
    createdAt: new Date().toISOString(),
    lastSyncedAt: null,
    ...series,
    project: series.project || series.title || "名称未設定",
    tasks: sortPlaylistTasks(
      (Array.isArray(series.tasks) ? series.tasks : []).map((task) => ({
        ...task,
        sourcePosition: task.sourcePosition ?? task.position ?? 0,
        episodeOrder: parseEpisodeOrder(task.title),
      })),
    ),
  }));
  const savedProjects = Array.isArray(saved.projects) ? saved.projects : [];
  const projectNames = new Set(savedProjects.map((project) => project.name));
  const derivedProjects = [];
  for (const series of migratedSeries) {
    if (!projectNames.has(series.project)) {
      projectNames.add(series.project);
      derivedProjects.push({ name: series.project, aliases: [], learnedAliases: [] });
    }
  }
  return {
    ...defaultData(),
    ...saved,
    version: APP_VERSION,
    series: migratedSeries,
    projects: [
      ...savedProjects.map((project) => ({
        name: project.name,
        aliases: Array.isArray(project.aliases) ? project.aliases : [],
        learnedAliases: Array.isArray(project.learnedAliases) ? project.learnedAliases : [],
      })),
      ...derivedProjects,
    ],
  };
}

function loadConfig() {
  try {
    return { apiKey: "", ...JSON.parse(localStorage.getItem(CONFIG_KEY)) };
  } catch {
    return { apiKey: "" };
  }
}

function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function saveData({ syncFile = true } = {}) {
  data.updatedAt = new Date().toISOString();
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
  if (syncFile && saveFileHandle) {
    clearTimeout(fileSaveTimer);
    fileSaveTimer = setTimeout(() => writeConnectedFile(), 350);
  }
  updateBackupUI();
}

function exportPayload() {
  return {
    app: "CURAT",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

function isValidBackup(payload) {
  return (
    payload &&
    (payload.app === "CURAT" || payload.app === "PLAYLOG" || payload.version) &&
    payload.data &&
    Array.isArray(payload.data.series)
  );
}

function normalizeText(value = "") {
  return value.toLocaleLowerCase("ja").normalize("NFKC");
}

function getChannelName(series) {
  return series.channelTitle?.trim() || series.title || "チャンネル名未取得";
}

function normalizeProjectMatch(value = "") {
  return normalizeForProjectMatch(value);
}

function parseAliases(value = "") {
  return [
    ...new Set(
      value
        .split(/[\n,，]+/)
        .map((alias) => alias.trim())
        .filter(Boolean),
    ),
  ];
}

function projectRuleByName(name) {
  return data.projects.find((project) => project.name === name);
}

function inferProjectPlacement(playlistTitle) {
  return classifyProject(playlistTitle, data.projects);
}

function learnPlaylistTitle(projectName, playlistTitle) {
  return rememberLearnedAlias(projectRuleByName(projectName), playlistTitle);
}

function projectMatchTerms(projectName) {
  const rule = projectRuleByName(projectName);
  return [...(rule?.aliases || []), ...(rule?.learnedAliases || [])];
}

function escapeHtml(value = "") {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

function getThumbnail(thumbnails = {}) {
  return (
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    ""
  );
}

function extractPlaylistId(input) {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const id = url.searchParams.get("list");
    if (id && /^[A-Za-z0-9_-]{10,}$/.test(id)) return id;
  } catch {
    return null;
  }
  return null;
}

function parseDuration(iso = "") {
  const parts = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!parts) return 0;
  return (
    Number(parts[1] || 0) * 86400 +
    Number(parts[2] || 0) * 3600 +
    Number(parts[3] || 0) * 60 +
    Number(parts[4] || 0)
  );
}

function formatDuration(seconds = 0) {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "未同期";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getSeriesStats(series) {
  const tasks = series.tasks.filter((task) => !task.archived && task.status !== "skipped");
  const done = tasks.filter((task) => task.status === "done").length;
  const doing = tasks.filter((task) => task.status === "doing").length;
  const todo = Math.max(0, tasks.length - done - doing);
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  return { total: tasks.length, done, doing, todo, progress };
}

function getGlobalStats() {
  const tasks = data.series.flatMap((series) =>
    series.tasks.filter((task) => !task.archived && task.status !== "skipped"),
  );
  const done = tasks.filter((task) => task.status === "done").length;
  const doing = tasks.filter((task) => task.status === "doing").length;
  return {
    series: data.series.length,
    todo: Math.max(0, tasks.length - done),
    doing,
    progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
  };
}

function seriesMatchesView(series) {
  const stats = getSeriesStats(series);
  if (activeFilter === "active") return stats.doing > 0 || (stats.done > 0 && stats.progress < 100);
  if (activeFilter === "unstarted") return stats.done === 0 && stats.doing === 0;
  if (activeFilter === "done") return stats.total > 0 && stats.progress === 100;
  return true;
}

function filteredSeries() {
  const query = normalizeText(elements.search.value);
  return data.series
    .filter(seriesMatchesView)
    .filter((series) => {
      if (!query) return true;
      return normalizeText(`${series.title} ${series.channelTitle}`).includes(query);
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

function render() {
  const global = getGlobalStats();
  elements.seriesStat.textContent = global.series;
  elements.todoStat.textContent = global.todo;
  elements.progressStat.textContent = `${global.progress}%`;
  elements.progressBar.style.width = `${global.progress}%`;
  elements.deleteAll.disabled = data.series.length === 0 && data.projects.length === 0;

  const seriesList = filteredSeries();
  elements.grid.replaceChildren(...seriesList.map(createSeriesCard));
  elements.empty.hidden = seriesList.length > 0;
  renderEmptyState(seriesList.length);
  renderProjectTree();

  if (detailSeriesId && elements.detailSidebar.classList.contains("is-open")) {
    renderDetail(detailSeriesId);
  }
}

function renderProjectTree() {
  const groups = new Map();
  for (const project of data.projects) {
    const name = project.name?.trim();
    if (name && !groups.has(name)) groups.set(name, []);
  }
  for (const series of data.series) {
    const project = (series.project || series.title || "名称未設定").trim();
    if (!groups.has(project)) groups.set(project, []);
    groups.get(project).push(series);
  }

  $("#projectCount").textContent = groups.size;
  $("#playlistTreeCount").textContent = data.series.length;
  if (!groups.size) {
    elements.projectTree.innerHTML =
      '<p class="project-empty">フォルダーがありません。<br />上の「＋」から最初のフォルダーを作れます。</p>';
    return;
  }

  const query = normalizeText(elements.projectSearch.value.trim());
  const visibleGroups = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ja"))
    .filter(([project, seriesList]) => {
      const aliases = projectMatchTerms(project);
      return (
        !query ||
        normalizeText(`${project} ${aliases.join(" ")}`).includes(query) ||
        seriesList.some((series) =>
          normalizeText(`${series.title} ${series.channelTitle || ""}`).includes(query),
        )
      );
    });

  if (!visibleGroups.length) {
    elements.projectTree.innerHTML =
      '<p class="project-empty">一致するフォルダーや<br />プレイリストがありません。</p>';
    return;
  }

  config.expandedProjects ||= {};
  elements.projectTree.innerHTML = visibleGroups
    .map(([project, seriesList]) => {
      const rule = projectRuleByName(project);
      const aliases = rule?.aliases || [];
      const matchTerms = projectMatchTerms(project);
      const matchedSeries = query
        ? seriesList.filter(
            (series) =>
              normalizeText(`${project} ${matchTerms.join(" ")} ${series.title} ${series.channelTitle || ""}`).includes(
                query,
              ),
          )
        : seriesList;
      const expanded = Boolean(query) || config.expandedProjects[project] !== false;
      const totals = seriesList.reduce(
        (result, series) => {
          const stats = getSeriesStats(series);
          result.done += stats.done;
          result.total += stats.total;
          return result;
        },
        { done: 0, total: 0 },
      );
      const progress = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;
      const folderKey = `folder:${project}`;
      return `
      <div class="project-group${expanded ? " is-expanded" : ""}" data-drop-project="${escapeHtml(project)}">
        <div
          class="project-row${selectedTreeKey === folderKey ? " is-selected" : ""}"
          role="treeitem"
          tabindex="${selectedTreeKey === folderKey || (!selectedTreeKey && visibleGroups[0][0] === project) ? "0" : "-1"}"
          aria-expanded="${expanded}"
          data-tree-folder="${escapeHtml(project)}"
          title="${escapeHtml(aliases.length ? `${project} / ${aliases.join(" / ")}` : project)}"
        >
          <button class="tree-chevron" type="button" data-tree-toggle="${escapeHtml(project)}" tabindex="-1" aria-label="${
            expanded ? "折りたたむ" : "展開する"
          }">${icon("chevron-down")}</button>
          <span class="folder-icon" aria-hidden="true"></span>
          <span class="project-name">${escapeHtml(project)}</span>
          <span class="project-progress" title="${totals.done}/${totals.total} 本を視聴済み">${
            totals.total ? `${progress}%` : "—"
          }</span>
          <span class="project-item-count">${seriesList.length}</span>
          <button
            class="tree-context-trigger"
            type="button"
            data-context-kind="folder"
            data-context-id="${escapeHtml(project)}"
            tabindex="-1"
            aria-label="「${escapeHtml(project)}」の操作"
          >${icon("more")}</button>
        </div>
        <div class="project-playlists" role="group"${expanded ? "" : " hidden"}>
          ${
            matchedSeries.length
              ? matchedSeries
            .sort((a, b) => getChannelName(a).localeCompare(getChannelName(b), "ja"))
            .map(
              (series) => {
                const stats = getSeriesStats(series);
                const playlistKey = `playlist:${series.id}`;
                const channelName = getChannelName(series);
                return `
                  <div class="project-playlist-row${selectedTreeKey === playlistKey ? " is-selected" : ""}">
                    <button
                      class="project-playlist"
                      type="button"
                      role="treeitem"
                      tabindex="${selectedTreeKey === playlistKey ? "0" : "-1"}"
                      draggable="true"
                      data-project-series="${escapeHtml(series.id)}"
                      data-drag-series="${escapeHtml(series.id)}"
                      title="${escapeHtml(`${channelName} / ${series.title}`)}"
                    >
                      <span class="playlist-file-icon" aria-hidden="true">${icon("youtube", "youtube-icon")}</span>
                      <span class="playlist-title">${escapeHtml(channelName)}</span>
                      <span class="playlist-progress">${stats.progress}%</span>
                    </button>
                    <button
                      class="tree-context-trigger"
                      type="button"
                      data-context-kind="playlist"
                      data-context-id="${escapeHtml(series.id)}"
                      tabindex="-1"
                      aria-label="「${escapeHtml(channelName)}」の操作"
                    >${icon("more")}</button>
                  </div>
                `;
              },
            )
            .join("")
              : '<p class="project-empty-folder">プレイリストはまだありません</p>'
          }
        </div>
      </div>
    `;
    })
    .join("");
}

function renderEmptyState(visibleCount) {
  const title = $(".empty-state h2", elements.empty);
  const copy = $(".empty-state > p", elements.empty);
  const button = $("#emptyAdd");
  if (data.series.length && visibleCount === 0) {
    title.innerHTML = "条件に合うプレイリストが<br />ありません";
    copy.innerHTML = "検索ワードやフィルターを変更してみてください。";
    button.textContent = "すべて表示";
    button.dataset.mode = "clear";
  } else {
    title.innerHTML = "最初のプレイリストを<br />登録しよう";
    copy.innerHTML = "上の欄にプレイリスト URL を貼り付けると、<br />動画が視聴タスクとして並びます。";
    button.innerHTML = `URL を入力する ${icon("arrow-up")}`;
    button.dataset.mode = "add";
  }
}

function createSeriesCard(series) {
  const fragment = elements.template.content.cloneNode(true);
  const card = $(".series-card", fragment);
  const stats = getSeriesStats(series);
  card.dataset.id = series.id;
  card.dataset.dragSeries = series.id;
  card.draggable = true;
  const image = $(".series-cover img", card);
  image.src = series.thumbnail || "./favicon.svg";
  image.alt = `${series.title} のサムネイル`;
  $(".episode-count", card).textContent = `${stats.total} 本`;
  $("h3", card).textContent = series.title;
  $(".channel-name", card).textContent = series.channelTitle || "YouTube プレイリスト";
  $(".progress-copy strong", card).textContent = `${stats.done} / ${stats.total}`;
  $(".progress-track span", card).style.width = `${stats.progress}%`;
  const state = $(".series-state", card);
  if (stats.progress === 100 && stats.total) {
    state.textContent = "視聴完了";
    state.classList.add("is-done");
  } else if (stats.doing) {
    state.textContent = "視聴中";
  } else {
    state.textContent = "未視聴";
    state.classList.add("is-new");
  }
  const label = $(".continue-label", card);
  label.textContent = stats.progress === 100 ? "もう一度見る" : stats.doing ? "続きを見る" : "視聴をはじめる";
  return card;
}

async function fetchJson(path, params) {
  const url = new URL(`${API_BASE}/${path}`);
  Object.entries({ ...params, key: config.apiKey }).forEach(([key, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  });
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = payload.error?.errors?.[0]?.reason;
    const friendly = {
      keyInvalid: "API キーが正しくありません。設定を確認してください。",
      quotaExceeded: "YouTube API の本日の利用上限に達しました。",
      playlistItemsNotAccessible: "このプレイリストは非公開、または取得できません。",
      forbidden: "API キーの参照元制限または API 設定を確認してください。",
    };
    throw new Error(friendly[reason] || payload.error?.message || "YouTube から情報を取得できませんでした。");
  }
  return payload;
}

async function fetchPlaylist(playlistId) {
  const playlistResponse = await fetchJson("playlists", {
    part: "snippet,contentDetails,status",
    id: playlistId,
    maxResults: 1,
  });
  const playlist = playlistResponse.items?.[0];
  if (!playlist) throw new Error("プレイリストが見つかりません。URL と公開設定を確認してください。");

  const rawItems = [];
  let pageToken = "";
  do {
    const response = await fetchJson("playlistItems", {
      part: "snippet,contentDetails,status",
      playlistId,
      maxResults: 50,
      pageToken,
    });
    rawItems.push(...(response.items || []));
    pageToken = response.nextPageToken || "";
  } while (pageToken);

  const videoIds = [
    ...new Set(rawItems.map((item) => item.contentDetails?.videoId).filter(Boolean)),
  ];
  const videoDetails = new Map();
  for (let index = 0; index < videoIds.length; index += 50) {
    const response = await fetchJson("videos", {
      part: "contentDetails,status",
      id: videoIds.slice(index, index + 50).join(","),
      maxResults: 50,
    });
    for (const video of response.items || []) videoDetails.set(video.id, video);
  }

  return {
    playlist,
    items: rawItems,
    videoDetails,
  };
}

function mergePlaylistResult(playlistId, result) {
  const now = new Date().toISOString();
  const existing = data.series.find((series) => series.id === playlistId);
  const existingTasks = new Map((existing?.tasks || []).map((task) => [task.id, task]));

  const freshTasks = result.items.map((item, index) => {
    const previous = existingTasks.get(item.id);
    const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || "";
    const video = result.videoDetails.get(videoId);
    existingTasks.delete(item.id);
    return {
      id: item.id,
      videoId,
      title: item.snippet?.title || "タイトルを取得できない動画",
      thumbnail: getThumbnail(item.snippet?.thumbnails),
      sourcePosition: item.snippet?.position ?? index,
      position: item.snippet?.position ?? index,
      episodeOrder: parseEpisodeOrder(item.snippet?.title),
      publishedAt: item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || null,
      duration: parseDuration(video?.contentDetails?.duration),
      privacyStatus: item.status?.privacyStatus || video?.status?.privacyStatus || "unknown",
      status: previous?.status || "todo",
      archived: false,
      createdAt: previous?.createdAt || now,
      updatedAt: previous?.updatedAt || now,
    };
  });

  for (const oldTask of existingTasks.values()) {
    freshTasks.push({ ...oldTask, archived: true });
  }
  sortPlaylistTasks(freshTasks);

  const snippet = result.playlist.snippet || {};
  const placement = existing
    ? {
        projectName: existing.project || existing.title || "名称未設定",
        createNew: false,
        matchType: "existing",
      }
    : inferProjectPlacement(snippet.title);
  const nextSeries = {
    id: playlistId,
    title: snippet.title || existing?.title || "名称未設定のプレイリスト",
    description: snippet.description || "",
    channelTitle: snippet.channelTitle || "",
    project: placement.projectName,
    thumbnail: getThumbnail(snippet.thumbnails) || freshTasks.find((task) => task.thumbnail)?.thumbnail || "",
    sourceUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
    privacyStatus: result.playlist.status?.privacyStatus || "unknown",
    remoteItemCount: result.playlist.contentDetails?.itemCount ?? freshTasks.length,
    tasks: freshTasks,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastSyncedAt: now,
  };

  if (existing) {
    data.series[data.series.indexOf(existing)] = nextSeries;
  } else {
    data.series.unshift(nextSeries);
  }
  if (!projectRuleByName(nextSeries.project)) {
    data.projects.push({ name: nextSeries.project, aliases: [], learnedAliases: [] });
  } else if (!existing && !placement.createNew) {
    learnPlaylistTitle(nextSeries.project, nextSeries.title);
  }
  saveData();
  return { series: nextSeries, placement };
}

async function importPlaylist(input, { quiet = false } = {}) {
  const playlistId = extractPlaylistId(input);
  if (!playlistId) throw new Error("プレイリスト ID を含む YouTube URL を入力してください。");
  if (!config.apiKey) {
    pendingPlaylistUrl = input;
    elements.apiKey.value = "";
    elements.settingsDialog.showModal();
    throw new Error("最初に YouTube API キーを設定してください。");
  }
  if (!quiet) setFormLoading(true, "プレイリストを読み込み中…");
  const result = await fetchPlaylist(playlistId);
  const { series, placement } = mergePlaylistResult(playlistId, result);
  render();
  if (!quiet) {
    elements.url.value = "";
    const placementMessage = placement.createNew
      ? `新しい「${series.project}」フォルダーを作成しました。`
      : `「${series.project}」フォルダーへ${placement.matchType === "fuzzy" ? "近似一致で" : ""}分類しました。`;
    setFormMessage(
      `${series.tasks.filter((task) => !task.archived).length} 本の動画を取り込み、${placementMessage}`,
      false,
    );
    showToast(`「${series.title}」を「${series.project}」へ追加しました`);
  }
  return series;
}

function setFormLoading(isLoading, message = "") {
  const button = $("button[type='submit']", elements.form);
  button.disabled = isLoading;
  button.firstElementChild.textContent = isLoading ? "取得中…" : "取り込む";
  if (message) setFormMessage(message, false);
}

function setFormMessage(message, isError = true) {
  elements.formMessage.textContent = message;
  elements.formMessage.style.color = isError ? "var(--orange-dark)" : "var(--ink-soft)";
}

function openSeries(seriesId) {
  if (!elements.detailSidebar.classList.contains("is-open")) {
    detailReturnFocus = document.activeElement;
  }
  detailSeriesId = seriesId;
  renderDetail(seriesId);
  elements.detailSidebar.inert = false;
  elements.detailSidebar.setAttribute("aria-hidden", "false");
  elements.detailSidebar.classList.add("is-open");
  document.body.classList.add("detail-open");
  history.replaceState(null, "", `#series=${encodeURIComponent(seriesId)}`);
  requestAnimationFrame(() => $(".detail-close", elements.detailSidebar)?.focus());
}

function closeSeriesDetail({ restoreFocus = true } = {}) {
  if (!elements.detailSidebar.classList.contains("is-open") && !detailSeriesId) return;
  elements.detailSidebar.classList.remove("is-open");
  elements.detailSidebar.setAttribute("aria-hidden", "true");
  elements.detailSidebar.inert = true;
  document.body.classList.remove("detail-open");
  detailSeriesId = null;
  if (location.hash.startsWith("#series=")) {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
  if (restoreFocus && detailReturnFocus?.isConnected) detailReturnFocus.focus();
  detailReturnFocus = null;
}

function isDetailPinned() {
  return Boolean(config.detailPinned && DETAIL_PIN_MEDIA.matches);
}

function syncDetailPinnedState() {
  const pinned = isDetailPinned();
  document.body.classList.toggle("detail-pinned", pinned);
  const control = $("[data-detail-action='pin']", elements.detailSidebar);
  if (!control) return;
  control.setAttribute("aria-pressed", String(pinned));
  control.setAttribute(
    "aria-label",
    pinned ? "右サイドバーの固定を解除" : "右サイドバーを固定",
  );
  control.title = pinned
    ? "固定を解除してメイン画面に重ねる"
    : "固定してメイン画面と並べる";
}

function toggleDetailPinned() {
  config.detailPinned = !isDetailPinned();
  saveConfig();
  syncDetailPinnedState();
}

function renderDetail(seriesId) {
  const series = data.series.find((item) => item.id === seriesId);
  if (!series) {
    closeSeriesDetail();
    return;
  }
  const stats = getSeriesStats(series);
  const tasks = series.tasks.filter((task) => !task.archived);
  const remaining = Math.max(0, stats.total - stats.done);
  elements.detailContent.innerHTML = `
    <div class="detail-layout">
      <header class="detail-hero">
        <div class="detail-cover-wrap">
          <img class="detail-cover" src="${escapeHtml(series.thumbnail || "./favicon.svg")}" alt="" />
          <span class="detail-cover-label">PLAYLIST</span>
        </div>
        <div class="detail-hero-copy">
          <span class="detail-eyebrow">Playlist detail</span>
          <h2>${escapeHtml(series.title)}</h2>
          <div class="detail-meta">
            <span>${escapeHtml(getChannelName(series))}</span>
            <span>最終同期 ${escapeHtml(formatDate(series.lastSyncedAt))}</span>
          </div>
        </div>
        <button class="icon-button detail-close" type="button" data-detail-action="close" aria-label="閉じる">${icon("x")}</button>
      </header>
      <section class="detail-main">
        <div class="detail-toolbar">
          <div class="detail-summary">
            <div class="detail-summary-head">
              <span class="detail-summary-label">視聴進捗</span>
              <strong>${stats.progress}<small>%</small></strong>
            </div>
            <div
              class="detail-progress-track"
              role="progressbar"
              aria-label="プレイリストの視聴進捗"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="${stats.progress}"
            ><span style="width: ${stats.progress}%"></span></div>
            <div class="detail-summary-meta">
              <span><b>${stats.done}</b> / ${stats.total} 本を視聴済み</span>
              <span>残り <b>${remaining}</b> 本</span>
            </div>
          </div>
          <div class="detail-actions" role="group" aria-label="プレイリスト操作">
            <button
              class="compact-button detail-action-button detail-pin-toggle"
              type="button"
              data-detail-action="pin"
              aria-pressed="${isDetailPinned()}"
              aria-label="${isDetailPinned() ? "右サイドバーの固定を解除" : "右サイドバーを固定"}"
              title="${isDetailPinned() ? "固定を解除してメイン画面に重ねる" : "固定してメイン画面と並べる"}"
            >${icon("pin")}<span class="detail-action-label">固定</span></button>
            <button class="compact-button detail-action-button" type="button" data-detail-action="project" aria-label="フォルダーを変更" title="フォルダーを変更">${icon("folder")}<span class="detail-action-label">移動</span></button>
            <button class="compact-button detail-action-button" type="button" data-detail-action="sync" aria-label="YouTube と再同期" title="YouTube と再同期">${icon("refresh")}<span class="detail-action-label">同期</span></button>
            <a class="compact-button detail-action-button youtube-button" href="${escapeHtml(series.sourceUrl)}" target="_blank" rel="noreferrer" aria-label="YouTube で開く（新しいタブ）" title="YouTube で開く">${icon("youtube", "youtube-icon")}<span class="detail-action-label">YouTube</span></a>
            <button class="compact-button detail-action-button is-danger" type="button" data-detail-action="delete" aria-label="プレイリストを削除" title="プレイリストを削除">${icon("trash")}<span class="detail-action-label">削除</span></button>
          </div>
        </div>
        <div class="task-list-heading">
          <div>
            <span class="detail-eyebrow">Episodes</span>
            <h3>エピソード</h3>
          </div>
          <span class="task-list-count">${tasks.length} 本</span>
        </div>
        <ol class="task-list">
          ${tasks.map((task, index) => taskRowHtml(task, index)).join("")}
        </ol>
      </section>
    </div>
  `;
}

function openProjectDialog(seriesId) {
  const series = data.series.find((item) => item.id === seriesId);
  if (!series) return;
  editingProjectSeriesId = seriesId;
  editingProjectOriginalName = series.project || series.title;
  elements.projectName.value = editingProjectOriginalName;
  elements.projectAliases.value = (projectRuleByName(editingProjectOriginalName)?.aliases || []).join("\n");
  elements.projectAliases.dataset.forProject = editingProjectOriginalName;
  $("#projectPlaylistName").textContent = `移動するプレイリスト：${series.title}`;
  const projects = projectNames().sort((a, b) => a.localeCompare(b, "ja"));
  $("#projectNameOptions").innerHTML = projects
    .map((project) => `<option value="${escapeHtml(project)}"></option>`)
    .join("");
  elements.projectDialog.showModal();
  requestAnimationFrame(() => elements.projectName.select());
}

function projectNames() {
  return [
    ...new Set([
      ...data.projects.map((project) => project.name?.trim()).filter(Boolean),
      ...data.series.map((series) => (series.project || series.title || "名称未設定").trim()),
    ]),
  ];
}

function findEquivalentProjectName(name, excluding = "") {
  const normalized = normalizeProjectMatch(name);
  return projectNames().find(
    (project) => project !== excluding && normalizeProjectMatch(project) === normalized,
  );
}

function setProjectExpanded(projectName, expanded, { focus = true } = {}) {
  config.expandedProjects ||= {};
  config.expandedProjects[projectName] = expanded;
  saveConfig();
  selectedTreeKey = `folder:${projectName}`;
  renderProjectTree();
  if (focus) {
    requestAnimationFrame(() => {
      [...elements.projectTree.querySelectorAll("[data-tree-folder]")]
        .find((item) => item.dataset.treeFolder === projectName)
        ?.focus();
    });
  }
}

function setAllProjectsExpanded(expanded) {
  config.expandedProjects ||= {};
  for (const project of projectNames()) config.expandedProjects[project] = expanded;
  if (!expanded) selectedTreeKey = "";
  saveConfig();
  renderProjectTree();
  showToast(expanded ? "すべてのフォルダーを展開しました" : "すべてのフォルダーを折りたたみました");
}

function openFolderDialog(projectName = null) {
  closeTreeContextMenu();
  editingFolderOriginalName = projectName;
  const rule = projectName ? projectRuleByName(projectName) : null;
  const seriesCount = projectName
    ? data.series.filter((series) => (series.project || series.title) === projectName).length
    : 0;
  $("#folderDialogTitle").textContent = projectName ? "フォルダーを編集" : "新しいフォルダー";
  $("#folderDialogLead").textContent = projectName
    ? "フォルダー名を変更すると、中のプレイリストもまとめて移動します。別名は今後の自動分類に使われます。"
    : "ゲームごとのフォルダーを作り、複数の実況プレイリストをひとまとめにできます。";
  elements.folderName.value = projectName || "";
  elements.folderAliases.value = (rule?.aliases || []).join("\n");
  $("#folderNameError").textContent = "";
  $("#saveFolder").innerHTML = `${icon(projectName ? "save" : "folder-plus")}<span>${
    projectName ? "変更を保存" : "フォルダーを作成"
  }</span>`;
  $("#deleteFolder").hidden = !projectName;
  $("#folderDialogSummary").hidden = !projectName;
  $("#folderDialogSummary").innerHTML = projectName
    ? `<strong>${seriesCount} 件のプレイリスト</strong>がこのフォルダーに入っています。`
    : "";
  elements.folderDialog.showModal();
  requestAnimationFrame(() => elements.folderName.select());
}

function saveFolderFromDialog() {
  const name = elements.folderName.value.trim();
  const originalName = editingFolderOriginalName;
  const duplicate = findEquivalentProjectName(name, originalName || "");
  if (!name) {
    $("#folderNameError").textContent = "フォルダー名を入力してください。";
    elements.folderName.focus();
    return false;
  }
  if (duplicate) {
    $("#folderNameError").textContent = `「${duplicate}」はすでに存在します。`;
    elements.folderName.focus();
    return false;
  }

  let aliases = parseAliases(elements.folderAliases.value).filter(
    (alias) => normalizeProjectMatch(alias) !== normalizeProjectMatch(name),
  );

  if (!originalName) {
    data.projects.push({ name, aliases, learnedAliases: [] });
    config.expandedProjects ||= {};
    config.expandedProjects[name] = true;
  } else {
    const oldRule = projectRuleByName(originalName);
    if (originalName !== name) {
      aliases = [...new Set([...aliases, originalName, ...(oldRule?.aliases || [])])].filter(
        (alias) => normalizeProjectMatch(alias) !== normalizeProjectMatch(name),
      );
      for (const series of data.series) {
        if ((series.project || series.title) === originalName) {
          series.project = name;
          series.updatedAt = new Date().toISOString();
        }
      }
    }
    const learnedAliases = [...(oldRule?.learnedAliases || [])];
    data.projects = data.projects.filter((project) => project.name !== originalName);
    data.projects.push({ name, aliases, learnedAliases });
    config.expandedProjects ||= {};
    config.expandedProjects[name] = config.expandedProjects[originalName] !== false;
    if (originalName !== name) delete config.expandedProjects[originalName];
  }

  saveConfig();
  saveData();
  selectedTreeKey = `folder:${name}`;
  elements.folderDialog.close();
  render();
  showToast(originalName ? `「${name}」へフォルダー名を変更しました` : `「${name}」を作成しました`);
  return true;
}

function requestConfirmation({ title, message, actionLabel = "削除する" }) {
  if (elements.confirmDialog.open) {
    confirmResolver?.(false);
    confirmResolver = null;
    elements.confirmDialog.close("cancel");
  }
  $("#confirmTitle").textContent = title;
  $("#confirmMessage").textContent = message;
  $("#confirmAction").innerHTML = `${icon("trash")}<span>${escapeHtml(actionLabel)}</span>`;
  elements.confirmDialog.returnValue = "";
  elements.confirmDialog.showModal();
  requestAnimationFrame(() => $("#confirmAction").focus());
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function settleConfirmation(confirmed) {
  const resolver = confirmResolver;
  confirmResolver = null;
  resolver?.(confirmed);
}

async function deleteFolder(projectName) {
  const containedSeries = data.series.filter(
    (series) => (series.project || series.title || "名称未設定").trim() === projectName,
  );
  if (projectName === "未分類" && containedSeries.length) {
    showToast("プレイリストが入っている「未分類」フォルダーは削除できません", true);
    return;
  }
  const confirmed = await requestConfirmation({
    title: `「${projectName}」を削除`,
    message: containedSeries.length
      ? `${containedSeries.length} 件のプレイリストは削除せず、「未分類」フォルダーへ移動します。\nフォルダーの別名と自動分類ルールは削除されます。`
      : "空のフォルダーと、その別名・自動分類ルールを削除します。",
    actionLabel: "フォルダーを削除",
  });
  if (!confirmed) return;

  if (containedSeries.length) {
    for (const series of containedSeries) {
      series.project = "未分類";
      series.updatedAt = new Date().toISOString();
    }
    if (!projectRuleByName("未分類")) {
      data.projects.push({ name: "未分類", aliases: [], learnedAliases: [] });
    }
  }
  data.projects = data.projects.filter((project) => project.name !== projectName);
  if (config.expandedProjects) delete config.expandedProjects[projectName];
  saveConfig();
  saveData();
  selectedTreeKey = "";
  if (elements.folderDialog.open) elements.folderDialog.close();
  render();
  showToast(`「${projectName}」を削除しました`);
}

async function deleteSeries(seriesId) {
  const series = data.series.find((item) => item.id === seriesId);
  if (!series) return;
  const confirmed = await requestConfirmation({
    title: "プレイリストを削除",
    message: `「${series.title}」と、すべての視聴進捗を削除します。\nこの操作は元に戻せません。`,
    actionLabel: "プレイリストを削除",
  });
  if (!confirmed) return;
  data.series = data.series.filter((item) => item.id !== series.id);
  if (detailSeriesId === series.id) closeSeriesDetail({ restoreFocus: false });
  saveData();
  selectedTreeKey = "";
  render();
  showToast("プレイリストを削除しました");
}

function selectTreeTarget(kind, id) {
  selectedTreeKey = `${kind}:${id}`;
  $$(".project-row.is-selected, .project-playlist-row.is-selected", elements.projectTree).forEach((item) =>
    item.classList.remove("is-selected"),
  );
  $$("[role='treeitem']", elements.projectTree).forEach((item) => {
    const matches =
      (kind === "folder" && item.dataset.treeFolder === id) ||
      (kind === "playlist" && item.dataset.projectSeries === id);
    item.tabIndex = matches ? 0 : -1;
    if (matches) {
      if (kind === "folder") item.classList.add("is-selected");
      else item.closest(".project-playlist-row")?.classList.add("is-selected");
    }
  });
}

function contextMenuItems(kind, id) {
  if (kind === "playlist") {
    const series = data.series.find((item) => item.id === id);
    return {
      label: series ? getChannelName(series) : "プレイリスト",
      items: [
        ["open-playlist", "panel", "詳細を開く", "Enter"],
        ["watch-playlist", "play", "続きを見る", ""],
        ["move-playlist", "move", "フォルダーを変更…", "F2"],
        ["sync-playlist", "refresh", "YouTube と再同期", ""],
        ["separator"],
        ["delete-playlist", "trash", "プレイリストを削除…", "Delete", true],
      ],
    };
  }
  if (kind === "folder") {
    return {
      label: id,
      items: [
        ["new-folder", "folder-plus", "新しいフォルダー…", ""],
        ["edit-folder", "edit", "名前・別名を編集…", "F2"],
        ["separator"],
        ["expand-folder", "chevrons-down", "フォルダーを展開", ""],
        ["collapse-folder", "chevrons-up", "フォルダーを折りたたむ", ""],
        ["separator"],
        ["delete-folder", "trash", "フォルダーを削除…", "Delete", true],
      ],
    };
  }
  return {
    label: "エクスプローラー",
    items: [
      ["new-folder", "folder-plus", "新しいフォルダー…", ""],
      ["expand-all", "chevrons-down", "すべて展開", ""],
      ["collapse-all", "chevrons-up", "すべて折りたたむ", ""],
    ],
  };
}

function openTreeContextMenu(kind, id, x, y) {
  contextTarget = { kind, id };
  if (kind !== "workspace") selectTreeTarget(kind, id);
  const menu = contextMenuItems(kind, id);
  elements.contextMenu.innerHTML = `
    <div class="context-menu-label">${escapeHtml(menu.label)}</div>
    ${menu.items
      .map((item) =>
        item[0] === "separator"
          ? '<div class="context-menu-separator" role="separator"></div>'
          : `<button class="context-menu-item${item[4] ? " is-danger" : ""}" type="button" role="menuitem" data-context-action="${item[0]}">
              <span class="context-menu-icon" aria-hidden="true">${icon(item[1])}</span>
              <span>${item[2]}</span>
              ${item[3] ? `<kbd>${item[3]}</kbd>` : "<span></span>"}
            </button>`,
      )
      .join("")}
  `;
  elements.contextMenu.hidden = false;
  const rect = elements.contextMenu.getBoundingClientRect();
  elements.contextMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
  elements.contextMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
  requestAnimationFrame(() => $(".context-menu-item", elements.contextMenu)?.focus());
}

function closeTreeContextMenu() {
  elements.contextMenu.hidden = true;
  elements.contextMenu.replaceChildren();
  contextTarget = null;
}

async function runTreeContextAction(action) {
  const target = contextTarget;
  closeTreeContextMenu();
  if (!target) return;
  if (action === "new-folder") openFolderDialog();
  if (action === "edit-folder") openFolderDialog(target.id);
  if (action === "expand-folder") setProjectExpanded(target.id, true);
  if (action === "collapse-folder") setProjectExpanded(target.id, false);
  if (action === "expand-all") setAllProjectsExpanded(true);
  if (action === "collapse-all") setAllProjectsExpanded(false);
  if (action === "delete-folder") await deleteFolder(target.id);
  if (action === "open-playlist") openSeries(target.id);
  if (action === "watch-playlist") continueSeries(target.id);
  if (action === "move-playlist") openProjectDialog(target.id);
  if (action === "delete-playlist") await deleteSeries(target.id);
  if (action === "sync-playlist") {
    try {
      await syncSeries(target.id);
    } catch (error) {
      showToast(error.message, true);
    }
  }
}

function moveSeriesToProject(seriesId, projectName) {
  const series = data.series.find((item) => item.id === seriesId);
  const targetName = projectName.trim();
  if (!series || !targetName) return false;

  const oldName = (series.project || series.title || "名称未設定").trim();
  if (oldName === targetName) return false;

  const targetAliases = [...(projectRuleByName(targetName)?.aliases || [])];

  const targetRule = projectRuleByName(targetName);
  if (targetRule) {
    targetRule.aliases = targetAliases;
  } else {
    data.projects.push({ name: targetName, aliases: targetAliases, learnedAliases: [] });
  }

  series.project = targetName;
  learnPlaylistTitle(targetName, series.title);
  series.updatedAt = new Date().toISOString();
  config.expandedProjects ||= {};
  config.expandedProjects[targetName] = true;
  saveConfig();
  selectedTreeKey = `playlist:${series.id}`;
  saveData();
  render();
  showToast(`「${series.title}」を「${targetName}」へ移動しました`);
  return true;
}

function clearPlaylistDragState() {
  draggedSeriesId = null;
  activeDropProject = null;
  document.body.classList.remove("is-dragging-playlist");
  $$(".is-dragging").forEach((item) => item.classList.remove("is-dragging"));
  $$(".project-group.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
}

function setActiveDropProject(group) {
  if (activeDropProject === group) return;
  activeDropProject?.classList.remove("is-drop-target");
  activeDropProject = group;
  activeDropProject?.classList.add("is-drop-target");
}

function handlePlaylistDragStart(event) {
  const source = event.target.closest("[data-drag-series]");
  if (!source) return;
  draggedSeriesId = source.dataset.dragSeries;
  suppressPlaylistClickUntil = Date.now() + 500;
  source.classList.add("is-dragging");
  document.body.classList.add("is-dragging-playlist");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedSeriesId);
  event.dataTransfer.setData("application/x-playlog-series", draggedSeriesId);
}

function handleProjectDragOver(event) {
  if (!draggedSeriesId) return;
  const group = event.target.closest("[data-drop-project]");
  if (!group) {
    setActiveDropProject(null);
    return;
  }
  const series = data.series.find((item) => item.id === draggedSeriesId);
  const currentProject = (series?.project || series?.title || "").trim();
  if (!series || currentProject === group.dataset.dropProject) {
    setActiveDropProject(null);
    event.dataTransfer.dropEffect = "none";
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  setActiveDropProject(group);
}

function handleProjectDrop(event) {
  if (!draggedSeriesId) return;
  const group = event.target.closest("[data-drop-project]");
  if (!group) return;
  event.preventDefault();
  const seriesId =
    event.dataTransfer.getData("application/x-playlog-series") ||
    event.dataTransfer.getData("text/plain") ||
    draggedSeriesId;
  const projectName = group.dataset.dropProject;
  clearPlaylistDragState();
  moveSeriesToProject(seriesId, projectName);
}

function taskRowHtml(task, index) {
  const labels = { todo: "未視聴", doing: "視聴中", done: "視聴済み", skipped: "スキップ" };
  const statusIcons = { todo: "play", doing: "play", done: "check-circle", skipped: "skip" };
  const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(task.videoId)}`;
  return `
    <li class="task-row is-${escapeHtml(task.status)}" data-task-id="${escapeHtml(task.id)}"${task.status === "doing" ? ' aria-current="true"' : ""}>
      <button class="task-check" type="button" data-detail-action="toggle" aria-label="${task.status === "done" ? "未視聴に戻す" : "視聴済みにする"}">
        ${task.status === "done" ? icon("check") : ""}
      </button>
      <a class="task-thumb" href="${videoUrl}" target="_blank" rel="noreferrer" data-detail-action="watch">
        <img src="${escapeHtml(task.thumbnail || "./favicon.svg")}" alt="" loading="lazy" />
        ${task.duration ? `<span class="duration">${formatDuration(task.duration)}</span>` : ""}
      </a>
      <div class="task-copy">
        <span class="task-index">EP. ${String(index + 1).padStart(2, "0")}</span>
        <a href="${videoUrl}" target="_blank" rel="noreferrer" data-detail-action="watch" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</a>
      </div>
      <button class="task-state-button" type="button" data-detail-action="cycle" aria-label="視聴状態を変更。現在は${labels[task.status] || "未視聴"}">${icon(
        statusIcons[task.status] || "play",
      )}<span>${labels[task.status] || "未視聴"}</span></button>
    </li>
  `;
}

function updateTask(seriesId, taskId, nextStatus) {
  const series = data.series.find((item) => item.id === seriesId);
  const task = series?.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (nextStatus === "doing") {
    series.tasks.forEach((item) => {
      if (item.status === "doing" && item.id !== taskId) item.status = "todo";
    });
  }
  task.status = nextStatus;
  task.updatedAt = new Date().toISOString();
  series.updatedAt = task.updatedAt;
  saveData();
  render();
}

function firstWatchableTask(series) {
  return (
    series.tasks.find((task) => !task.archived && task.status === "doing") ||
    series.tasks.find((task) => !task.archived && task.status === "todo") ||
    series.tasks.find((task) => !task.archived && task.status === "done")
  );
}

function continueSeries(seriesId, shouldOpen = true) {
  const series = data.series.find((item) => item.id === seriesId);
  const task = series && firstWatchableTask(series);
  if (!task) {
    showToast("視聴できる動画がありません", true);
    return;
  }
  if (task.status === "todo") updateTask(seriesId, task.id, "doing");
  if (shouldOpen) {
    window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(task.videoId)}`, "_blank", "noopener");
  }
}

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " is-error" : ""}`;
  toast.textContent = message;
  $("#toastRegion").append(toast);
  setTimeout(() => toast.remove(), 3600);
}

async function syncSeries(seriesId, { quiet = false } = {}) {
  const series = data.series.find((item) => item.id === seriesId);
  if (!series) return;
  if (!config.apiKey) {
    elements.settingsDialog.showModal();
    throw new Error("YouTube API キーを設定してください。");
  }
  const result = await fetchPlaylist(seriesId);
  const { series: updated } = mergePlaylistResult(seriesId, result);
  render();
  if (!quiet) showToast(`「${updated.title}」を再同期しました`);
}

async function syncAllSeries() {
  if (!data.series.length) {
    showToast("同期するプレイリストがありません");
    return;
  }
  if (!config.apiKey) {
    elements.settingsDialog.showModal();
    return;
  }
  elements.syncAll.classList.add("is-spinning");
  elements.syncAll.disabled = true;
  let success = 0;
  try {
    for (const series of [...data.series]) {
      try {
        await syncSeries(series.id, { quiet: true });
        success += 1;
      } catch (error) {
        console.error(error);
      }
    }
    showToast(`${success}/${data.series.length} 件のプレイリストを同期しました`, success === 0);
  } finally {
    elements.syncAll.classList.remove("is-spinning");
    elements.syncAll.disabled = false;
  }
}

async function deleteAllPlaylistsAndFolders() {
  const playlistCount = data.series.length;
  const folderCount = new Set([
    ...data.projects.map((project) => project.name?.trim()).filter(Boolean),
    ...data.series.map((series) => (series.project || series.title || "名称未設定").trim()),
  ]).size;
  if (!playlistCount && !folderCount) {
    showToast("削除するプレイリストやフォルダーがありません");
    return;
  }

  const shouldDelete = await requestConfirmation({
    title: "プレイリストとフォルダーを全削除",
    message: `登録中のプレイリスト ${playlistCount} 件、フォルダー ${folderCount} 件、すべての視聴進捗と自動分類ルールを削除します。\nこの操作は元に戻せません。`,
    actionLabel: "すべて削除",
  });
  if (!shouldDelete) return;

  closeSeriesDetail({ restoreFocus: false });
  data.series = [];
  data.projects = [];
  config.expandedProjects = {};
  selectedTreeKey = "";
  saveConfig();
  saveData();
  render();
  showToast("すべてのプレイリストとフォルダーを削除しました");
}

async function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("handles");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeFileHandle(handle) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("handles", "readwrite");
    tx.objectStore("handles").put(handle, HANDLE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getStoredFileHandle() {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("handles").objectStore("handles").get(HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function restoreFileConnection() {
  if (!("showSaveFilePicker" in window)) return;
  try {
    const handle = await getStoredFileHandle();
    if (handle && (await handle.queryPermission({ mode: "readwrite" })) === "granted") {
      saveFileHandle = handle;
      updateBackupUI();
    }
  } catch (error) {
    console.warn("保存ファイル接続を復元できませんでした", error);
  }
}

async function connectSaveFile() {
  if (!("showSaveFilePicker" in window)) {
    downloadBackup();
    showToast("このブラウザでは自動同期に未対応のため、ファイルをダウンロードしました");
    return;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "curat-save.json",
      types: [{ description: "Curat 保存データ", accept: { "application/json": [".json"] } }],
    });
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("ファイルへの書き込みが許可されませんでした。");

    const existingFile = await handle.getFile();
    if (existingFile.size > 0) {
      let existingBackup;
      try {
        existingBackup = JSON.parse(await existingFile.text());
      } catch {
        throw new Error("選択したファイルは JSON 形式ではありません。別のファイル名を選んでください。");
      }
      if (!isValidBackup(existingBackup)) {
        throw new Error("選択したファイルは Curat の保存データではありません。");
      }

      const fileUpdatedAt = new Date(existingBackup.data.updatedAt || existingBackup.exportedAt || 0);
      const localUpdatedAt = new Date(data.updatedAt || 0);
      const shouldRestore = !data.series.length || fileUpdatedAt > localUpdatedAt;
      if (shouldRestore) {
        data = migrateData(existingBackup.data);
        saveData({ syncFile: false });
        render();
        showToast(`${data.series.length} 件のプレイリストを保存ファイルから復元しました`);
      } else if (localUpdatedAt > fileUpdatedAt) {
        const shouldUpdateFile = window.confirm(
          "ブラウザ内のデータの方が新しいようです。現在のデータで保存ファイルを更新しますか？",
        );
        if (!shouldUpdateFile) return;
      }
    }

    saveFileHandle = handle;
    await storeFileHandle(handle);
    await writeConnectedFile();
    showToast("保存ファイルを接続しました");
  } catch (error) {
    if (error.name !== "AbortError") showToast(error.message, true);
  }
}

async function writeConnectedFile() {
  if (!saveFileHandle) return;
  try {
    const permission = await saveFileHandle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      saveFileHandle = null;
      updateBackupUI();
      return;
    }
    const writable = await saveFileHandle.createWritable();
    await writable.write(JSON.stringify(exportPayload(), null, 2));
    await writable.close();
    updateBackupUI(true);
  } catch (error) {
    console.warn("保存ファイルへの書き込みに失敗しました", error);
    elements.backupStatus.textContent = "ファイル同期に失敗";
  }
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `curat-backup-${date}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("バックアップをダウンロードしました");
}

async function restoreBackup(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (!isValidBackup(payload)) throw new Error("Curat のバックアップファイルではありません。");
    const count = payload.data.series.length;
    if (data.series.length && !window.confirm(`現在のデータを置き換え、${count} 件のプレイリストを復元しますか？`)) return;
    data = migrateData(payload.data);
    saveData();
    render();
    showToast(`${count} 件のプレイリストを復元しました`);
    elements.backupDialog.close();
  } catch (error) {
    showToast(error.message || "バックアップを読み込めませんでした", true);
  }
}

function updateBackupUI(justSaved = false) {
  if (saveFileHandle) {
    elements.backupStatus.textContent = justSaved ? "ファイルへ同期済み" : "保存ファイル接続中";
    elements.saveStatusTitle.textContent = "保存ファイルを接続中";
    elements.saveStatusCopy.textContent = `「${saveFileHandle.name}」へ変更を自動同期します。`;
  } else {
    elements.backupStatus.textContent = "このブラウザに保存中";
    elements.saveStatusTitle.textContent = "ブラウザ保存は有効です";
    elements.saveStatusCopy.textContent = "外部の保存ファイルはまだ接続されていません。";
  }
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await importPlaylist(elements.url.value);
  } catch (error) {
    setFormMessage(error.message);
  } finally {
    setFormLoading(false);
  }
});

elements.grid.addEventListener("click", (event) => {
  if (Date.now() < suppressPlaylistClickUntil) return;
  const actionButton = event.target.closest("[data-action]");
  const card = event.target.closest(".series-card");
  if (!actionButton || !card) return;
  const seriesId = card.dataset.id;
  if (actionButton.dataset.action === "open") openSeries(seriesId);
  if (actionButton.dataset.action === "continue") continueSeries(seriesId);
  if (actionButton.dataset.action === "menu") openProjectDialog(seriesId);
});

elements.detailContent.addEventListener("click", async (event) => {
  const control = event.target.closest("[data-detail-action]");
  if (!control) return;
  const action = control.dataset.detailAction;
  if (action === "close") {
    closeSeriesDetail();
    return;
  }
  if (action === "pin") {
    toggleDetailPinned();
    return;
  }
  const series = data.series.find((item) => item.id === detailSeriesId);
  if (!series) return;
  if (action === "project") {
    openProjectDialog(series.id);
    return;
  }
  if (action === "sync") {
    control.disabled = true;
    try {
      await syncSeries(series.id);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      control.disabled = false;
    }
    return;
  }
  if (action === "delete") {
    await deleteSeries(series.id);
    return;
  }
  const row = control.closest(".task-row");
  const task = series.tasks.find((item) => item.id === row?.dataset.taskId);
  if (!task) return;
  if (action === "watch") {
    event.preventDefault();
    if (task.status === "todo") updateTask(series.id, task.id, "doing");
    window.open(control.href, "_blank", "noopener");
    return;
  }
  if (action === "toggle") updateTask(series.id, task.id, task.status === "done" ? "todo" : "done");
  if (action === "cycle") {
    const states = ["todo", "doing", "done", "skipped"];
    updateTask(series.id, task.id, states[(states.indexOf(task.status) + 1) % states.length]);
  }
});

$$("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    $$("[data-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    render();
  });
});

elements.search.addEventListener("input", render);
elements.syncAll.addEventListener("click", syncAllSeries);
elements.deleteAll.addEventListener("click", deleteAllPlaylistsAndFolders);

$("#emptyAdd").addEventListener("click", (event) => {
  if (event.currentTarget.dataset.mode === "clear") {
    elements.search.value = "";
    activeFilter = "all";
    $$("[data-filter]").forEach((item) => item.classList.toggle("is-active", item.dataset.filter === "all"));
    render();
  } else {
    elements.url.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

$("#openSettings").addEventListener("click", () => {
  elements.apiKey.value = config.apiKey;
  elements.settingsDialog.showModal();
  document.body.classList.remove("sidebar-open");
  updateSidebarControls();
});

$("#toggleKey").addEventListener("click", (event) => {
  const showing = elements.apiKey.type === "text";
  elements.apiKey.type = showing ? "password" : "text";
  $("span", event.currentTarget).textContent = showing ? "表示" : "隠す";
  event.currentTarget.setAttribute("aria-label", showing ? "API キーを表示" : "API キーを隠す");
});

$("#saveSettings").addEventListener("click", async () => {
  config.apiKey = elements.apiKey.value.trim();
  saveConfig();
  elements.settingsDialog.close();
  showToast("API 設定を保存しました");
  if (pendingPlaylistUrl && config.apiKey) {
    const url = pendingPlaylistUrl;
    pendingPlaylistUrl = "";
    try {
      await importPlaylist(url);
    } catch (error) {
      setFormMessage(error.message);
    } finally {
      setFormLoading(false);
    }
  }
});

$("#openBackup").addEventListener("click", () => {
  updateBackupUI();
  elements.backupDialog.showModal();
  document.body.classList.remove("sidebar-open");
  updateSidebarControls();
});
$("#closeBackup").addEventListener("click", () => elements.backupDialog.close());
$("#connectSave").addEventListener("click", connectSaveFile);
$("#downloadSave").addEventListener("click", downloadBackup);
$("#restoreSave").addEventListener("click", () => $("#restoreInput").click());
$("#restoreInput").addEventListener("change", (event) => {
  if (event.target.files?.[0]) restoreBackup(event.target.files[0]);
  event.target.value = "";
});

elements.projectTree.addEventListener("click", (event) => {
  if (Date.now() < suppressPlaylistClickUntil) {
    event.preventDefault();
    return;
  }
  const contextTrigger = event.target.closest("[data-context-kind]");
  if (contextTrigger) {
    event.stopPropagation();
    const rect = contextTrigger.getBoundingClientRect();
    openTreeContextMenu(
      contextTrigger.dataset.contextKind,
      contextTrigger.dataset.contextId,
      rect.right - 4,
      rect.bottom + 3,
    );
    return;
  }
  const folderRow = event.target.closest("[data-tree-folder]");
  if (folderRow) {
    const projectName = folderRow.dataset.treeFolder;
    selectTreeTarget("folder", projectName);
    const group = folderRow.closest(".project-group");
    setProjectExpanded(projectName, !group.classList.contains("is-expanded"));
    return;
  }
  const button = event.target.closest("[data-project-series]");
  if (!button) return;
  selectTreeTarget("playlist", button.dataset.projectSeries);
  openSeries(button.dataset.projectSeries);
  if (window.matchMedia("(max-width: 780px)").matches) {
    document.body.classList.remove("sidebar-open");
    updateSidebarControls();
  }
});

elements.projectTree.addEventListener("contextmenu", (event) => {
  const playlist = event.target.closest("[data-project-series]");
  const folder = event.target.closest("[data-tree-folder]");
  event.preventDefault();
  if (playlist) {
    openTreeContextMenu("playlist", playlist.dataset.projectSeries, event.clientX, event.clientY);
  } else if (folder) {
    openTreeContextMenu("folder", folder.dataset.treeFolder, event.clientX, event.clientY);
  } else {
    openTreeContextMenu("workspace", "", event.clientX, event.clientY);
  }
});

elements.projectTree.addEventListener("keydown", (event) => {
  if (event.target.closest(".tree-context-trigger")) return;
  const current = event.target.closest("[role='treeitem']");
  if (!current) return;
  const visibleItems = $$("[role='treeitem']", elements.projectTree).filter(
    (item) => !item.closest("[hidden]"),
  );
  const index = visibleItems.indexOf(current);
  const isFolder = Boolean(current.dataset.treeFolder);
  const id = current.dataset.treeFolder || current.dataset.projectSeries;

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const offset = event.key === "ArrowDown" ? 1 : -1;
    const next = visibleItems[Math.max(0, Math.min(visibleItems.length - 1, index + offset))];
    if (next) {
      selectTreeTarget(next.dataset.treeFolder ? "folder" : "playlist", next.dataset.treeFolder || next.dataset.projectSeries);
      next.focus();
    }
    return;
  }
  if (event.key === "ArrowRight" && isFolder) {
    event.preventDefault();
    if (current.getAttribute("aria-expanded") === "false") setProjectExpanded(id, true);
    else if (visibleItems[index + 1]) {
      const next = visibleItems[index + 1];
      selectTreeTarget(next.dataset.treeFolder ? "folder" : "playlist", next.dataset.treeFolder || next.dataset.projectSeries);
      next.focus();
    }
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    if (isFolder && current.getAttribute("aria-expanded") === "true") {
      setProjectExpanded(id, false);
    } else if (!isFolder) {
      const parent = current.closest(".project-group")?.querySelector("[data-tree-folder]");
      if (parent) {
        selectTreeTarget("folder", parent.dataset.treeFolder);
        parent.focus();
      }
    }
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (isFolder) setProjectExpanded(id, current.getAttribute("aria-expanded") === "false");
    else openSeries(id);
    return;
  }
  if (event.key === "F2") {
    event.preventDefault();
    if (isFolder) openFolderDialog(id);
    else openProjectDialog(id);
    return;
  }
  if (event.key === "Delete") {
    event.preventDefault();
    if (isFolder) deleteFolder(id);
    else deleteSeries(id);
    return;
  }
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    event.preventDefault();
    const rect = current.getBoundingClientRect();
    openTreeContextMenu(isFolder ? "folder" : "playlist", id, rect.left + 24, rect.bottom);
  }
});

elements.grid.addEventListener("dragstart", handlePlaylistDragStart);
elements.projectTree.addEventListener("dragstart", handlePlaylistDragStart);
elements.projectTree.addEventListener("dragover", handleProjectDragOver);
elements.projectTree.addEventListener("drop", handleProjectDrop);
elements.projectTree.addEventListener("dragleave", (event) => {
  if (!elements.projectTree.contains(event.relatedTarget)) setActiveDropProject(null);
});
document.addEventListener("dragend", () => {
  suppressPlaylistClickUntil = Date.now() + 250;
  clearPlaylistDragState();
});

$("#newProject").addEventListener("click", () => openFolderDialog());
$("#expandProjects").addEventListener("click", () => setAllProjectsExpanded(true));
$("#collapseProjects").addEventListener("click", () => setAllProjectsExpanded(false));

elements.projectSearch.addEventListener("input", () => {
  selectedTreeKey = "";
  renderProjectTree();
});
elements.projectSearch.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.projectSearch.value) {
    event.preventDefault();
    elements.projectSearch.value = "";
    renderProjectTree();
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    const firstItem = $("[role='treeitem']", elements.projectTree);
    firstItem?.focus();
  }
});

$("#folderForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    elements.folderDialog.close();
    return;
  }
  saveFolderFromDialog();
});
elements.folderName.addEventListener("input", () => {
  $("#folderNameError").textContent = "";
});
$("#deleteFolder").addEventListener("click", () => {
  if (editingFolderOriginalName) deleteFolder(editingFolderOriginalName);
});

elements.contextMenu.addEventListener("click", (event) => {
  const item = event.target.closest("[data-context-action]");
  if (item) runTreeContextAction(item.dataset.contextAction);
});
elements.contextMenu.addEventListener("keydown", (event) => {
  const items = $$(".context-menu-item", elements.contextMenu);
  const index = items.indexOf(document.activeElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const offset = event.key === "ArrowDown" ? 1 : -1;
    items[(index + offset + items.length) % items.length]?.focus();
  }
  if (event.key === "Home") {
    event.preventDefault();
    items[0]?.focus();
  }
  if (event.key === "End") {
    event.preventDefault();
    items.at(-1)?.focus();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeTreeContextMenu();
  }
});

elements.confirmDialog.addEventListener("submit", (event) => {
  settleConfirmation(event.submitter?.value === "confirm");
});
elements.confirmDialog.addEventListener("cancel", () => settleConfirmation(false));
elements.confirmDialog.addEventListener("close", () => {
  settleConfirmation(elements.confirmDialog.returnValue === "confirm");
});

elements.projectName.addEventListener("input", () => {
  const name = elements.projectName.value.trim();
  const rule = projectRuleByName(name);
  if (!rule || elements.projectAliases.dataset.forProject === name) return;
  elements.projectAliases.value = (rule.aliases || []).join("\n");
  elements.projectAliases.dataset.forProject = name;
});

elements.projectAliases.addEventListener("input", () => {
  elements.projectAliases.dataset.forProject = elements.projectName.value.trim();
});

$("#projectForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    elements.projectDialog.close();
    return;
  }
  const name = elements.projectName.value.trim();
  let aliases = parseAliases(elements.projectAliases.value).filter(
    (alias) => normalizeProjectMatch(alias) !== normalizeProjectMatch(name),
  );
  const series = data.series.find((item) => item.id === editingProjectSeriesId);
  if (!name || !series) return;

  series.project = name;
  series.updatedAt = new Date().toISOString();
  const existingRule = projectRuleByName(name);
  if (existingRule) {
    existingRule.aliases = aliases;
  } else {
    data.projects.push({ name, aliases, learnedAliases: [] });
  }
  learnPlaylistTitle(name, series.title);
  config.expandedProjects ||= {};
  config.expandedProjects[name] = true;
  selectedTreeKey = `playlist:${series.id}`;
  saveConfig();
  saveData();
  elements.projectDialog.close();
  render();
  showToast(`「${name}」フォルダーへ移動しました`);
});

elements.sidebarResizer.addEventListener("pointerdown", (event) => {
  if (window.matchMedia("(max-width: 780px)").matches) return;
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"),
  );
  document.body.classList.add("is-resizing-sidebar");

  const handleMove = (moveEvent) => {
    const width = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, startWidth + moveEvent.clientX - startX),
    );
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
    elements.sidebarResizer.setAttribute("aria-valuenow", String(Math.round(width)));
  };
  const handleEnd = () => {
    document.body.classList.remove("is-resizing-sidebar");
    const width = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"),
    );
    config.sidebarWidth = Math.round(width);
    saveConfig();
    document.removeEventListener("pointermove", handleMove);
    document.removeEventListener("pointerup", handleEnd);
  };
  document.addEventListener("pointermove", handleMove);
  document.addEventListener("pointerup", handleEnd, { once: true });
});

elements.sidebarResizer.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const currentWidth = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"),
  );
  const width = Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, currentWidth + (event.key === "ArrowRight" ? 10 : -10)),
  );
  document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  config.sidebarWidth = Math.round(width);
  elements.sidebarResizer.setAttribute("aria-valuenow", String(Math.round(width)));
  saveConfig();
});

function updateSidebarControls() {
  const mobile = window.matchMedia("(max-width: 780px)").matches;
  const visible = mobile
    ? document.body.classList.contains("sidebar-open")
    : !document.body.classList.contains("sidebar-collapsed");
  elements.sidebar.inert = !visible;
  elements.sidebar.setAttribute("aria-hidden", String(!visible));
  elements.mobileMenu.setAttribute("aria-expanded", String(visible));
  elements.mobileMenu.setAttribute(
    "aria-label",
    visible ? "左サイドバーを隠す" : "左サイドバーを表示",
  );
  elements.mobileMenu.title = visible ? "左サイドバーを隠す" : "左サイドバーを表示";
}

function hideSidebar() {
  if (window.matchMedia("(max-width: 780px)").matches) {
    document.body.classList.remove("sidebar-open");
  } else {
    document.body.classList.add("sidebar-collapsed");
    config.sidebarCollapsed = true;
    saveConfig();
  }
  updateSidebarControls();
  elements.mobileMenu.focus();
}

elements.mobileMenu.addEventListener("click", () => {
  if (window.matchMedia("(max-width: 780px)").matches) {
    document.body.classList.toggle("sidebar-open");
    updateSidebarControls();
    return;
  }
  document.body.classList.toggle("sidebar-collapsed");
  config.sidebarCollapsed = document.body.classList.contains("sidebar-collapsed");
  saveConfig();
  updateSidebarControls();
});
elements.sidebarHide.addEventListener("click", hideSidebar);
$("#sidebarScrim").addEventListener("click", () => {
  document.body.classList.remove("sidebar-open");
  updateSidebarControls();
});

document.addEventListener("pointerdown", (event) => {
  if (!elements.contextMenu.hidden && !event.target.closest("#treeContextMenu")) {
    closeTreeContextMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    elements.search.focus();
  }
  if (event.altKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    if (document.body.classList.contains("sidebar-collapsed")) {
      document.body.classList.remove("sidebar-collapsed");
      config.sidebarCollapsed = false;
      saveConfig();
    }
    if (window.matchMedia("(max-width: 780px)").matches) {
      document.body.classList.add("sidebar-open");
    }
    updateSidebarControls();
    elements.projectSearch.focus();
  }
  if (event.key === "Escape") {
    if (!elements.contextMenu.hidden) {
      closeTreeContextMenu();
      return;
    }
    document.body.classList.remove("sidebar-open");
    updateSidebarControls();
    if (!document.querySelector("dialog[open]")) closeSeriesDetail();
  }
});

DETAIL_PIN_MEDIA.addEventListener("change", syncDetailPinnedState);
window.matchMedia("(max-width: 780px)").addEventListener("change", updateSidebarControls);

window.addEventListener("storage", (event) => {
  if (event.key === DATA_KEY && event.newValue) {
    data = migrateData(JSON.parse(event.newValue));
    render();
  }
});

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

render();
restoreFileConnection();
updateSidebarControls();
syncDetailPinnedState();

const initialSeriesId = location.hash.startsWith("#series=")
  ? decodeURIComponent(location.hash.slice("#series=".length))
  : "";
if (initialSeriesId && data.series.some((series) => series.id === initialSeriesId)) {
  openSeries(initialSeriesId);
}
