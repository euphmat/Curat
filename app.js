import { CloudSync } from "./cloud-sync.js";
import { dataStore } from "./data-store.js";

const APP_VERSION = 1;
const API_BASE = "https://www.googleapis.com/youtube/v3";
const BROWSER_SETTINGS_KEY = "curat-browser-settings-v1";
const RECENT_FOLDER_ICONS_KEY = "curat-recent-folder-icons-v1";
const RECENT_FOLDER_ICONS_LIMIT = 6;
const FOLDER_ICON_SEARCH_LIMIT = 192;
const FOLDER_ICON_SEARCH_ALL_LIMIT = 999;
const SIDEBAR_MIN_WIDTH = 300;
const SIDEBAR_MAX_WIDTH = 480;
const RECENT_IMPORT_CORRECTION_MS = 5 * 60 * 1000;
const TOUCH_LONG_PRESS_MS = 560;
const TOUCH_MOVE_THRESHOLD = 10;
const RECOMMENDATION_PROJECT_SEARCH_LIMIT = 6;
const RECOMMENDATION_CHANNEL_SEARCH_LIMIT = 6;
const RECOMMENDATION_DISCOVERY_SEARCH_TERMS = [
  "ゲーム実況 プレイリスト",
  "ゲーム実況 完結",
];
const RECOMMENDATION_DISCOVERY_CANDIDATE_LIMIT = 100;
const RECOMMENDATION_CANDIDATE_LIMIT = 250;
const RECOMMENDATION_RESULT_LIMIT_PER_TYPE = 8;
const {
  parseEpisodeOrder,
  sortPlaylistTasks,
  normalizeTaskOrder,
  sortTasksBySavedOrder,
  reorderVisibleTaskOrder,
} = window.PlaylogEpisodeSort;
const {
  normalizeForProjectMatch,
  similarity,
  subsequenceScore,
  matchesProjectSearch,
  classifyProject,
  rememberLearnedAlias,
  rememberProjectCorrection,
} = window.CuratProjectMatch;
const {
  normalizePlaylistOrder,
  sortSeriesByPlaylistOrder,
  reorderVisiblePlaylistOrder,
} = window.CuratPlaylistOrder;
const { compareFolderNames } = window.CuratFolderOrder;
const {
  RECOMMENDATION_TYPES,
  buildRecommendationProfile,
  isRecommendationDismissed,
  recommendationChannelKey,
  recommendationGameKey,
  recommendationPlaylistKey,
  recommendationType,
  rankRecommendationCandidatesByType,
} = window.CuratRecommendations;
const {
  toUpperCamelCase,
  isColorIconName,
  iconifySvgUrl,
  COLOR_ICON_PREFIXES,
} = window.CuratFolderDisplay;

const BUILTIN_FOLDER_ICONS = [
  { value: "", icon: "fluent-emoji-flat:file-folder", label: "標準", keywords: "folder フォルダー" },
  { value: "builtin:gamepad", icon: "fluent-emoji-flat:video-game", label: "ゲーム", keywords: "game controller ゲーム" },
  { value: "builtin:sparkles", icon: "fluent-emoji-flat:sparkles", label: "魔法", keywords: "magic sparkle 魔法" },
  { value: "builtin:sword", icon: "fluent-emoji-flat:crossed-swords", label: "剣", keywords: "sword battle 剣 戦闘" },
  { value: "builtin:crown", icon: "fluent-emoji-flat:crown", label: "王冠", keywords: "crown king 王冠" },
  { value: "builtin:book", icon: "fluent-emoji-flat:open-book", label: "物語", keywords: "book story 本 物語" },
  { value: "builtin:music", icon: "fluent-emoji-flat:musical-notes", label: "音楽", keywords: "music note 音楽" },
  { value: "builtin:star", icon: "fluent-emoji-flat:star", label: "お気に入り", keywords: "star favorite 星 お気に入り" },
];
const RPG_FOLDER_ICONS = [
  ["ancient-sword", "古代の剣", "剣 武器 sword weapon"],
  ["battle-axe", "戦斧", "斧 武器 axe weapon"],
  ["bow-arrow", "弓矢", "弓 矢 射手 bow arrow archer"],
  ["broadsword", "大剣", "剣 武器 sword weapon"],
  ["crossbow", "クロスボウ", "弓 武器 crossbow weapon"],
  ["two-handed-sword", "両手剣", "剣 武器 sword weapon"],
  ["warhammer", "戦槌", "槌 ハンマー 武器 hammer weapon"],
  ["spear-hook", "槍", "槍 武器 spear weapon"],
  ["round-shield", "丸盾", "盾 防具 shield armor"],
  ["winged-shield", "翼の盾", "盾 防具 wing shield armor"],
  ["shield-bounces", "防御", "盾 防御 guard shield"],
  ["sword-clash", "剣戟", "戦闘 バトル battle sword"],
  ["magic-swirl", "魔法陣", "魔法 魔術 magic spell"],
  ["fairy-wand", "妖精の杖", "魔法 杖 fairy wand magic"],
  ["wizard-staff", "魔導士の杖", "魔法 杖 wizard staff"],
  ["spell-book", "魔導書", "魔法 本 spell book"],
  ["crystal-ball", "水晶玉", "魔法 占い crystal ball"],
  ["fire-gem", "炎の宝石", "炎 火 宝石 fire gem"],
  ["ice-bolt", "氷魔法", "氷 魔法 ice magic"],
  ["lightning-storm", "雷魔法", "雷 魔法 lightning magic"],
  ["poison-bottle", "毒薬", "毒 薬 poison bottle"],
  ["health-potion", "回復薬", "回復 薬 potion health"],
  ["potion-ball", "ポーション", "薬 potion magic"],
  ["potion-of-madness", "怪しい薬", "薬 potion poison"],
  ["dragon-head", "ドラゴン", "竜 龍 dragon monster"],
  ["double-dragon", "双竜", "竜 龍 dragon monster"],
  ["wyvern", "ワイバーン", "竜 龍 wyvern monster"],
  ["unicorn", "ユニコーン", "馬 幻獣 unicorn monster"],
  ["wolf-head", "オオカミ", "狼 動物 wolf beast"],
  ["orc-head", "オーク", "魔物 monster orc"],
  ["goblin-head", "ゴブリン", "魔物 monster goblin"],
  ["troll", "トロール", "魔物 monster troll"],
  ["dwarf-helmet", "ドワーフ", "種族 dwarf"],
  ["elf-helmet", "エルフ", "種族 elf"],
  ["wizard-face", "魔導士", "魔法使い wizard mage"],
  ["vampire-dracula", "吸血鬼", "魔物 vampire"],
  ["skeleton", "スケルトン", "骸骨 魔物 skeleton"],
  ["castle", "城", "城 王国 castle kingdom"],
  ["dungeon-gate", "ダンジョン", "迷宮 dungeon gate"],
  ["underground-cave", "洞窟", "洞窟 ダンジョン cave dungeon"],
  ["tower-flag", "塔", "塔 ダンジョン tower"],
  ["village", "村", "町 村 village town"],
  ["campfire", "キャンプ", "焚き火 camp fire"],
  ["treasure-map", "宝の地図", "宝 地図 treasure map"],
  ["locked-chest", "宝箱", "宝箱 treasure chest"],
  ["gold-stack", "ゴールド", "金貨 お金 gold coin"],
  ["diamond-hard", "ダイヤ", "宝石 diamond gem"],
  ["holy-grail", "聖杯", "宝物 holy grail"],
  ["visored-helm", "騎士兜", "兜 騎士 helmet knight"],
  ["hood", "フード", "装備 hood equipment"],
  ["crowned-skull", "魔王", "王 骸骨 boss skull"],
  ["skull-crossed-bones", "危険地帯", "骸骨 危険 skull danger"],
  ["crown-of-thorns", "呪いの王冠", "王冠 呪い crown curse"],
  ["gauntlet", "籠手", "防具 装備 gauntlet armor"],
  ["boots", "ブーツ", "防具 装備 boots armor"],
  ["ring", "指輪", "装備 アクセサリ ring"],
  ["necklace", "首飾り", "装備 アクセサリ necklace"],
  ["scroll-unfurled", "巻物", "魔法 書物 scroll"],
  ["quill-ink", "クエスト", "依頼 物語 quest quill"],
  ["dice-twenty-faces-twenty", "20面ダイス", "ダイス サイコロ TRPG dice"],
  ["hourglass", "時間", "時間 hourglass time"],
].map(([name, label, keywords]) => ({
  value: `game-icons:${name}`,
  icon: `game-icons:${name}`,
  label,
  keywords: `${name.replaceAll("-", " ")} ${keywords}`,
}));
const DEFAULT_FOLDER_ICONS = [...BUILTIN_FOLDER_ICONS, ...RPG_FOLDER_ICONS];
const ICON_SEARCH_TRANSLATIONS = new Map([
  ["ゲーム", "game"],
  ["剣", "sword"],
  ["魔法", "magic"],
  ["星", "star"],
  ["音楽", "music"],
  ["本", "book"],
  ["王冠", "crown"],
  ["冒険", "adventure"],
  ["宇宙", "space"],
  ["車", "car"],
  ["RPG", "fantasy"],
  ["武器", "weapon"],
  ["防具", "armor"],
  ["盾", "shield"],
  ["弓", "bow"],
  ["杖", "staff"],
  ["魔物", "monster"],
  ["ドラゴン", "dragon"],
  ["ダンジョン", "dungeon"],
  ["宝箱", "treasure chest"],
  ["ポーション", "potion"],
]);

const defaultData = () => ({
  version: APP_VERSION,
  // An untouched device must never look newer than actual saved cloud data.
  updatedAt: new Date(0).toISOString(),
  series: [],
  projects: [],
  playlistOrder: [],
  recommendationDismissals: {
    playlists: [],
    games: [],
    channels: [],
  },
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name, className = "icon") =>
  `<svg class="${className}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

const elements = {
  form: $("#playlistForm"),
  url: $("#playlistUrl"),
  formMessage: $("#formMessage"),
  syncAll: $("#syncAll"),
  deleteAll: $("#deleteAll"),
  openRecommendations: $("#openRecommendations"),
  recommendationDialog: $("#recommendationDialog"),
  recommendationTabs: $("#recommendationTabs"),
  recommendationStatus: $("#recommendationStatus"),
  recommendationResults: $("#recommendationResults"),
  refreshRecommendations: $("#refreshRecommendations"),
  detailView: $("#detailView"),
  detailContent: $("#detailContent"),
  settingsDialog: $("#settingsDialog"),
  apiKey: $("#apiKeyInput"),
  backupStatus: $("#backupStatus"),
  saveStatusTitle: $("#saveStatusTitle"),
  saveStatusCopy: $("#saveStatusCopy"),
  cloudLoginForm: $("#cloudLoginForm"),
  cloudEmail: $("#cloudEmail"),
  cloudPassword: $("#cloudPassword"),
  cloudLogin: $("#cloudLogin"),
  cloudLogout: $("#cloudLogout"),
  cloudAccount: $("#cloudAccount"),
  cloudSetupNotice: $("#cloudSetupNotice"),
  projectTree: $("#projectTree"),
  projectDialog: $("#projectDialog"),
  projectName: $("#projectNameInput"),
  projectAliases: $("#projectAliasesInput"),
  projectSearch: $("#projectSearch"),
  folderDialog: $("#folderDialog"),
  folderForm: $("#folderForm"),
  newProject: $("#newProject"),
  newFolderName: $("#newFolderNameInput"),
  newFolderAliases: $("#newFolderAliasesInput"),
  renameFolderDialog: $("#renameFolderDialog"),
  renameFolderForm: $("#renameFolderForm"),
  folderName: $("#folderNameInput"),
  folderNameSuggestionsSection: $("#folderNameSuggestionsSection"),
  folderNameSuggestions: $("#folderNameSuggestions"),
  saveFolderName: $("#saveFolderName"),
  folderIconDialog: $("#folderIconDialog"),
  folderIconForm: $("#folderIconForm"),
  folderIconSearch: $("#folderIconSearch"),
  folderIconResults: $("#folderIconResults"),
  recentFolderIconsSection: $("#recentFolderIconsSection"),
  recentFolderIcons: $("#recentFolderIcons"),
  folderIconStatus: $("#folderIconStatus"),
  folderIconMore: $("#folderIconMore"),
  folderIconCurrent: $("#folderIconCurrent"),
  folderIconSelection: $("#folderIconSelection"),
  contextMenu: $("#treeContextMenu"),
  confirmDialog: $("#confirmDialog"),
  sidebarResizer: $("#sidebarResizer"),
};

function loadBrowserSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(BROWSER_SETTINGS_KEY) || "{}");
    return {
      apiKey: String(saved.apiKey || ""),
      username: String(saved.username || ""),
      password: String(saved.password || ""),
      recommendationPreviousIds: [
        ...new Set(
          (Array.isArray(saved.recommendationPreviousIds)
            ? saved.recommendationPreviousIds
            : [])
            .map((id) => String(id || "").trim())
            .filter(Boolean),
        ),
      ].slice(
        -RECOMMENDATION_RESULT_LIMIT_PER_TYPE * RECOMMENDATION_TYPES.length,
      ),
    };
  } catch {
    return {
      apiKey: "",
      username: "",
      password: "",
      recommendationPreviousIds: [],
    };
  }
}

function saveBrowserSettings() {
  try {
    localStorage.setItem(BROWSER_SETTINGS_KEY, JSON.stringify(browserSettings));
  } catch {
    showToast("ブラウザに設定を保存できませんでした", true);
  }
}

let browserSettings = loadBrowserSettings();
let data = defaultData();
let config = { apiKey: browserSettings.apiKey };
let detailSeriesId = null;
let pendingPlaylistUrl = "";
let editingProjectSeriesId = null;
let editingProjectOriginalName = "";
let draggedSeriesId = null;
let activeDropProject = null;
let activeDropPlaylistRow = null;
let activePlaylistDropPlacement = "";
let suppressPlaylistClickUntil = 0;
let draggedTaskId = null;
let activeDropTaskRow = null;
let activeTaskDropPlacement = "";
let touchReorderGesture = null;
let treeLongPressGesture = null;
let detailReturnFocus = null;
let editingFolderOriginalName = null;
let folderNameSuggestionIndex = -1;
let selectedFolderIcon = "";
let folderIconSearchTimer = null;
let folderIconSearchController = null;
let editingFolderIconName = null;
let recentFolderIcons = [];
let selectedTreeKey = "";
let contextTarget = null;
let confirmResolver = null;
let importHighlightTimer = null;
let newVideoHighlightTimer = null;
let recentImportCorrection = null;
let recommendationCandidates = [];
let recommendationLoading = false;
let recommendationError = "";
let recommendationLastUpdatedAt = "";
let recommendationSourceSignature = "";
let activeRecommendationTab = "new-channel";
let cloudState = {
  configured: false,
  phase: "not-configured",
  email: "",
  lastSyncedAt: "",
  error: "",
};
let applyingCloudData = false;
elements.apiKey.value = browserSettings.apiKey;
elements.cloudEmail.value = browserSettings.username;
elements.cloudPassword.value = browserSettings.password;

const cloudSync = new CloudSync({
  getLocalData: () => data,
  onRemoteData: (remoteData) => {
    applyingCloudData = true;
    try {
      const openSeriesId = detailSeriesId;
      data = migrateData({
        ...remoteData,
        series: Array.isArray(remoteData.series) ? remoteData.series : [],
        projects: Array.isArray(remoteData.projects) ? remoteData.projects : [],
        playlistOrder: Array.isArray(remoteData.playlistOrder)
          ? remoteData.playlistOrder
          : [],
      });
      recommendationCandidates = recommendationCandidates.filter(
        (candidate) =>
          !isRecommendationDismissed(candidate, data.recommendationDismissals),
      );
      saveData({ syncCloud: false, touchUpdatedAt: false });
      render();
      if (elements.recommendationDialog.open) renderRecommendationResults();
      if (openSeriesId && data.series.some((series) => series.id === openSeriesId)) {
        openSeries(openSeriesId);
      } else if (data.series[0]) {
        openSeries(data.series[0].id);
      }
      showToast("別の端末から最新データを同期しました");
    } finally {
      applyingCloudData = false;
    }
  },
  onStatus: (nextState) => {
    cloudState = nextState;
    updateBackupUI();
  },
});

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

function migrateData(saved) {
  const migratedSeries = saved.series.map((series) => {
    const tasks = sortPlaylistTasks(
      (Array.isArray(series.tasks) ? series.tasks : []).map((task) => ({
        ...task,
        sourcePosition: task.sourcePosition ?? task.position ?? 0,
        episodeOrder: parseEpisodeOrder(task.title),
      })),
    );
    const taskOrder = Array.isArray(series.taskOrder)
      ? normalizeTaskOrder(tasks, series.taskOrder)
      : undefined;
    if (taskOrder) sortTasksBySavedOrder(tasks, taskOrder);
    return {
      createdAt: new Date().toISOString(),
      lastSyncedAt: null,
      ...series,
      project: series.project || series.title || "名称未設定",
      tasks,
      taskOrder,
    };
  });
  const savedProjects = Array.isArray(saved.projects) ? saved.projects : [];
  const projectNames = new Set(savedProjects.map((project) => project.name));
  const derivedProjects = [];
  for (const series of migratedSeries) {
    if (!projectNames.has(series.project)) {
      projectNames.add(series.project);
      derivedProjects.push({ name: series.project, aliases: [], learnedAliases: [], icon: "" });
    }
  }
  return {
    ...defaultData(),
    ...saved,
    version: APP_VERSION,
    series: migratedSeries,
    playlistOrder: normalizePlaylistOrder(migratedSeries, saved.playlistOrder),
    recommendationDismissals: normalizeRecommendationDismissals(
      saved.recommendationDismissals,
    ),
    projects: [
      ...savedProjects.map((project) => ({
        name: project.name,
        aliases: Array.isArray(project.aliases) ? project.aliases : [],
        learnedAliases: Array.isArray(project.learnedAliases) ? project.learnedAliases : [],
        icon: normalizeFolderIcon(project.icon),
      })),
      ...derivedProjects,
    ],
  };
}

function normalizeRecommendationDismissals(value = {}) {
  const uniqueKeys = (keys) =>
    [
      ...new Set(
        (Array.isArray(keys) ? keys : [])
          .map((key) => String(key || "").trim())
          .filter(Boolean),
      ),
    ].slice(-500);
  return {
    playlists: uniqueKeys([
      ...(Array.isArray(value.playlists) ? value.playlists : []),
      ...(Array.isArray(value.videos) ? value.videos : []),
    ]),
    games: uniqueKeys(value.games),
    channels: uniqueKeys(value.channels),
  };
}

function saveData({ syncCloud = true, touchUpdatedAt = true } = {}) {
  data.playlistOrder = normalizePlaylistOrder(data.series, data.playlistOrder);
  for (const series of data.series) {
    if (Array.isArray(series.taskOrder)) {
      series.taskOrder = normalizeTaskOrder(series.tasks, series.taskOrder);
      sortTasksBySavedOrder(series.tasks, series.taskOrder);
    } else {
      sortPlaylistTasks(series.tasks);
    }
  }
  if (touchUpdatedAt) data.updatedAt = new Date().toISOString();
  const localSave = dataStore.save(data);
  localSave.catch((error) => {
    console.warn("端末へのデータ保存に失敗しました", error);
    showToast("端末へのデータ保存に失敗しました", true);
  });
  if (syncCloud && !applyingCloudData) cloudSync.queue(data);
  updateBackupUI();
  return localSave;
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

function builtinFolderIcon(value) {
  return DEFAULT_FOLDER_ICONS.find((item) => item.value === value);
}

function normalizeFolderIcon(value) {
  const iconName = String(value || "");
  if (builtinFolderIcon(iconName) || isColorIconName(iconName)) return iconName;
  return "";
}

function folderIconMarkup(value) {
  const iconName = normalizeFolderIcon(value);
  const builtin = builtinFolderIcon(iconName);
  const url = iconifySvgUrl(builtin?.icon || iconName);
  return `<img class="folder-color-icon" src="${escapeHtml(url)}" alt="" loading="lazy" />`;
}

function loadRecentFolderIcons() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_FOLDER_ICONS_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return [...new Set(saved.map(normalizeFolderIcon).filter(Boolean))]
      .slice(0, RECENT_FOLDER_ICONS_LIMIT);
  } catch {
    return [];
  }
}

function rememberRecentFolderIcon(value) {
  const iconName = normalizeFolderIcon(value);
  if (!iconName) return;
  recentFolderIcons = [iconName, ...recentFolderIcons.filter((item) => item !== iconName)]
    .slice(0, RECENT_FOLDER_ICONS_LIMIT);
  try {
    localStorage.setItem(RECENT_FOLDER_ICONS_KEY, JSON.stringify(recentFolderIcons));
  } catch {
    // The icon change still succeeds when private browsing blocks local storage.
  }
}

recentFolderIcons = loadRecentFolderIcons();

function displayFolderName(value) {
  return toUpperCamelCase(value);
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

function learnRecentImportCorrection(series, targetProjectName) {
  if (
    !recentImportCorrection ||
    recentImportCorrection.seriesId !== series?.id ||
    Date.now() - recentImportCorrection.importedAt > RECENT_IMPORT_CORRECTION_MS
  ) {
    recentImportCorrection = null;
    return false;
  }

  const { sourceProject, playlistTitle } = recentImportCorrection;
  recentImportCorrection = null;
  return rememberProjectCorrection(
    data.projects,
    sourceProject,
    targetProjectName,
    playlistTitle,
  );
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

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll('"', "&quot;").replaceAll("'", "&#39;");
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

function render() {
  elements.deleteAll.disabled = data.series.length === 0 && data.projects.length === 0;
  elements.openRecommendations.disabled = data.series.length === 0;
  renderProjectTree();

  if (detailSeriesId && data.series.some((series) => series.id === detailSeriesId)) {
    renderDetail(detailSeriesId);
  } else {
    detailSeriesId = null;
    renderWorkspaceEmpty();
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

  if (!groups.size) {
    elements.projectTree.innerHTML =
      '<p class="project-empty">フォルダーがありません。<br />上の「＋」から最初のフォルダーを作れます。</p>';
    return;
  }

  const rawQuery = elements.projectSearch.value.trim();
  const query = normalizeText(rawQuery);
  const visibleGroups = [...groups.entries()]
    .sort(([a], [b]) => compareFolderNames(a, b))
    .filter(([project, seriesList]) => {
      const aliases = projectMatchTerms(project);
      return (
        !query ||
        matchesProjectSearch(rawQuery, [project, ...aliases]) ||
        seriesList.some((series) =>
          matchesProjectSearch(rawQuery, [series.title, series.channelTitle || ""]),
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
      const displayName = displayFolderName(project);
      const matchTerms = projectMatchTerms(project);
      const matchedSeries = query
        ? seriesList.filter(
            (series) =>
              matchesProjectSearch(rawQuery, [
                project,
                ...matchTerms,
                series.title,
                series.channelTitle || "",
              ]),
          )
        : seriesList;
      const expanded = Boolean(query) || config.expandedProjects[project] === true;
      const folderKey = `folder:${project}`;
      return `
      <div class="project-group${expanded ? " is-expanded" : ""}" data-drop-project="${escapeHtml(project)}">
        <div
          class="project-row${selectedTreeKey === folderKey ? " is-selected" : ""}"
          role="treeitem"
          tabindex="${selectedTreeKey === folderKey || (!selectedTreeKey && visibleGroups[0][0] === project) ? "0" : "-1"}"
          aria-expanded="${expanded}"
          data-tree-folder="${escapeHtml(project)}"
          title="${escapeHtml(aliases.length ? `${displayName} / ${aliases.join(" / ")}` : displayName)}"
        >
          <button class="tree-chevron" type="button" data-tree-toggle="${escapeHtml(project)}" tabindex="-1" aria-label="${
            expanded ? "折りたたむ" : "展開する"
          }">${icon("chevron-down")}</button>
          <span class="folder-icon" aria-hidden="true">${folderIconMarkup(rule?.icon)}</span>
          <span class="project-name">${escapeHtml(displayName)}</span>
          <button
            class="tree-context-trigger"
            type="button"
            data-context-kind="folder"
            data-context-id="${escapeHtml(project)}"
            tabindex="-1"
            aria-label="「${escapeHtml(displayName)}」の操作"
          >${icon("more")}</button>
        </div>
        <div class="project-playlists" role="group"${expanded ? "" : " hidden"}>
          ${
            matchedSeries.length
              ? sortSeriesByPlaylistOrder(matchedSeries, data.playlistOrder).map(
              (series) => {
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
                    </button>
                    <button
                      class="playlist-drag-handle"
                      type="button"
                      data-touch-drag-series="${escapeHtml(series.id)}"
                      aria-label="「${escapeHtml(channelName)}」をスライドして並べ替え"
                      title="スライドして並べ替え"
                    >${icon("grip")}</button>
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
      dailyLimitExceeded: "YouTube API の本日の利用上限に達しました。",
      rateLimitExceeded: "YouTube API へのリクエストが集中しています。少し待ってからお試しください。",
      playlistItemsNotAccessible: "このプレイリストは非公開、または取得できません。",
      forbidden: "API キーの参照元制限または API 設定を確認してください。",
    };
    throw new Error(friendly[reason] || payload.error?.message || "YouTube から情報を取得できませんでした。");
  }
  return payload;
}

function recommendationDataSignature() {
  const seriesSignature = data.series
    .map((series) => series.id)
    .filter(Boolean)
    .sort()
    .join("|");
  const dismissals = normalizeRecommendationDismissals(
    data.recommendationDismissals,
  );
  return [
    seriesSignature,
    dismissals.playlists.slice().sort().join("|"),
    dismissals.games.slice().sort().join("|"),
    dismissals.channels.slice().sort().join("|"),
  ].join("::");
}

function recommendationCandidateFromResource(
  resource,
  sourceProjectName = "",
  sourceKind = "",
) {
  const snippet = resource?.snippet || {};
  return {
    id: resource?.id?.playlistId || resource?.id || "",
    title: snippet.title || "名称未設定のプレイリスト",
    description: snippet.description || "",
    channelId: snippet.channelId || "",
    channelTitle: snippet.channelTitle || "",
    thumbnail: getThumbnail(snippet.thumbnails),
    publishedAt: snippet.publishedAt || null,
    itemCount: resource?.contentDetails?.itemCount ?? 0,
    privacyStatus: resource?.status?.privacyStatus || "unknown",
    sourceProjectNames: new Set(sourceProjectName ? [sourceProjectName] : []),
    discoverySource: sourceKind === "discovery",
    needsHydration: Boolean(resource?.id?.playlistId),
  };
}

function mergeRecommendationCandidate(candidateMap, candidate) {
  if (!candidate.id) return;
  const existing = candidateMap.get(candidate.id);
  if (!existing) {
    candidateMap.set(candidate.id, candidate);
    return;
  }
  for (const projectName of candidate.sourceProjectNames || []) {
    existing.sourceProjectNames.add(projectName);
  }
  existing.discoverySource =
    Boolean(existing.discoverySource) || Boolean(candidate.discoverySource);
  existing.needsHydration =
    Boolean(existing.needsHydration) && Boolean(candidate.needsHydration);
  for (const key of [
    "title",
    "description",
    "channelId",
    "channelTitle",
    "thumbnail",
    "publishedAt",
    "itemCount",
    "privacyStatus",
  ]) {
    if (candidate[key] !== undefined && candidate[key] !== "" && candidate[key] !== 0) {
      existing[key] = candidate[key];
    }
  }
}

async function fetchPlaylistResources(playlistIds) {
  const ids = [...new Set(playlistIds.filter(Boolean))];
  const requests = [];
  for (let index = 0; index < ids.length; index += 50) {
    requests.push(
      fetchJson("playlists", {
        part: "snippet,contentDetails,status",
        id: ids.slice(index, index + 50).join(","),
        maxResults: 50,
      }),
    );
  }
  const responses = await Promise.all(requests);
  return responses.flatMap((response) => response.items || []);
}

async function hydrateRegisteredPlaylistChannels() {
  const resources = await fetchPlaylistResources(data.series.map((series) => series.id));
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  let changed = false;
  for (const series of data.series) {
    const snippet = byId.get(series.id)?.snippet;
    if (!snippet) continue;
    if (snippet.channelId && series.channelId !== snippet.channelId) {
      series.channelId = snippet.channelId;
      changed = true;
    }
    if (!series.channelTitle && snippet.channelTitle) {
      series.channelTitle = snippet.channelTitle;
      changed = true;
    }
  }
  if (changed) saveData();
}

function recommendationCardHtml(candidate) {
  const isNewChannel = candidate.channelRelationship === "new";
  const isNewGame = candidate.gameRelationship === "new";
  return `
    <article class="recommendation-card${isNewChannel ? " is-new-channel" : ""}${isNewGame ? " is-new-game" : ""}" data-recommendation-id="${escapeHtml(candidate.id)}">
      <a
        class="recommendation-thumbnail"
        href="https://www.youtube.com/playlist?list=${encodeURIComponent(candidate.id)}"
        target="_blank"
        rel="noreferrer"
        aria-label="「${escapeHtml(candidate.title)}」を YouTube で開く"
      >
        <img src="${escapeHtml(candidate.thumbnail || "./favicon.svg")}" alt="" loading="lazy" />
        <span>${Number(candidate.itemCount) || "?"} 本</span>
      </a>
      <div class="recommendation-copy">
        <h3>${escapeHtml(candidate.title)}</h3>
        <p class="recommendation-channel">
          <span>${escapeHtml(candidate.channelTitle || "投稿者名未取得")}</span>
          ${isNewChannel ? '<b>新しい投稿者</b>' : ""}
          ${isNewGame ? '<b class="is-new-game">新しいゲーム</b>' : ""}
        </p>
        <div class="recommendation-reasons">
          ${(candidate.reasons || [])
            .map((reason) => `<span>${icon("sparkles")}${escapeHtml(reason)}</span>`)
            .join("")}
        </div>
      </div>
      <div class="recommendation-actions">
        <button
          class="recommendation-dismiss-button"
          type="button"
          data-recommendation-action="dismiss-playlist"
          aria-label="「${escapeHtml(candidate.title)}」を今後表示しない"
          title="このプレイリストを表示しない"
        >${icon("playlist-x")}</button>
        <button
          class="recommendation-dismiss-button"
          type="button"
          data-recommendation-action="dismiss-game"
          aria-label="「${escapeHtml(candidate.matchedProjectName || candidate.title)}」を今後表示しない"
          title="もうこのゲームは表示しない"
        >${icon("eye-off")}</button>
        <button
          class="recommendation-dismiss-button"
          type="button"
          data-recommendation-action="dismiss-channel"
          aria-label="「${escapeHtml(candidate.channelTitle || "このチャンネル")}」を今後表示しない"
          title="もうこのチャンネルは表示しない"
          ${recommendationChannelKey(candidate) ? "" : "disabled"}
        >${icon("user-x")}</button>
        <a
          class="recommendation-youtube-link"
          href="https://www.youtube.com/playlist?list=${encodeURIComponent(candidate.id)}"
          target="_blank"
          rel="noreferrer"
          aria-label="YouTube で確認"
          title="YouTube で確認"
        >${icon("external-link")}</a>
        <button
          class="recommendation-add-button"
          type="button"
          data-recommendation-action="add"
          data-playlist-id="${escapeHtml(candidate.id)}"
        >${icon("plus")}<span>追加</span></button>
      </div>
    </article>
  `;
}

const RECOMMENDATION_TABS = {
  "new-channel": {
    id: "recommendationTabNewChannel",
    label: "新しい投稿者",
    icon: "user-plus",
    emptyTitle: "新しい投稿者の候補がありません",
    emptyCopy: "登録済みのゲームに関連する別の投稿者が見つかると、ここに表示します。",
  },
  "known-channel": {
    id: "recommendationTabKnownChannel",
    label: "追加済みの投稿者",
    icon: "user-check",
    emptyTitle: "追加済みの投稿者から候補がありません",
    emptyCopy: "登録済みの投稿者が同じゲームの別シリーズを公開すると、ここに表示します。",
  },
  "new-game": {
    id: "recommendationTabNewGame",
    label: "新しいゲーム",
    icon: "gamepad",
    emptyTitle: "新しいゲームの候補がありません",
    emptyCopy: "登録済みの投稿者による、ライブラリにないゲームが見つかると、ここに表示します。",
  },
  "new-game-new-channel": {
    id: "recommendationTabNewGameNewChannel",
    label: "新しいゲーム AND 新しい投稿者",
    icon: "sparkles",
    emptyTitle: "新しいゲームと投稿者の候補がありません",
    emptyCopy: "ゲームと投稿者の両方がライブラリにない候補が見つかると、ここに表示します。",
  },
};

function recommendationCandidatesByType(type) {
  return recommendationCandidates.filter(
    (candidate) => recommendationType(candidate) === type,
  );
}

function updateRecommendationTabs() {
  for (const button of $$("[data-recommendation-tab]", elements.recommendationTabs)) {
    const type = button.dataset.recommendationTab;
    const isActive = type === activeRecommendationTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
    const count = $(".recommendation-tab-count", button);
    if (count) count.textContent = recommendationCandidatesByType(type).length;
  }
  const tab = RECOMMENDATION_TABS[activeRecommendationTab];
  elements.recommendationResults.setAttribute("aria-labelledby", tab.id);
}

function renderRecommendationResults() {
  elements.refreshRecommendations.disabled = recommendationLoading;
  elements.recommendationDialog.classList.toggle("is-loading", recommendationLoading);
  updateRecommendationTabs();

  if (recommendationLoading) {
    elements.recommendationStatus.textContent = "YouTube から候補を探しています…";
    elements.recommendationResults.innerHTML = `
      <div class="recommendation-loading" aria-hidden="true">
        ${Array.from({ length: 4 }, () => '<span class="recommendation-skeleton"></span>').join("")}
      </div>
    `;
    return;
  }

  if (recommendationError) {
    elements.recommendationStatus.textContent = recommendationError;
    elements.recommendationResults.innerHTML = `
      <div class="recommendation-empty is-error">
        ${icon("alert")}
        <strong>候補を取得できませんでした</strong>
        <span>API キーと利用上限を確認して、もう一度お試しください。</span>
      </div>
    `;
    return;
  }

  if (!recommendationLastUpdatedAt) {
    elements.recommendationStatus.textContent = "候補を更新すると、登録済みデータからおすすめを探します。";
    elements.recommendationResults.innerHTML = `
      <div class="recommendation-empty">
        ${icon("sparkles")}
        <strong>まだ候補を取得していません</strong>
        <span>視聴状態は使わず、登録内容だけで検索します。</span>
      </div>
    `;
    return;
  }

  const activeTab = RECOMMENDATION_TABS[activeRecommendationTab];
  const visibleCandidates = recommendationCandidatesByType(activeRecommendationTab);
  elements.recommendationStatus.textContent = recommendationCandidates.length
    ? `${activeTab.label} ${visibleCandidates.length} 件 · 全 ${recommendationCandidates.length} 件 · ${formatDate(recommendationLastUpdatedAt)} 更新`
    : `${formatDate(recommendationLastUpdatedAt)} 更新`;
  if (!recommendationCandidates.length) {
    elements.recommendationResults.innerHTML = `
      <div class="recommendation-empty">
        ${icon("search")}
        <strong>新しい候補が見つかりませんでした</strong>
        <span>登録する作品や実況者を増やしてから、もう一度更新してください。</span>
      </div>
    `;
    return;
  }

  if (!visibleCandidates.length) {
    elements.recommendationResults.innerHTML = `
      <div class="recommendation-empty">
        ${icon(activeTab.icon || "search")}
        <strong>${escapeHtml(activeTab.emptyTitle)}</strong>
        <span>${escapeHtml(activeTab.emptyCopy)}</span>
      </div>
    `;
    return;
  }

  elements.recommendationResults.innerHTML = `
    <div class="recommendation-group-list">
      ${visibleCandidates.map(recommendationCardHtml).join("")}
    </div>
  `;
}

async function loadRecommendations() {
  if (recommendationLoading) return;
  if (!data.series.length) {
    showToast("先にプレイリストを追加してください", true);
    return;
  }
  if (!config.apiKey) {
    openSettingsDialog();
    showToast("おすすめの取得には YouTube API キーが必要です", true);
    return;
  }

  recommendationLoading = true;
  recommendationError = "";
  renderRecommendationResults();
  try {
    await hydrateRegisteredPlaylistChannels();
    const profile = buildRecommendationProfile(data.series, data.projects);
    const candidateMap = new Map();
    const requests = [];

    for (const channel of profile.channels
      .filter((item) => item.id)
      .slice(0, RECOMMENDATION_CHANNEL_SEARCH_LIMIT)) {
      requests.push({
        kind: "channel",
        promise: fetchJson("playlists", {
          part: "snippet,contentDetails,status",
          channelId: channel.id,
          maxResults: 50,
        }),
      });
    }

    for (const projectName of profile.searchTerms.slice(0, RECOMMENDATION_PROJECT_SEARCH_LIMIT)) {
      requests.push({
        kind: "project",
        projectName,
        promise: fetchJson("search", {
          part: "snippet",
          type: "playlist",
          q: `${projectName} 実況`,
          order: "relevance",
          maxResults: 50,
          regionCode: "JP",
          relevanceLanguage: "ja",
          safeSearch: "moderate",
        }),
      });
    }

    for (const query of RECOMMENDATION_DISCOVERY_SEARCH_TERMS) {
      requests.push({
        kind: "discovery",
        promise: fetchJson("search", {
          part: "snippet",
          type: "playlist",
          q: query,
          order: "relevance",
          maxResults: 50,
          regionCode: "JP",
          relevanceLanguage: "ja",
          safeSearch: "moderate",
        }),
      });
    }

    const settled = await Promise.allSettled(requests.map((request) => request.promise));
    const failures = [];
    settled.forEach((result, index) => {
      const request = requests[index];
      if (result.status === "rejected") {
        failures.push(result.reason);
        return;
      }
      for (const resource of result.value.items || []) {
        mergeRecommendationCandidate(
          candidateMap,
          recommendationCandidateFromResource(
            resource,
            request.kind === "project" ? request.projectName : "",
            request.kind,
          ),
        );
      }
    });

    if (!candidateMap.size && failures.length) throw failures[0];

    const candidatesNeedingHydration = [...candidateMap.values()].filter(
      (candidate) =>
        !profile.registeredIds.has(candidate.id) &&
        candidate.needsHydration,
    );
    const discoveryCandidateIds = candidatesNeedingHydration
      .filter((candidate) => candidate.discoverySource)
      .map((candidate) => candidate.id)
      .slice(0, RECOMMENDATION_DISCOVERY_CANDIDATE_LIMIT);
    const discoveryCandidateIdSet = new Set(discoveryCandidateIds);
    const candidateIds = [
      ...discoveryCandidateIds,
      ...candidatesNeedingHydration
        .filter((candidate) => !discoveryCandidateIdSet.has(candidate.id))
        .sort(
          (left, right) =>
            Number((right.sourceProjectNames?.size || 0) > 0) -
            Number((left.sourceProjectNames?.size || 0) > 0),
        )
        .map((candidate) => candidate.id),
    ].slice(0, RECOMMENDATION_CANDIDATE_LIMIT);
    if (candidateIds.length) {
      const details = await fetchPlaylistResources(candidateIds);
      for (const resource of details) {
        mergeRecommendationCandidate(
          candidateMap,
          recommendationCandidateFromResource(resource),
        );
      }
    }

    const previousIds = recommendationCandidates.length
      ? recommendationCandidates.map((candidate) => candidate.id)
      : browserSettings.recommendationPreviousIds;
    recommendationCandidates = rankRecommendationCandidatesByType(
      [...candidateMap.values()].filter(
        (candidate) =>
          candidate.privacyStatus !== "private" &&
          candidate.privacyStatus !== "unlisted",
      ),
      profile,
      RECOMMENDATION_RESULT_LIMIT_PER_TYPE,
      data.recommendationDismissals,
      previousIds,
    );
    browserSettings.recommendationPreviousIds = recommendationCandidates.map(
      (candidate) => candidate.id,
    );
    saveBrowserSettings();
    recommendationLastUpdatedAt = new Date().toISOString();
    recommendationSourceSignature = recommendationDataSignature();
  } catch (error) {
    recommendationError = error.message || "おすすめを取得できませんでした。";
  } finally {
    recommendationLoading = false;
    renderRecommendationResults();
  }
}

function openRecommendationDialog() {
  if (!data.series.length) {
    showToast("先にプレイリストを追加してください", true);
    return;
  }
  if (!config.apiKey) {
    openSettingsDialog();
    showToast("おすすめの取得には YouTube API キーが必要です", true);
    return;
  }
  if (!elements.recommendationDialog.open) elements.recommendationDialog.showModal();
  renderRecommendationResults();
  if (
    !recommendationLastUpdatedAt ||
    recommendationSourceSignature !== recommendationDataSignature()
  ) {
    loadRecommendations();
  }
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
  const newTasks = [];

  const freshTasks = result.items.map((item, index) => {
    const previous = existingTasks.get(item.id);
    const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || "";
    const video = result.videoDetails.get(videoId);
    existingTasks.delete(item.id);
    const task = {
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
    if (existing && !previous) newTasks.push(task);
    return task;
  });

  for (const oldTask of existingTasks.values()) {
    freshTasks.push({ ...oldTask, archived: true });
  }
  sortPlaylistTasks(freshTasks);
  const taskOrder = Array.isArray(existing?.taskOrder)
    ? normalizeTaskOrder(freshTasks, existing.taskOrder)
    : undefined;
  if (taskOrder) sortTasksBySavedOrder(freshTasks, taskOrder);

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
    channelId: snippet.channelId || existing?.channelId || "",
    channelTitle: snippet.channelTitle || "",
    project: placement.projectName,
    thumbnail: getThumbnail(snippet.thumbnails) || freshTasks.find((task) => task.thumbnail)?.thumbnail || "",
    sourceUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
    privacyStatus: result.playlist.status?.privacyStatus || "unknown",
    remoteItemCount: result.playlist.contentDetails?.itemCount ?? freshTasks.length,
    tasks: freshTasks,
    taskOrder,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastSyncedAt: now,
  };

  if (existing) {
    data.series[data.series.indexOf(existing)] = nextSeries;
  } else {
    data.series.unshift(nextSeries);
    data.playlistOrder = normalizePlaylistOrder(data.series, data.playlistOrder);
    data.playlistOrder = [
      nextSeries.id,
      ...data.playlistOrder.filter((id) => id !== nextSeries.id),
    ];
  }
  if (!projectRuleByName(nextSeries.project)) {
    data.projects.push({ name: nextSeries.project, aliases: [], learnedAliases: [] });
  } else if (!existing && !placement.createNew) {
    learnPlaylistTitle(nextSeries.project, nextSeries.title);
  }
  saveData();
  return { series: nextSeries, placement, isNew: !existing, newTasks };
}

function revealImportedPlaylist(series) {
  clearTimeout(importHighlightTimer);
  elements.projectSearch.value = "";
  config.expandedProjects ||= {};
  config.expandedProjects[series.project] = true;
  selectedTreeKey = `playlist:${series.id}`;

  renderProjectTree();

  const startHighlight = () => {
    const folder = [...elements.projectTree.querySelectorAll("[data-drop-project]")].find(
      (item) => item.dataset.dropProject === series.project,
    );
    const playlist = [...elements.projectTree.querySelectorAll("[data-project-series]")].find(
      (item) => item.dataset.projectSeries === series.id,
    );
    if (!folder || !playlist) return;

    const folderRow = $("[data-tree-folder]", folder);
    const playlistRow = playlist.closest(".project-playlist-row");
    const badge = document.createElement("span");
    badge.className = "import-destination-badge";
    badge.textContent = "追加先";
    badge.setAttribute("aria-hidden", "true");
    folderRow?.append(badge);
    folder.classList.add("is-import-target");
    playlistRow?.classList.add("is-just-imported");
    folder.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });

    importHighlightTimer = setTimeout(() => {
      folder.classList.remove("is-import-target");
      playlistRow?.classList.remove("is-just-imported");
      badge.remove();
    }, 3000);
  };

  requestAnimationFrame(() => requestAnimationFrame(startHighlight));
}

function clearNewVideoHighlights() {
  clearTimeout(newVideoHighlightTimer);
  newVideoHighlightTimer = null;
  $("#sidebar")?.classList.remove("has-new-videos");
  $$(".project-group.has-new-videos, .project-playlist-row.has-new-videos", elements.projectTree)
    .forEach((item) => item.classList.remove("has-new-videos"));
  $$(".new-video-badge", elements.projectTree).forEach((item) => item.remove());
}

function highlightPlaylistUpdates(updates) {
  clearNewVideoHighlights();
  const activeUpdates = updates.filter((update) => update.newTasks.length > 0);
  if (!activeUpdates.length) return;

  $("#sidebar")?.classList.add("has-new-videos");
  const folderCounts = new Map();
  for (const { series, newTasks } of activeUpdates) {
    folderCounts.set(series.project, (folderCounts.get(series.project) || 0) + newTasks.length);
  }

  const addBadge = (row, count) => {
    if (!row) return;
    const badge = document.createElement("span");
    badge.className = "new-video-badge";
    badge.textContent = `新着 ${count}本`;
    badge.setAttribute("aria-hidden", "true");
    row.append(badge);
  };

  let firstTarget = null;
  for (const [project, count] of folderCounts) {
    const folder = [...elements.projectTree.querySelectorAll("[data-drop-project]")].find(
      (item) => item.dataset.dropProject === project,
    );
    if (!folder) continue;
    folder.classList.add("has-new-videos");
    addBadge($("[data-tree-folder]", folder), count);
    firstTarget ||= folder;
  }

  for (const { series, newTasks } of activeUpdates) {
    const playlist = [...elements.projectTree.querySelectorAll("[data-project-series]")].find(
      (item) => item.dataset.projectSeries === series.id,
    );
    const playlistRow = playlist?.closest(".project-playlist-row");
    if (!playlistRow) continue;
    playlistRow.classList.add("has-new-videos");
    addBadge(playlistRow, newTasks.length);
    firstTarget ||= playlistRow;
  }

  firstTarget?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "nearest",
  });
  newVideoHighlightTimer = setTimeout(clearNewVideoHighlights, 4800);
}

function openSettingsDialog({ focus = "api" } = {}) {
  elements.apiKey.value = config.apiKey;
  if (!elements.settingsDialog.open) elements.settingsDialog.showModal();
  requestAnimationFrame(() => {
    if (focus === "backup") {
      const focusTarget = !elements.cloudLoginForm.hidden
        ? elements.cloudEmail
        : $("#downloadSave");
      focusTarget?.focus();
      return;
    }
    elements.apiKey.select();
  });
}

async function importPlaylist(input, { quiet = false } = {}) {
  const playlistId = extractPlaylistId(input);
  if (!playlistId) throw new Error("プレイリスト ID を含む YouTube URL を入力してください。");
  if (!config.apiKey) {
    pendingPlaylistUrl = input;
    openSettingsDialog();
    throw new Error("最初に YouTube API キーを設定してください。");
  }
  if (!quiet) setFormLoading(true, "プレイリストを読み込み中…");
  const result = await fetchPlaylist(playlistId);
  const { series, placement, isNew } = mergePlaylistResult(playlistId, result);
  if (isNew) {
    recentImportCorrection = {
      seriesId: series.id,
      sourceProject: series.project,
      playlistTitle: series.title,
      importedAt: Date.now(),
    };
  }
  render();
  openSeries(series.id);
  if (!quiet && isNew) revealImportedPlaylist(series);
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
  elements.form.setAttribute("aria-busy", String(isLoading));
  const buttonLabel = isLoading ? "プレイリストを取得中" : "プレイリストを追加";
  button.setAttribute("aria-label", buttonLabel);
  button.title = buttonLabel;
  if (message) setFormMessage(message, false);
}

function setFormMessage(message, isError = true) {
  elements.formMessage.textContent = message;
  if (isError && message) showToast(message, true);
}

function renderWorkspaceEmpty() {
  const stats = getGlobalStats();
  $("#viewTitle").textContent = "実況ライブラリ";
  elements.detailView.classList.remove("has-playlist");
  elements.detailContent.innerHTML = `
    <div class="workspace-welcome">
      <div class="welcome-art" aria-hidden="true">
        <span class="welcome-orbit"></span>
        <span class="welcome-gem">${icon("play")}</span>
      </div>
      <span class="detail-eyebrow">YOUR WATCHING SPACE</span>
      <h2>${data.series.length ? "プレイリストを選択" : "最初のプレイリストを追加"}</h2>
      <p>${
        data.series.length
          ? "左のエクスプローラーからプレイリストを選ぶと、エピソードと視聴進捗をここで管理できます。"
          : "ヘッダーに YouTube プレイリストの URL を貼り付けると、エピソードごとの視聴管理を始められます。"
      }</p>
      <div class="welcome-stats" aria-label="ライブラリの概要">
        <div><strong>${stats.series}</strong><span>プレイリスト</span></div>
        <div><strong>${stats.todo}</strong><span>未視聴動画</span></div>
        <div><strong>${stats.progress}%</strong><span>全体の進捗</span></div>
      </div>
      <button class="welcome-add-button" type="button" data-workspace-action="add">
        ${icon("plus")}<span>プレイリストを追加</span>
      </button>
    </div>
  `;
}

function openSeries(seriesId) {
  const series = data.series.find((item) => item.id === seriesId);
  if (!series) return;
  detailSeriesId = seriesId;
  selectedTreeKey = `playlist:${seriesId}`;
  $("#viewTitle").textContent = getChannelName(series);
  elements.detailView.classList.add("has-playlist");
  renderDetail(seriesId);
  renderProjectTree();
  history.replaceState(null, "", `#series=${encodeURIComponent(seriesId)}`);
  elements.detailView.scrollTo({ top: 0, behavior: "smooth" });
}

function closeSeriesDetail({ restoreFocus = true } = {}) {
  if (!detailSeriesId) return;
  detailSeriesId = null;
  selectedTreeKey = "";
  renderWorkspaceEmpty();
  renderProjectTree();
  if (location.hash.startsWith("#series=")) {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
  if (restoreFocus && detailReturnFocus?.isConnected) detailReturnFocus.focus();
  detailReturnFocus = null;
}

function renderDetail(seriesId) {
  const series = data.series.find((item) => item.id === seriesId);
  if (!series) {
    closeSeriesDetail();
    return;
  }
  const stats = getSeriesStats(series);
  const tasks = series.tasks.filter((task) => !task.archived);
  const watchableTasks = tasks.filter((task) => task.status !== "skipped");
  const canContinue = watchableTasks.length > 0;
  const canCompleteAll = watchableTasks.some((task) => task.status !== "done");
  const canResetProgress = tasks.some((task) => task.status !== "todo");
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
            <button class="compact-button detail-action-button is-primary" type="button" data-detail-action="continue" aria-label="続きを見る" title="続きを見る"${canContinue ? "" : " disabled"}>${icon("play")}</button>
            <button class="compact-button detail-action-button" type="button" data-detail-action="complete-all" aria-label="すべて視聴済みにする" title="すべて視聴済みにする"${canCompleteAll ? "" : " disabled"}>${icon("check-all")}</button>
            <button class="compact-button detail-action-button" type="button" data-detail-action="reset-progress" aria-label="視聴進捗をリセット" title="視聴進捗をリセット"${canResetProgress ? "" : " disabled"}>${icon("undo")}</button>
            <button class="compact-button detail-action-button" type="button" data-detail-action="project" aria-label="フォルダーを変更" title="フォルダーを変更">${icon("folder")}</button>
            <button class="compact-button detail-action-button" type="button" data-detail-action="sync" aria-label="YouTube と再同期" title="YouTube と再同期">${icon("refresh")}</button>
            <a class="compact-button detail-action-button youtube-button" href="${escapeHtml(series.sourceUrl)}" target="_blank" rel="noreferrer" aria-label="YouTube で開く（新しいタブ）" title="YouTube で開く">${icon("youtube", "youtube-icon")}</a>
            <button class="compact-button detail-action-button is-danger" type="button" data-detail-action="delete" aria-label="プレイリストを削除" title="プレイリストを削除">${icon("trash")}</button>
          </div>
        </div>
        <div class="task-list-heading">
          <div>
            <span class="detail-eyebrow">Episodes</span>
            <h3>エピソード</h3>
          </div>
          <span class="task-list-count">${tasks.length} 本</span>
        </div>
        ${
          tasks.length
            ? `<ol class="task-list">${tasks.map((task, index) => taskRowHtml(task, index)).join("")}</ol>`
            : `<div class="task-empty">${icon("list-video")}<strong>表示できるエピソードがありません</strong><span>同期すると YouTube の最新状態を取得できます。</span></div>`
        }
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
  const projects = projectNames().sort(compareFolderNames);
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

function removeProjectIfEmpty(projectName) {
  const name = String(projectName || "").trim();
  if (
    !name ||
    data.series.some(
      (series) => (series.project || series.title || "名称未設定").trim() === name,
    )
  ) {
    return false;
  }

  data.projects = data.projects.filter((project) => project.name !== name);
  if (config.expandedProjects) delete config.expandedProjects[name];
  if (selectedTreeKey === `folder:${name}`) selectedTreeKey = "";
  return true;
}

function setProjectExpanded(projectName, expanded, { focus = true } = {}) {
  config.expandedProjects ||= {};
  config.expandedProjects[projectName] = expanded;
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
  renderProjectTree();
  showToast(expanded ? "すべてのフォルダーを展開しました" : "すべてのフォルダーを折りたたみました");
}

function positionAnchoredPopup(dialog, anchor) {
  if (!dialog.open || !anchor) return;

  const viewportPadding = 12;
  const gap = 12;
  const anchorRect = anchor.getBoundingClientRect();
  const popupRect = dialog.getBoundingClientRect();
  const maxLeft = Math.max(viewportPadding, window.innerWidth - popupRect.width - viewportPadding);
  const maxTop = Math.max(viewportPadding, window.innerHeight - popupRect.height - viewportPadding);
  let left = anchorRect.right + gap;
  let placement = "right";

  if (left > maxLeft) {
    left = anchorRect.left - popupRect.width - gap;
    placement = "left";
  }
  if (left < viewportPadding) {
    left = Math.min(maxLeft, Math.max(viewportPadding, anchorRect.left));
    placement = "overlap";
  }

  const top = Math.min(maxTop, Math.max(viewportPadding, anchorRect.top - 18));
  dialog.style.left = `${Math.round(left)}px`;
  dialog.style.top = `${Math.round(top)}px`;
  dialog.dataset.popupPlacement = placement;
  dialog.classList.add("is-popup-positioned");
}

function positionFolderPopup(dialog, projectName) {
  positionAnchoredPopup(dialog, folderRowByName(projectName));
}

function showAnchoredPopup(dialog, anchor, focusTarget) {
  dialog.classList.remove("is-popup-positioned");
  dialog.style.removeProperty("left");
  dialog.style.removeProperty("top");
  dialog.showModal();
  requestAnimationFrame(() => {
    positionAnchoredPopup(dialog, anchor);
    focusTarget?.focus();
  });
}

function showFolderPopup(dialog, projectName, focusTarget) {
  showAnchoredPopup(dialog, folderRowByName(projectName), focusTarget);
}

function folderNameSuggestionCandidates(projectName) {
  const rule = projectRuleByName(projectName);
  const relatedSeries = data.series.filter(
    (series) => (series.project || series.title) === projectName,
  );
  const candidates = [
    { value: projectName, source: "現在の名前", priority: 4 },
    ...(rule?.aliases || []).map((value) => ({
      value,
      source: "登録済みの別名",
      priority: 3,
    })),
    ...(rule?.learnedAliases || []).map((value) => ({
      value,
      source: "自動分類で見つけた名前",
      priority: 2,
    })),
    ...relatedSeries.map((series) => ({
      value: series.title,
      source: "プレイリスト名",
      priority: 1,
    })),
  ];
  return [
    ...new Map(
      candidates
        .map((item) => ({ ...item, value: String(item.value || "").trim().slice(0, 180) }))
        .filter((item) => item.value)
        .map((item) => [normalizeProjectMatch(item.value), item]),
    ).values(),
  ];
}

function folderNameSuggestionScore(query, candidate) {
  const normalizedQuery = normalizeProjectMatch(query);
  const normalizedCandidate = normalizeProjectMatch(candidate.value);
  if (!normalizedCandidate) return 0;
  if (!normalizedQuery) return candidate.priority / 10;
  if (normalizedCandidate === normalizedQuery) return 2;
  if (normalizedCandidate.startsWith(normalizedQuery)) return 1.5;
  if (normalizedCandidate.includes(normalizedQuery)) return 1.3;
  return Math.max(
    similarity(normalizedQuery, normalizedCandidate),
    subsequenceScore(normalizedQuery, normalizedCandidate),
  );
}

function setFolderNameSuggestionIndex(index) {
  const options = $$("[data-folder-name-suggestion]", elements.folderNameSuggestions);
  if (!options.length) {
    folderNameSuggestionIndex = -1;
    elements.folderName.removeAttribute("aria-activedescendant");
    return;
  }
  folderNameSuggestionIndex = (index + options.length) % options.length;
  options.forEach((option, optionIndex) => {
    const selected = optionIndex === folderNameSuggestionIndex;
    option.classList.toggle("is-active", selected);
    option.setAttribute("aria-selected", String(selected));
  });
  const activeOption = options[folderNameSuggestionIndex];
  elements.folderName.setAttribute("aria-activedescendant", activeOption.id);
  activeOption.scrollIntoView({ block: "nearest" });
}

function chooseFolderNameSuggestion(value) {
  elements.folderName.value = value;
  folderNameSuggestionIndex = -1;
  updateRenameFolderInteraction();
  elements.folderName.focus();
  elements.folderName.setSelectionRange(value.length, value.length);
}

function renderFolderNameSuggestions() {
  const query = elements.folderName.value.trim();
  const normalizedQuery = normalizeProjectMatch(query);
  const formattedQuery = displayFolderName(query);
  const candidates = folderNameSuggestionCandidates(editingFolderOriginalName);

  if (
    formattedQuery &&
    formattedQuery !== query &&
    !candidates.some(
      (item) => normalizeProjectMatch(item.value) === normalizeProjectMatch(formattedQuery),
    )
  ) {
    candidates.unshift({
      value: formattedQuery,
      source: "読みやすい表記",
      priority: 5,
    });
  }

  const threshold = [...normalizedQuery].length < 3 ? 0.5 : 0.36;
  const suggestions = candidates
    .map((item) => ({ ...item, score: folderNameSuggestionScore(query, item) }))
    .filter(
      (item) =>
        normalizeProjectMatch(item.value) !== normalizedQuery &&
        (!normalizedQuery || item.score >= threshold),
    )
    .sort((left, right) => right.score - left.score || right.priority - left.priority)
    .slice(0, 6);

  folderNameSuggestionIndex = -1;
  elements.folderNameSuggestionsSection.hidden = suggestions.length === 0;
  elements.folderName.setAttribute("aria-expanded", String(suggestions.length > 0));
  elements.folderName.removeAttribute("aria-activedescendant");
  elements.folderNameSuggestions.innerHTML = suggestions
    .map(
      (item, index) => `
        <button
          class="folder-name-suggestion"
          id="folderNameSuggestion-${index}"
          type="button"
          role="option"
          aria-selected="false"
          data-folder-name-suggestion="${escapeAttribute(item.value)}"
        >
          <span>${escapeHtml(displayFolderName(item.value))}</span>
          <small>${escapeHtml(item.source)}</small>
        </button>
      `,
    )
    .join("");
  if (elements.renameFolderDialog.open && editingFolderOriginalName) {
    requestAnimationFrame(() =>
      positionFolderPopup(elements.renameFolderDialog, editingFolderOriginalName),
    );
  }
}

function updateRenameFolderInteraction() {
  const enteredName = elements.folderName.value.trim();
  const name = displayFolderName(enteredName);
  const duplicate = name
    ? findEquivalentProjectName(name, editingFolderOriginalName || "")
    : "";
  $("#folderNameError").textContent = duplicate
    ? `「${duplicate}」はすでに存在します。`
    : "";
  elements.saveFolderName.disabled = !name || Boolean(duplicate);
  renderFolderNameSuggestions();
}

function previewSelectedFolderIcon() {
  if (!editingFolderIconName) return;
  const row = folderRowByName(editingFolderIconName);
  if (!row) return;
  const target = $(".folder-icon", row);
  if (target) target.innerHTML = folderIconMarkup(selectedFolderIcon);
}

function updateFolderIconSelection() {
  const builtin = builtinFolderIcon(selectedFolderIcon);
  const label = builtin?.label || selectedFolderIcon || "標準のフォルダー";
  elements.folderIconCurrent.innerHTML = folderIconMarkup(selectedFolderIcon);
  elements.folderIconSelection.textContent = builtin
    ? builtin.value
      ? builtin.label
      : "標準のフォルダー"
    : label;
  $$("[data-folder-icon]", elements.folderIconDialog).forEach((button) => {
    const selected = button.dataset.folderIcon === selectedFolderIcon;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  previewSelectedFolderIcon();
}

function activeFolderEditorContainer() {
  return elements.folderIconDialog;
}

function folderIconOptionMarkup(item) {
  return `
    <button
      class="folder-icon-option"
      type="button"
      role="option"
      data-folder-icon="${escapeHtml(item.value)}"
      aria-selected="${item.value === selectedFolderIcon}"
      aria-label="${escapeHtml(item.label)}"
      title="${escapeHtml(item.label)}"
    >
      <span aria-hidden="true">${folderIconMarkup(item.value)}</span>
      <small>${escapeHtml(item.label)}</small>
    </button>
  `;
}

function renderRecentFolderIcons() {
  const items = recentFolderIcons.map((value) => {
    const builtin = builtinFolderIcon(value);
    return {
      value,
      label: builtin?.label || value.replace(":", " · ").replaceAll("-", " "),
    };
  });
  elements.recentFolderIconsSection.hidden = items.length === 0;
  elements.recentFolderIcons.innerHTML = items.map(folderIconOptionMarkup).join("");
}

function renderFolderIconResults(items, status) {
  const uniqueItems = [...new Map(items.map((item) => [item.value, item])).values()];
  elements.folderIconResults.innerHTML = uniqueItems.map(folderIconOptionMarkup).join("");
  elements.folderIconStatus.textContent = status;
  renderRecentFolderIcons();
  updateFolderIconSelection();
  if (elements.folderIconDialog.open && editingFolderIconName) {
    requestAnimationFrame(() =>
      positionFolderPopup(elements.folderIconDialog, editingFolderIconName),
    );
  }
}

function showBuiltinFolderIcons() {
  renderFolderIconResults(
    DEFAULT_FOLDER_ICONS,
    `定番のカラー絵文字とRPGアイコンを${DEFAULT_FOLDER_ICONS.length}種類表示しています。`,
  );
  elements.folderIconMore.hidden = true;
}

async function searchFolderIcons(rawQuery, { showAll = false } = {}) {
  const trimmedQuery = rawQuery.trim();
  if (!trimmedQuery) {
    folderIconSearchController?.abort();
    showBuiltinFolderIcons();
    return;
  }

  const translatedQuery = ICON_SEARCH_TRANSLATIONS.get(trimmedQuery) || trimmedQuery;
  const localQuery = normalizeText(trimmedQuery);
  const localMatches = DEFAULT_FOLDER_ICONS.filter((item) =>
    normalizeText(`${item.label} ${item.keywords}`).includes(localQuery),
  );
  folderIconSearchController?.abort();
  elements.folderIconMore.hidden = true;
  const searchController = new AbortController();
  folderIconSearchController = searchController;
  activeFolderEditorContainer().classList.add("is-searching-icons");
  elements.folderIconStatus.textContent = `「${trimmedQuery}」を検索中…`;

  try {
    const url = new URL("https://api.iconify.design/search");
    url.searchParams.set("query", translatedQuery);
    const searchLimit = showAll ? FOLDER_ICON_SEARCH_ALL_LIMIT : FOLDER_ICON_SEARCH_LIMIT;
    url.searchParams.set("limit", String(searchLimit));
    url.searchParams.set("prefixes", COLOR_ICON_PREFIXES.join(","));
    const response = await fetch(url, { signal: searchController.signal });
    if (!response.ok) throw new Error(`Icon search failed: ${response.status}`);
    const result = await response.json();
    const remoteItems = (Array.isArray(result.icons) ? result.icons : [])
      .filter(isColorIconName)
      .map((value) => ({
        value,
        label: value.replace(":", " · ").replaceAll("-", " "),
      }));
    const items = [...localMatches, ...remoteItems];
    const hasMore = !showAll && remoteItems.length >= searchLimit;
    elements.folderIconMore.hidden = !hasMore;
    renderFolderIconResults(
      items,
      items.length
        ? hasMore
          ? `上位${remoteItems.length}件を表示しています。さらに候補を読み込めます。`
          : `${remoteItems.length}件の検索結果を表示しています。`
        : `「${trimmedQuery}」に一致するアイコンはありませんでした。`,
    );
  } catch (error) {
    if (error.name === "AbortError") return;
    renderFolderIconResults(
      localMatches.length ? localMatches : DEFAULT_FOLDER_ICONS,
      "オンライン検索に接続できません。内蔵アイコンはそのまま選べます。",
    );
    elements.folderIconMore.hidden = true;
  } finally {
    if (folderIconSearchController === searchController) {
      activeFolderEditorContainer().classList.remove("is-searching-icons");
    }
  }
}

function folderRowByName(projectName) {
  return $$("[data-tree-folder]", elements.projectTree).find(
    (item) => item.dataset.treeFolder === projectName,
  );
}

function stopFolderIconSearch() {
  clearTimeout(folderIconSearchTimer);
  folderIconSearchController?.abort();
  folderIconSearchController = null;
  elements.folderIconDialog.classList.remove("is-searching-icons");
}

function openFolderDialog() {
  closeTreeContextMenu();
  elements.newFolderName.value = "";
  elements.newFolderAliases.value = "";
  $("#newFolderNameError").textContent = "";
  showAnchoredPopup(elements.folderDialog, elements.newProject, elements.newFolderName);
}

function openRenameFolderDialog(projectName) {
  closeTreeContextMenu();
  editingFolderOriginalName = projectName;
  const seriesCount = data.series.filter(
    (series) => (series.project || series.title) === projectName,
  ).length;
  elements.folderName.value = displayFolderName(projectName);
  $("#folderNameError").textContent = "";
  $("#renameFolderSummary").innerHTML =
    `<strong>${seriesCount} 件のプレイリスト</strong>が新しい名前へ移動します。`;
  updateRenameFolderInteraction();
  showFolderPopup(elements.renameFolderDialog, projectName, elements.folderName);
  requestAnimationFrame(() => {
    elements.folderName.select();
  });
}

function openFolderIconDialog(projectName) {
  closeTreeContextMenu();
  editingFolderIconName = projectName;
  selectedFolderIcon = normalizeFolderIcon(projectRuleByName(projectName)?.icon);
  elements.folderIconSearch.value = "";
  $("#folderIconDialogLead").textContent =
    `「${displayFolderName(projectName)}」のアイコンを選んでください。`;
  showBuiltinFolderIcons();
  showFolderPopup(elements.folderIconDialog, projectName, elements.folderIconSearch);
}

function saveNewFolder() {
  const enteredName = elements.newFolderName.value.trim();
  const name = displayFolderName(enteredName);
  const duplicate = findEquivalentProjectName(name);
  if (!name) {
    $("#newFolderNameError").textContent = "フォルダー名を入力してください。";
    elements.newFolderName.focus();
    return false;
  }
  if (duplicate) {
    $("#newFolderNameError").textContent = `「${duplicate}」はすでに存在します。`;
    elements.newFolderName.focus();
    return false;
  }

  let aliases = parseAliases(elements.newFolderAliases.value).filter(
    (alias) => normalizeProjectMatch(alias) !== normalizeProjectMatch(name),
  );
  if (enteredName !== name) aliases = [...new Set([...aliases, enteredName])];

  data.projects.push({ name, aliases, learnedAliases: [], icon: "" });
  config.expandedProjects ||= {};
  config.expandedProjects[name] = true;

  saveData();
  selectedTreeKey = `folder:${name}`;
  elements.folderDialog.close();
  render();
  requestAnimationFrame(() => folderRowByName(name)?.focus());
  showToast(`「${name}」を作成しました`);
  return true;
}

function saveRenamedFolder() {
  const enteredName = elements.folderName.value.trim();
  const name = displayFolderName(enteredName);
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
  if (!originalName) return false;

  const oldRule = projectRuleByName(originalName);
  let aliases = [...(oldRule?.aliases || [])];
  if (enteredName !== name) aliases = [...new Set([...aliases, enteredName])];
  if (originalName !== name) {
    aliases = [...new Set([...aliases, originalName])].filter(
      (alias) => normalizeProjectMatch(alias) !== normalizeProjectMatch(name),
    );
    for (const series of data.series) {
      if ((series.project || series.title) === originalName) {
        series.project = name;
        series.updatedAt = new Date().toISOString();
      }
    }
  }

  data.projects = data.projects.filter((project) => project.name !== originalName);
  data.projects.push({
    name,
    aliases,
    learnedAliases: [...(oldRule?.learnedAliases || [])],
    icon: normalizeFolderIcon(oldRule?.icon),
  });
  config.expandedProjects ||= {};
  config.expandedProjects[name] = config.expandedProjects[originalName] === true;
  if (originalName !== name) delete config.expandedProjects[originalName];

  saveData();
  selectedTreeKey = `folder:${name}`;
  elements.renameFolderDialog.close();
  editingFolderOriginalName = null;
  render();
  requestAnimationFrame(() => folderRowByName(name)?.focus());
  showToast(`「${name}」へフォルダー名を変更しました`);
  return true;
}

function saveChangedFolderIcon() {
  const projectName = editingFolderIconName;
  const rule = projectName ? projectRuleByName(projectName) : null;
  if (!rule) return false;
  rule.icon = selectedFolderIcon;
  rememberRecentFolderIcon(selectedFolderIcon);
  saveData();
  elements.folderIconDialog.close();
  editingFolderIconName = null;
  render();
  requestAnimationFrame(() => folderRowByName(projectName)?.focus());
  showToast(`「${displayFolderName(projectName)}」のアイコンを変更しました`);
  return true;
}

function requestConfirmation({
  title,
  message,
  actionLabel = "削除する",
  actionIcon = "trash",
  actionTone = "danger",
}) {
  if (elements.confirmDialog.open) {
    confirmResolver?.(false);
    confirmResolver = null;
    elements.confirmDialog.close("cancel");
  }
  $("#confirmTitle").textContent = title;
  $("#confirmMessage").textContent = message;
  $("#confirmAction").className = actionTone === "danger" ? "danger-button" : "primary-button";
  $("#confirmAction").innerHTML = `${icon(actionIcon)}<span>${escapeHtml(actionLabel)}</span>`;
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
  saveData();
  selectedTreeKey = "";
  if (elements.renameFolderDialog.open) elements.renameFolderDialog.close();
  if (elements.folderIconDialog.open) elements.folderIconDialog.close();
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
  const deletedActiveSeries = detailSeriesId === series.id;
  if (deletedActiveSeries) detailSeriesId = null;
  saveData();
  selectedTreeKey = "";
  render();
  if (deletedActiveSeries && data.series[0]) openSeries(data.series[0].id);
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
        ["group", "再生"],
        ["open-playlist", "panel", "詳細を開く", "Enter"],
        ["watch-playlist", "play", "続きを見る", ""],
        ["group", "整理"],
        ["move-playlist", "move", "プレイリストを移動…", "F2"],
        ["group", "管理"],
        ["sync-playlist", "refresh", "YouTube と再同期", ""],
        ["delete-playlist", "trash", "プレイリストを削除…", "Delete", true],
      ],
    };
  }
  if (kind === "folder") {
    const expanded = config.expandedProjects?.[id] === true;
    return {
      label: displayFolderName(id),
      items: [
        ["group", "作成・編集"],
        ["new-folder", "folder-plus", "新しいフォルダーを作成…", ""],
        ["edit-folder", "edit", "フォルダー名を変更…", "F2"],
        ["change-folder-icon", "sparkles", "アイコンを変更…", ""],
        ["group", "表示"],
        expanded
          ? ["collapse-folder", "chevrons-up", "フォルダーを折りたたむ", ""]
          : ["expand-folder", "chevrons-down", "フォルダーを展開", ""],
        ["group", "管理"],
        ["delete-folder", "trash", "フォルダーを削除…", "Delete", true],
      ],
    };
  }
  return {
    label: "エクスプローラー",
    items: [
      ["group", "作成"],
      ["new-folder", "folder-plus", "新しいフォルダーを作成…", ""],
      ["group", "表示"],
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
          : item[0] === "group"
            ? `<div class="context-menu-section-label">${escapeHtml(item[1])}</div>`
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
  if (action === "edit-folder") openRenameFolderDialog(target.id);
  if (action === "change-folder-icon") openFolderIconDialog(target.id);
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
  const aliasAdded = learnRecentImportCorrection(series, targetName);
  if (!aliasAdded) learnPlaylistTitle(targetName, series.title);
  const removedEmptyFolder = removeProjectIfEmpty(oldName);
  series.updatedAt = new Date().toISOString();
  config.expandedProjects ||= {};
  config.expandedProjects[targetName] = true;
  selectedTreeKey = `playlist:${series.id}`;
  saveData();
  render();
  const message = aliasAdded
    ? `「${series.title}」を移動し、今後の分類用の別名にも追加しました`
    : `「${series.title}」を「${targetName}」へ移動しました`;
  showToast(
    removedEmptyFolder
      ? `${message}。空になった「${oldName}」フォルダーも削除しました`
      : message,
  );
  return true;
}

function clearPlaylistDragState() {
  draggedSeriesId = null;
  activeDropProject = null;
  activeDropPlaylistRow = null;
  activePlaylistDropPlacement = "";
  document.body.classList.remove("is-dragging-playlist");
  $$(".is-dragging").forEach((item) => item.classList.remove("is-dragging"));
  $$(".project-group.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
  $$(".project-playlist-row.is-drop-before, .project-playlist-row.is-drop-after").forEach((item) =>
    item.classList.remove("is-drop-before", "is-drop-after"),
  );
}

function setActiveDropProject(group) {
  if (activeDropProject === group) return;
  activeDropProject?.classList.remove("is-drop-target");
  activeDropProject = group;
  activeDropProject?.classList.add("is-drop-target");
}

function setActiveDropPlaylist(row, placement = "") {
  if (activeDropPlaylistRow === row && activePlaylistDropPlacement === placement) return;
  activeDropPlaylistRow?.classList.remove("is-drop-before", "is-drop-after");
  activeDropPlaylistRow = row;
  activePlaylistDropPlacement = placement;
  activeDropPlaylistRow?.classList.add(
    placement === "after" ? "is-drop-after" : "is-drop-before",
  );
}

function playlistButtonFromDropTarget(target) {
  return target
    .closest(".project-playlist-row")
    ?.querySelector("[data-project-series]");
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
    setActiveDropPlaylist(null);
    return;
  }
  const series = data.series.find((item) => item.id === draggedSeriesId);
  const currentProject = (series?.project || series?.title || "").trim();
  const targetPlaylist = playlistButtonFromDropTarget(event.target);
  const canPositionPlaylist =
    series &&
    targetPlaylist &&
    targetPlaylist.dataset.projectSeries !== draggedSeriesId;

  if (canPositionPlaylist) {
    const targetRow = targetPlaylist.closest(".project-playlist-row");
    const rect = targetRow.getBoundingClientRect();
    const placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setActiveDropProject(null);
    setActiveDropPlaylist(targetRow, placement);
    return;
  }

  setActiveDropPlaylist(null);
  if (!series || currentProject === group.dataset.dropProject) {
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
  const seriesId =
    event.dataTransfer.getData("application/x-playlog-series") ||
    event.dataTransfer.getData("text/plain") ||
    draggedSeriesId;
  const targetPlaylist = playlistButtonFromDropTarget(event.target);
  event.preventDefault();
  completePlaylistDrop(
    seriesId,
    group,
    targetPlaylist,
    activePlaylistDropPlacement || "before",
  );
}

function completePlaylistDrop(seriesId, group, targetPlaylist, placement = "before") {
  const series = data.series.find((item) => item.id === seriesId);
  if (!series || !group) {
    clearPlaylistDragState();
    return false;
  }
  const currentProject = (series.project || series.title || "").trim();
  const isPlaylistDrop =
    targetPlaylist &&
    targetPlaylist.dataset.projectSeries !== seriesId;

  if (isPlaylistDrop) {
    const normalizedOrder = normalizePlaylistOrder(data.series, data.playlistOrder);
    const renderedIds = new Set(
      $$("[data-project-series]", elements.projectTree).map(
        (item) => item.dataset.projectSeries,
      ),
    );
    const visibleIds = normalizedOrder.filter((id) => renderedIds.has(id));
    data.playlistOrder = reorderVisiblePlaylistOrder(
      normalizedOrder,
      visibleIds,
      seriesId,
      targetPlaylist.dataset.projectSeries,
      placement,
    );
    clearPlaylistDragState();
    if (currentProject !== group.dataset.dropProject) {
      moveSeriesToProject(seriesId, group.dataset.dropProject);
      return true;
    }
    saveData();
    render();
    showToast("プレイリストの並び順を保存しました");
    return true;
  }

  const projectName = group.dataset.dropProject;
  clearPlaylistDragState();
  return moveSeriesToProject(seriesId, projectName);
}

function taskRowHtml(task, index) {
  const labels = { todo: "未視聴", doing: "視聴中", done: "視聴済み", skipped: "スキップ" };
  const statusIcons = { todo: "play", doing: "play", done: "check-circle", skipped: "skip" };
  const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(task.videoId)}`;
  return `
    <li class="task-row is-${escapeHtml(task.status)}" data-task-id="${escapeHtml(task.id)}"${task.status === "doing" ? ' aria-current="true"' : ""}>
      <button
        class="task-drag-handle"
        type="button"
        draggable="true"
        data-drag-task="${escapeHtml(task.id)}"
        aria-label="「${escapeHtml(task.title)}」の順番を変更。ドラッグ、または上下矢印キーで移動"
        title="ドラッグして並べ替え"
      >${icon("grip")}</button>
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

function reorderTaskInSeries(series, taskId, targetId, placement) {
  const normalizedOrder = normalizeTaskOrder(series.tasks, series.taskOrder);
  const activeTaskIds = new Set(
    series.tasks.filter((task) => !task.archived).map((task) => task.id),
  );
  const activeIds = normalizedOrder.filter((id) => activeTaskIds.has(id));
  const nextOrder = reorderVisibleTaskOrder(
    normalizedOrder,
    activeIds,
    taskId,
    targetId,
    placement,
  );
  if (nextOrder.every((id, index) => id === normalizedOrder[index])) return false;

  series.taskOrder = nextOrder;
  sortTasksBySavedOrder(series.tasks, series.taskOrder);
  series.updatedAt = new Date().toISOString();
  saveData();
  render();
  return true;
}

function clearTaskDragState() {
  draggedTaskId = null;
  activeDropTaskRow = null;
  activeTaskDropPlacement = "";
  document.body.classList.remove("is-dragging-task");
  $$(".task-row.is-task-dragging", elements.detailContent).forEach((row) =>
    row.classList.remove("is-task-dragging"),
  );
  $$(".task-row.is-task-drop-before, .task-row.is-task-drop-after", elements.detailContent).forEach(
    (row) => row.classList.remove("is-task-drop-before", "is-task-drop-after"),
  );
}

function setActiveDropTask(row, placement = "") {
  if (activeDropTaskRow === row && activeTaskDropPlacement === placement) return;
  activeDropTaskRow?.classList.remove("is-task-drop-before", "is-task-drop-after");
  activeDropTaskRow = row;
  activeTaskDropPlacement = placement;
  activeDropTaskRow?.classList.add(
    placement === "after" ? "is-task-drop-after" : "is-task-drop-before",
  );
}

function handleTaskDragStart(event) {
  const handle = event.target.closest("[data-drag-task]");
  const series = data.series.find((item) => item.id === detailSeriesId);
  if (!handle || !series?.tasks.some((task) => task.id === handle.dataset.dragTask)) return;

  draggedTaskId = handle.dataset.dragTask;
  handle.closest(".task-row")?.classList.add("is-task-dragging");
  document.body.classList.add("is-dragging-task");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedTaskId);
  event.dataTransfer.setData("application/x-curat-task", draggedTaskId);
}

function handleTaskDragOver(event) {
  if (!draggedTaskId) return;
  const row = event.target.closest(".task-row");
  if (!row || row.dataset.taskId === draggedTaskId) {
    setActiveDropTask(null);
    return;
  }

  const rect = row.getBoundingClientRect();
  const placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  setActiveDropTask(row, placement);
}

function handleTaskDrop(event) {
  if (!draggedTaskId) return;
  const row = event.target.closest(".task-row");
  const series = data.series.find((item) => item.id === detailSeriesId);
  if (!row || !series || row.dataset.taskId === draggedTaskId) {
    clearTaskDragState();
    return;
  }

  event.preventDefault();
  const taskId =
    event.dataTransfer.getData("application/x-curat-task") ||
    event.dataTransfer.getData("text/plain") ||
    draggedTaskId;
  const targetId = row.dataset.taskId;
  const placement = activeTaskDropPlacement || "before";
  clearTaskDragState();
  if (reorderTaskInSeries(series, taskId, targetId, placement)) {
    showToast("エピソードの並び順を保存しました");
  }
}

function isTouchLikePointer(event) {
  return event.isPrimary && (event.pointerType === "touch" || event.pointerType === "pen");
}

function pointerDistance(gesture, event) {
  return Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
}

function autoScrollTouchContainer(container, clientY) {
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const edge = Math.min(64, rect.height * 0.18);
  if (clientY < rect.top + edge) {
    container.scrollBy({ top: -18, behavior: "auto" });
  } else if (clientY > rect.bottom - edge) {
    container.scrollBy({ top: 18, behavior: "auto" });
  }
}

function beginTouchReorder(event, kind, id, handle) {
  if (!isTouchLikePointer(event)) return;
  event.preventDefault();
  closeTreeContextMenu();
  touchReorderGesture = {
    kind,
    id,
    handle,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    activated: false,
  };
  try {
    handle.setPointerCapture?.(event.pointerId);
  } catch {
    // Some embedded WebViews expose Pointer Events without pointer capture.
  }
}

function activateTouchReorder(gesture) {
  gesture.activated = true;
  gesture.handle.classList.add("is-touch-dragging");
  if (gesture.kind === "playlist") {
    draggedSeriesId = gesture.id;
    suppressPlaylistClickUntil = Date.now() + 700;
    gesture.handle
      .closest(".project-playlist-row")
      ?.querySelector("[data-project-series]")
      ?.classList.add("is-dragging");
    document.body.classList.add("is-dragging-playlist", "is-touch-reordering");
  } else {
    draggedTaskId = gesture.id;
    gesture.handle.closest(".task-row")?.classList.add("is-task-dragging");
    document.body.classList.add("is-dragging-task", "is-touch-reordering");
  }
}

function updateTouchPlaylistDrop(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  const group = target?.closest?.("[data-drop-project]");
  if (!group) {
    setActiveDropProject(null);
    setActiveDropPlaylist(null);
    return;
  }
  const targetPlaylist = playlistButtonFromDropTarget(target);
  if (targetPlaylist && targetPlaylist.dataset.projectSeries !== draggedSeriesId) {
    const targetRow = targetPlaylist.closest(".project-playlist-row");
    const rect = targetRow.getBoundingClientRect();
    setActiveDropProject(null);
    setActiveDropPlaylist(
      targetRow,
      clientY < rect.top + rect.height / 2 ? "before" : "after",
    );
    return;
  }
  const series = data.series.find((item) => item.id === draggedSeriesId);
  const currentProject = (series?.project || series?.title || "").trim();
  setActiveDropPlaylist(null);
  setActiveDropProject(currentProject === group.dataset.dropProject ? null : group);
}

function updateTouchTaskDrop(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  const row = target?.closest?.(".task-row");
  if (!row || row.dataset.taskId === draggedTaskId) {
    setActiveDropTask(null);
    return;
  }
  const rect = row.getBoundingClientRect();
  setActiveDropTask(
    row,
    clientY < rect.top + rect.height / 2 ? "before" : "after",
  );
}

function handleTouchReorderMove(event) {
  const gesture = touchReorderGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  event.preventDefault();
  if (!gesture.activated) {
    if (pointerDistance(gesture, event) < TOUCH_MOVE_THRESHOLD) return;
    activateTouchReorder(gesture);
  }
  if (gesture.kind === "playlist") {
    updateTouchPlaylistDrop(event.clientX, event.clientY);
    autoScrollTouchContainer(elements.projectTree, event.clientY);
  } else {
    updateTouchTaskDrop(event.clientX, event.clientY);
    autoScrollTouchContainer(elements.detailView, event.clientY);
  }
}

function finishTouchReorder(event, { cancelled = false } = {}) {
  const gesture = touchReorderGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  touchReorderGesture = null;
  gesture.handle.classList.remove("is-touch-dragging");
  try {
    gesture.handle.releasePointerCapture?.(event.pointerId);
  } catch {
    // The pointer may already have been released by iPadOS.
  }
  document.body.classList.remove("is-touch-reordering");
  if (!gesture.activated || cancelled) {
    if (gesture.kind === "playlist") clearPlaylistDragState();
    else clearTaskDragState();
    return;
  }

  event.preventDefault();
  if (gesture.kind === "playlist") {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const group = target?.closest?.("[data-drop-project]") || activeDropProject;
    const targetPlaylist =
      playlistButtonFromDropTarget(target) ||
      activeDropPlaylistRow?.querySelector("[data-project-series]");
    completePlaylistDrop(
      gesture.id,
      group,
      targetPlaylist,
      activePlaylistDropPlacement || "before",
    );
    return;
  }

  const target = document.elementFromPoint(event.clientX, event.clientY);
  const row = target?.closest?.(".task-row") || activeDropTaskRow;
  const series = data.series.find((item) => item.id === detailSeriesId);
  const placement = activeTaskDropPlacement || "before";
  clearTaskDragState();
  if (
    row &&
    series &&
    row.dataset.taskId !== gesture.id &&
    reorderTaskInSeries(series, gesture.id, row.dataset.taskId, placement)
  ) {
    showToast("エピソードの並び順を保存しました");
  }
}

function clearTreeLongPress() {
  if (!treeLongPressGesture) return;
  clearTimeout(treeLongPressGesture.timer);
  treeLongPressGesture.target?.classList.remove("is-holding");
  treeLongPressGesture = null;
}

function beginTreeLongPress(event) {
  if (
    !isTouchLikePointer(event) ||
    event.target.closest("[data-context-kind], [data-touch-drag-series]")
  ) {
    return;
  }
  const playlist = event.target.closest("[data-project-series]");
  const folder = event.target.closest("[data-tree-folder]");
  const target = playlist || folder;
  if (!target) return;

  clearTreeLongPress();
  const gesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    clientX: event.clientX,
    clientY: event.clientY,
    target,
    kind: playlist ? "playlist" : "folder",
    id: playlist?.dataset.projectSeries || folder.dataset.treeFolder,
    timer: 0,
  };
  gesture.timer = window.setTimeout(() => {
    if (treeLongPressGesture !== gesture) return;
    target.classList.remove("is-holding");
    suppressPlaylistClickUntil = Date.now() + 800;
    openTreeContextMenu(gesture.kind, gesture.id, gesture.clientX, gesture.clientY);
    treeLongPressGesture = null;
  }, TOUCH_LONG_PRESS_MS);
  treeLongPressGesture = gesture;
  target.classList.add("is-holding");
}

function moveTreeLongPress(event) {
  const gesture = treeLongPressGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  gesture.clientX = event.clientX;
  gesture.clientY = event.clientY;
  if (pointerDistance(gesture, event) > TOUCH_MOVE_THRESHOLD) clearTreeLongPress();
}

function endTreeLongPress(event) {
  if (treeLongPressGesture?.pointerId === event.pointerId) clearTreeLongPress();
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

async function completeAllTasks(seriesId) {
  const series = data.series.find((item) => item.id === seriesId);
  const tasks = series?.tasks.filter((task) => !task.archived && task.status !== "skipped") || [];
  const pendingTasks = tasks.filter((task) => task.status !== "done");
  if (!pendingTasks.length) {
    showToast(tasks.length ? "すべて視聴済みです" : "視聴済みにする動画がありません");
    return;
  }
  const confirmed = await requestConfirmation({
    title: "すべて視聴済みにする",
    message: `未完了の ${pendingTasks.length} 本を視聴済みにします。スキップ中の動画は変更しません。`,
    actionLabel: "すべて視聴済みにする",
    actionIcon: "check-all",
    actionTone: "primary",
  });
  if (!confirmed) return;

  const updatedAt = new Date().toISOString();
  pendingTasks.forEach((task) => {
    task.status = "done";
    task.updatedAt = updatedAt;
  });
  series.updatedAt = updatedAt;
  saveData();
  render();
  showToast(`${pendingTasks.length} 本を視聴済みにしました`);
}

async function resetSeriesProgress(seriesId) {
  const series = data.series.find((item) => item.id === seriesId);
  const tasks = series?.tasks.filter((task) => !task.archived) || [];
  const changedTasks = tasks.filter((task) => task.status !== "todo");
  if (!changedTasks.length) {
    showToast(tasks.length ? "視聴進捗はすでに未視聴です" : "リセットする動画がありません");
    return;
  }
  const confirmed = await requestConfirmation({
    title: "視聴進捗をリセット",
    message: `${tasks.length} 本の視聴状態をすべて「未視聴」に戻します。`,
    actionLabel: "進捗をリセット",
    actionIcon: "undo",
  });
  if (!confirmed) return;

  const updatedAt = new Date().toISOString();
  tasks.forEach((task) => {
    task.status = "todo";
    task.updatedAt = updatedAt;
  });
  series.updatedAt = updatedAt;
  saveData();
  render();
  showToast("視聴進捗をリセットしました");
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
    openSettingsDialog();
    throw new Error("YouTube API キーを設定してください。");
  }
  const result = await fetchPlaylist(seriesId);
  const { series: updated, newTasks } = mergePlaylistResult(seriesId, result);
  render();
  if (!quiet) {
    if (newTasks.length) {
      highlightPlaylistUpdates([{ series: updated, newTasks }]);
      showToast(`「${updated.title}」に新着動画が ${newTasks.length} 本あります`);
    } else {
      showToast(`「${updated.title}」を再同期しました`);
    }
  }
  return { series: updated, newTasks };
}

async function syncAllSeries() {
  if (!data.series.length) {
    showToast("同期するプレイリストがありません");
    return;
  }
  if (!config.apiKey) {
    openSettingsDialog();
    return;
  }
  elements.syncAll.classList.add("is-spinning");
  elements.syncAll.disabled = true;
  let success = 0;
  const updates = [];
  try {
    for (const series of [...data.series]) {
      try {
        const update = await syncSeries(series.id, { quiet: true });
        if (update?.newTasks.length) updates.push(update);
        success += 1;
      } catch (error) {
        console.error(error);
      }
    }
    if (updates.length) {
      const newVideoCount = updates.reduce((total, update) => total + update.newTasks.length, 0);
      highlightPlaylistUpdates(updates);
      showToast(
        updates.length === 1
          ? `「${updates[0].series.title}」に新着動画が ${newVideoCount} 本あります`
          : `${updates.length} 件のプレイリストに新着動画が ${newVideoCount} 本あります`,
      );
    } else {
      showToast(`${success}/${data.series.length} 件のプレイリストを同期しました`, success === 0);
    }
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
  saveData();
  render();
  showToast("すべてのプレイリストとフォルダーを削除しました");
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
    await saveData();
    render();
    showToast(`${count} 件のプレイリストを復元しました`);
    elements.settingsDialog.close();
  } catch (error) {
    showToast(error.message || "バックアップを読み込めませんでした", true);
  }
}

function updateBackupUI() {
  const statusPanel = $("#saveStatusPanel");
  statusPanel.dataset.syncState = cloudState.phase;
  elements.cloudSetupNotice.hidden = cloudState.configured;
  elements.cloudLoginForm.hidden =
    !cloudState.configured ||
    (cloudState.phase !== "signed-out" && !(cloudState.phase === "error" && !cloudState.email));
  elements.cloudAccount.hidden =
    !cloudState.configured ||
    !["connecting", "syncing", "synced", "error"].includes(cloudState.phase) ||
    !cloudState.email;
  $("#cloudAccountEmail").textContent = cloudState.email;

  if (cloudState.phase === "synced") {
    elements.backupStatus.textContent = "クラウド同期済み";
    elements.saveStatusTitle.textContent = "すべての端末で同期中";
    elements.saveStatusCopy.textContent = `${cloudState.email} として安全に同期しています。`;
  } else if (cloudState.phase === "syncing") {
    elements.backupStatus.textContent = "クラウドへ保存中…";
    elements.saveStatusTitle.textContent = "変更を同期しています";
    elements.saveStatusCopy.textContent = "完了すると別の端末へ自動反映されます。";
  } else if (cloudState.phase === "connecting" || cloudState.phase === "loading") {
    elements.backupStatus.textContent = "クラウドへ接続中…";
    elements.saveStatusTitle.textContent = "Firebase へ接続中";
    elements.saveStatusCopy.textContent = "接続後に Firebase のデータを読み込みます。";
  } else if (cloudState.phase === "error") {
    elements.backupStatus.textContent = "クラウド同期エラー";
    elements.saveStatusTitle.textContent = "クラウド同期を確認してください";
    elements.saveStatusCopy.textContent = cloudState.error;
  } else if (cloudState.phase === "signed-out") {
    elements.backupStatus.textContent = "ログインが必要";
    elements.saveStatusTitle.textContent = "この端末に保存中";
    elements.saveStatusCopy.textContent = "ログインすると他の端末とも同期できます。";
  } else {
    elements.backupStatus.textContent = "Firebase 未設定";
    elements.saveStatusTitle.textContent = "この端末に保存中";
    elements.saveStatusCopy.textContent = "Firebase を設定すると他の端末とも同期できます。";
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

elements.detailContent.addEventListener("click", async (event) => {
  const workspaceAction = event.target.closest("[data-workspace-action]");
  if (workspaceAction?.dataset.workspaceAction === "add") {
    elements.url.focus();
    return;
  }
  const control = event.target.closest("[data-detail-action]");
  if (!control) return;
  const action = control.dataset.detailAction;
  const series = data.series.find((item) => item.id === detailSeriesId);
  if (!series) return;
  if (action === "continue") {
    continueSeries(series.id);
    return;
  }
  if (action === "complete-all") {
    await completeAllTasks(series.id);
    return;
  }
  if (action === "reset-progress") {
    await resetSeriesProgress(series.id);
    return;
  }
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

elements.detailContent.addEventListener("dragstart", handleTaskDragStart);
elements.detailContent.addEventListener("dragover", handleTaskDragOver);
elements.detailContent.addEventListener("drop", handleTaskDrop);
elements.detailContent.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest("[data-drag-task]");
  if (handle) beginTouchReorder(event, "task", handle.dataset.dragTask, handle);
});
elements.detailContent.addEventListener("dragleave", (event) => {
  if (!elements.detailContent.contains(event.relatedTarget)) setActiveDropTask(null);
});
elements.detailContent.addEventListener("keydown", (event) => {
  const handle = event.target.closest("[data-drag-task]");
  if (!handle || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
  const series = data.series.find((item) => item.id === detailSeriesId);
  if (!series) return;
  const activeTasks = series.tasks.filter((task) => !task.archived);
  const index = activeTasks.findIndex((task) => task.id === handle.dataset.dragTask);
  const offset = event.key === "ArrowUp" ? -1 : 1;
  const target = activeTasks[index + offset];
  if (!target) return;

  event.preventDefault();
  const taskId = handle.dataset.dragTask;
  const placement = offset < 0 ? "before" : "after";
  if (!reorderTaskInSeries(series, taskId, target.id, placement)) return;
  requestAnimationFrame(() => {
    $$("[data-drag-task]", elements.detailContent)
      .find((item) => item.dataset.dragTask === taskId)
      ?.focus();
  });
});

elements.syncAll.addEventListener("click", syncAllSeries);
elements.deleteAll.addEventListener("click", deleteAllPlaylistsAndFolders);
elements.openRecommendations.addEventListener("click", openRecommendationDialog);
elements.refreshRecommendations.addEventListener("click", loadRecommendations);
elements.recommendationTabs.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-recommendation-tab]");
  if (!tab) return;
  activeRecommendationTab = tab.dataset.recommendationTab;
  renderRecommendationResults();
});
elements.recommendationTabs.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = $$("[data-recommendation-tab]", elements.recommendationTabs);
  const currentIndex = tabs.indexOf(event.target.closest("[data-recommendation-tab]"));
  if (currentIndex < 0) return;
  let nextIndex = currentIndex;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.length - 1;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
  event.preventDefault();
  activeRecommendationTab = tabs[nextIndex].dataset.recommendationTab;
  renderRecommendationResults();
  tabs[nextIndex].focus();
});
$("#closeRecommendations").addEventListener("click", () =>
  elements.recommendationDialog.close(),
);
elements.recommendationDialog.addEventListener("click", (event) => {
  if (event.target === elements.recommendationDialog) {
    elements.recommendationDialog.close();
  }
});
elements.recommendationResults.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-recommendation-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.recommendationAction;
  if (
    action === "dismiss-playlist" ||
    action === "dismiss-game" ||
    action === "dismiss-channel"
  ) {
    const card = button.closest("[data-recommendation-id]");
    const candidate = recommendationCandidates.find(
      (item) => item.id === card?.dataset.recommendationId,
    );
    if (!candidate) return;
    const kind = {
      "dismiss-playlist": "playlists",
      "dismiss-game": "games",
      "dismiss-channel": "channels",
    }[action];
    const key = {
      playlists: recommendationPlaylistKey,
      games: recommendationGameKey,
      channels: recommendationChannelKey,
    }[kind](candidate);
    if (!key) return;
    data.recommendationDismissals = normalizeRecommendationDismissals({
      ...data.recommendationDismissals,
      [kind]: [...(data.recommendationDismissals?.[kind] || []), key],
    });
    recommendationCandidates = recommendationCandidates.filter(
      (item) =>
        !isRecommendationDismissed(item, data.recommendationDismissals),
    );
    saveData();
    recommendationSourceSignature = recommendationDataSignature();
    renderRecommendationResults();
    showToast(
      {
        playlists: "このプレイリストをおすすめに表示しないようにしました",
        games: "このゲームをおすすめに表示しないようにしました",
        channels: "このチャンネルをおすすめに表示しないようにしました",
      }[kind],
    );
    return;
  }
  if (action !== "add") return;
  const playlistId = button.dataset.playlistId;
  if (!playlistId) return;
  button.disabled = true;
  const label = $("span", button);
  if (label) label.textContent = "追加中…";
  try {
    await importPlaylist(`https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`);
    recommendationCandidates = recommendationCandidates.filter(
      (candidate) => candidate.id !== playlistId,
    );
    recommendationSourceSignature = recommendationDataSignature();
    elements.recommendationDialog.close();
  } catch (error) {
    recommendationError = error.message;
    renderRecommendationResults();
  } finally {
    setFormLoading(false);
    if (button.isConnected) {
      button.disabled = false;
      if (label) label.textContent = "追加";
    }
  }
});

$("#openSettings").addEventListener("click", () => {
  openSettingsDialog();
});

$("#toggleKey").addEventListener("click", (event) => {
  const showing = elements.apiKey.type === "text";
  elements.apiKey.type = showing ? "password" : "text";
  $("span", event.currentTarget).textContent = showing ? "表示" : "隠す";
  event.currentTarget.setAttribute("aria-label", showing ? "API キーを表示" : "API キーを隠す");
});

$("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  config.apiKey = elements.apiKey.value.trim();
  browserSettings.apiKey = config.apiKey;
  saveBrowserSettings();
  elements.settingsDialog.close();
  showToast("API キーをこのブラウザに保存しました");
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
$("#closeSettings").addEventListener("click", () =>
  elements.settingsDialog.close(),
);
$("#openBackup").addEventListener("click", () => {
  updateBackupUI();
  openSettingsDialog({ focus: "backup" });
});
elements.cloudLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.cloudLogin.disabled = true;
  browserSettings.username = elements.cloudEmail.value.trim();
  browserSettings.password = elements.cloudPassword.value;
  saveBrowserSettings();
  try {
    await cloudSync.signIn(
      browserSettings.username,
      browserSettings.password,
    );
    showToast("クラウド同期へログインしました");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.cloudLogin.disabled = false;
  }
});
elements.cloudLogout.addEventListener("click", async () => {
  await cloudSync.signOut();
  showToast("クラウド同期からログアウトしました");
});
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
});

elements.projectTree.addEventListener("contextmenu", (event) => {
  clearTreeLongPress();
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
elements.projectTree.addEventListener("pointerdown", (event) => {
  const dragHandle = event.target.closest("[data-touch-drag-series]");
  if (dragHandle) {
    clearTreeLongPress();
    beginTouchReorder(
      event,
      "playlist",
      dragHandle.dataset.touchDragSeries,
      dragHandle,
    );
    return;
  }
  beginTreeLongPress(event);
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
    if (isFolder) openRenameFolderDialog(id);
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

elements.projectTree.addEventListener("dragstart", handlePlaylistDragStart);
elements.projectTree.addEventListener("dragover", handleProjectDragOver);
elements.projectTree.addEventListener("drop", handleProjectDrop);
elements.projectTree.addEventListener("dragleave", (event) => {
  if (!elements.projectTree.contains(event.relatedTarget)) setActiveDropProject(null);
});
document.addEventListener("dragend", () => {
  suppressPlaylistClickUntil = Date.now() + 250;
  clearPlaylistDragState();
  clearTaskDragState();
});
document.addEventListener("pointermove", (event) => {
  handleTouchReorderMove(event);
  moveTreeLongPress(event);
}, { passive: false });
document.addEventListener("pointerup", (event) => {
  finishTouchReorder(event);
  endTreeLongPress(event);
});
document.addEventListener("pointercancel", (event) => {
  finishTouchReorder(event, { cancelled: true });
  endTreeLongPress(event);
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
  saveNewFolder();
});
$("#folderForm").querySelectorAll(".close-button, .secondary-button").forEach((button) => {
  button.addEventListener("click", () => elements.folderDialog.close());
});
elements.folderDialog.addEventListener("click", (event) => {
  if (event.target === elements.folderDialog) elements.folderDialog.close();
});
elements.newFolderName.addEventListener("input", () => {
  $("#newFolderNameError").textContent = "";
});

elements.renameFolderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveRenamedFolder();
});
elements.renameFolderForm.querySelectorAll(".close-button, .secondary-button").forEach((button) => {
  button.addEventListener("click", () => elements.renameFolderDialog.close());
});
elements.folderName.addEventListener("input", updateRenameFolderInteraction);
elements.folderName.addEventListener("keydown", (event) => {
  const suggestionsVisible = !elements.folderNameSuggestionsSection.hidden;
  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestionsVisible) {
    event.preventDefault();
    const optionCount = $$(
      "[data-folder-name-suggestion]",
      elements.folderNameSuggestions,
    ).length;
    const nextIndex =
      folderNameSuggestionIndex < 0
        ? event.key === "ArrowDown"
          ? 0
          : optionCount - 1
        : folderNameSuggestionIndex + (event.key === "ArrowDown" ? 1 : -1);
    setFolderNameSuggestionIndex(nextIndex);
    return;
  }
  if (event.key === "Enter" && folderNameSuggestionIndex >= 0) {
    event.preventDefault();
    const option = $$(
      "[data-folder-name-suggestion]",
      elements.folderNameSuggestions,
    )[folderNameSuggestionIndex];
    if (option) chooseFolderNameSuggestion(option.dataset.folderNameSuggestion);
    return;
  }
  if (event.key === "Escape" && suggestionsVisible) {
    event.preventDefault();
    elements.folderNameSuggestionsSection.hidden = true;
    elements.folderName.setAttribute("aria-expanded", "false");
    elements.folderName.removeAttribute("aria-activedescendant");
    folderNameSuggestionIndex = -1;
  }
});
elements.folderNameSuggestions.addEventListener("click", (event) => {
  const option = event.target.closest("[data-folder-name-suggestion]");
  if (option) chooseFolderNameSuggestion(option.dataset.folderNameSuggestion);
});

elements.folderIconForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveChangedFolderIcon();
});
elements.folderIconForm.querySelectorAll(".close-button, .secondary-button").forEach((button) => {
  button.addEventListener("click", () => elements.folderIconDialog.close());
});
elements.folderIconSearch.addEventListener("input", () => {
  clearTimeout(folderIconSearchTimer);
  folderIconSearchTimer = setTimeout(
    () => searchFolderIcons(elements.folderIconSearch.value),
    280,
  );
});
elements.folderIconSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    clearTimeout(folderIconSearchTimer);
    searchFolderIcons(elements.folderIconSearch.value);
  }
  if (event.key === "Escape" && elements.folderIconSearch.value) {
    event.preventDefault();
    elements.folderIconSearch.value = "";
    showBuiltinFolderIcons();
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    $("[data-folder-icon]", elements.folderIconResults)?.focus();
  }
});
elements.folderIconMore.addEventListener("click", () => {
  searchFolderIcons(elements.folderIconSearch.value, { showAll: true });
});
elements.folderIconDialog.addEventListener("click", (event) => {
  if (event.target === elements.folderIconDialog) {
    elements.folderIconDialog.close();
    return;
  }
  const option = event.target.closest("[data-folder-icon]");
  if (!option) return;
  selectedFolderIcon = normalizeFolderIcon(option.dataset.folderIcon);
  updateFolderIconSelection();
});
elements.folderIconDialog.addEventListener("dblclick", (event) => {
  if (event.target.closest("[data-folder-icon]")) {
    elements.folderIconForm.requestSubmit(elements.folderIconForm.querySelector("[type='submit']"));
  }
});
elements.folderIconDialog.addEventListener("keydown", (event) => {
  const option = event.target.closest("[data-folder-icon]");
  if (!option || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    return;
  }
  event.preventDefault();
  const container = option.closest(".folder-icon-results");
  const options = $$("[data-folder-icon]", container);
  const index = options.indexOf(option);
  const columnCount = getComputedStyle(container).gridTemplateColumns.split(" ").length;
  const offset = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -columnCount,
    ArrowDown: columnCount,
  }[event.key];
  options[Math.max(0, Math.min(options.length - 1, index + offset))]?.focus();
});
$("#resetFolderIcon").addEventListener("click", () => {
  selectedFolderIcon = "";
  updateFolderIconSelection();
});

elements.renameFolderDialog.addEventListener("close", () => {
  elements.folderNameSuggestionsSection.hidden = true;
  elements.folderName.setAttribute("aria-expanded", "false");
  elements.saveFolderName.disabled = false;
  folderNameSuggestionIndex = -1;
  editingFolderOriginalName = null;
});
elements.folderIconDialog.addEventListener("close", () => {
  stopFolderIconSearch();
  if (editingFolderIconName) {
    const row = folderRowByName(editingFolderIconName);
    const target = row ? $(".folder-icon", row) : null;
    if (target) {
      target.innerHTML = folderIconMarkup(projectRuleByName(editingFolderIconName)?.icon);
    }
  }
  editingFolderIconName = null;
});
elements.renameFolderDialog.addEventListener("click", (event) => {
  if (event.target === elements.renameFolderDialog) elements.renameFolderDialog.close();
});
window.addEventListener("resize", () => {
  if (elements.folderDialog.open) {
    positionAnchoredPopup(elements.folderDialog, elements.newProject);
  }
  if (elements.renameFolderDialog.open && editingFolderOriginalName) {
    positionFolderPopup(elements.renameFolderDialog, editingFolderOriginalName);
  }
  if (elements.folderIconDialog.open && editingFolderIconName) {
    positionFolderPopup(elements.folderIconDialog, editingFolderIconName);
  }
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

document.addEventListener("keydown", (event) => {
  if (
    event.key !== "Enter" ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229
  ) {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const isMultiline = target.matches("textarea, [contenteditable='true']");
  if (isMultiline && !(event.metaKey || event.ctrlKey)) return;
  if (target.matches("button, a, select")) return;

  const form = target.closest("form");
  const submitter = form?.querySelector("[data-default-action]");
  if (!submitter || submitter.disabled) return;
  event.preventDefault();
  form.requestSubmit(submitter);
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
  const aliasAdded = editingProjectOriginalName !== name &&
    learnRecentImportCorrection(series, name);
  if (!aliasAdded) learnPlaylistTitle(name, series.title);
  const removedEmptyFolder =
    editingProjectOriginalName !== name &&
    removeProjectIfEmpty(editingProjectOriginalName);
  config.expandedProjects ||= {};
  config.expandedProjects[name] = true;
  selectedTreeKey = `playlist:${series.id}`;
  saveData();
  elements.projectDialog.close();
  render();
  const message = aliasAdded
    ? `「${name}」へ移動し、今後の分類用の別名にも追加しました`
    : `「${name}」フォルダーへ移動しました`;
  showToast(
    removedEmptyFolder
      ? `${message}。空になった「${editingProjectOriginalName}」フォルダーも削除しました`
      : message,
  );
});
$(".close-button", elements.projectDialog).addEventListener("click", () =>
  elements.projectDialog.close(),
);

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
});

document.addEventListener("pointerdown", (event) => {
  if (!elements.contextMenu.hidden && !event.target.closest("#treeContextMenu")) {
    closeTreeContextMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    elements.url.focus();
  }
  if (event.altKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    elements.projectSearch.focus();
  }
  if (event.key === "Escape") {
    if (!elements.contextMenu.hidden) {
      closeTreeContextMenu();
      return;
    }
  }
});

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

async function startApp() {
  // Paint the app shell immediately while IndexedDB restores the saved library.
  render();
  try {
    const savedData = await dataStore.load();
    if (savedData && Array.isArray(savedData.series)) {
      data = migrateData(savedData);
    }
  } catch (error) {
    console.warn("端末の保存データを読み込めませんでした", error);
  }

  render();
  cloudSync.start();

  const initialSeriesId = location.hash.startsWith("#series=")
    ? decodeURIComponent(location.hash.slice("#series=".length))
    : "";
  if (initialSeriesId && data.series.some((series) => series.id === initialSeriesId)) {
    openSeries(initialSeriesId);
  } else {
    const firstSeries =
      data.series.find((series) => series.id === data.playlistOrder[0]) || data.series[0];
    if (firstSeries) openSeries(firstSeries.id);
  }
}

startApp();
