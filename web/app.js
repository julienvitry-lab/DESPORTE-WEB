import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  getAggregateFromServer,
  count,
  sum,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  Timestamp,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// WEB018 · EDITION002 : parité d’édition activité Web / téléphone / tablette.
// Chaque écriture produit aussi un événement /changes consommé par les appareils Android.
// La clé API Firebase Web identifie le projet ; l'accès dépend de Firebase Auth + règles Firestore.
const firebaseConfig = {
  apiKey: "AIzaSyDALtXWRoNHiD9oc4SqxH4tn7HY_08NI1A",
  authDomain: "sport-505813.firebaseapp.com",
  projectId: "sport-505813",
  storageBucket: "sport-505813.firebasestorage.app",
  messagingSenderId: "161388578171"
};

const ROOT = "sport_users";
const PAGE_SIZE = 250;
const MAX_EQUIPMENT_RENAME_CASCADE = 180;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const ui = Object.fromEntries(
  [
    "authState", "loginButton", "logoutButton", "messageBox", "dashboard",
    "appearanceSelect", "appearanceSection", "uxPrimaryNav", "uxSecondaryNav", "uxHeroTitle", "uxHeroEyebrow", "bootstrapMetrics", "activityDirectorySection", "advancedLandmarksSection",
    "catalogView", "identityLine", "activityCount", "equipmentCount",
    "landmarkCount", "activityLandmarkCount", "recordCount", "expectedDocuments",
    "webDashboardSection", "webDashboardMeta", "dashboardRunningButton", "dashboardCyclingButton",
    "personalSyncSection", "personalSyncMeta", "personalSyncStatus", "goalSportSelect",
    "webStravaSection", "webStravaBadge", "webStravaConnectButton", "webStravaDays", "webStravaRefreshButton", "webStravaImportButton", "webStravaStatus", "webStravaAthlete", "webStravaPreviewList", "webStravaBackendUrl", "webStravaTestBackendButton", "webStravaDisconnectButton", "webFilesSection", "webFilesSummaryBadge", "webFilesOriginalCount", "webFilesLocalSize", "webFilesLinkedCount", "webFilesDerivedCount", "webFilesRefreshButton", "webFilesFilter", "webFilesSearch", "webFilesStatus", "webFilesList", "webDriveStatus", "webDriveBadge", "webDriveConnectButton", "webDriveUploadMissingButton", "webDriveFolderMeta", "webManualSection", "webManualForm", "webManualSport", "webManualDate", "webManualTime", "webManualDistanceKm", "webManualDuration", "webManualAscent", "webManualDescent", "webManualAvgHr", "webManualMaxHr", "webManualCalories", "webManualEquipment", "webManualTitle", "webManualLandmarkButtons", "webManualNotes", "webManualPreview", "webManualResetButton", "webManualCommitButton", "webImportSection", "webImportDropZone", "webImportFileInput", "webImportArchiveOriginals", "webImportArchiveBadge", "webImportArchiveMeta", "webImportStatus", "webImportPreviewList", "webImportClearButton", "webImportCommitButton", "syncCenterSection", "syncCenterMeta", "syncHistoryTableFilter", "syncHistorySourceFilter",
    "syncEventCount", "syncConflictCount", "syncLastSource", "syncConflictBanner", "syncHistoryList",
    "syncHealthSection", "syncHealthMeta", "syncHealthClientCount", "syncHealthHealthyCount",
    "syncHealthPendingCount", "syncHealthErrorCount", "syncHealthNetwork", "syncHealthList",
    "syncHealthRefreshButton", "syncHealthRetryButton",
    "trashSection", "trashMeta", "trashSearchInput", "trashRefreshButton", "trashCount", "trashActiveEstimate", "trashLastChange", "trashList",
    "goalDistanceInput", "goalAscentInput", "goalDurationInput", "goalTargetNameInput",
    "goalTargetDateInput", "goalPrepDistanceInput", "goalPrepAscentInput", "goalSaveStatus", "goalProgress",
    "weightDateInput", "weightKgInput", "weightSaveStatus", "weightSummary", "weightHistory",
    "dashboardWeekButton", "dashboardMonthButton", "dashboardYearButton", "dashboardTotalButton",
    "dashboardActivityValue", "dashboardDistanceValue", "dashboardDurationValue", "dashboardAscentValue",
    "dashboardActivityDelta", "dashboardDistanceDelta", "dashboardDurationDelta", "dashboardAscentDelta",
    "dashboardComparisonMeta", "dashboardChartTitle", "dashboardChartMeta", "dashboardChart",
    "dashboardChartDistanceButton", "dashboardChartAscentButton", "dashboardChartDurationButton",
    "dashboardTrends", "dashboardGoalMeta", "dashboardGoalSummary", "dashboardSportSplit",
    "dashboardEquipmentMeta", "dashboardEquipmentList", "dashboardRecentList", "dashboardRecordsList",
    "dashboardDrilldownNotice", "dashboardDrilldownLabel", "clearDashboardDrilldownButton",
    "equipmentManagerSection", "equipmentManagerMeta", "equipmentManagerSearch",
    "equipmentManagerStatusFilter", "newEquipmentButton", "equipmentEditor",
    "equipmentMappingSection", "equipmentMappingSource", "equipmentMappingSport",
    "equipmentMappingSubSport", "equipmentMappingEquipment", "equipmentMappingAddButton",
    "equipmentMappingApplyButton", "equipmentMappingStatus", "equipmentMappingList",
    "equipmentEditorEyebrow", "equipmentEditorTitle", "equipmentEditorHint",
    "closeEquipmentEditorButton", "equipmentCategoryInput", "equipmentCustomNameInput",
    "equipmentBrandInput", "equipmentModelInput", "equipmentSpecimenInput",
    "equipmentStatusInput", "equipmentPurchaseDateInput", "equipmentPriceInput",
    "equipmentWarningDistanceInput", "equipmentCriticalDistanceInput",
    "equipmentWarningDurationInput", "equipmentCriticalDurationInput",
    "equipmentNotesInput", "equipmentEditorStatus", "equipmentEditorId",
    "createEquipmentButton", "equipmentManagerList",
    "landmarkManagerSection", "landmarkManagerMeta", "landmarkManagerSearch",
    "newLandmarkButton", "landmarkEditor", "landmarkEditorEyebrow", "landmarkEditorTitle",
    "landmarkEditorHint", "closeLandmarkEditorButton", "landmarkCodeInput",
    "landmarkNameInput", "landmarkTypeInput", "landmarkSortOrderInput",
    "landmarkEditorStatus", "landmarkEditorInfo", "deleteLandmarkButton",
    "createLandmarkButton", "landmarkManagerList",
    "recordsManagerSection", "recordsManagerStatus", "rebuildRecordsButton",
    "loadedLabel", "loadMoreButton", "loadAllButton", "refreshButton",
    "globalMapSection", "globalMapStatus", "globalMapCount", "globalMapHotspot", "globalMapSummaryText", "globalActivityMap", "globalMapFilteredButton", "globalMapAllButton", "globalMapClearButton", "globalMapModeSelect", "globalMapYearSelect", "globalMapSportSelect", "globalMapDensityZoomSelect", "globalMapLegend", "globalHotspotExplorer", "globalHotspotMeta", "globalHotspotList", "globalHotspotResetButton",
    "performanceTerrainAnalysis", "performanceTerrainMeta", "performanceBenchmarkBadge", "performanceTerrainMetrics", "performanceGradeDistribution", "performanceBenchmark", "performanceInsight",
    "performanceProgression", "performanceProgressionMeta", "performanceProgressionTrend", "performanceProgressionSummary", "performanceProgressionWindows", "performanceProgressionChart", "performanceProgressionHistory",
    "recurringLandmarksAnalysis", "recurringLandmarksMeta", "recurringLandmarksList", "scanRecurringClimbsButton", "recurringClimbsStatus", "recurringClimbsList",
    "searchInput", "sportFilter", "yearFilter", "equipmentFilter",
    "landmarkFilter", "sourceFilter", "distanceFilter", "ascentFilter", "sortFilter",
    "activityList", "recordsList",
    "detailView", "backToCatalogButton", "backToCatalogBottomButton", "splitActivityButton", "splitActivityPanel", "splitActivityCloseButton", "splitActivityStatus", "splitActivityWorkspace", "splitProfileSvg", "splitActivityRange", "splitActivityRangeLabel", "splitActivityPreview", "splitActivityTitleA", "splitActivityTitleB", "splitActivityAutoButton", "splitActivityCommitButton",
    "previousActivityButton", "nextActivityButton",
    "previousActivityBottomButton", "nextActivityBottomButton", "detailPosition",
    "detailSportLine", "detailTitle", "detailDateLine", "detailHeroMetrics", "quickLandmarkButtons", "detailCaloriesQuality", "metricChartPanel", "metricChartTitle", "metricChartMeta", "metricChartStatus", "metricChartSvg", "metricChartCloseButton", "detailTechnicalPanel", "trashCurrentActivityButton",
    "detailSummaryGrid", "detailPerformanceGrid", "detailPersonalGrid",
    "interopStatus", "interopEditor", "editTitleInput", "editDescriptionInput", "editNoteInput",
    "editEquipmentSelect", "editFeelingSelect", "editDifficultySelect", "editPrivacySelect",
    "addLandmarkSelect",
    "detailMapSection", "mapStatus", "mapStage", "activityMap", "mapLayerSelect", "mapRouteModeSelect",
    "mapKmMarkersToggle", "mapRecenterButton", "mapFullscreenButton", "mapSlopeLegend",
    "routeComparisonPanel", "routeComparisonSelect", "routeComparisonButton", "routeComparisonClearButton", "routeComparisonStatus", "routeComparisonMetrics", "routeComparisonLegend",
    "routeStats", "routeAnalysis", "routeAnalysisMeta", "routeSegmentList", "routeAnalysisClearButton", "routeKmAnalysisMeta", "routeKmAnalysisList", "routeKmClearButton", "elevationProfile", "profileMeta", "profileLive",
    "detailLandmarks", "detailRecordsSection", "detailRecordsList",
    "detailImportGrid", "detailTechnicalSummary", "detailRawGrid"
  ].map((id) => [id, document.querySelector(`#${id}`)])
);

let currentUser = null;
let activities = [];
let filteredActivities = [];
let lastActivityDoc = null;
let moreActivities = true;
let loading = false;
let loadingAll = false;
let catalogScrollY = 0;
let currentDetailId = null;
let activityVisibleLimit = 20;
let uxCurrentPage = "home";
let uxCurrentSubpage = "main";
let trashActivities = new Map();
let trashMutationRunning = false;

let dashboardSport = 1;
let dashboardPeriod = "YEAR";
let dashboardChartMetric = "distance";
let dashboardLoadGeneration = 0;
let dashboardDrilldownStartMs = 0;
let dashboardDrilldownEndMs = 0;
let dashboardDrilldownText = "";
let dashboardRefreshTimer = null;

let sportGoals = new Map();
let journalEntries = new Map();
let selectedGoalSport = 1;
let goalEditorDirty = false;
let goalAutosaveTimer = null;
let goalAutosaveQueue = Promise.resolve();
let goalAutosaveGeneration = 0;
let weightEditorDirty = false;
let weightAutosaveTimer = null;
let weightAutosaveQueue = Promise.resolve();
let weightAutosaveGeneration = 0;

let equipmentRows = [];
let equipmentMappingRows = [];
let equipmentEditorMode = "closed";
let equipmentEditorRowId = null;
let equipmentEditorDirty = false;
let equipmentAutosaveTimer = null;
let equipmentAutosaveQueue = Promise.resolve();
let equipmentAutosaveGeneration = 0;

let landmarks = new Map();
let landmarkReferences = new Map();
let landmarkEditorMode = "closed";
let landmarkEditorCode = null;
let landmarkEditorDirty = false;
let landmarkAutosaveTimer = null;
let landmarkAutosaveQueue = Promise.resolve();
let landmarkAutosaveGeneration = 0;

let activityLandmarks = new Map();
let records = [];
let recordsRebuildRunning = false;

let interopUnsubscribe = null;
let syncHistoryUnsubscribe = null;
let syncHistoryEvents = [];
const SYNC_HISTORY_LIMIT = 120;
const CONFLICT_WINDOW_MS = 30_000;
let interopWatchStartedAtMs = 0;
const webDeviceId = loadWebDeviceId();

let syncHealthUnsubscribe = null;
let syncHealthRows = [];
let syncHealthHeartbeatTimer = null;
let webMutationRetryRunning = false;
const WEB_PENDING_MUTATIONS_KEY = "sport_web016_pending_mutations";
const SYNC_HEALTH_STALE_MS = 15 * 60 * 1000;
const SYNC_HEALTH_HEARTBEAT_MS = 60 * 1000;

const AUTOSAVE_DELAY_MS = 800;
let activityAutosaveTimer = null;
let activityAutosaveGeneration = 0;
let activityAutosaveQueue = Promise.resolve();
let activityEditDirty = false;
let editorActivityKey = null;

let globalMapInstance = null;
let globalMapLayer = null;
let globalMapRequestToken = 0;
let globalMapRouteCache = new Map();
let globalMapRenderedKeys = new Set();
let globalMapIsBusy = false;
let globalMapIsStale = true;
let globalMapLastLoadEverything = false;
let globalMapDensityCells = [];
let webImportCandidates = [];
let webImportRunning = false;
const WEB_IMPORT_ARCHIVE_DB = "sport_web_import_archive_v1";
const WEB_IMPORT_ARCHIVE_STORE = "original_fit";
const FIT_UNIX_EPOCH_MS = 631065600000;
let webManualLandmarkCounts = new Map();
let webManualSaving = false;
let splitActivityRoute = null;
let splitActivitySource = null;
let splitActivitySessions = [];
let splitActivitySaving = false;
let webFileVaultEntries = [];
let webFileVaultLoading = false;
let webDriveAccessToken = null;
let webDriveFolderId = null;
let webDriveBusy = false;
const WEB_DRIVE_FOLDER_NAME = "SPORT";
const WEB_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DEFAULT_STRAVA_BRIDGE_URL = "https://europe-west1-sport-505813.cloudfunctions.net/stravaBridge";
let webStravaCandidates = [];
let webStravaConnected = false;
let webStravaBusy = false;
let webStravaAthleteProfile = null;
let webStravaAutoSyncTimer = null;
let webStravaAutoSyncPromise = null;
let webStravaAutoHooksWired = false;
let webStravaLastAutoAttemptMs = 0;
let webStravaServerAutomatic = false;
let webStravaServerSubscriptionId = null;
const WEB_STRAVA_AUTO_INTERVAL_MS = 5 * 60 * 1000;
const WEB_STRAVA_AUTO_MIN_GAP_MS = 60 * 1000;
const WEB_STRAVA_AUTO_INITIAL_LOOKBACK_DAYS = 30;
const WEB_STRAVA_AUTO_OVERLAP_MS = 2 * 24 * 60 * 60 * 1000;
const WEB_STRAVA_DUPLICATE_TIME_WINDOW_MS = 2 * 60 * 1000;
const WEB_STRAVA_TREADMILL_SLOPE_PERCENT = 12;
const WEB_SPLIT_AUTO_GAP_MS = 15 * 60 * 1000;
const WEB_SPLIT_INACTIVE_SPEED_MPS = 0.30;
const WEB_SPLIT_INACTIVE_MERGE_MS = 2 * 60 * 1000;
const WEB_SPLIT_DISTANCE_PLATEAU_M = 30;
const WEB_SPLIT_VERSION = "WEBSPLIT003";







let activityMapInstance = null;
let activityRouteLayer = null;
let activityRouteLayers = [];
let activityKmMarkersLayer = null;
let activityRouteBounds = null;
let activityHoverMarker = null;
let showKmMarkers = true;
let cartographyRequestToken = 0;
let activityBaseLayers = {};
let activityBaseLayer = null;
let activeRoute = null;
let recurringClimbScanToken = 0;
let recurringClimbScanBusy = false;
let profileHoverUpdater = null;
let profileHoverClearer = null;
let profileSegmentHighlighter = null;
let activitySegmentHighlightLayer = null;
let selectedRouteSegment = null;
let comparedActivity = null;
let comparedRoute = null;
let comparisonRouteLayer = null;
let profileComparisonRenderer = null;
let profileComparisonClearer = null;

wireEvents();
/* WEB051_UNIFIED_CONNECTION_TIMER · affichage uniquement */
renderUnifiedConnectionBadgeWeb051();
setInterval(renderUnifiedConnectionBadgeWeb051, 5000);
window.addEventListener("online", renderUnifiedConnectionBadgeWeb051, { passive: true });
window.addEventListener("offline", renderUnifiedConnectionBadgeWeb051, { passive: true });

initUxNavigation();
initializeWebStravaModule();
installWeb049UiContract();
queueMicrotask(() => installEquipmentMappingEditorWeb050());
/* WEB053_PROFILE_EDITOR_BOOT */
queueMicrotask(() => installEquipmentProfileEditorWeb053());

upgradeActivityDirectoryUi();
upgradeActivityUiWeb046();
upgradeActivityDetailUiWeb047();
installActivityDetailStickyObserverWeb047();


// -----------------------------------------------------------------------------
// WEB045 · WEBACTIVITY001 — interface compacte du répertoire
// -----------------------------------------------------------------------------
function upgradeActivityDirectoryUi() {
  const filters = document.querySelector("#activityDirectorySection .filters");
  if (filters && !filters.closest("details.activity-filters-disclosure")) {
    const details = document.createElement("details");
    details.className = "activity-filters-disclosure";
    const summary = document.createElement("summary");
    summary.innerHTML = '<span>Tri des activités</span><small>Recherche, sport, année, matériel, repères…</small>';
    filters.parentNode.insertBefore(details, filters);
    details.append(summary, filters);
  }
}


// -----------------------------------------------------------------------------
// WEB046 · WEBACTIVITY002 — dépouillement Activités + détail sticky
// -----------------------------------------------------------------------------
function upgradeActivityUiWeb046() {
  const directory = document.getElementById("activityDirectorySection");
  if (directory) {
    const header = directory.querySelector(":scope > .panel-title-row");
    const activityList = document.getElementById("activityList");
    if (header && activityList && !directory.querySelector(".directory-load-actions-bottom")) {
      const actions = header.querySelector(".panel-actions");
      if (actions) {
        const bottom = document.createElement("div");
        bottom.className = "directory-load-actions-bottom";
        bottom.append(...Array.from(actions.children));
        activityList.insertAdjacentElement("afterend", bottom);
      }
      header.remove();
    }
  }

  const detail = document.getElementById("detailView");
  if (detail && !detail.querySelector(":scope > .detail-sticky-stack")) {
    const toolbar = detail.querySelector(":scope > .detail-toolbar");
    const hero = detail.querySelector(":scope > .detail-hero-two-lines");
    if (toolbar && hero) {
      const stack = document.createElement("div");
      stack.className = "detail-sticky-stack";
      toolbar.insertAdjacentElement("beforebegin", stack);
      stack.append(toolbar, hero);
    }
  }

  const oldInterop = document.querySelector(".hero-actions .interop-badge");
  if (oldInterop) oldInterop.remove();
}


function upgradeActivityDetailUiWeb047() {
  const detail = document.getElementById("detailView");
  if (!detail) return;

  // WEB046 plaçait navigation + résumé dans la même pile.
  // WEB047 les sépare.
  const oldStack = detail.querySelector(":scope > .detail-sticky-stack");

  if (oldStack) {
    const toolbar =
      oldStack.querySelector(":scope > .detail-toolbar");

    const hero =
      oldStack.querySelector(":scope > .detail-hero-two-lines");

    if (toolbar) {
      oldStack.insertAdjacentElement("beforebegin", toolbar);
    }

    if (hero) {
      if (toolbar) {
        toolbar.insertAdjacentElement("afterend", hero);
      } else {
        oldStack.insertAdjacentElement("beforebegin", hero);
      }
    }

    if (!oldStack.children.length) {
      oldStack.remove();
    } else {
      oldStack.classList.add("hidden");
    }
  }

  const toolbar =
    detail.querySelector(":scope > .detail-toolbar");

  const hero =
    detail.querySelector(":scope > .detail-hero-two-lines");

  if (!toolbar || !hero) return;

  toolbar.classList.add("detail-toolbar-web047");
  hero.classList.add("detail-hero-web047");

  syncActivityDetailStickyOffsetsWeb047();
}


function syncActivityDetailStickyOffsetsWeb047() {
  const detail = document.getElementById("detailView");

  if (!detail ||
      detail.classList.contains("hidden")) return;

  const toolbar =
    detail.querySelector(":scope > .detail-toolbar");

  const hero =
    detail.querySelector(":scope > .detail-hero-two-lines");

  if (!toolbar || !hero) return;

  const topbar = document.querySelector(".topbar");
  const primary = document.getElementById("uxPrimaryNav");

  let top = 0;

  for (const element of [topbar, primary]) {
    if (!element) continue;

    const style = getComputedStyle(element);

    if (style.display === "none" ||
        style.visibility === "hidden") continue;

    top += Math.ceil(
      element.getBoundingClientRect().height
    );
  }

  toolbar.style.setProperty(
    "--web047-toolbar-top",
    top + "px"
  );

  const toolbarHeight =
    Math.ceil(toolbar.getBoundingClientRect().height);

  hero.style.setProperty(
    "--web047-hero-top",
    (top + toolbarHeight + 6) + "px"
  );
}


function installActivityDetailStickyObserverWeb047() {
  if (window.__web047DetailObserverInstalled) return;
  window.__web047DetailObserverInstalled = true;

  const refresh = () => requestAnimationFrame(() => {
    upgradeActivityDetailUiWeb047();
    syncActivityDetailStickyOffsetsWeb047();
    if (typeof applyWeb049UiContract === "function") {
      applyWeb049UiContract();
      syncWeb049StickyOffsets();
    }
  });

  window.addEventListener("resize", refresh, { passive: true });

  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(refresh);

    [
      document.querySelector(".topbar"),
      document.getElementById("uxPrimaryNav"),
      document.getElementById("uxSecondaryNav"),
      document.querySelector("#detailView > .detail-toolbar")
    ].filter(Boolean).forEach((el) => ro.observe(el));

    window.__web047ResizeObserver = ro;
  }
}


// -----------------------------------------------------------------------------
// WEB048 · WEBRESTORE001 — garde-fou des choix d'interface validés
// -----------------------------------------------------------------------------
function restoreInterfaceWeb048() {
  // Cartes n'est plus un onglet primaire.
  document.querySelectorAll('[data-ux-page="maps"]').forEach((button) => button.remove());

  // Aucun titre personnalisé dans le répertoire ou le détail.
  if (ui.detailTitle) {
    ui.detailTitle.textContent = "";
    ui.detailTitle.classList.add("hidden");
  }

  // Un seul statut d'interopérabilité : dans le topbar, juste avant Firebase.
  const compactInterop = document.getElementById("interopCompactStatus");
  if (compactInterop) {
    compactInterop.textContent = "Intéropérabilité OK";
    compactInterop.className = currentUser ? "pill ok web048-interop" : "pill ok web048-interop hidden";
  }

  document.querySelectorAll(".interop-badge, #personalSyncStatus").forEach((node) => {
    if (node.id !== "interopCompactStatus") node.classList.add("hidden");
  });

  // Mentions techniques visibles : WEBxxx, identité projet, version.
  const identity = document.getElementById("identityLine");
  if (identity) identity.classList.add("hidden");

  document.querySelectorAll(".version").forEach((node) => node.classList.add("hidden"));

  document.querySelectorAll(".eyebrow").forEach((node) => {
    if (/^WEB\d+/i.test(String(node.textContent || "").trim())) {
      node.classList.add("web048-technical-hidden");
    }
  });

  // Les gros heros Activités et Plus sont redondants avec les onglets.
  const page = document.body.dataset.uxPage || "";
  const hero = document.querySelector("#catalogView > .hero");
  if (hero) hero.classList.toggle("web048-hero-hidden", page === "activities" || page === "more");

  // Répertoire : le pavé de filtres redevient un bandeau déroulant fermé par défaut.
  const directory = document.getElementById("activityDirectorySection");
  const filters = directory?.querySelector(":scope > .filters");

  if (filters && !filters.closest("details.activity-filters-disclosure-web048")) {
    const details = document.createElement("details");
    details.className = "activity-filters-disclosure activity-filters-disclosure-web048";

    const summary = document.createElement("summary");
    summary.innerHTML =
      '<span>Tri des activités</span><small>Recherche, sport, année, matériel, repères…</small>';

    filters.parentNode.insertBefore(details, filters);
    details.append(summary, filters);
    details.open = false;
  }

  // En-tête Répertoire / WEB031 / compteurs supprimé ; boutons Charger... conservés en bas.
  if (directory) {
    const header = directory.querySelector(":scope > .panel-title-row");
    const list = document.getElementById("activityList");

    if (header && list) {
      const actions = header.querySelector(".panel-actions");
      if (actions && !directory.querySelector(".directory-load-actions-bottom")) {
        const bottom = document.createElement("div");
        bottom.className = "directory-load-actions-bottom";
        bottom.append(...Array.from(actions.children));
        list.insertAdjacentElement("afterend", bottom);
      }
      header.remove();
    }

    directory.querySelectorAll("#loadedLabel, .activity-directory-footer .muted")
      .forEach((node) => node.classList.add("hidden"));
  }

  // Les messages purement techniques WEBxxx restent silencieux, sauf erreur.
  const box = document.getElementById("messageBox");
  if (box) {
    const text = String(box.textContent || "").trim();
    const isError = box.classList.contains("error");
    if (!isError && (/^WEB\d+/i.test(text) || /interopérabilit/i.test(text))) {
      box.classList.add("hidden");
    }
  }
}

function installInterfaceGuardWeb048() {
  if (window.__web048GuardInstalled) return;
  window.__web048GuardInstalled = true;
  restoreInterfaceWeb048();
}



// -----------------------------------------------------------------------------
// WEB049 · WEBUI001 — contrat d'interface durable
// -----------------------------------------------------------------------------
function applyWeb049UiContract() {
  // Aucun titre d'activité visible.
  if (ui.detailTitle) {
    ui.detailTitle.textContent = "";
    ui.detailTitle.classList.add("hidden");
  }

  // Une seule information d'interopérabilité, compacte, dans le topbar.
  const compactInterop = document.getElementById("web049InteropStatus");
  if (compactInterop) {
    compactInterop.textContent = "Intéropérabilité OK";
    compactInterop.classList.toggle("hidden", !currentUser);
  }

  document.querySelectorAll(".interop-badge").forEach((node) => node.classList.add("hidden"));

  if (ui.identityLine) ui.identityLine.classList.add("hidden");
  document.querySelectorAll(".version").forEach((node) => node.classList.add("hidden"));

  document.querySelectorAll(".eyebrow").forEach((node) => {
    if (/^WEB\d+/i.test(String(node.textContent || "").trim())) {
      node.classList.add("web049-technical-hidden");
    }
  });

  // Les héros Activités / Plus répètent le nom de l'onglet.
  const page = document.body.dataset.uxPage || "";
  const hero = document.querySelector("#catalogView > .hero");
  if (hero) hero.classList.toggle("web049-page-hero-hidden", page === "activities" || page === "more");

  // Le message technique central ne doit pas occuper l'écran.
  if (ui.messageBox) {
    const text = String(ui.messageBox.textContent || "").trim();
    const isError = ui.messageBox.classList.contains("error");
    if (!isError && (/^WEB\d+/i.test(text) || /interopérabilit/i.test(text))) {
      ui.messageBox.classList.add("web049-message-hidden");
    } else {
      ui.messageBox.classList.remove("web049-message-hidden");
    }
  }

  // Répertoire : en-tête supprimé, actions de chargement conservées en bas.
  const directory = document.getElementById("activityDirectorySection");
  const list = document.getElementById("activityList");

  if (directory && list) {
    const header = directory.querySelector(":scope > .panel-title-row");
    if (header) {
      const actions = header.querySelector(".panel-actions");
      if (actions && !directory.querySelector(".directory-load-actions-web049")) {
        const bottom = document.createElement("div");
        bottom.className = "directory-load-actions-web049";
        bottom.append(...Array.from(actions.children));
        list.insertAdjacentElement("afterend", bottom);
      }
      header.remove();
    }

    // Filtres : bandeau déroulant fermé par défaut.
    const filters = directory.querySelector(":scope > .filters");
    if (filters && !filters.closest("details.activity-filters-web049")) {
      const details = document.createElement("details");
      details.className = "activity-filters-web049";

      const summary = document.createElement("summary");
      summary.innerHTML = '<span>Tri des activités</span><small>Recherche et filtres</small>';

      filters.parentNode.insertBefore(details, filters);
      details.append(summary, filters);
      details.open = false;
    }

    directory.querySelectorAll(".activity-directory-footer .muted")
      .forEach((node) => node.classList.add("hidden"));
  }

  // Ancien onglet Cartes : sécurité supplémentaire en plus de sa suppression HTML.
  document.querySelectorAll('[data-ux-page="maps"]').forEach((node) => node.remove());

  // Détail : sépare définitivement toolbar et résumé si WEB046 les avait regroupés.
  const detail = document.getElementById("detailView");
  if (detail) {
    const stack = detail.querySelector(":scope > .detail-sticky-stack");
    if (stack) {
      const toolbar = stack.querySelector(":scope > .detail-toolbar");
      const heroBlock = stack.querySelector(":scope > .detail-hero-two-lines");

      if (toolbar) stack.insertAdjacentElement("beforebegin", toolbar);
      if (heroBlock) {
        const anchor = toolbar || stack.previousElementSibling;
        if (anchor) anchor.insertAdjacentElement("afterend", heroBlock);
        else stack.insertAdjacentElement("beforebegin", heroBlock);
      }

      if (!stack.children.length) stack.remove();
      else stack.classList.add("hidden");
    }

    const toolbar = detail.querySelector(":scope > .detail-toolbar");
    const heroBlock = detail.querySelector(":scope > .detail-hero-two-lines");

    if (toolbar) toolbar.classList.add("detail-toolbar-web049");
    if (heroBlock) heroBlock.classList.add("detail-hero-web049");

    syncWeb049StickyOffsets();
  }
}

function syncWeb049StickyOffsets() {
  const detail = document.getElementById("detailView");
  if (!detail || detail.classList.contains("hidden")) return;

  const toolbar = detail.querySelector(":scope > .detail-toolbar");
  const hero = detail.querySelector(":scope > .detail-hero-two-lines");
  if (!toolbar || !hero) return;

  let top = 0;
  for (const node of [
    document.querySelector(".topbar"),
    document.getElementById("uxPrimaryNav"),
    document.getElementById("uxSecondaryNav")
  ]) {
    if (!node) continue;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") continue;
    top += Math.ceil(node.getBoundingClientRect().height);
  }

  toolbar.style.setProperty("--web049-toolbar-top", top + "px");
  const toolbarHeight = Math.ceil(toolbar.getBoundingClientRect().height);
  hero.style.setProperty("--web049-hero-top", (top + toolbarHeight + 6) + "px");
}

function installWeb049UiContract() {
  if (window.__web049UiInstalled) return;
  window.__web049UiInstalled = true;

  const refresh = () => requestAnimationFrame(() => {
    applyWeb049UiContract();
    syncWeb049StickyOffsets();
  });

  refresh();
  window.addEventListener("resize", refresh, { passive: true });

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(refresh);

    [
      document.querySelector(".topbar"),
      document.getElementById("uxPrimaryNav"),
      document.getElementById("uxSecondaryNav"),
      document.querySelector("#detailView > .detail-toolbar")
    ].filter(Boolean).forEach((node) => resizeObserver.observe(node));

    window.__web049ResizeObserver = resizeObserver;
  }
}


function uxPageConfig() {
  return {
    home: {
      title: "Accueil",
      eyebrow: "",
      subs: []
    },
    activities: {
      title: "Activités",
      eyebrow: "",
      subs: [["directory","Répertoire"],["trash","Corbeille"]]
    },
    analysis: {
      title: "Analyse",
      eyebrow: "",
      subs: [["goals","Objectifs & poids"],["landmarks","Repères"],["records","Records"]]
    },
    equipment: {
      title: "Matériel",
      eyebrow: "",
      subs: [["used","Utilisé"],["all","Tout le matériel"]]
    },
    more: {
      title: "Plus",
      eyebrow: "",
      subs: [
        ["strava","Strava"],
        ["appearance","Apparence"],
        ["equipment-map","Matériel auto"],
        ["maps","Cartes"],
        ["files","Fichiers"],
        ["manual","Ajout manuel"],
        ["import","Import"],
        ["sync","Synchronisation"],
        ["health","Santé sync"],
        ["landmarks-advanced","Repères avancés"]
      ]
    }
  };
}

function uxDefaultSubpage(page) {
  const config = uxPageConfig()[page];
  return config?.subs?.[0]?.[0] || "main";
}

function applyAppearance(theme, persist = true) {
  const allowed = ["sport","aurum","light","contrast"];
  const value = allowed.includes(theme) ? theme : "sport";
  document.documentElement.dataset.theme = value;
  if (ui.appearanceSelect) ui.appearanceSelect.value = value;
  if (persist) localStorage.setItem("sport_web_theme", value);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", value === "aurum" ? "#090805" : value === "light" ? "#f5f5f1" : "#090b0a");
}

function initAppearance() {
  applyAppearance(localStorage.getItem("sport_web_theme") || "sport", false);
}

function managedUxSections() {
  return [
    ui.webDashboardSection, ui.activityDirectorySection, ui.trashSection,
    ui.personalSyncSection, ui.landmarkManagerSection, ui.recordsManagerSection,
    ui.globalMapSection, ui.equipmentManagerSection,
    ui.webStravaSection, ui.equipmentMappingSection, ui.appearanceSection, ui.webFilesSection, ui.webManualSection, ui.webImportSection, ui.syncCenterSection, ui.syncHealthSection, ui.bootstrapMetrics, ui.advancedLandmarksSection
  ].filter(Boolean);
}

function setUxSectionVisibility(visible) {
  const set = new Set(visible.filter(Boolean));
  managedUxSections().forEach((section) => section.classList.toggle("hidden", !set.has(section)));
}

function renderUxSecondaryNav(page, activeSub) {
  const config = uxPageConfig()[page];
  if (!ui.uxSecondaryNav) return;
  const subs = config?.subs || [];
  ui.uxSecondaryNav.innerHTML = "";
  ui.uxSecondaryNav.classList.toggle("hidden", !subs.length);
  if (!subs.length) return;
  const inner = document.createElement("div");
  inner.className = "ux-secondary-nav-inner";
  subs.forEach(([key,label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ux-subnav-button${key === activeSub ? " active" : ""}`;
    button.textContent = label;
    button.addEventListener("click", () => navigateUx(page,key));
    inner.appendChild(button);
  });
  ui.uxSecondaryNav.appendChild(inner);
}

function navigateUx(page, subpage = null, options = {}) {
  if (page === "maps") { page = "more"; subpage = "maps"; }
  const config = uxPageConfig();
  if (!config[page]) page = "home";
  const allowedSubs = new Set(config[page].subs.map(([key]) => key));
  let sub = subpage || uxCurrentSubpage;
  if (!allowedSubs.has(sub)) sub = uxDefaultSubpage(page);

  uxCurrentPage = page;
  uxCurrentSubpage = sub;
  document.body.dataset.uxPage = page;
  document.body.classList.toggle("ux-activities-page", page === "activities");

  if (!ui.detailView.classList.contains("hidden")) showCatalog(false);

  document.querySelectorAll("[data-ux-page]").forEach((button) => {
    button.classList.toggle("active", button.dataset.uxPage === page);
  });
  renderUxSecondaryNav(page,sub);

  ui.uxHeroTitle.textContent = config[page].title;
  ui.uxHeroEyebrow.textContent = config[page].eyebrow;

  if (page === "home") {
    setUxSectionVisibility([ui.webDashboardSection]);
  } else if (page === "activities") {
    if (sub === "trash") setUxSectionVisibility([ui.trashSection]);
    else setUxSectionVisibility([ui.activityDirectorySection]);
  } else if (page === "analysis") {
    if (sub === "landmarks") setUxSectionVisibility([ui.landmarkManagerSection]);
    else if (sub === "records") setUxSectionVisibility([ui.recordsManagerSection]);
    else setUxSectionVisibility([ui.personalSyncSection]);
  } else if (page === "equipment") {
    setUxSectionVisibility([ui.equipmentManagerSection]);
    if (ui.equipmentManagerStatusFilter) {
      ui.equipmentManagerStatusFilter.value = sub === "all" ? "" : "USED";
      renderEquipmentManager();
    }
  } else if (page === "more") {
    if (sub === "appearance") {
      setUxSectionVisibility([ui.appearanceSection]);
    } else if (sub === "maps") {
      setUxSectionVisibility([ui.globalMapSection]);
      if (ui.globalMapModeSelect && !["routes","density"].includes(ui.globalMapModeSelect.value)) {
        ui.globalMapModeSelect.value = "routes";
      }
      markGlobalMapStale();
    } else if (sub === "strava") {
      setUxSectionVisibility([ui.webStravaSection]);
      void refreshWebStravaStatus();
    } else if (sub === "equipment-map") {
      setUxSectionVisibility([ui.equipmentMappingSection]);
      renderEquipmentMappingPanel();
    } else if (sub === "files") {
      setUxSectionVisibility([ui.webFilesSection]);
      void renderWebFileVault();
    } else if (sub === "manual") setUxSectionVisibility([ui.webManualSection]);
    else if (sub === "import") setUxSectionVisibility([ui.webImportSection]);
    else if (sub === "health") setUxSectionVisibility([ui.syncHealthSection]);
    else if (sub === "landmarks-advanced") setUxSectionVisibility([ui.advancedLandmarksSection]);
    else setUxSectionVisibility([ui.syncCenterSection]);
  }
  queueMicrotask(() => applyWeb049UiContract());
  if (!options.keepScroll) window.scrollTo({top:0,behavior:"smooth"});
  sessionStorage.setItem("sport_web_ux_page", page);
  sessionStorage.setItem("sport_web_ux_subpage", sub);
}

function initUxNavigation() {
  initAppearance();
  ui.appearanceSelect?.addEventListener("change", () => applyAppearance(ui.appearanceSelect.value));
  document.querySelectorAll("[data-ux-page]").forEach((button) => {
    button.addEventListener("click", () => navigateUx(button.dataset.uxPage));
  });
  const savedPage = sessionStorage.getItem("sport_web_ux_page") || "home";
  const savedSub = sessionStorage.getItem("sport_web_ux_subpage") || null;
  navigateUx(savedPage,savedSub,{keepScroll:true});
}


function wireEvents() {
  ui.loginButton.addEventListener("click", async () => {
    setMessage("Connexion Google…", "info");
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      handleError(error, "Connexion Google impossible");
    }
  });

  ui.logoutButton.addEventListener("click", () => signOut(auth));
  ui.metricChartCloseButton?.addEventListener("click", () => closeMetricChart());
  ui.webImportFileInput?.addEventListener("change", (event) => {
    void handleWebImportFiles([...event.target.files]);
    event.target.value = "";
  });
  ui.webImportDropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    ui.webImportDropZone.classList.add("dragging");
  });
  ui.webImportDropZone?.addEventListener("dragleave", () => ui.webImportDropZone.classList.remove("dragging"));
  ui.webImportDropZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    ui.webImportDropZone.classList.remove("dragging");
    void handleWebImportFiles([...event.dataTransfer.files]);
  });
  ui.webImportDropZone?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      ui.webImportFileInput?.click();
    }
  });
  ui.webStravaConnectButton?.addEventListener("click", () => { void connectWebStrava(); });
  ui.webStravaRefreshButton?.addEventListener("click", () => { void loadWebStravaActivities(); });
  ui.webStravaImportButton?.addEventListener("click", () => { void importSelectedWebStravaActivities(); });
  ui.webStravaTestBackendButton?.addEventListener("click", () => { void testWebStravaBackend(); });
  ui.webStravaDisconnectButton?.addEventListener("click", () => { void disconnectWebStrava(); });
  ui.webStravaBackendUrl?.addEventListener("change", () => {
    localStorage.setItem("sport_web_strava_bridge_url", ui.webStravaBackendUrl.value.trim());
    webStravaConnected=false;
    renderWebStravaState();
  });
  ui.equipmentMappingAddButton?.addEventListener("click", () => { void addEquipmentMappingRule(); });
  ui.equipmentMappingApplyButton?.addEventListener("click", () => { void applyEquipmentMappingsToExistingActivities(); });

  ui.webDriveConnectButton?.addEventListener("click", () => { void connectWebDrive(); });
  ui.webDriveUploadMissingButton?.addEventListener("click", () => { void uploadMissingOriginalsToDrive(); });

  ui.webFilesRefreshButton?.addEventListener("click", () => { void renderWebFileVault(true); });
  ui.webFilesFilter?.addEventListener("change", renderWebFileVaultList);
  ui.webFilesSearch?.addEventListener("input", renderWebFileVaultList);

  ui.splitActivityButton?.addEventListener("click", () => { void openSplitActivityPanel(); });
  ui.splitActivityCloseButton?.addEventListener("click", closeSplitActivityPanel);
  ui.splitActivityRange?.addEventListener("input", renderSplitActivityPreview);
  ui.splitActivityAutoButton?.addEventListener("click", () => { void commitAutomaticSplitActivity(); });
  ui.splitActivityCommitButton?.addEventListener("click", () => { void commitSplitActivity(); });

  ui.webManualSport?.addEventListener("change", () => {
    rebuildWebManualEquipment();
    updateWebManualPreview();
  });
  [
    ui.webManualDate, ui.webManualTime, ui.webManualDistanceKm, ui.webManualDuration,
    ui.webManualAscent, ui.webManualDescent, ui.webManualAvgHr, ui.webManualMaxHr,
    ui.webManualCalories, ui.webManualTitle, ui.webManualNotes
  ].forEach((node) => node?.addEventListener("input", updateWebManualPreview));
  ui.webManualResetButton?.addEventListener("click", resetWebManualForm);
  ui.webManualForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void commitWebManualActivity();
  });

  ui.webImportClearButton?.addEventListener("click", clearWebImportCandidates);
  ui.webImportCommitButton?.addEventListener("click", () => { void commitSelectedWebImports(); });


  ui.refreshButton.addEventListener("click", () => reloadAll());

  ui.dashboardRunningButton.addEventListener("click", () => selectDashboardSport(1));
  ui.dashboardCyclingButton.addEventListener("click", () => selectDashboardSport(2));
  ui.dashboardWeekButton.addEventListener("click", () => selectDashboardPeriod("WEEK"));
  ui.dashboardMonthButton.addEventListener("click", () => selectDashboardPeriod("MONTH"));
  ui.dashboardYearButton.addEventListener("click", () => selectDashboardPeriod("YEAR"));
  ui.dashboardTotalButton.addEventListener("click", () => selectDashboardPeriod("TOTAL"));
  ui.dashboardChartDistanceButton.addEventListener("click", () => selectDashboardChartMetric("distance"));
  ui.dashboardChartAscentButton.addEventListener("click", () => selectDashboardChartMetric("ascent"));
  ui.dashboardChartDurationButton.addEventListener("click", () => selectDashboardChartMetric("duration"));
  ui.clearDashboardDrilldownButton.addEventListener("click", () => clearDashboardDrilldown(true));

  ui.goalSportSelect.addEventListener("change", () => {
    selectedGoalSport = Number(ui.goalSportSelect.value) || 0;
    goalEditorDirty = false;
    populateGoalEditor();
    void loadGoalProgress();
  });
  [ui.goalDistanceInput, ui.goalAscentInput, ui.goalDurationInput, ui.goalTargetNameInput,
   ui.goalTargetDateInput, ui.goalPrepDistanceInput, ui.goalPrepAscentInput].forEach((element) => {
    element.addEventListener("input", scheduleGoalAutosave);
    element.addEventListener("change", () => { void flushGoalAutosave(); });
  });
  ui.weightDateInput.addEventListener("change", () => {
    weightEditorDirty = false;
    populateWeightEditorForDate();
  });
  ui.weightKgInput.addEventListener("input", scheduleWeightAutosave);
  ui.weightKgInput.addEventListener("change", () => { void flushWeightAutosave(); });

  ui.syncHistoryTableFilter.addEventListener("change", renderSyncHistory);
  ui.syncHistorySourceFilter.addEventListener("change", renderSyncHistory);
  ui.trashSearchInput.addEventListener("input", renderTrash);
  ui.trashRefreshButton.addEventListener("click", () => { void loadTrashActivities(); });
  ui.trashCurrentActivityButton.addEventListener("click", () => {
    const activity = currentDetailActivity();
    if (activity) void trashActivityFromWeb(activity);
  });
  ui.loadMoreButton.addEventListener("click", () => loadNextPage());
  ui.loadAllButton.addEventListener("click", () => loadAllActivities());

  [
    ui.searchInput, ui.sportFilter, ui.yearFilter, ui.equipmentFilter,
    ui.landmarkFilter, ui.sourceFilter, ui.distanceFilter,
    ui.ascentFilter, ui.sortFilter
  ].forEach((element) => {
    element.addEventListener(element.tagName === "INPUT" ? "input" : "change", (event) => {
      if (event.isTrusted && dashboardDrilldownStartMs > 0) clearDashboardDrilldown(false);
      activityVisibleLimit = 20;
      applyFiltersAndRender();
    });
  });

  ui.backToCatalogButton.addEventListener("click", () => {
    void flushCurrentActivityAutosave();
    showCatalog();
  });
  ui.backToCatalogBottomButton.addEventListener("click", () => {
    void flushCurrentActivityAutosave();
    showCatalog();
  });
  ui.previousActivityButton.addEventListener("click", () => {
    void flushCurrentActivityAutosave();
    moveDetail(-1);
  });
  ui.previousActivityBottomButton.addEventListener("click", () => {
    void flushCurrentActivityAutosave();
    moveDetail(-1);
  });
  ui.nextActivityButton.addEventListener("click", () => {
    void flushCurrentActivityAutosave();
    moveDetail(1);
  });
  ui.nextActivityBottomButton.addEventListener("click", () => {
    void flushCurrentActivityAutosave();
    moveDetail(1);
  });

  ui.scanRecurringClimbsButton?.addEventListener("click", () => { void analyzeRecurringClimbsForCurrentActivity(); });
  ui.globalMapModeSelect?.addEventListener("change", markGlobalMapStale);
  ui.globalMapYearSelect?.addEventListener("change", markGlobalMapStale);
  ui.globalMapSportSelect?.addEventListener("change", markGlobalMapStale);
  ui.globalMapDensityZoomSelect?.addEventListener("change", markGlobalMapStale);
  ui.globalHotspotResetButton?.addEventListener("click", () => {
    if (globalMapLayer && globalMapInstance) {
      const bounds = globalMapLayer.getBounds();
      if (bounds.isValid()) globalMapInstance.fitBounds(bounds.pad(0.04), { animate: true, maxZoom: 15 });
    }
  });

  ui.globalMapFilteredButton?.addEventListener("click", () => { void renderGlobalActivityMap(false); });
  ui.globalMapAllButton?.addEventListener("click", () => { void renderGlobalActivityMap(true); });
  ui.globalMapClearButton?.addEventListener("click", clearGlobalActivityMap);

  ui.mapLayerSelect.addEventListener("change", () => switchBaseLayer(ui.mapLayerSelect.value));
  ui.mapRouteModeSelect.addEventListener("change", () => redrawRouteOverlay());
  ui.mapKmMarkersToggle.addEventListener("click", toggleKmMarkers);
  ui.mapRecenterButton.addEventListener("click", recenterActivityMap);
  ui.routeComparisonButton?.addEventListener("click", compareSelectedActivity);
  ui.routeComparisonClearButton?.addEventListener("click", clearRouteComparison);
  ui.routeAnalysisClearButton.addEventListener("click", clearRouteSegmentSelection);
  ui.routeKmClearButton?.addEventListener("click", clearRouteSegmentSelection);
  ui.mapFullscreenButton.addEventListener("click", toggleMapFullscreen);
  document.addEventListener("fullscreenchange", handleFullscreenChange);

  ui.editTitleInput.addEventListener("input", scheduleCurrentActivityAutosave);
  ui.editDescriptionInput.addEventListener("input", scheduleCurrentActivityAutosave);
  ui.editNoteInput.addEventListener("input", scheduleCurrentActivityAutosave);
  ui.editTitleInput.addEventListener("change", () => { void flushCurrentActivityAutosave(); });
  ui.editDescriptionInput.addEventListener("change", () => { void flushCurrentActivityAutosave(); });
  ui.editNoteInput.addEventListener("change", () => { void flushCurrentActivityAutosave(); });

  ui.editEquipmentSelect.addEventListener("change", () => {
    void saveImmediateActivityFields({
      equipment_name: ui.editEquipmentSelect.value || null,
      equipment_manual: 1
    }, "Matériel synchronisé");
  });

  ui.editFeelingSelect.addEventListener("change", () => {
    void saveImmediateActivityFields({
      feeling_score: nullableSelectNumber(ui.editFeelingSelect.value, 1, 5)
    }, "Ressenti synchronisé");
  });

  ui.editDifficultySelect.addEventListener("change", () => {
    void saveImmediateActivityFields({
      difficulty_score: nullableSelectNumber(ui.editDifficultySelect.value, 1, 10)
    }, "Difficulté synchronisée");
  });

  ui.editPrivacySelect.addEventListener("change", () => {
    void saveImmediateActivityFields({
      privacy: normalizePrivacy(ui.editPrivacySelect.value)
    }, "Confidentialité synchronisée");
  });

  ui.addLandmarkSelect.addEventListener("change", () => {
    if (ui.addLandmarkSelect.value) void addSelectedLandmark();
  });

  ui.newEquipmentButton.addEventListener("click", openNewEquipmentEditor);
  ui.closeEquipmentEditorButton.addEventListener("click", closeEquipmentEditor);
  ui.createEquipmentButton.addEventListener("click", () => { void createEquipmentFromWeb(); });
  ui.equipmentManagerSearch.addEventListener("input", renderEquipmentManager);
  ui.equipmentManagerStatusFilter.addEventListener("change", renderEquipmentManager);

  [
    ui.equipmentNotesInput,
    ui.equipmentPriceInput,
    ui.equipmentPurchaseDateInput,
    ui.equipmentWarningDistanceInput,
    ui.equipmentCriticalDistanceInput,
    ui.equipmentWarningDurationInput,
    ui.equipmentCriticalDurationInput
  ].forEach((element) => {
    element.addEventListener("input", scheduleEquipmentAutosave);
    element.addEventListener("change", () => { void flushEquipmentAutosave(); });
  });

  [
    ui.equipmentCustomNameInput,
    ui.equipmentBrandInput,
    ui.equipmentModelInput
  ].forEach((element) => {
    // L'identité visuelle peut nécessiter de renommer les activités associées.
    // On attend donc la validation du champ (blur/changement), sans bouton Enregistrer.
    element.addEventListener("change", () => { void saveEquipmentEditorImmediate(); });
  });

  [
    ui.equipmentCategoryInput,
    ui.equipmentSpecimenInput,
    ui.equipmentStatusInput
  ].forEach((element) => {
    element.addEventListener("change", () => { void saveEquipmentEditorImmediate(); });
  });

  ui.newLandmarkButton.addEventListener("click", openNewLandmarkEditor);
  ui.closeLandmarkEditorButton.addEventListener("click", () => { void closeLandmarkEditor(); });
  ui.createLandmarkButton.addEventListener("click", () => { void createLandmarkFromWeb(); });
  ui.deleteLandmarkButton.addEventListener("click", () => { void deleteCurrentLandmarkIfUnused(); });
  ui.landmarkManagerSearch.addEventListener("input", renderLandmarkManager);

  ui.landmarkNameInput.addEventListener("input", scheduleLandmarkAutosave);
  ui.landmarkNameInput.addEventListener("change", () => { void flushLandmarkAutosave(); });
  ui.landmarkSortOrderInput.addEventListener("input", scheduleLandmarkAutosave);
  ui.landmarkSortOrderInput.addEventListener("change", () => { void flushLandmarkAutosave(); });
  ui.landmarkTypeInput.addEventListener("change", () => { void saveLandmarkEditorImmediate(); });

  ui.rebuildRecordsButton.addEventListener("click", () => { void rebuildRecordsFromFirestore(); });

  ui.syncHealthRefreshButton.addEventListener("click", () => {
    void publishWebHealth(navigator.onLine ? "OK" : "OFFLINE", "");
    renderSyncHealth();
  });
  ui.syncHealthRetryButton.addEventListener("click", () => { void flushPendingWebMutations(); });

  window.addEventListener("online", () => {
    renderSyncHealth();
    void publishWebHealth("OK", "");
    void flushPendingWebMutations();
  });
  window.addEventListener("offline", () => {
    renderSyncHealth();
    void publishWebHealth("OFFLINE", "");
  });

  window.addEventListener("keydown", (event) => {
    if (ui.detailView.classList.contains("hidden")) return;
    if (event.key === "Escape") showCatalog();
    if (event.key === "ArrowLeft") moveDetail(-1);
    if (event.key === "ArrowRight") moveDetail(1);
  });
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;

  if (!user) {
    stopInteropWatch();
    stopSyncHistoryWatch();
    stopSyncHealthWatch();
    stopWebHealthHeartbeat();
    stopWebStravaAutoSync();
    webStravaConnected = false;
    webStravaAthleteProfile = null;
    webStravaCandidates = [];
    renderWebStravaAthlete();
    renderWebStravaState();
    ui.authState.textContent = "Non connecté";
    ui.authState.className = "pill neutral auth-pill";
    document.getElementById("interopCompactStatus")?.classList.add("hidden");
    ui.loginButton.classList.remove("hidden");
    ui.logoutButton.classList.add("hidden");
    ui.dashboard.classList.add("hidden");
    ui.uxPrimaryNav?.classList.add("hidden");
    ui.uxSecondaryNav?.classList.add("hidden");
    setMessage(
      "WEB018 · Interop : connecte-toi avec le même compte Google que SPORT Android.",
      "info"
    );
    return;
  }
ui.authState.textContent = "Firebase connecté";
  ui.authState.className = "pill ok auth-pill";
  ui.loginButton.classList.add("hidden");
  ui.logoutButton.classList.remove("hidden");
  ui.dashboard.classList.remove("hidden");
  ui.uxPrimaryNav?.classList.remove("hidden");
  navigateUx(uxCurrentPage, uxCurrentSubpage, {keepScroll:true});
  queueMicrotask(() => applyWeb049UiContract());
  ui.identityLine.textContent = `${user.email || "Compte Google"} · projet sport-505813`;
  await reloadAll();
  await refreshWebStravaStatus({autoSync:true});
  startWebStravaAutoSync();
  startInteropWatch();
  startSyncHistoryWatch();
  startSyncHealthWatch();
  startWebHealthHeartbeat();
  await publishWebHealth(navigator.onLine ? "OK" : "OFFLINE", "");
  if (navigator.onLine) void flushPendingWebMutations();
});

function userCollection(name) {
  return collection(db, ROOT, currentUser.uid, name);
}

async function reloadAll() {
  if (!currentUser || loading || loadingAll) return;

  activities = [];
  filteredActivities = [];
  lastActivityDoc = null;
  moreActivities = true;
  equipmentRows = [];
  equipmentMappingRows = [];
  landmarks = new Map();
  landmarkReferences = new Map();
  activityLandmarks = new Map();
  records = [];
  sportGoals = new Map();
  journalEntries = new Map();
  trashActivities = new Map();
  currentDetailId = null;
  activityVisibleLimit = 20;
  globalMapRouteCache = new Map();
  clearGlobalActivityMap();

  ui.activityList.innerHTML = "";
  ui.recordsList.innerHTML = "";
  resetFilterOptions();
  showCatalog(false);
  setMessage("Lecture Firestore en cours…", "info");

  try {
    await Promise.all([loadMeta(), loadReferenceCollections(), loadPersonalSyncData(), loadTrashActivities()]);
    renderTrash();
    await loadNextPage();
    await loadWebDashboard();
    setMessage("WEB018 connecté · interopérabilité Web ↔ téléphone ↔ tablette active.", "success");
  } catch (error) {
    handleError(error, "Lecture Firestore impossible");
  }
}

async function loadPersonalSyncData() {
  const [goalSnap, journalSnap] = await Promise.all([
    getDocs(userCollection("sport_goals")),
    getDocs(userCollection("journal_entries"))
  ]);
  sportGoals.clear();
  goalSnap.forEach((item) => sportGoals.set(String(item.id), { __docId: item.id, ...item.data() }));
  journalEntries.clear();
  journalSnap.forEach((item) => journalEntries.set(String(item.id), { __docId: item.id, ...item.data() }));

  if (!ui.weightDateInput.value) ui.weightDateInput.value = dateInputLocalValue(Date.now());
  populateGoalEditor();
  populateWeightEditorForDate();
  renderWeightHistory();
  updatePersonalSyncMeta();
  void loadGoalProgress();
}

function updatePersonalSyncMeta() {
  const configuredGoals = [...sportGoals.values()].filter((goal) => goalConfigured(goal)).length;
  const weightCount = [...journalEntries.values()].filter((entry) => Number(entry.weight_kg) > 0).length;
  ui.personalSyncMeta.textContent = `${configuredGoals} objectif(s) configuré(s) · ${weightCount} mesure(s) de poids dans Firestore`;
}

function goalConfigured(goal) {
  if (!goal) return false;
  return (Number(goal.annual_distance_km) || 0) > 0 || (Number(goal.annual_ascent_m) || 0) > 0 ||
    (Number(goal.annual_duration_h) || 0) > 0 || String(goal.target_name || "").trim() ||
    String(goal.target_date || "").trim() || (Number(goal.prep_distance_90_km) || 0) > 0 ||
    (Number(goal.prep_ascent_90_m) || 0) > 0;
}

function populateGoalEditor() {
  const goal = sportGoals.get(String(selectedGoalSport)) || {};
  ui.goalSportSelect.value = String(selectedGoalSport);
  ui.goalDistanceInput.value = numericInputValue(goal.annual_distance_km);
  ui.goalAscentInput.value = numericInputValue(goal.annual_ascent_m);
  ui.goalDurationInput.value = numericInputValue(goal.annual_duration_h);
  ui.goalTargetNameInput.value = String(goal.target_name ?? "");
  ui.goalTargetDateInput.value = String(goal.target_date ?? "");
  ui.goalPrepDistanceInput.value = numericInputValue(goal.prep_distance_90_km);
  ui.goalPrepAscentInput.value = numericInputValue(goal.prep_ascent_90_m);
  ui.goalSaveStatus.textContent = "Synchronisation automatique";
}

function scheduleGoalAutosave() {
  goalEditorDirty = true;
  goalAutosaveGeneration += 1;
  const generation = goalAutosaveGeneration;
  if (goalAutosaveTimer) clearTimeout(goalAutosaveTimer);
  ui.goalSaveStatus.textContent = "Modification détectée…";
  goalAutosaveTimer = window.setTimeout(() => {
    goalAutosaveTimer = null;
    void queueGoalAutosave(generation);
  }, AUTOSAVE_DELAY_MS);
}

function flushGoalAutosave() {
  if (!goalEditorDirty) return goalAutosaveQueue;
  if (goalAutosaveTimer) { clearTimeout(goalAutosaveTimer); goalAutosaveTimer = null; }
  goalAutosaveGeneration += 1;
  return queueGoalAutosave(goalAutosaveGeneration);
}

function queueGoalAutosave(generation) {
  const sport = selectedGoalSport;
  const row = goalRowFromEditor(sport);
  const run = () => persistGoalRow(sport, row, generation);
  goalAutosaveQueue = goalAutosaveQueue.then(run, run);
  return goalAutosaveQueue;
}

function goalRowFromEditor(sport) {
  return {
    sport: Number(sport),
    annual_distance_km: Math.max(0, Number(ui.goalDistanceInput.value) || 0),
    annual_ascent_m: Math.max(0, Math.round(Number(ui.goalAscentInput.value) || 0)),
    annual_duration_h: Math.max(0, Number(ui.goalDurationInput.value) || 0),
    target_name: String(ui.goalTargetNameInput.value ?? "").trim(),
    target_date: String(ui.goalTargetDateInput.value ?? "").trim(),
    prep_distance_90_km: Math.max(0, Number(ui.goalPrepDistanceInput.value) || 0),
    prep_ascent_90_m: Math.max(0, Math.round(Number(ui.goalPrepAscentInput.value) || 0)),
    updated_at_ms: Date.now()
  };
}

async function persistGoalRow(sport, row, generation) {
  const key = String(sport);
  ui.goalSaveStatus.textContent = "Synchronisation vers les 3 plateformes…";
  try {
    await commitWebMutation({
      table: "sport_goals", rowKey: key, operation: "UPSERT", row,
      materializedCollection: "sport_goals", materializedData: row
    });
    sportGoals.set(key, { __docId: key, ...row });
    if (generation === goalAutosaveGeneration && selectedGoalSport === sport) {
      goalEditorDirty = false;
      ui.goalSaveStatus.textContent = "Synchronisé automatiquement";
    }
    updatePersonalSyncMeta();
    void loadGoalProgress();
  } catch (error) {
    if (generation === goalAutosaveGeneration) ui.goalSaveStatus.textContent = "Échec de synchronisation";
    handleError(error, "Objectif impossible à synchroniser");
  }
}

async function loadGoalProgress() {
  const sport = selectedGoalSport;
  const goal = sportGoals.get(String(sport));
  if (!goal || !goalConfigured(goal)) {
    ui.goalProgress.innerHTML = '<span class="muted">Aucun objectif configuré pour ce sport.</span>';
    return;
  }
  try {
    const start = new Date(); start.setMonth(0,1); start.setHours(0,0,0,0);
    const snapshot = await getDocs(query(userCollection("activities"), where("start_time_ms", ">=", start.getTime())));
    let distance=0, ascent=0, duration=0;
    snapshot.forEach((item) => {
      const row=item.data(); if (Number(row.sport)!==sport || row.deleted_at_ms!=null) return;
      distance += Number(row.distance_m)||0; ascent += Number(row.ascent_m)||0; duration += Number(row.elapsed_time_ms)||0;
    });
    if (selectedGoalSport !== sport) return;
    const cards=[];
    if (Number(goal.annual_distance_km)>0) cards.push(goalProgressDatum("Distance", distance/1000, Number(goal.annual_distance_km), "km"));
    if (Number(goal.annual_ascent_m)>0) cards.push(goalProgressDatum("D+", ascent, Number(goal.annual_ascent_m), "m"));
    if (Number(goal.annual_duration_h)>0) cards.push(goalProgressDatum("Durée", duration/3600000, Number(goal.annual_duration_h), "h"));
    ui.goalProgress.innerHTML=""; cards.forEach((card)=>ui.goalProgress.appendChild(card));
  } catch (error) { console.error(error); }
}

function goalProgressDatum(label, actual, target, unit) {
  const box=document.createElement("div"); box.className="goal-progress-item";
  const pct=target>0?Math.max(0,Math.min(999,(actual/target)*100)):0;
  const head=document.createElement("div"); head.className="goal-progress-head";
  const name=document.createElement("strong"); name.textContent=label;
  const value=document.createElement("span"); value.textContent=`${actual.toLocaleString("fr-FR",{maximumFractionDigits:1})} / ${target.toLocaleString("fr-FR",{maximumFractionDigits:1})} ${unit} · ${Math.round(pct)} %`;
  head.append(name,value);
  const track=document.createElement("div"); track.className="goal-progress-track";
  const fill=document.createElement("div"); fill.className="goal-progress-fill"; fill.style.width=`${Math.min(100,pct)}%`; track.appendChild(fill);
  box.append(head,track); return box;
}

function populateWeightEditorForDate() {
  const key = String(dayStartMsFromDateInput(ui.weightDateInput.value));
  const entry = journalEntries.get(key);
  ui.weightKgInput.value = entry?.weight_kg == null ? "" : String(Number(entry.weight_kg));
  ui.weightSaveStatus.textContent = "Synchronisation automatique";
}

function scheduleWeightAutosave() {
  weightEditorDirty = true;
  weightAutosaveGeneration += 1;
  const generation=weightAutosaveGeneration;
  if (weightAutosaveTimer) clearTimeout(weightAutosaveTimer);
  ui.weightSaveStatus.textContent="Modification détectée…";
  weightAutosaveTimer=window.setTimeout(()=>{ weightAutosaveTimer=null; void queueWeightAutosave(generation); }, AUTOSAVE_DELAY_MS);
}

function flushWeightAutosave() {
  if (!weightEditorDirty) return weightAutosaveQueue;
  if (weightAutosaveTimer) { clearTimeout(weightAutosaveTimer); weightAutosaveTimer=null; }
  weightAutosaveGeneration += 1;
  return queueWeightAutosave(weightAutosaveGeneration);
}

function queueWeightAutosave(generation) {
  const dayStartMs=dayStartMsFromDateInput(ui.weightDateInput.value);
  const existing=journalEntries.get(String(dayStartMs));
  const weight=Number(String(ui.weightKgInput.value||"").replace(",","."));
  const run=()=>persistWeight(dayStartMs, existing, weight, generation);
  weightAutosaveQueue=weightAutosaveQueue.then(run,run); return weightAutosaveQueue;
}

async function persistWeight(dayStartMs, existing, weight, generation) {
  if (!Number.isFinite(weight) || weight<20 || weight>300) {
    ui.weightSaveStatus.textContent="Poids attendu entre 20 et 300 kg"; return;
  }
  const key=String(dayStartMs); const now=Date.now();
  const row={
    day_start_ms: dayStartMs,
    sleep_hours: existing?.sleep_hours ?? null,
    sleep_quality: Number(existing?.sleep_quality)||3,
    energy: Number(existing?.energy)||3,
    fatigue: Number(existing?.fatigue)||3,
    motivation: Number(existing?.motivation)||3,
    stress: Number(existing?.stress)||3,
    soreness: Number(existing?.soreness)||3,
    digestion: Number(existing?.digestion)||3,
    resting_hr: existing?.resting_hr ?? null,
    weight_kg: Math.round(weight*10)/10,
    note: String(existing?.note ?? ""),
    updated_at_ms: now
  };
  ui.weightSaveStatus.textContent="Synchronisation vers les 3 plateformes…";
  try {
    await commitWebMutation({ table:"journal_entries", rowKey:key, operation:"UPSERT", row,
      materializedCollection:"journal_entries", materializedData:row });
    journalEntries.set(key,{__docId:key,...row});
    if (generation===weightAutosaveGeneration) { weightEditorDirty=false; ui.weightSaveStatus.textContent="Synchronisé automatiquement"; }
    renderWeightHistory(); updatePersonalSyncMeta();
  } catch(error) { if(generation===weightAutosaveGeneration) ui.weightSaveStatus.textContent="Échec de synchronisation"; handleError(error,"Poids impossible à synchroniser"); }
}

function renderWeightHistory() {
  const rows=[...journalEntries.values()].filter((e)=>Number(e.weight_kg)>0).sort((a,b)=>(Number(b.day_start_ms)||0)-(Number(a.day_start_ms)||0));
  ui.weightHistory.innerHTML="";
  if (!rows.length) { ui.weightSummary.textContent="Aucune mesure"; ui.weightHistory.innerHTML='<div class="empty compact-empty">Historique vide.</div>'; return; }
  const latest=Number(rows[0].weight_kg), oldest=Number(rows[rows.length-1].weight_kg), delta=latest-oldest;
  ui.weightSummary.textContent=`${latest.toLocaleString("fr-FR",{minimumFractionDigits:1,maximumFractionDigits:1})} kg · ${rows.length} mesure(s)` + (rows.length>1?` · ${delta>=0?"+":""}${delta.toLocaleString("fr-FR",{maximumFractionDigits:1})} kg`:"");
  rows.slice(0,30).forEach((entry)=>{
    const row=document.createElement("button"); row.type="button"; row.className="weight-history-row";
    row.addEventListener("click",()=>{ ui.weightDateInput.value=dateInputLocalValue(Number(entry.day_start_ms)); populateWeightEditorForDate(); });
    const date=document.createElement("span"); date.textContent=new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(Number(entry.day_start_ms)));
    const value=document.createElement("strong"); value.textContent=`${Number(entry.weight_kg).toLocaleString("fr-FR",{minimumFractionDigits:1,maximumFractionDigits:1})} kg`;
    row.append(date,value); ui.weightHistory.appendChild(row);
  });
}

function dateInputLocalValue(ms) {
  const d=new Date(Number(ms)); if(Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dayStartMsFromDateInput(value) {
  const text=String(value||"").trim(); const d=text?new Date(`${text}T00:00:00`):new Date(); d.setHours(0,0,0,0); return d.getTime();
}
function numericInputValue(value) { const n=Number(value); return Number.isFinite(n)&&n!==0?String(n):""; }

function selectDashboardSport(sport) {
  dashboardSport = sport === 2 ? 2 : 1;
  renderDashboardChoices();
  void loadWebDashboard();
}

function selectDashboardPeriod(period) {
  dashboardPeriod = ["WEEK", "MONTH", "YEAR", "TOTAL"].includes(period) ? period : "WEEK";
  renderDashboardChoices();
  void loadWebDashboard();
}

function selectDashboardChartMetric(metric) {
  dashboardChartMetric = ["distance", "ascent", "duration"].includes(metric) ? metric : "distance";
  renderDashboardChoices();
  void loadWebDashboard();
}

function renderDashboardChoices() {
  ui.dashboardRunningButton.classList.toggle("active", dashboardSport === 1);
  ui.dashboardCyclingButton.classList.toggle("active", dashboardSport === 2);
  ui.dashboardWeekButton.classList.toggle("active", dashboardPeriod === "WEEK");
  ui.dashboardMonthButton.classList.toggle("active", dashboardPeriod === "MONTH");
  ui.dashboardYearButton.classList.toggle("active", dashboardPeriod === "YEAR");
  ui.dashboardTotalButton.classList.toggle("active", dashboardPeriod === "TOTAL");
  ui.dashboardChartDistanceButton.classList.toggle("active", dashboardChartMetric === "distance");
  ui.dashboardChartAscentButton.classList.toggle("active", dashboardChartMetric === "ascent");
  ui.dashboardChartDurationButton.classList.toggle("active", dashboardChartMetric === "duration");
}

function dashboardPeriodStart(period, now = new Date()) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  if (period === "WEEK") {
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day);
    return date.getTime();
  }
  if (period === "MONTH") {
    date.setDate(1);
    return date.getTime();
  }
  if (period === "YEAR") {
    date.setMonth(0, 1);
    return date.getTime();
  }
  return 0;
}

function dashboardPreviousWindow(period, nowMs = Date.now()) {
  if (period === "TOTAL") return null;
  const now = new Date(nowMs);
  const currentStart = dashboardPeriodStart(period, now);
  let previousStartDate;
  let previousEndDate;

  if (period === "WEEK") {
    previousStartDate = new Date(currentStart - 7 * 86400000);
    previousEndDate = new Date(previousStartDate.getTime() + (nowMs - currentStart));
  } else if (period === "MONTH") {
    const start = new Date(currentStart);
    previousStartDate = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    const next = new Date(start.getFullYear(), start.getMonth(), 1);
    previousEndDate = new Date(previousStartDate.getTime() + (nowMs - currentStart));
    if (previousEndDate >= next) previousEndDate = new Date(next.getTime() - 1);
  } else {
    const start = new Date(currentStart);
    previousStartDate = new Date(start.getFullYear() - 1, 0, 1);
    previousEndDate = new Date(now);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);
  }

  return {
    currentStart,
    currentEnd: nowMs,
    previousStart: previousStartDate.getTime(),
    previousEnd: previousEndDate.getTime()
  };
}

function dashboardPeriodLabel() {
  if (dashboardPeriod === "WEEK") return "cette semaine";
  if (dashboardPeriod === "MONTH") return "ce mois";
  if (dashboardPeriod === "YEAR") return "cette année";
  return "depuis le début";
}

function metricsFromRows(rows, sport = dashboardSport) {
  const metrics = { activityCount: 0, distance: 0, duration: 0, ascent: 0 };
  for (const row of rows) {
    if (sport != null && Number(row.sport) !== Number(sport)) continue;
    if (row.deleted_at_ms != null) continue;
    metrics.activityCount += 1;
    metrics.distance += Number(row.distance_m) || 0;
    metrics.duration += Number(row.elapsed_time_ms) || 0;
    metrics.ascent += Number(row.ascent_m) || 0;
  }
  return metrics;
}

async function fetchDashboardAggregateForSport(sport) {
  const aggregateQuery = query(
    userCollection("activities"),
    where("sport", "==", Number(sport)),
    where("deleted_at_ms", "==", null)
  );
  const aggregate = await getAggregateFromServer(aggregateQuery, {
    activityCount: count(),
    distance: sum("distance_m"),
    duration: sum("elapsed_time_ms"),
    ascent: sum("ascent_m")
  });
  const data = aggregate.data();
  return {
    activityCount: Number(data.activityCount) || 0,
    distance: Number(data.distance) || 0,
    duration: Number(data.duration) || 0,
    ascent: Number(data.ascent) || 0
  };
}

function dashboardDeltaText(current, previous) {
  const now = Number(current) || 0;
  const before = Number(previous) || 0;
  if (before === 0 && now === 0) return { text: "—", direction: "flat" };
  if (before === 0) return { text: "+ nouveau", direction: "up" };
  const pct = ((now - before) / Math.abs(before)) * 100;
  const rounded = Math.round(Math.abs(pct));
  if (Math.abs(pct) < 0.5) return { text: "≈ stable", direction: "flat" };
  return {
    text: `${pct > 0 ? "+" : "−"}${rounded} %`,
    direction: pct > 0 ? "up" : "down"
  };
}

function setDashboardDelta(node, current, previous, enabled = true) {
  node.className = "dashboard-delta";
  if (!enabled) {
    node.textContent = "Historique complet";
    node.classList.add("flat");
    return;
  }
  const delta = dashboardDeltaText(current, previous);
  node.textContent = delta.text;
  node.classList.add(delta.direction);
}

async function loadWebDashboard() {
  if (!currentUser) return;
  const generation = ++dashboardLoadGeneration;
  renderDashboardChoices();
  ui.webDashboardMeta.textContent = "Calcul des indicateurs Firestore…";

  try {
    const nowMs = Date.now();
    const currentStart = dashboardPeriodStart(dashboardPeriod, new Date(nowMs));
    const compareWindow = dashboardPreviousWindow(dashboardPeriod, nowMs);
    const trendStart = startOfDayMs(nowMs - 364 * 86400000);
    const queryStart = dashboardPeriod === "TOTAL"
      ? trendStart
      : Math.min(compareWindow.previousStart, trendStart);

    const [windowSnapshot, recentSnapshot] = await Promise.all([
      getDocs(query(userCollection("activities"), where("start_time_ms", ">=", queryStart))),
      getDocs(query(userCollection("activities"), orderBy("start_time_ms", "desc"), limit(50)))
    ]);

    const allWindowRows = [];
    windowSnapshot.forEach((item) => {
      const row = { __docId: item.id, ...item.data() };
      if (row.deleted_at_ms == null) allWindowRows.push(row);
    });

    const recent = [];
    recentSnapshot.forEach((item) => {
      const row = { __docId: item.id, ...item.data() };
      if (Number(row.sport) === dashboardSport && row.deleted_at_ms == null && recent.length < 5) recent.push(row);
    });

    let currentRows = [];
    let previousRows = [];
    let currentMetrics;
    let previousMetrics = { activityCount: 0, distance: 0, duration: 0, ascent: 0 };
    let splitMetrics;

    if (dashboardPeriod === "TOTAL") {
      const [selectedTotal, runTotal, bikeTotal] = await Promise.all([
        fetchDashboardAggregateForSport(dashboardSport),
        fetchDashboardAggregateForSport(1),
        fetchDashboardAggregateForSport(2)
      ]);
      currentMetrics = selectedTotal;
      splitMetrics = { running: runTotal, cycling: bikeTotal };
      currentRows = allWindowRows.filter((row) => Number(row.sport) === dashboardSport && Number(row.start_time_ms) >= trendStart);
    } else {
      currentRows = allWindowRows.filter((row) =>
        Number(row.start_time_ms) >= compareWindow.currentStart &&
        Number(row.start_time_ms) <= compareWindow.currentEnd &&
        Number(row.sport) === dashboardSport
      );
      previousRows = allWindowRows.filter((row) =>
        Number(row.start_time_ms) >= compareWindow.previousStart &&
        Number(row.start_time_ms) <= compareWindow.previousEnd &&
        Number(row.sport) === dashboardSport
      );
      currentMetrics = metricsFromRows(currentRows, dashboardSport);
      previousMetrics = metricsFromRows(previousRows, dashboardSport);
      const allCurrentRows = allWindowRows.filter((row) =>
        Number(row.start_time_ms) >= compareWindow.currentStart && Number(row.start_time_ms) <= compareWindow.currentEnd
      );
      splitMetrics = {
        running: metricsFromRows(allCurrentRows, 1),
        cycling: metricsFromRows(allCurrentRows, 2)
      };
    }

    const trendRows = allWindowRows.filter((row) =>
      Number(row.start_time_ms) >= trendStart && Number(row.sport) === dashboardSport
    );

    if (generation !== dashboardLoadGeneration) return;

    ui.dashboardActivityValue.textContent = formatNumber(currentMetrics.activityCount);
    ui.dashboardDistanceValue.textContent = formatDistance(currentMetrics.distance);
    ui.dashboardDurationValue.textContent = formatDuration(currentMetrics.duration);
    ui.dashboardAscentValue.textContent = formatMeters(currentMetrics.ascent);

    const compareEnabled = dashboardPeriod !== "TOTAL";
    setDashboardDelta(ui.dashboardActivityDelta, currentMetrics.activityCount, previousMetrics.activityCount, compareEnabled);
    setDashboardDelta(ui.dashboardDistanceDelta, currentMetrics.distance, previousMetrics.distance, compareEnabled);
    setDashboardDelta(ui.dashboardDurationDelta, currentMetrics.duration, previousMetrics.duration, compareEnabled);
    setDashboardDelta(ui.dashboardAscentDelta, currentMetrics.ascent, previousMetrics.ascent, compareEnabled);

    ui.dashboardComparisonMeta.textContent = compareEnabled
      ? "Écart par rapport à la période précédente, comparée au même stade."
      : "Le total utilise les agrégations Firestore ; le graphique montre les 12 derniers mois.";
    ui.webDashboardMeta.textContent = `${sportName(dashboardSport)} · ${dashboardPeriodLabel()} · DASHBOARD002`;

    renderDashboardChart(currentRows, nowMs);
    renderDashboardTrends(trendRows, nowMs);
    renderDashboardGoal(trendRows, nowMs);
    renderDashboardSportSplit(splitMetrics);
    renderDashboardEquipment(currentRows);
    renderDashboardRecent(recent);
    renderDashboardRecords();
  } catch (error) {
    console.error(error);
    if (generation !== dashboardLoadGeneration) return;
    ui.webDashboardMeta.textContent = "Tableau de bord indisponible";
    [ui.dashboardActivityValue, ui.dashboardDistanceValue, ui.dashboardDurationValue, ui.dashboardAscentValue].forEach((node) => node.textContent = "—");
    [ui.dashboardActivityDelta, ui.dashboardDistanceDelta, ui.dashboardDurationDelta, ui.dashboardAscentDelta].forEach((node) => node.textContent = "—");
    ui.dashboardChart.innerHTML = '<div class="empty compact-empty">Graphique indisponible.</div>';
  }
}

function startOfDayMs(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dashboardChartBuckets(nowMs) {
  const buckets = [];
  const now = new Date(nowMs);

  if (dashboardPeriod === "WEEK") {
    const start = new Date(dashboardPeriodStart("WEEK", now));
    for (let i = 0; i < 7; i += 1) {
      const a = new Date(start); a.setDate(a.getDate() + i);
      const b = new Date(a); b.setDate(b.getDate() + 1);
      buckets.push({ start: a.getTime(), end: b.getTime(), label: new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(a).replace(".", "") });
    }
    return buckets;
  }

  if (dashboardPeriod === "MONTH") {
    const start = new Date(dashboardPeriodStart("MONTH", now));
    const next = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    for (let a = new Date(start); a < next; a.setDate(a.getDate() + 1)) {
      const b = new Date(a); b.setDate(b.getDate() + 1);
      buckets.push({ start: a.getTime(), end: b.getTime(), label: String(a.getDate()) });
    }
    return buckets;
  }

  if (dashboardPeriod === "YEAR") {
    const year = now.getFullYear();
    for (let month = 0; month < 12; month += 1) {
      const a = new Date(year, month, 1);
      const b = new Date(year, month + 1, 1);
      buckets.push({ start: a.getTime(), end: b.getTime(), label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(a).replace(".", "") });
    }
    return buckets;
  }

  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  for (let i = 0; i < 12; i += 1) {
    const a = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const b = new Date(a.getFullYear(), a.getMonth() + 1, 1);
    buckets.push({ start: a.getTime(), end: b.getTime(), label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(a).replace(".", "") });
  }
  return buckets;
}

function dashboardChartValue(metrics) {
  if (dashboardChartMetric === "ascent") return metrics.ascent;
  if (dashboardChartMetric === "duration") return metrics.duration / 3600000;
  return metrics.distance / 1000;
}

function dashboardChartValueLabel(value) {
  if (dashboardChartMetric === "ascent") return `${Math.round(value).toLocaleString("fr-FR")} m`;
  if (dashboardChartMetric === "duration") return `${Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h`;
  return `${Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

function renderDashboardChart(rows, nowMs) {
  const buckets = dashboardChartBuckets(nowMs);
  const chartRows = dashboardPeriod === "TOTAL"
    ? rows.filter((row) => Number(row.start_time_ms) >= buckets[0].start)
    : rows;

  const values = buckets.map((bucket) => {
    const bucketRows = chartRows.filter((row) => Number(row.start_time_ms) >= bucket.start && Number(row.start_time_ms) < bucket.end);
    const metrics = metricsFromRows(bucketRows, dashboardSport);
    return { ...bucket, metrics, value: dashboardChartValue(metrics) };
  });
  const maxValue = Math.max(0, ...values.map((item) => item.value));

  const metricLabel = dashboardChartMetric === "ascent" ? "D+" : dashboardChartMetric === "duration" ? "Temps" : "Distance";
  ui.dashboardChartTitle.textContent = `${metricLabel} · ${dashboardPeriod === "TOTAL" ? "12 derniers mois" : dashboardPeriodLabel()}`;
  ui.dashboardChartMeta.textContent = "Clique sur une barre pour ouvrir les activités correspondantes.";
  ui.dashboardChart.innerHTML = "";

  const fragment = document.createDocumentFragment();
  values.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dashboard-bar-button";
    const pct = maxValue > 0 ? Math.max(item.value > 0 ? 5 : 0, (item.value / maxValue) * 100) : 0;
    button.title = `${item.label} · ${dashboardChartValueLabel(item.value)} · ${item.metrics.activityCount} activité(s)`;
    button.addEventListener("click", () => { void openDashboardBucket(item); });

    const value = document.createElement("span");
    value.className = "dashboard-bar-value";
    value.textContent = item.value > 0 ? dashboardChartValueLabel(item.value) : "";
    const stage = document.createElement("span");
    stage.className = "dashboard-bar-stage";
    const bar = document.createElement("span");
    bar.className = "dashboard-bar-fill";
    bar.style.height = `${pct}%`;
    stage.appendChild(bar);
    const label = document.createElement("span");
    label.className = "dashboard-bar-label";
    label.textContent = item.label;
    button.append(value, stage, label);
    fragment.appendChild(button);
  });
  ui.dashboardChart.appendChild(fragment);
}

async function openDashboardBucket(bucket) {
  if (!currentUser) return;
  setMessage("Chargement des activités de la période sélectionnée…", "info");
  try {
    const snap = await getDocs(query(
      userCollection("activities"),
      where("start_time_ms", ">=", bucket.start),
      where("start_time_ms", "<", bucket.end)
    ));
    const merged = new Map(activities.map((item) => [activityKey(item), item]));
    snap.forEach((item) => {
      const row = { __docId: item.id, ...item.data() };
      if (row.deleted_at_ms == null) merged.set(activityKey(row), row);
    });
    activities = [...merged.values()];
    rebuildDynamicFilters();
  initializeWebManualForm();


    dashboardDrilldownStartMs = bucket.start;
    dashboardDrilldownEndMs = bucket.end;
    dashboardDrilldownText = `${sportName(dashboardSport)} · ${formatDashboardBucketRange(bucket.start, bucket.end)}`;
    ui.sportFilter.value = String(dashboardSport);
    ui.yearFilter.value = "";
    ui.dashboardDrilldownLabel.textContent = `Filtre DASHBOARD002 : ${dashboardDrilldownText}`;
    ui.dashboardDrilldownNotice.classList.remove("hidden");
    applyFiltersAndRender();
    const catalogueHeading = ui.loadedLabel?.closest("section");
    if (catalogueHeading) catalogueHeading.scrollIntoView({ behavior: "smooth", block: "start" });
    setMessage(`DASHBOARD002 · ${filteredActivities.length} activité(s) affichée(s) pour ${dashboardDrilldownText}.`, "success");
  } catch (error) {
    handleError(error, "Ouverture des activités du graphique impossible");
  }
}

function clearDashboardDrilldown(rerender = true) {
  dashboardDrilldownStartMs = 0;
  dashboardDrilldownEndMs = 0;
  dashboardDrilldownText = "";
  ui.dashboardDrilldownNotice.classList.add("hidden");
  if (rerender) applyFiltersAndRender();
}

function formatDashboardBucketRange(startMs, endMs) {
  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  const a = new Date(startMs);
  const b = new Date(Math.max(startMs, endMs - 1));
  const left = fmt.format(a);
  const right = fmt.format(b);
  return left === right ? left : `${left} → ${right}`;
}

function renderDashboardTrends(rows, nowMs) {
  const windows = [30, 90, 365];
  ui.dashboardTrends.innerHTML = "";
  for (const days of windows) {
    const start = startOfDayMs(nowMs - (days - 1) * 86400000);
    const periodRows = rows.filter((row) => Number(row.start_time_ms) >= start);
    const metrics = metricsFromRows(periodRows, dashboardSport);
    const card = document.createElement("div");
    card.className = "dashboard-trend-row";
    const label = document.createElement("strong");
    label.textContent = `${days} j`;
    const data = document.createElement("span");
    data.textContent = `${formatDistance(metrics.distance)} · ${formatMeters(metrics.ascent)} · ${metrics.activityCount} act.`;
    const weekly = document.createElement("small");
    const weeks = Math.max(1, days / 7);
    weekly.textContent = `${(metrics.distance / 1000 / weeks).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km / semaine`;
    card.append(label, data, weekly);
    ui.dashboardTrends.appendChild(card);
  }
}

function renderDashboardGoal(rows, nowMs) {
  const goal = sportGoals.get(String(dashboardSport));
  ui.dashboardGoalSummary.innerHTML = "";
  if (!goal || !goalConfigured(goal)) {
    ui.dashboardGoalMeta.textContent = "non configuré";
    ui.dashboardGoalSummary.innerHTML = '<div class="empty compact-empty">Aucun objectif configuré pour ce sport.</div>';
    return;
  }

  const yearStart = new Date(new Date(nowMs).getFullYear(), 0, 1).getTime();
  const yearRows = rows.filter((row) => Number(row.start_time_ms) >= yearStart);
  const metrics = metricsFromRows(yearRows, dashboardSport);
  const specs = [
    ["Distance", metrics.distance / 1000, Number(goal.annual_distance_km) || 0, "km"],
    ["D+", metrics.ascent, Number(goal.annual_ascent_m) || 0, "m"],
    ["Durée", metrics.duration / 3600000, Number(goal.annual_duration_h) || 0, "h"]
  ].filter((spec) => spec[2] > 0);

  ui.dashboardGoalMeta.textContent = goal.target_name ? String(goal.target_name) : `${new Date(nowMs).getFullYear()}`;
  if (!specs.length) {
    ui.dashboardGoalSummary.innerHTML = '<div class="empty compact-empty">Objectif qualitatif configuré.</div>';
    return;
  }

  for (const [label, actual, target, unit] of specs) {
    const pct = target > 0 ? (actual / target) * 100 : 0;
    const row = document.createElement("div");
    row.className = "dashboard-goal-row";
    const head = document.createElement("div");
    const name = document.createElement("strong"); name.textContent = label;
    const value = document.createElement("span");
    value.textContent = `${actual.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} / ${target.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${unit}`;
    head.append(name, value);
    const track = document.createElement("div"); track.className = "dashboard-goal-track";
    const fill = document.createElement("div"); fill.className = "dashboard-goal-fill"; fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    track.appendChild(fill);
    const footer = document.createElement("small"); footer.textContent = `${Math.round(pct)} %`;
    row.append(head, track, footer);
    ui.dashboardGoalSummary.appendChild(row);
  }
}

function renderDashboardSportSplit(splitMetrics) {
  const run = Number(splitMetrics?.running?.distance) || 0;
  const bike = Number(splitMetrics?.cycling?.distance) || 0;
  const total = run + bike;
  const runPct = total > 0 ? (run / total) * 100 : 0;
  const bikePct = total > 0 ? (bike / total) * 100 : 0;
  ui.dashboardSportSplit.innerHTML = "";

  const donut = document.createElement("div");
  donut.className = "dashboard-split-donut";
  donut.style.setProperty("--run-pct", `${runPct}%`);
  const center = document.createElement("span"); center.textContent = total > 0 ? formatDistance(total) : "0 km";
  donut.appendChild(center);

  const legend = document.createElement("div"); legend.className = "dashboard-split-legend";
  const runRow = document.createElement("div"); runRow.innerHTML = `<span class="split-dot run"></span><strong>Course</strong><span>${formatDistance(run)} · ${runPct.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %</span>`;
  const bikeRow = document.createElement("div"); bikeRow.innerHTML = `<span class="split-dot bike"></span><strong>Vélo</strong><span>${formatDistance(bike)} · ${bikePct.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %</span>`;
  legend.append(runRow, bikeRow);
  ui.dashboardSportSplit.append(donut, legend);
}

function renderDashboardEquipment(rows) {
  const byName = new Map();
  for (const activity of rows) {
    if (Number(activity.sport) !== dashboardSport || activity.deleted_at_ms != null) continue;
    const name = String(activity.equipment_name ?? "").trim();
    if (!name) continue;
    const current = byName.get(name) || { name, count: 0, distance: 0, duration: 0, ascent: 0 };
    current.count += 1;
    current.distance += Number(activity.distance_m) || 0;
    current.duration += Number(activity.elapsed_time_ms) || 0;
    current.ascent += Number(activity.ascent_m) || 0;
    byName.set(name, current);
  }
  const ranked = [...byName.values()].sort((a, b) => b.distance - a.distance || b.count - a.count);

  ui.dashboardEquipmentMeta.textContent = ranked.length ? `${ranked.length} utilisé(s)` : "aucun";
  ui.dashboardEquipmentList.innerHTML = "";
  if (!ranked.length) {
    ui.dashboardEquipmentList.innerHTML = '<div class="empty compact-empty">Aucun matériel renseigné sur cette période.</div>';
    return;
  }
  ranked.slice(0, 5).forEach((item) => {
    const card = document.createElement("div"); card.className = "dashboard-list-row";
    const main = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = item.name;
    const meta = document.createElement("span"); meta.textContent = `${formatDistance(item.distance)} · ${formatMeters(item.ascent)} · ${formatDuration(item.duration)}`;
    main.append(title, meta);
    const countNode = document.createElement("span"); countNode.className = "dashboard-list-value"; countNode.textContent = `${item.count} act.`;
    card.append(main, countNode); ui.dashboardEquipmentList.appendChild(card);
  });
}

function renderDashboardRecent(rows) {
  ui.dashboardRecentList.innerHTML = "";
  if (!rows.length) {
    ui.dashboardRecentList.innerHTML = '<div class="empty compact-empty">Aucune activité récente.</div>';
    return;
  }
  rows.forEach((activity) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "dashboard-list-row dashboard-activity-row";
    button.addEventListener("click", () => showActivity(activity));
    const main = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = activity.custom_title || sportName(activity.sport);
    const meta = document.createElement("span"); meta.textContent = `${formatDate(activity.start_time_ms)} · ${formatDistance(activity.distance_m)} · ${formatMeters(activity.ascent_m)}`;
    main.append(title, meta);
    const duration = document.createElement("span"); duration.className = "dashboard-list-value"; duration.textContent = formatDuration(activity.elapsed_time_ms);
    button.append(main, duration); ui.dashboardRecentList.appendChild(button);
  });
}

function renderDashboardRecords() {
  ui.dashboardRecordsList.innerHTML = "";
  const standard = records
    .filter((record) => ["distance", "duration", "ascent"].includes(String(record.record_type ?? "").toLowerCase()))
    .sort((a, b) => ["distance", "duration", "ascent"].indexOf(String(a.record_type).toLowerCase()) - ["distance", "duration", "ascent"].indexOf(String(b.record_type).toLowerCase()));
  if (!standard.length) {
    ui.dashboardRecordsList.innerHTML = '<div class="empty compact-empty">Aucun record matérialisé.</div>';
    return;
  }
  standard.forEach((record) => {
    const activityId = Number(record.activity_id);
    const linked = activities.find((activity) => Number(activity.id ?? activity.__docId) === activityId);
    const button = document.createElement("button"); button.type = "button"; button.className = "dashboard-list-row dashboard-activity-row";
    button.addEventListener("click", () => { void openRecordActivity(record); });
    const main = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = recordLabel(record.record_type);
    const meta = document.createElement("span"); meta.textContent = linked ? `${formatDate(linked.start_time_ms)} · ${linked.custom_title || sportName(linked.sport)}` : `Activité #${activityId || "?"}`;
    main.append(title, meta);
    const value = document.createElement("span"); value.className = "dashboard-list-value"; value.textContent = formatRecordValue(record);
    button.append(main, value); ui.dashboardRecordsList.appendChild(button);
  });
}

function scheduleDashboardRefresh() {
  if (dashboardRefreshTimer) clearTimeout(dashboardRefreshTimer);
  dashboardRefreshTimer = window.setTimeout(() => {
    dashboardRefreshTimer = null;
    void loadWebDashboard();
  }, 1200);
}

async function loadMeta() {
  const ref = doc(db, ROOT, currentUser.uid, "meta", "state");
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    throw new Error("Le document meta/state est absent.");
  }

  const data = snapshot.data();
  setMetric(ui.activityCount, data.activityCount);
  setMetric(ui.equipmentCount, data.equipmentCount);
  setMetric(ui.landmarkCount, data.landmarkCount);
  setMetric(ui.activityLandmarkCount, data.activityLandmarkCount);
  setMetric(ui.recordCount, data.recordCount);
  setMetric(ui.expectedDocuments, data.expectedDocuments);
}

async function loadReferenceCollections() {
  const [
    equipmentSnap,
    equipmentMappingSnap,
    landmarkSnap,
    landmarkReferenceSnap,
    activityLandmarkSnap,
    recordSnap
  ] = await Promise.all([
    getDocs(userCollection("equipment")),
    getDocs(userCollection("equipment_mappings")),
    getDocs(userCollection("landmarks")),
    getDocs(userCollection("landmark_references")),
    getDocs(userCollection("activity_landmarks")),
    getDocs(userCollection("records"))
  ]);

  equipmentRows = [];
  equipmentSnap.forEach((item) => equipmentRows.push({ __docId: item.id, ...item.data() }));

  equipmentMappingRows = [];
  equipmentMappingSnap.forEach((item) => equipmentMappingRows.push({ __docId: item.id, ...item.data() }));

  landmarks.clear();
  landmarkSnap.forEach((item) => {
    const row = item.data();
    const code = String(row.code ?? row.__sportKey ?? item.id).trim();
    if (code) landmarks.set(code, row);
  });

  landmarkReferences.clear();
  landmarkReferenceSnap.forEach((item) => {
    const row = item.data();
    const code = String(row.landmark_code ?? row.__sportKey ?? item.id).trim();
    if (code) landmarkReferences.set(code, row);
  });

  activityLandmarks.clear();
  activityLandmarkSnap.forEach((item) => {
    const row = item.data();
    const activityId = String(row.activity_id ?? "").trim();
    if (!activityId) return;
    const list = activityLandmarks.get(activityId) || [];
    list.push(row);
    activityLandmarks.set(activityId, list);
  });

  records = [];
  recordSnap.forEach((item) => records.push({ __docId: item.id, ...item.data() }));

  renderRecords();
  renderEquipmentManager();
  renderEquipmentMappingPanel();
  renderLandmarkManager();
  rebuildLandmarkFilter();
}

async function loadTrashActivities() {
  if (!currentUser) return;

  try {
    const snapshot = await getDocs(
      query(
        userCollection("activities"),
        where("deleted_at_ms", ">", 0),
        orderBy("deleted_at_ms", "desc")
      )
    );

    trashActivities.clear();
    snapshot.forEach((item) => {
      const row = { __docId: item.id, ...item.data() };
      trashActivities.set(activityKey(row), row);
    });
    renderTrash();
  } catch (error) {
    console.error(error);
    ui.trashMeta.textContent = "Lecture de la corbeille impossible";
  }
}

function renderTrash() {
  if (!ui.trashList) return;

  const needle = String(ui.trashSearchInput?.value ?? "").trim().toLowerCase();
  const allTrashRows = [...trashActivities.values()]
    .filter((activity) => activity.deleted_at_ms != null)
    .sort((a, b) => numberOrZero(b.deleted_at_ms) - numberOrZero(a.deleted_at_ms));
  const rows = allTrashRows
    .filter((activity) => {
      if (!needle) return true;
      const haystack = [
        activity.custom_title,
        activity.file_name,
        activity.equipment_name,
        activity.import_source,
        sportName(activity.sport),
        formatDate(activity.start_time_ms)
      ].map((value) => String(value ?? "").toLowerCase()).join(" ");
      return haystack.includes(needle);
    });

  const total = trashActivities.size;
  const totalFirestore = Number(String(ui.activityCount?.textContent ?? "").replace(/\s/g, ""));
  ui.trashCount.textContent = formatNumber(total);
  ui.trashActiveEstimate.textContent =
    Number.isFinite(totalFirestore) ? formatNumber(Math.max(0, totalFirestore - total)) : "—";
  ui.trashLastChange.textContent =
    allTrashRows.length ? formatTrashDate(allTrashRows[0].deleted_at_ms) : "—";
  ui.trashMeta.textContent =
    `${formatNumber(total)} activité(s) restaurable(s) · ${formatNumber(rows.length)} affichée(s)`;

  ui.trashList.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty compact-empty";
    empty.textContent = total ? "Aucune activité ne correspond à la recherche." : "La corbeille est vide.";
    ui.trashList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const activity of rows) {
    const key = activityKey(activity);
    const card = document.createElement("article");
    card.className = "trash-card";

    const main = document.createElement("div");
    main.className = "trash-card-main";
    const title = document.createElement("strong");
    title.textContent = activity.custom_title || sportName(activity.sport);
    const meta = document.createElement("span");
    meta.textContent = `${formatDate(activity.start_time_ms)} · ${sportName(activity.sport)} · ${formatDistance(activity.distance_m)}`;
    const deleted = document.createElement("span");
    deleted.className = "trash-deleted-meta";
    deleted.textContent = `Corbeille : ${formatTrashDate(activity.deleted_at_ms)} · ${trashSourceLabel(key, activity.deleted_at_ms)}`;
    main.append(title, meta, deleted);

    const actions = document.createElement("div");
    actions.className = "trash-card-actions";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "primary";
    restore.textContent = "↩ Restaurer";
    restore.disabled = trashMutationRunning;
    restore.addEventListener("click", () => { void restoreActivityFromWeb(activity); });
    actions.appendChild(restore);

    card.append(main, actions);
    fragment.appendChild(card);
  }
  ui.trashList.appendChild(fragment);
}

function trashSourceLabel(rowKey, deletedAtMs) {
  const targetTime = Number(deletedAtMs) || 0;
  const event = syncHistoryEvents.find((item) => {
    if (String(item.table) !== "activities" || String(item.rowKey) !== String(rowKey)) return false;
    if (String(item.operation) !== "UPSERT" || !item.row || item.row.deleted_at_ms == null) return false;
    const eventDeleted = Number(item.row.deleted_at_ms) || 0;
    return !targetTime || !eventDeleted || Math.abs(eventDeleted - targetTime) < 5000;
  });
  return event ? syncSourceLabel(event) : "source synchronisée";
}

function formatTrashDate(ms) {
  const number = Number(ms);
  if (!Number.isFinite(number) || number <= 0) return "date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  }).format(new Date(number));
}

async function trashActivityFromWeb(activity) {
  if (!activity || trashMutationRunning) return;

  if (activity.deleted_at_ms != null) {
    await restoreActivityFromWeb(activity);
    return;
  }

  const key = activityKey(activity);
  if (!key) return;

  const confirmed = window.confirm(
    `Mettre « ${activity.custom_title || sportName(activity.sport)} » à la corbeille ?\n\n` +
    "L'activité disparaîtra des trois répertoires et des statistiques, mais restera restaurable. " +
    "Le tracé, les repères liés et le fichier FIT local ne sont pas supprimés."
  );
  if (!confirmed) return;

  await flushCurrentActivityAutosave();
  trashMutationRunning = true;
  ui.trashCurrentActivityButton.disabled = true;

  try {
    const deletedAtMs = Date.now();
    const patch = { id: Number(key), deleted_at_ms: deletedAtMs };

    await commitWebMutation({
      table: "activities",
      rowKey: key,
      operation: "UPSERT",
      row: patch,
      materializedCollection: "activities",
      materializedData: patch
    });

    Object.assign(activity, patch);
    trashActivities.set(key, { ...activity });
    rebuildDynamicFilters();
    applyFiltersAndRender();
    renderTrash();

    showCatalog(false);
    setMessage(
      "WEB018 · activité mise à la corbeille et propagée vers téléphone + tablette.",
      "success"
    );

    await rebuildRecordsFromFirestore();
    await loadWebDashboard();
  } catch (error) {
    handleError(error, "Mise à la corbeille impossible");
  } finally {
    trashMutationRunning = false;
    renderTrash();
  }
}

async function restoreActivityFromWeb(activity) {
  if (!activity || trashMutationRunning) return;

  const key = activityKey(activity);
  if (!key) return;

  const confirmed = window.confirm(
    `Restaurer « ${activity.custom_title || sportName(activity.sport)} » ?\n\n` +
    "L'activité redeviendra active sur Web, téléphone et tablette."
  );
  if (!confirmed) return;

  trashMutationRunning = true;
  try {
    const patch = { id: Number(key), deleted_at_ms: null };

    await commitWebMutation({
      table: "activities",
      rowKey: key,
      operation: "UPSERT",
      row: patch,
      materializedCollection: "activities",
      materializedData: patch
    });

    const loaded = activities.find((item) => activityKey(item) === key);
    if (loaded) Object.assign(loaded, patch);
    else activities.push({ ...activity, ...patch, __docId: key });

    trashActivities.delete(key);
    rebuildDynamicFilters();
    applyFiltersAndRender();
    renderTrash();

    setMessage(
      "WEB018 · activité restaurée et propagée vers téléphone + tablette.",
      "success"
    );

    await rebuildRecordsFromFirestore();
    await loadWebDashboard();
  } catch (error) {
    handleError(error, "Restauration impossible");
  } finally {
    trashMutationRunning = false;
    renderTrash();
  }
}

async function topActiveActivityByField(field) {
  let cursor = null;
  for (let page = 0; page < 30; page += 1) {
    let activityQuery = query(
      userCollection("activities"),
      where(field, ">", 0),
      orderBy(field, "desc"),
      limit(100)
    );
    if (cursor) {
      activityQuery = query(
        userCollection("activities"),
        where(field, ">", 0),
        orderBy(field, "desc"),
        startAfter(cursor),
        limit(100)
      );
    }

    const snapshot = await getDocs(activityQuery);
    for (const activityDoc of snapshot.docs) {
      const row = activityDoc.data();
      if (row.deleted_at_ms == null) return activityDoc;
    }
    if (snapshot.empty || snapshot.size < 100) break;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
  return null;
}

async function loadNextPage() {
  if (!currentUser || loading || !moreActivities) return;

  loading = true;
  updateLoadButtons();

  try {
    const ref = userCollection("activities");
    let activityQuery = query(ref, orderBy("start_time_ms", "desc"), limit(PAGE_SIZE));

    if (lastActivityDoc) {
      activityQuery = query(
        ref,
        orderBy("start_time_ms", "desc"),
        startAfter(lastActivityDoc),
        limit(PAGE_SIZE)
      );
    }

    const snapshot = await getDocs(activityQuery);

    snapshot.forEach((item) => {
      activities.push({ __docId: item.id, ...item.data() });
    });

    if (!snapshot.empty) {
      lastActivityDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    moreActivities = snapshot.size === PAGE_SIZE;
    rebuildDynamicFilters();
    applyFiltersAndRender();
  } finally {
    loading = false;
    updateLoadButtons();
  }
}

async function loadAllActivities() {
  if (!currentUser || loadingAll || loading) return;

  loadingAll = true;
  updateLoadButtons();
  setMessage("Chargement de toutes les activités Firestore…", "info");

  try {
    while (moreActivities) {
      await loadNextPage();
    }
    setMessage(`${formatNumber(activities.length)} activités chargées.`, "success");
  } catch (error) {
    handleError(error, "Chargement complet impossible");
  } finally {
    loadingAll = false;
    updateLoadButtons();
  }
}

function updateLoadButtons() {
  ui.loadMoreButton.disabled = loading || loadingAll || !moreActivities;
  ui.loadAllButton.disabled = loading || loadingAll || !moreActivities;

  if (loadingAll) {
    ui.loadAllButton.textContent = `Chargement… ${formatNumber(activities.length)}`;
    ui.loadMoreButton.textContent = "Chargement…";
  } else if (loading) {
    ui.loadMoreButton.textContent = "Chargement…";
    ui.loadAllButton.textContent = "Charger tout";
  } else {
    ui.loadMoreButton.textContent = moreActivities ? "Charger 250 de plus" : "Tout est chargé";
    ui.loadAllButton.textContent = moreActivities ? "Charger tout" : "Tout est chargé";
  }
}

function resetFilterOptions() {
  ui.sportFilter.innerHTML = '<option value="">Tous</option>';
  ui.yearFilter.innerHTML = '<option value="">Toutes</option>';
  ui.equipmentFilter.innerHTML = '<option value="">Tous</option>';
  ui.landmarkFilter.innerHTML = '<option value="">Tous</option>';
  ui.sourceFilter.innerHTML = '<option value="">Toutes</option>';
}

function rebuildDynamicFilters() {
  const activeActivities = activities.filter((activity) => activity.deleted_at_ms == null);
  rebuildSimpleSelect(
    ui.sportFilter,
    [...new Set(activeActivities.map((a) => String(a.sport ?? "")).filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b))
      .map((value) => [value, sportName(value)]),
    "Tous"
  );

  rebuildSimpleSelect(
    ui.yearFilter,
    [...new Set(
      activeActivities
        .map((a) => dateFromMs(a.start_time_ms))
        .filter(Boolean)
        .map((d) => String(d.getFullYear()))
    )]
      .sort((a, b) => Number(b) - Number(a))
      .map((value) => [value, value]),
    "Toutes"
  );

  rebuildSimpleSelect(
    ui.equipmentFilter,
    [...new Set(activeActivities.map((a) => String(a.equipment_name ?? "").trim()).filter(Boolean))]
      .sort(localeSort)
      .map((value) => [value, value]),
    "Tous"
  );

  rebuildSimpleSelect(
    ui.sourceFilter,
    [...new Set(activeActivities.map((a) => String(a.import_source ?? "").trim()).filter(Boolean))]
      .sort(localeSort)
      .map((value) => [value, value]),
    "Toutes"
  );
}

function rebuildLandmarkFilter() {
  const entries = [...landmarks.entries()]
    .sort((a, b) => Number(a[1]?.sort_order ?? 999) - Number(b[1]?.sort_order ?? 999))
    .map(([code, row]) => [code, `${code} · ${row.name || row.label || "Repère"}`]);

  rebuildSimpleSelect(ui.landmarkFilter, entries, "Tous");
}

function rebuildSimpleSelect(select, entries, firstLabel) {
  const selected = select.value;
  select.innerHTML = "";

  const first = document.createElement("option");
  first.value = "";
  first.textContent = firstLabel;
  select.appendChild(first);

  for (const [value, label] of entries) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  if (entries.some(([value]) => value === selected)) {
    select.value = selected;
  }
}

function applyFiltersAndRender() {
  const needle = ui.searchInput.value.trim().toLowerCase();
  const sport = ui.sportFilter.value;
  const year = ui.yearFilter.value;
  const equipment = ui.equipmentFilter.value;
  const landmark = ui.landmarkFilter.value;
  const source = ui.sourceFilter.value;
  const distanceMinKm = positiveNumber(ui.distanceFilter.value);
  const ascentMin = positiveNumber(ui.ascentFilter.value);
  const sortMode = ui.sortFilter.value;

  filteredActivities = activities.filter((activity) => {
    if (activity.deleted_at_ms != null) return false;
    if (sport && String(activity.sport ?? "") !== sport) return false;
    if (dashboardDrilldownStartMs > 0) {
      const startTime = numberOrZero(activity.start_time_ms);
      if (startTime < dashboardDrilldownStartMs || startTime >= dashboardDrilldownEndMs) return false;
    }

    const date = dateFromMs(activity.start_time_ms);
    if (year && (!date || String(date.getFullYear()) !== year)) return false;

    if (equipment && String(activity.equipment_name ?? "") !== equipment) return false;
    if (source && String(activity.import_source ?? "") !== source) return false;

    if (distanceMinKm > 0 && numberOrZero(activity.distance_m) < distanceMinKm * 1000) return false;
    if (ascentMin > 0 && numberOrZero(activity.ascent_m) < ascentMin) return false;

    const links = linksForActivity(activity);

    if (landmark && !links.some((link) => String(link.landmark_code ?? "") === landmark)) {
      return false;
    }

    if (needle) {
      const markerText = links
        .map((link) => {
          const code = String(link.landmark_code ?? "");
          const meta = landmarks.get(code);
          return `${code} ${meta?.name ?? ""} ${meta?.landmark_type ?? ""}`;
        })
        .join(" ");

      const haystack = [
        activity.custom_title,
        activity.file_name,
        activity.equipment_name,
        activity.import_source,
        activity.manufacturer,
        activity.product_name,
        activity.description,
        activity.personal_note,
        sportName(activity.sport),
        markerText
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      if (!haystack.includes(needle)) return false;
    }

    return true;
  });

  const numeric = (field) => (a) => numberOrZero(a[field]);

  if (sortMode === "date_asc") {
    filteredActivities.sort((a, b) => numberOrZero(a.start_time_ms) - numberOrZero(b.start_time_ms));
  } else if (sortMode === "distance_desc") {
    filteredActivities.sort((a, b) => numeric("distance_m")(b) - numeric("distance_m")(a));
  } else if (sortMode === "ascent_desc") {
    filteredActivities.sort((a, b) => numeric("ascent_m")(b) - numeric("ascent_m")(a));
  } else if (sortMode === "duration_desc") {
    filteredActivities.sort((a, b) => numeric("elapsed_time_ms")(b) - numeric("elapsed_time_ms")(a));
  } else {
    filteredActivities.sort((a, b) => numberOrZero(b.start_time_ms) - numberOrZero(a.start_time_ms));
  }

  renderActivities();
  markGlobalMapStale();
}

function renderActivities() {
  const activeLoadedCount = activities.filter((activity) => activity.deleted_at_ms == null).length;
  ui.loadedLabel.textContent =
    `${formatNumber(filteredActivities.length)} résultat(s) · ${formatNumber(Math.min(activityVisibleLimit, filteredActivities.length))} affiché(s) · ` +
    `${formatNumber(activeLoadedCount)} activités chargées`;

  ui.activityList.innerHTML = "";

  if (!filteredActivities.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucune activité parmi les données actuellement chargées.";
    ui.activityList.appendChild(empty);
    queueMicrotask(() => applyWeb049UiContract());
    return;
  }

  const fragment = document.createDocumentFragment();
  const visibleRows = filteredActivities.slice(0, activityVisibleLimit);

  for (const activity of visibleRows) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "activity-card";
    button.addEventListener("click", () => showActivity(activity));

    button.appendChild(activityMain(activity));
    button.appendChild(datum("Date", formatActivityDateWeb049(activity.start_time_ms), "activity-date-datum"));
    button.appendChild(datum("Départ", formatActivityTimeWeb049(activity.start_time_ms), "activity-time-datum"));
    button.appendChild(datum("Distance", formatDistance(activity.distance_m)));
    button.appendChild(datum("D+", formatMeters(activity.ascent_m), "hide-sm"));
    button.appendChild(datum("Durée", formatDuration(activity.elapsed_time_ms), "hide-sm"));
    button.appendChild(datum("Matériel", activity.equipment_name || "—", "hide-md hide-sm"));
    button.appendChild(datum("Repères", markerSummary(activity), "hide-md hide-sm"));

    fragment.appendChild(button);
  }

  ui.activityList.appendChild(fragment);

  if (filteredActivities.length > visibleRows.length) {
    const footer = document.createElement("div");
    footer.className = "activity-directory-footer";
    const info = document.createElement("span");
    info.className = "muted";
    info.textContent = `${formatNumber(visibleRows.length)} / ${formatNumber(filteredActivities.length)} activités affichées`;
    const more = document.createElement("button");
    more.type = "button";
    more.className = "secondary";
    more.textContent = "Afficher 20 de plus";
    more.addEventListener("click", () => {
      activityVisibleLimit += 20;
      renderActivities();
    });
    footer.append(info,more);
    ui.activityList.appendChild(footer);
  }

  queueMicrotask(() => applyWeb049UiContract());
}

function activitySportIconMarkupLegacy(activity) {
  const code = Number(activity?.sport);

  if (code === 1 || code === 6) {
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="39" cy="10" r="5"></circle><path d="M33 20l-11 11 9 7 6-11 11 7"></path><path d="M31 38L19 57"></path><path d="M33 38L48 55"></path><path d="M22 30L9 37"></path></svg>';
  }

  if ([2,3,4].includes(code)) {
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="16" cy="47" r="11"></circle><circle cx="49" cy="47" r="11"></circle><path d="M16 47l12-23h11l10 23"></path><path d="M28 24l11 23"></path><path d="M24 36h19"></path><path d="M27 18h10"></path></svg>';
  }

  if (code === 5) {
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 42c8-7 15-7 23 0s15 7 25 0"></path><path d="M8 52c8-7 15-7 23 0s15 7 25 0"></path><circle cx="24" cy="22" r="5"></circle><path d="M29 27l13 8"></path></svg>';
  }

  if ([11,17].includes(code)) {
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="34" cy="10" r="5"></circle><path d="M31 19l-8 15 10 7"></path><path d="M33 40L22 57"></path><path d="M34 40l12 17"></path><path d="M22 31L11 43"></path></svg>';
  }

  return '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="16"></circle></svg>';
}

function activitySportIconMarkup(sportInput) {
  const sportValue = Number(
    sportInput && typeof sportInput === "object"
      ? (sportInput.sport ?? sportInput.sport_id ?? sportInput.sportId)
      : sportInput
  );

  if (sportValue === 1) {
    return '<img class="sport-icon-c1v1 sport-icon-c1" src="./assets/icons/sport-running-c1-exact.png" alt="" aria-hidden="true">';
  }

  if (sportValue === 2) {
    return '<img class="sport-icon-c1v1 sport-icon-v1" src="./assets/icons/sport-bike-v1-exact.png" alt="" aria-hidden="true">';
  }

  return activitySportIconMarkupLegacy(sportInput);
}


function formatActivityDate(value) {
  const date = dateFromMs(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatActivityTime(value) {
  const date = dateFromMs(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function activitySportIconMarkupWeb049(activity) {
  return activitySportIconMarkup(activity);
}

function formatActivityDateWeb049(value) {
  const date = dateFromMs(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric"
  }).format(date);
}

function formatActivityTimeWeb049(value) {
  const date = dateFromMs(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit", minute: "2-digit"
  }).format(date);
}

function activityMain(activity) {
  const cell = document.createElement("div");
  cell.className = "activity-main activity-main-web049";

  const icon = document.createElement("span");
  icon.className = "activity-sport-icon-web049";
  icon.innerHTML = activitySportIconMarkupWeb049(activity);
  icon.title = sportName(activity.sport);
  icon.setAttribute("aria-label", sportName(activity.sport));

  cell.append(icon);
  return cell;
}

function datum(label, value, extraClass = "") {
  const cell = document.createElement("div");
  cell.className = `datum ${extraClass}`.trim();

  const strong = document.createElement("strong");
  strong.textContent = value;

  const span = document.createElement("span");
  span.textContent = label;

  cell.append(strong, span);
  return cell;
}


function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function globalMapSportClass(activity) {
  const sport = Number(activity?.sport);
  if ([1, 6].includes(sport)) return "running";
  if ([2, 3, 4].includes(sport)) return "cycling";
  if ([11, 17].includes(sport)) return "hiking";
  return "other";
}

function globalMapSportColor(activity) {
  const cls = globalMapSportClass(activity);
  if (cls === "running") return "#9cff22";
  if (cls === "cycling") return "#4fb3ff";
  if (cls === "hiking") return "#f3c969";
  return "#d6b3ff";
}

function markGlobalMapStale() {
  globalMapIsStale = true;
  if (!ui.globalMapStatus || !globalMapRenderedKeys.size || globalMapIsBusy) return;
  ui.globalMapStatus.textContent =
    "Les filtres ou options de la carte ont changé. Relancez la cartographie pour actualiser la vue.";
}

async function loadGlobalRoute(activity) {
  const key = activityKey(activity);
  if (!key) return null;
  if (globalMapRouteCache.has(key)) return globalMapRouteCache.get(key);

  try {
    const snapshot = await getDoc(doc(db, ROOT, currentUser.uid, "activity_routes", key));
    if (!snapshot.exists()) {
      globalMapRouteCache.set(key, null);
      return null;
    }
    const route = normalizeRoute(snapshot.data());
    const normalized = route.points.length >= 2 ? route : null;
    globalMapRouteCache.set(key, normalized);
    return normalized;
  } catch (error) {
    console.warn("WEBCARTO008 route ignorée", key, error);
    return null;
  }
}

async function mapWithConcurrency(items, worker, concurrency = 10) {
  const result = new Array(items.length);
  let next = 0;
  async function runner() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      result[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, runner));
  return result;
}

function ensureGlobalMap() {
  if (!ui.globalActivityMap || typeof L === "undefined") return null;
  if (globalMapInstance) return globalMapInstance;

  ui.globalActivityMap.classList.remove("route-empty");
  ui.globalActivityMap.textContent = "";
  globalMapInstance = L.map(ui.globalActivityMap, {
    preferCanvas: true,
    zoomControl: true
  });

  L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution: "© OpenStreetMap · SRTM · OpenTopoMap"
  }).addTo(globalMapInstance);

  globalMapLayer = L.featureGroup().addTo(globalMapInstance);
  return globalMapInstance;
}

function clearGlobalActivityMap() {
  globalMapRequestToken++;
  globalMapRenderedKeys = new Set();
  globalMapIsBusy = false;
  globalMapIsStale = true;

  if (globalMapLayer) globalMapLayer.clearLayers();
  if (globalMapInstance) {
    globalMapInstance.remove();
    globalMapInstance = null;
    globalMapLayer = null;
  }

  if (ui.globalActivityMap) {
    ui.globalActivityMap.classList.add("route-empty");
    ui.globalActivityMap.textContent = "Lancez la cartographie pour afficher vos activités GPS.";
  }
  if (ui.globalMapStatus) {
    ui.globalMapStatus.textContent = "Affiche les tracés des activités filtrées ou de tout l’historique chargé.";
  }
  if (ui.globalMapCount) {
    ui.globalMapCount.textContent = "0 tracé";
    ui.globalMapCount.className = "pill neutral";
  }
  if (ui.globalMapHotspot) {
    ui.globalMapHotspot.textContent = "0 zone";
    ui.globalMapHotspot.className = "pill neutral";
  }
  if (ui.globalMapSummaryText) {
    ui.globalMapSummaryText.textContent = "Cliquez sur un tracé pour ouvrir l’activité correspondante.";
  }
  globalMapDensityCells = [];
  if (ui.globalHotspotExplorer) ui.globalHotspotExplorer.classList.add("hidden");
  if (ui.globalHotspotList) ui.globalHotspotList.innerHTML = "";
  if (ui.globalHotspotMeta) ui.globalHotspotMeta.textContent = "Classement des zones de densité.";
  if (ui.globalMapFilteredButton) ui.globalMapFilteredButton.disabled = false;
  if (ui.globalMapAllButton) ui.globalMapAllButton.disabled = false;
  if (ui.globalMapClearButton) ui.globalMapClearButton.disabled = true;
}


function refreshGlobalMapYearOptions() {
  if (!ui.globalMapYearSelect) return;
  const current = ui.globalMapYearSelect.value || "all";
  const years = [...new Set(activities
    .map((activity) => new Date(numberOrZero(activity.start_time_ms)).getFullYear())
    .filter((year) => Number.isFinite(year) && year >= 2000 && year <= 2100))]
    .sort((a,b) => b-a);
  ui.globalMapYearSelect.innerHTML = '<option value="all">Toutes</option>' +
    years.map((year) => `<option value="${year}">${year}</option>`).join("");
  ui.globalMapYearSelect.value = years.includes(Number(current)) ? current : "all";
}

function globalMapSecondaryFilters(source) {
  const year = ui.globalMapYearSelect?.value || "all";
  const sport = ui.globalMapSportSelect?.value || "all";
  return source.filter((activity) => {
    if (year !== "all") {
      const activityYear = new Date(numberOrZero(activity.start_time_ms)).getFullYear();
      if (String(activityYear) !== year) return false;
    }
    if (sport !== "all" && globalMapSportClass(activity) !== sport) return false;
    return true;
  });
}

function densityTileForPoint(latitude, longitude, zoom = 17) {
  const lat = Math.max(-85.05112878, Math.min(85.05112878, Number(latitude)));
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const n = 2 ** zoom;
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
  return { x, y, zoom, key: `${zoom}:${x}:${y}` };
}

function densityTileCenter(tile) {
  const n = 2 ** tile.zoom;
  const lon = (tile.x + 0.5) / n * 360 - 180;
  const mercator = Math.PI * (1 - 2 * (tile.y + 0.5) / n);
  const lat = Math.atan(Math.sinh(mercator)) * 180 / Math.PI;
  return [lat, lon];
}

function buildDensityCells(items) {
  const cells = new Map();
  for (const item of items) {
    if (!item?.route?.points?.length) continue;
    const perActivity = new Set();
    for (const point of item.route.points) {
      const zoom = Number(ui.globalMapDensityZoomSelect?.value || 17);
      const tile = densityTileForPoint(point.latitude, point.longitude, zoom);
      if (!tile || perActivity.has(tile.key)) continue;
      perActivity.add(tile.key);
      const existing = cells.get(tile.key) || { ...tile, count: 0, activities: [] };
      existing.count++;
      existing.activities.push(item.activity);
      cells.set(tile.key, existing);
    }
  }
  return [...cells.values()].sort((a,b) => b.count-a.count);
}

function densityCellStyle(count, maxCount) {
  const ratio = maxCount > 1 ? Math.log1p(count) / Math.log1p(maxCount) : 1;
  return {
    radius: 5 + ratio * 13,
    fillOpacity: 0.16 + ratio * 0.64,
    opacity: 0.35 + ratio * 0.55,
    weight: 1 + ratio * 2
  };
}


function hotspotDominantSport(activities) {
  const counts = new Map();
  for (const activity of activities) {
    const cls = globalMapSportClass(activity);
    counts.set(cls, (counts.get(cls) || 0) + 1);
  }
  return [...counts.entries()].sort((a,b) => b[1]-a[1])[0]?.[0] || "other";
}

function hotspotSportLabel(cls) {
  if (cls === "running") return "Course / trail";
  if (cls === "cycling") return "Vélo";
  if (cls === "hiking") return "Randonnée / marche";
  return "Autres";
}

function renderGlobalHotspotExplorer(cells) {
  if (!ui.globalHotspotExplorer || !ui.globalHotspotList || !ui.globalHotspotMeta) return;
  const top = cells.slice(0, 12);

  if (!top.length) {
    ui.globalHotspotExplorer.classList.add("hidden");
    ui.globalHotspotList.innerHTML = "";
    return;
  }

  ui.globalHotspotExplorer.classList.remove("hidden");
  ui.globalHotspotMeta.textContent =
    `Top ${top.length} · ${cells.length} zone(s) fréquentée(s) · granularité ${ui.globalMapDensityZoomSelect?.selectedOptions?.[0]?.textContent || "standard"}`;
  ui.globalHotspotList.innerHTML = "";

  top.forEach((cell,index) => {
    const center = densityTileCenter(cell);
    const dominant = hotspotDominantSport(cell.activities);
    const recent = [...cell.activities]
      .sort((a,b) => numberOrZero(b.start_time_ms)-numberOrZero(a.start_time_ms))
      .slice(0,3);

    const card = document.createElement("article");
    card.className = "global-hotspot-card";
    card.innerHTML = `
      <button type="button" class="global-hotspot-focus">
        <span class="global-hotspot-rank">#${index+1}</span>
        <span class="global-hotspot-main">
          <strong>${formatNumber(cell.count)} passage${cell.count>1?"s":""}</strong>
          <small>${escapeHtml(hotspotSportLabel(dominant))} dominant · zone ${Math.round(center[0]*1000)/1000}, ${Math.round(center[1]*1000)/1000}</small>
        </span>
        <span class="pill ${index < 3 ? "ok" : "neutral"}">${index < 3 ? "Top 3" : "Secteur"}</span>
      </button>
      <div class="global-hotspot-recent">
        ${recent.map((activity) =>
          `<button type="button" data-hotspot-activity="${escapeHtml(activityKey(activity))}">
            <span>${escapeHtml(formatDate(activity.start_time_ms))}</span>
            <strong>${escapeHtml(activity.custom_title || sportName(activity.sport))}</strong>
            <small>${escapeHtml(formatDistance(activity.distance_m))}</small>
          </button>`
        ).join("")}
      </div>`;

    card.querySelector(".global-hotspot-focus")?.addEventListener("click", () => {
      if (!globalMapInstance) return;
      globalMapInstance.setView(center, Math.min(18, cell.zoom + 1), { animate: true });
    });

    card.querySelectorAll("[data-hotspot-activity]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = cell.activities.find((activity) => activityKey(activity) === button.dataset.hotspotActivity);
        if (target) showActivity(target);
      });
    });

    ui.globalHotspotList.appendChild(card);
  });
}

function renderGlobalDensity(items) {
  const cells = buildDensityCells(items);
  globalMapDensityCells = cells;
  renderGlobalHotspotExplorer(cells);
  if (!cells.length) return { cellCount: 0, maxCount: 0 };

  const maxCount = cells[0].count;
  for (const cell of cells) {
    const center = densityTileCenter(cell);
    const style = densityCellStyle(cell.count, maxCount);
    const circle = L.circleMarker(center, {
      radius: style.radius,
      color: "#9cff22",
      fillColor: "#9cff22",
      fillOpacity: style.fillOpacity,
      opacity: style.opacity,
      weight: style.weight,
      interactive: true
    });
    const recent = [...cell.activities]
      .sort((a,b) => numberOrZero(b.start_time_ms)-numberOrZero(a.start_time_ms))
      .slice(0,5);
    circle.bindTooltip(
      `<strong>${cell.count} activité${cell.count>1?"s":""}</strong><br>` +
      recent.map((activity) => `${escapeHtml(formatDate(activity.start_time_ms))} · ${escapeHtml(activity.custom_title || sportName(activity.sport))}`).join("<br>"),
      { sticky: true }
    );
    circle.on("click", () => {
      if (cell.activities.length === 1) showActivity(cell.activities[0]);
    });
    circle.addTo(globalMapLayer);
  }
  return { cellCount: cells.length, maxCount };
}

async function renderGlobalActivityMap(loadEverything) {
  if (!currentUser || globalMapIsBusy) return;
  globalMapIsBusy = true;
  const token = ++globalMapRequestToken;

  if (ui.globalMapFilteredButton) ui.globalMapFilteredButton.disabled = true;
  if (ui.globalMapAllButton) ui.globalMapAllButton.disabled = true;
  if (ui.globalMapClearButton) ui.globalMapClearButton.disabled = false;

  try {
    globalMapLastLoadEverything = Boolean(loadEverything);
    if (loadEverything && moreActivities) {
      ui.globalMapStatus.textContent = "Chargement de tout le catalogue avant cartographie…";
      await loadAllActivities();
      if (token !== globalMapRequestToken) return;
    }

    refreshGlobalMapYearOptions();
    const baseSource = loadEverything
      ? activities.filter((activity) => activity.deleted_at_ms == null)
      : [...filteredActivities];
    const source = globalMapSecondaryFilters(baseSource);

    const candidates = source.filter((activity) => numberOrZero(activity.gps_point_count) > 1);
    if (!candidates.length) {
      clearGlobalActivityMap();
      ui.globalMapStatus.textContent = "Aucune activité GPS dans la sélection.";
      return;
    }

    const map = ensureGlobalMap();
    if (!map) throw new Error("Leaflet indisponible");

    globalMapLayer.clearLayers();
    globalMapRenderedKeys = new Set();
    ui.globalMapStatus.textContent = `Lecture des tracés Web : 0 / ${formatNumber(candidates.length)}…`;

    let completed = 0;
    const loaded = await mapWithConcurrency(candidates, async (activity) => {
      const route = await loadGlobalRoute(activity);
      completed++;
      if (token === globalMapRequestToken && (completed === candidates.length || completed % 10 === 0)) {
        ui.globalMapStatus.textContent =
          `Lecture des tracés Web : ${formatNumber(completed)} / ${formatNumber(candidates.length)}…`;
      }
      return { activity, route };
    }, 10);

    if (token !== globalMapRequestToken) return;

    let routeCount = 0;
    let pointCount = 0;
    const usable = loaded.filter((item) => item?.route?.points?.length);
    const mode = ui.globalMapModeSelect?.value || "routes";

    for (const item of usable) {
      routeCount++;
      pointCount += item.route.points.length;
      globalMapRenderedKeys.add(activityKey(item.activity));
    }

    if (mode === "density") {
      const density = renderGlobalDensity(usable);
      ui.globalMapHotspot.textContent = density.maxCount
        ? `Pic ${formatNumber(density.maxCount)} passage${density.maxCount>1?"s":""}`
        : "0 zone";
      ui.globalMapHotspot.className = density.maxCount ? "pill ok" : "pill neutral";
      ui.globalMapSummaryText.textContent =
        "La densité compte des activités distinctes par zone, pas les points GPS.";
      if (ui.globalMapLegend) {
        ui.globalMapLegend.innerHTML =
          '<span><i class="global-map-density low"></i>Peu fréquenté</span>' +
          '<span><i class="global-map-density medium"></i>Fréquenté</span>' +
          '<span><i class="global-map-density high"></i>Très fréquenté</span>';
      }
    } else {
      globalMapDensityCells = [];
      if (ui.globalHotspotExplorer) ui.globalHotspotExplorer.classList.add("hidden");
      if (ui.globalHotspotList) ui.globalHotspotList.innerHTML = "";
      for (const item of usable) {
        const { activity, route } = item;
        const latLngs = route.points.map((point) => [point.latitude, point.longitude]);
        const color = globalMapSportColor(activity);
        const line = L.polyline(latLngs, {
          color,
          weight: 3,
          opacity: 0.56,
          interactive: true
        });

        const title = activity.custom_title || sportName(activity.sport);
        line.bindTooltip(
          `${escapeHtml(title)}<br>${escapeHtml(formatDate(activity.start_time_ms))} · ${escapeHtml(formatDistance(activity.distance_m))}`,
          { sticky: true }
        );
        line.on("mouseover", () => line.setStyle({ weight: 6, opacity: 0.95 }));
        line.on("mouseout", () => line.setStyle({ weight: 3, opacity: 0.56 }));
        line.on("click", () => showActivity(activity));
        line.addTo(globalMapLayer);
      }
      ui.globalMapHotspot.textContent = "Vue tracés";
      ui.globalMapHotspot.className = "pill neutral";
      ui.globalMapSummaryText.textContent = "Cliquez sur un tracé pour ouvrir l’activité correspondante.";
      if (ui.globalMapLegend) {
        ui.globalMapLegend.innerHTML =
          '<span><i class="global-map-line running"></i>Course / trail</span>' +
          '<span><i class="global-map-line cycling"></i>Vélo</span>' +
          '<span><i class="global-map-line hiking"></i>Randonnée / marche</span>' +
          '<span><i class="global-map-line other"></i>Autres</span>';
      }
    }

    if (!routeCount) {
      globalMapLayer.clearLayers();
      ui.globalMapStatus.textContent =
        "Aucun document activity_routes exploitable. Publiez d’abord les tracés Web depuis SPORT Android.";
      ui.globalMapCount.textContent = "0 tracé";
      ui.globalMapCount.className = "pill neutral";
      return;
    }

    const bounds = globalMapLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.04), { animate: false, maxZoom: 15 });
    window.setTimeout(() => map.invalidateSize(false), 80);

    globalMapIsStale = false;
    ui.globalMapCount.textContent = `${formatNumber(routeCount)} activité${routeCount > 1 ? "s" : ""}`;
    ui.globalMapCount.className = "pill ok";
    const modeLabel = (ui.globalMapModeSelect?.value || "routes") === "density" ? "densité" : "tracés";
    const yearLabel = ui.globalMapYearSelect?.value === "all" ? "toutes années" : ui.globalMapYearSelect.value;
    const sportLabel = ui.globalMapSportSelect?.selectedOptions?.[0]?.textContent || "Tous";
    ui.globalMapStatus.textContent =
      `${formatNumber(routeCount)} activité(s) · vue ${modeLabel} · ${yearLabel} · ${sportLabel} · ` +
      `${formatNumber(candidates.length - routeCount)} tracé(s) absent(s) ou inexploitable(s).`;
  } catch (error) {
    console.error(error);
    ui.globalMapStatus.textContent = `Carte globale indisponible : ${error?.message || String(error)}`;
    ui.globalMapCount.className = "pill error";
  } finally {
    if (token === globalMapRequestToken) {
      globalMapIsBusy = false;
      if (ui.globalMapFilteredButton) ui.globalMapFilteredButton.disabled = false;
      if (ui.globalMapAllButton) ui.globalMapAllButton.disabled = false;
      if (ui.globalMapClearButton) ui.globalMapClearButton.disabled = !globalMapRenderedKeys.size;
    }
  }
}

function showActivity(activity) {
  catalogScrollY = window.scrollY;
  ui.uxSecondaryNav?.classList.add("hidden");
  currentDetailId = activityKey(activity);

  ui.catalogView.classList.add("hidden");
  ui.detailView.classList.remove("hidden");
  closeSplitActivityPanel();

  renderDetail(activity);

  queueMicrotask(() => {
    upgradeActivityDetailUiWeb047();
    applyWeb049UiContract();
    syncActivityDetailStickyOffsetsWeb047();
    syncWeb049StickyOffsets();
  });

  window.scrollTo({ top: 0, behavior: "auto" });
}

function showCatalog(restoreScroll = true) {
  document.title = "SPORT Web · WEB041";
  cartographyRequestToken++;
  destroyActivityMap();
  ui.detailView.classList.add("hidden");
  ui.catalogView.classList.remove("hidden");
  ui.uxPrimaryNav?.classList.remove("hidden");
  navigateUx(uxCurrentPage, uxCurrentSubpage, {keepScroll:true});
  window.setTimeout(() => {
    if (globalMapInstance) globalMapInstance.invalidateSize(false);
  }, 80);

  if (restoreScroll) {
    window.requestAnimationFrame(() => window.scrollTo({ top: catalogScrollY, behavior: "auto" }));
  }
}

function moveDetail(delta) {
  if (!currentDetailId || !filteredActivities.length) return;

  const index = filteredActivities.findIndex((activity) => activityKey(activity) === currentDetailId);
  if (index < 0) return;

  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= filteredActivities.length) return;

  const target = filteredActivities[targetIndex];
  currentDetailId = activityKey(target);
  renderDetail(target);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderDetail(activity) {
  const index = filteredActivities.findIndex((row) => activityKey(row) === activityKey(activity));
  const total = filteredActivities.length;

  ui.detailPosition.textContent =
    index >= 0 ? `${formatNumber(index + 1)} / ${formatNumber(total)}` : "—";

  const previousDisabled = index <= 0;
  const nextDisabled = index < 0 || index >= total - 1;

  [ui.previousActivityButton, ui.previousActivityBottomButton].forEach((button) => {
    button.disabled = previousDisabled;
  });

  [ui.nextActivityButton, ui.nextActivityBottomButton].forEach((button) => {
    button.disabled = nextDisabled;
  });

  const title = activity.custom_title || sportName(activity.sport);
  const hasCustomTitle = Boolean(String(activity.custom_title || "").trim());
  ui.detailTitle.textContent = hasCustomTitle ? activity.custom_title : "";
  ui.detailTitle.classList.toggle("hidden", !hasCustomTitle);
  ui.trashCurrentActivityButton.disabled = trashMutationRunning;
  ui.trashCurrentActivityButton.textContent =
    activity.deleted_at_ms == null ? "🗑 Mettre à la corbeille" : "↩ Restaurer";
  const sportLabel = sportName(activity.sport);
  ui.detailTitle.textContent = "";
  ui.detailTitle.classList.add("hidden");

  ui.detailSportLine.innerHTML =
    '<span class="detail-sport-svg-web049">' + activitySportIconMarkupWeb049(activity) + '</span>';
  ui.detailSportLine.title = sportLabel;
  ui.detailSportLine.setAttribute("aria-label", sportLabel);

  ui.detailDateLine.innerHTML =
    '<span class="detail-start-stat-web049"><strong>' + formatActivityDateWeb049(activity.start_time_ms) + '</strong><span>Date</span></span>' +
    '<span class="detail-start-stat-web049"><strong>' + formatActivityTimeWeb049(activity.start_time_ms) + '</strong><span>Départ</span></span>';

  renderHeroMetrics(activity);
  renderSummary(activity);
  populateRouteComparisonSelect(activity);
  renderCartography(activity);
  renderPerformance(activity);
  renderPersonal(activity);
  renderRecurringLandmarkHistory(activity);
  resetRecurringClimbAnalysis();
  renderLinkedRecords(activity);

  document.title = `${title} · SPORT Web`;
}


function nearestRecordedWeightKg(timestampMs) {
  const target = numberOrZero(timestampMs);
  const rows = [...journalEntries.values()]
    .map((entry) => ({
      time: numberOrZero(entry.day_start_ms ?? entry.__docId),
      weight: Number(entry.weight_kg)
    }))
    .filter((entry) => entry.time > 0 && Number.isFinite(entry.weight) && entry.weight >= 20 && entry.weight <= 300);
  if (!rows.length) return null;
  rows.sort((a,b) => Math.abs(a.time-target)-Math.abs(b.time-target));
  return rows[0].weight;
}

function originalCalories(activity) {
  const candidates = [
    activity?.calories,
    activity?.total_calories,
    activity?.active_calories,
    activity?.kcal
  ].map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return candidates.length ? Math.round(candidates[0]) : null;
}

function estimateActivityCalories(activity) {
  const weight = nearestRecordedWeightKg(activity?.start_time_ms);
  if (!Number.isFinite(weight)) return null;

  const distanceKm = numberOrZero(activity?.distance_m) / 1000;
  const ascent = numberOrZero(activity?.ascent_m);
  const durationMin = numberOrZero(activity?.elapsed_time_ms) / 60000;
  const sport = Number(activity?.sport);

  let kcal = null;
  if ([1,6].includes(sport) && distanceKm > 0) {
    kcal = weight * distanceKm + weight * ascent * 0.006;
  } else if ([11,17].includes(sport) && distanceKm > 0) {
    kcal = weight * distanceKm * 0.58 + weight * ascent * 0.006;
  } else if ([2,3,4].includes(sport) && durationMin > 0) {
    const speed = averageSpeedKmh(activity);
    const met = speed >= 28 ? 12 : speed >= 22 ? 10 : speed >= 16 ? 8 : 6;
    kcal = met * 3.5 * weight / 200 * durationMin;
  } else if (durationMin > 0) {
    kcal = 5 * 3.5 * weight / 200 * durationMin;
  }

  return Number.isFinite(kcal) && kcal > 0
    ? { value: Math.round(kcal), weight }
    : null;
}

function activityCaloriesPresentation(activity) {
  const original = originalCalories(activity);
  if (Number.isFinite(original)) return { value: `${formatNumber(original)} kcal`, label: "Calories · fichier", estimated: false };
  const estimate = estimateActivityCalories(activity);
  if (estimate) return { value: `≈ ${formatNumber(estimate.value)} kcal`, label: "Calories · estim.", estimated: true };
  return { value: "—", label: "Calories", estimated: false };
}


function metricSeriesFromRoute(route, activity) {
  const raw = route?.raw || {};
  const routePoints = route?.points || [];
  const aliases = {
    time: [raw.time_ms, raw.timestamp_ms, raw.timestamps_ms, raw.record_time_ms],
    hr: [raw.hr_bpm, raw.heart_rate_bpm, raw.heart_rate, raw.hr],
    speed: [raw.speed_mps, raw.enhanced_speed_mps, raw.speed]
  };

  const firstArray = (values) => values.find((value) => Array.isArray(value) && value.length) || [];
  const time = firstArray(aliases.time);
  const hr = firstArray(aliases.hr);
  const speed = firstArray(aliases.speed);

  const length = Math.max(time.length, hr.length, speed.length, routePoints.length);
  if (!length) return { pace: [], hr: [] };

  const paceSeries = [];
  const hrSeries = [];

  for (let i = 0; i < length; i++) {
    const distanceM = numberOrZero(routePoints[i]?.distanceMeters);
    const x = distanceM > 0 ? distanceM / 1000 : i;

    const heart = Number(hr[i]);
    if (Number.isFinite(heart) && heart > 20 && heart < 260) {
      hrSeries.push({ x, y: heart });
    }

    let speedMps = Number(speed[i]);
    if ((!Number.isFinite(speedMps) || speedMps <= 0) && i > 0 && time.length > i && routePoints.length > i) {
      const dt = Number(time[i]) - Number(time[i - 1]);
      const dd = numberOrZero(routePoints[i]?.distanceMeters) - numberOrZero(routePoints[i - 1]?.distanceMeters);
      if (Number.isFinite(dt) && dt > 0 && dd >= 0) {
        speedMps = dd / (dt / 1000);
      }
    }
    if (Number.isFinite(speedMps) && speedMps > 0.2 && speedMps < 30) {
      const paceMinKm = 1000 / speedMps / 60;
      if (Number.isFinite(paceMinKm) && paceMinKm > 1 && paceMinKm < 60) {
        paceSeries.push({ x, y: paceMinKm });
      }
    }
  }

  return { pace: paceSeries, hr: hrSeries };
}

function renderMetricChart(activity, kind) {
  if (!ui.metricChartPanel || !ui.metricChartSvg) return;
  ui.metricChartPanel.classList.remove("hidden");
  ui.metricChartSvg.innerHTML = "";

  const route = activeRoute;
  const series = metricSeriesFromRoute(route, activity);
  const rows = kind === "hr" ? series.hr : series.pace;

  ui.metricChartTitle.textContent = kind === "hr" ? "Fréquence cardiaque" : "Allure";
  ui.metricChartMeta.textContent = kind === "hr"
    ? `${formatHeartRate(activity.avg_hr)} moy. · ${formatHeartRate(activity.max_hr)} max`
    : primarySpeedMetric(activity);

  if (rows.length < 2) {
    ui.metricChartStatus.textContent =
      "Série point-par-point non disponible dans activity_routes. Le Web n’invente pas de courbe à partir des seules moyennes : il faudra publier timestamps/FC/vitesse depuis Android pour obtenir ce graphique.";
    return;
  }

  ui.metricChartStatus.textContent = `${formatNumber(rows.length)} points détaillés`;
  const width = 1000, height = 240, px = 35, py = 26;
  const xs = rows.map((row) => row.x);
  const ys = rows.map((row) => row.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  if (maxY - minY < 1) { minY -= 0.5; maxY += 0.5; }

  const xMap = (value) => px + ((value - minX) / Math.max(0.0001, maxX - minX)) * (width - px * 2);
  const yMap = (value) => py + ((maxY - value) / Math.max(0.0001, maxY - minY)) * (height - py * 2);
  const points = rows.map((row) => `${xMap(row.x).toFixed(1)},${yMap(row.y).toFixed(1)}`).join(" ");

  const grid = [0, .25, .5, .75, 1].map((ratio) => {
    const y = py + ratio * (height - py * 2);
    const value = maxY - ratio * (maxY - minY);
    const label = kind === "hr"
      ? `${Math.round(value)}`
      : `${Math.floor(value)}:${String(Math.round((value % 1) * 60)).padStart(2,"0")}`;
    return `<line x1="${px}" y1="${y}" x2="${width-px}" y2="${y}" class="metric-chart-grid"></line>
            <text x="4" y="${y+4}" class="metric-chart-label">${label}</text>`;
  }).join("");

  ui.metricChartSvg.innerHTML = `
    ${grid}
    <polyline points="${points}" class="metric-chart-line"></polyline>
    <text x="${px}" y="${height-4}" class="metric-chart-label">${minX.toLocaleString("fr-FR",{maximumFractionDigits:1})} km</text>
    <text x="${width-px-70}" y="${height-4}" class="metric-chart-label">${maxX.toLocaleString("fr-FR",{maximumFractionDigits:1})} km</text>`;
}

function closeMetricChart() {
  if (!ui.metricChartPanel) return;
  ui.metricChartPanel.classList.add("hidden");
  if (ui.metricChartSvg) ui.metricChartSvg.innerHTML = "";
}

function toggleDetailTechnicalPanel() {
  if (!ui.detailTechnicalPanel) return;
  const willShow = ui.detailTechnicalPanel.classList.contains("hidden");
  ui.detailTechnicalPanel.classList.toggle("hidden", !willShow);
  if (willShow) ui.detailTechnicalPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateCaloriesQuality(activity) {
  if (!ui.detailCaloriesQuality) return;
  const calories = activityCaloriesPresentation(activity);
  if (calories.value === "—") {
    ui.detailCaloriesQuality.textContent = "⚠ Calories manquantes";
    ui.detailCaloriesQuality.className = "pill error";
  } else {
    ui.detailCaloriesQuality.textContent = calories.value;
    ui.detailCaloriesQuality.className = calories.estimated ? "pill pending" : "pill ok";
  }
}

function equipmentCategoriesForSport(activity) {
  const sport = Number(activity?.sport);
  if ([1, 6].includes(sport)) return new Set(["SHOES"]);
  if ([2, 3, 4].includes(sport)) return new Set(["BIKE", "HOME_TRAINER"]);
  if ([11, 17].includes(sport)) return new Set(["SHOES", "BACKPACK", "POLES"]);
  return null;
}

function renderHeroMetrics(activity) {
  ui.detailHeroMetrics.innerHTML = "";
  updateCaloriesQuality(activity);

  const metrics = [
    ["Distance", formatDistance(activity.distance_m), null],
    ["Durée", formatDuration(activity.elapsed_time_ms), null],
    ["D+", formatMeters(activity.ascent_m), null],
    ["Allure / vitesse", primarySpeedMetric(activity), "pace"],
    ["FC moy.", formatHeartRate(activity.avg_hr), "hr"]
  ];

  for (const [label, value, chartKind] of metrics) {
    const box = document.createElement(chartKind ? "button" : "div");
    box.className = `hero-metric summary-chip${chartKind ? " metric-clickable" : ""}`;
    if (chartKind) {
      box.type = "button";
      box.title = `Afficher le graphique ${label.toLowerCase()}`;
      box.addEventListener("click", () => renderMetricChart(activity, chartKind));
    }
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    box.append(span, strong);
    ui.detailHeroMetrics.appendChild(box);
  }
}

function renderSummary(activity) {
  ui.detailSummaryGrid.innerHTML = "";

  addDetailItem(ui.detailSummaryGrid, "Date et heure", formatDateLong(activity.start_time_ms), "wide");
  addDetailItem(ui.detailSummaryGrid, "Sport", sportName(activity.sport));
  addDetailItem(ui.detailSummaryGrid, "Sous-sport", subSportName(activity.sub_sport));
  addDetailItem(ui.detailSummaryGrid, "Distance", formatDistance(activity.distance_m));
  addDetailItem(ui.detailSummaryGrid, "Durée écoulée", formatDuration(activity.elapsed_time_ms));
  addDetailItem(ui.detailSummaryGrid, "Temps actif", formatDuration(activity.timer_time_ms));
  addDetailItem(ui.detailSummaryGrid, "Dénivelé +", formatMeters(activity.ascent_m));
  addDetailItem(ui.detailSummaryGrid, "Dénivelé −", formatMeters(activity.descent_m));
  const calories = activityCaloriesPresentation(activity);
  addDetailItem(ui.detailSummaryGrid, calories.label, calories.value);
}


async function renderCartography(activity) {
  const token = ++cartographyRequestToken;
  destroyActivityMap();

  // Les modules avancés ne doivent jamais pouvoir empêcher la carte/profil de base.
  try { clearRouteComparison(false); } catch (error) { console.warn("WEB025-FIX2 comparison reset", error); }
  ui.elevationProfile.innerHTML = "";
  ui.profileMeta.textContent = "";
  ui.profileLive.textContent = "Survolez la carte ou le profil pour suivre votre position.";
  ui.routeStats.innerHTML = "";
  try { resetPerformanceTerrainAnalysis(activity); } catch (error) { console.warn("WEB025-FIX2 performance reset", error); }

  ui.mapStatus.textContent = "Chargement du tracé…";
  ui.mapStatus.className = "pill neutral";
  ui.activityMap.classList.remove("route-empty");
  ui.activityMap.textContent = "";

  try {
    // Certaines générations d'activités possèdent à la fois id et __docId.
    // Les anciens activity_routes peuvent avoir été publiés sous l'un ou l'autre.
    const keys = [...new Set([
      activity?.id,
      activity?.__docId,
      activityKey(activity)
    ].filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
      .map((value) => String(value)))];

    if (!keys.length) {
      throw new Error("identifiant d’activité introuvable");
    }

    let snapshot = null;
    let routeKey = null;
    for (const key of keys) {
      const candidate = await getDoc(doc(db, ROOT, currentUser.uid, "activity_routes", key));
      if (token !== cartographyRequestToken) return;
      if (candidate.exists()) {
        snapshot = candidate;
        routeKey = key;
        break;
      }
    }

    if (token !== cartographyRequestToken) return;

    if (!snapshot) {
      const gpsCount = numberOrZero(activity.gps_point_count);
      showRouteUnavailable(
        `Tracé Web non publié pour cette activité${gpsCount > 1 ? ` (${formatNumber(gpsCount)} points GPS dans l’activité)` : ""}. ` +
        "Sur le téléphone principal : Firebase · SPORT Web → « Publier les tracés Web · CARTOWEB001 »."
      );
      return;
    }

    const route = normalizeRoute(snapshot.data());
    if (route.points.length < 2) {
      showRouteUnavailable(
        `Le document activity_routes « ${routeKey} » existe mais ne contient pas assez de points exploitables.`
      );
      return;
    }

    // ----- Socle cartographique : identique au chemin validé WEB019 -----
    activeRoute = route;
    renderLeafletMap(route);
    renderElevationProfile(route);

    const sourceCount = numberOrZero(snapshot.data().source_point_count);
    renderRouteStats(route, sourceCount);

    const previewCount = route.points.length;
    ui.mapStatus.textContent = `${formatNumber(previewCount)} points Web`;
    ui.mapStatus.className = "pill ok";
    ui.profileMeta.textContent =
      sourceCount > previewCount
        ? `${formatNumber(previewCount)} points affichés sur ${formatNumber(sourceCount)} points GPS`
        : `${formatNumber(previewCount)} points GPS`;

    // ----- Extensions WEB020–025 : chacune isolée -----
    try { renderRouteAnalysis(route); }
    catch (error) { console.warn("WEB025-FIX2 route analysis", error); }

    try { renderKilometerAnalysis(route); }
    catch (error) { console.warn("WEB025-FIX2 kilometer analysis", error); }

    try {
      if (ui.scanRecurringClimbsButton) ui.scanRecurringClimbsButton.disabled = false;
    } catch (error) {
      console.warn("WEB025-FIX2 recurring climbs activation", error);
    }

    try { renderPerformanceTerrainAnalysis(activity, route); }
    catch (error) {
      console.warn("WEB025-FIX2 performance terrain", error);
      try { resetPerformanceTerrainAnalysis(activity); } catch (_) {}
      if (ui.performanceTerrainMeta) {
        ui.performanceTerrainMeta.textContent =
          "Carte/profil disponibles ; analyse avancée momentanément indisponible.";
      }
    }

    window.setTimeout(() => {
      if (token === cartographyRequestToken && activityMapInstance) {
        activityMapInstance.invalidateSize(false);
        recenterActivityMap();
      }
    }, 100);
  } catch (error) {
    console.error("WEB025-FIX2 cartography", error);
    if (token !== cartographyRequestToken) return;
    showRouteUnavailable(`Carte indisponible : ${error?.message || String(error)}`);
  }
}

function normalizeRoute(data) {
  const lat = Array.isArray(data?.lat) ? data.lat : [];
  const lon = Array.isArray(data?.lon) ? data.lon : [];
  const alt = Array.isArray(data?.alt_m) ? data.alt_m : [];
  const distance = Array.isArray(data?.distance_m) ? data.distance_m : [];
  const routeTime = Array.isArray(data?.time_ms) ? data.time_ms
    : Array.isArray(data?.timestamp_ms) ? data.timestamp_ms
    : Array.isArray(data?.timestamps_ms) ? data.timestamps_ms
    : [];
  const routeHr = Array.isArray(data?.hr_bpm) ? data.hr_bpm
    : Array.isArray(data?.heart_rate_bpm) ? data.heart_rate_bpm
    : Array.isArray(data?.heart_rate) ? data.heart_rate
    : [];
  const routeSpeed = Array.isArray(data?.speed_mps) ? data.speed_mps
    : Array.isArray(data?.enhanced_speed_mps) ? data.enhanced_speed_mps
    : Array.isArray(data?.speed) ? data.speed
    : [];
  const routeGap = Array.isArray(data?.gap_sec_per_km) ? data.gap_sec_per_km
    : Array.isArray(data?.grade_adjusted_pace_sec_per_km) ? data.grade_adjusted_pace_sec_per_km
    : Array.isArray(data?.gap_s_per_km) ? data.gap_s_per_km
    : [];

  const count = Math.min(lat.length, lon.length);
  const points = [];
  let cumulative = 0;
  let cumulativeAscent = 0;
  let previous = null;

  for (let i = 0; i < count; i++) {
    const latitude = Number(lat[i]);
    const longitude = Number(lon[i]);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
        || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      continue;
    }

    if (previous) {
      cumulative += haversineMeters(previous.latitude, previous.longitude, latitude, longitude);
      const previousAltitude = Number(previous.altitudeMeters);
      const currentAltitude = Number(alt[i]);
      if (Number.isFinite(previousAltitude) && Number.isFinite(currentAltitude)) {
        const gain = currentAltitude - previousAltitude;
        if (gain > 0) cumulativeAscent += gain;
      }
    }

    const rawDistance = Number(distance[i]);
    const distanceMeters = Number.isFinite(rawDistance) && rawDistance >= 0
      ? rawDistance
      : cumulative;

    const rawAltitude = Number(alt[i]);
    const altitudeMeters = Number.isFinite(rawAltitude) ? rawAltitude : null;

    const point = {
      latitude,
      longitude,
      altitudeMeters,
      distanceMeters,
      cumulativeAscentMeters: cumulativeAscent,
      timeMs: Number(routeTime[i]),
      heartRateBpm: Number(routeHr[i]),
      speedMps: Number(routeSpeed[i]),
      gapSecondsPerKm: Number(routeGap[i]),
      sourceIndex: i
    };
    points.push(point);
    previous = point;
  }

  // Si les distances Firestore ne sont pas croissantes, on recalcule une distance cartographique.
  let monotonic = true;
  for (let i = 1; i < points.length; i++) {
    if (points[i].distanceMeters + 0.1 < points[i - 1].distanceMeters) {
      monotonic = false;
      break;
    }
  }

  if (!monotonic && points.length > 1) {
    let d = 0;
    points[0].distanceMeters = 0;
    for (let i = 1; i < points.length; i++) {
      d += haversineMeters(
        points[i - 1].latitude,
        points[i - 1].longitude,
        points[i].latitude,
        points[i].longitude
      );
      points[i].distanceMeters = d;
    }
  }

  calculateRouteGrades(points);
  return { raw: data || {}, points };
}

function calculateRouteGrades(points) {
  if (!Array.isArray(points) || points.length < 2) return;
  const targetWindowMeters = 120;

  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    if (!Number.isFinite(current.altitudeMeters)) {
      current.gradePercent = null;
      continue;
    }

    let before = i;
    let after = i;
    while (before > 0
        && current.distanceMeters - points[before].distanceMeters < targetWindowMeters / 2) {
      before--;
    }
    while (after < points.length - 1
        && points[after].distanceMeters - current.distanceMeters < targetWindowMeters / 2) {
      after++;
    }

    const p1 = points[before];
    const p2 = points[after];
    const horizontal = Number(p2.distanceMeters) - Number(p1.distanceMeters);
    const vertical = Number(p2.altitudeMeters) - Number(p1.altitudeMeters);
    current.gradePercent = Number.isFinite(horizontal) && horizontal >= 25 && Number.isFinite(vertical)
      ? Math.max(-35, Math.min(35, (vertical / horizontal) * 100))
      : null;
  }
}

function routeStats(route) {
  const altitudes = route.points
    .map((point) => point.altitudeMeters)
    .filter((value) => Number.isFinite(value));
  const distance = route.points.length
    ? numberOrZero(route.points[route.points.length - 1].distanceMeters)
    : 0;
  const ascent = route.points.length
    ? numberOrZero(route.points[route.points.length - 1].cumulativeAscentMeters)
    : 0;
  const grades = route.points
    .map((point) => point.gradePercent)
    .filter((value) => Number.isFinite(value));
  return {
    distanceMeters: distance,
    ascentMeters: ascent,
    minAltitude: altitudes.length ? Math.min(...altitudes) : null,
    maxAltitude: altitudes.length ? Math.max(...altitudes) : null,
    maxClimbGrade: grades.length ? Math.max(0, ...grades) : null,
    maxDescentGrade: grades.length ? Math.min(0, ...grades) : null
  };
}

function renderRouteStats(route, sourceCount) {
  ui.routeStats.innerHTML = "";
  const stats = routeStats(route);
  const values = [
    ["Distance tracé", formatDistance(stats.distanceMeters)],
    ["D+ profil", formatMeters(stats.ascentMeters)],
    ["Altitude min.", Number.isFinite(stats.minAltitude) ? formatMeters(stats.minAltitude) : "—"],
    ["Altitude max.", Number.isFinite(stats.maxAltitude) ? formatMeters(stats.maxAltitude) : "—"],
    ["Pente max. +", Number.isFinite(stats.maxClimbGrade) ? `${stats.maxClimbGrade.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—"],
    ["Pente max. −", Number.isFinite(stats.maxDescentGrade) ? `${stats.maxDescentGrade.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—"]
  ];

  for (const [label, value] of values) {
    const box = document.createElement("div");
    box.className = "route-stat";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    box.append(span, strong);
    ui.routeStats.appendChild(box);
  }
}


function detectRouteSegments(route) {
  const points = route?.points || [];
  if (points.length < 3) return [];

  const directionFor = (point) => {
    const grade = Number(point?.gradePercent);
    if (!Number.isFinite(grade)) return 0;
    if (grade >= 1.5) return 1;
    if (grade <= -1.5) return -1;
    return 0;
  };

  const raw = [];
  let activeDirection = 0;
  let startIndex = 0;
  let neutralStart = -1;
  const neutralToleranceMeters = 220;

  const closeSegment = (endIndex) => {
    if (!activeDirection || endIndex <= startIndex) return;
    raw.push({ direction: activeDirection, startIndex, endIndex });
  };

  for (let i = 0; i < points.length; i++) {
    const direction = directionFor(points[i]);
    if (!activeDirection) {
      if (direction) {
        activeDirection = direction;
        startIndex = Math.max(0, i - 1);
        neutralStart = -1;
      }
      continue;
    }

    if (direction === activeDirection) {
      neutralStart = -1;
      continue;
    }

    if (direction === 0) {
      if (neutralStart < 0) neutralStart = i;
      const neutralDistance = numberOrZero(points[i].distanceMeters)
        - numberOrZero(points[neutralStart].distanceMeters);
      if (neutralDistance <= neutralToleranceMeters) continue;
      closeSegment(Math.max(startIndex + 1, neutralStart));
      activeDirection = 0;
      neutralStart = -1;
      continue;
    }

    const endIndex = neutralStart >= 0 ? neutralStart : Math.max(startIndex + 1, i - 1);
    closeSegment(endIndex);
    activeDirection = direction;
    startIndex = Math.max(0, endIndex);
    neutralStart = -1;
  }

  if (activeDirection) closeSegment(points.length - 1);

  const segments = [];
  for (const item of raw) {
    const segmentPoints = points.slice(item.startIndex, item.endIndex + 1);
    if (segmentPoints.length < 2) continue;
    const first = segmentPoints[0];
    const last = segmentPoints[segmentPoints.length - 1];
    const distanceMeters = Math.max(0, numberOrZero(last.distanceMeters) - numberOrZero(first.distanceMeters));
    let gainMeters = 0;
    let lossMeters = 0;
    const grades = [];
    for (let i = 1; i < segmentPoints.length; i++) {
      const a1 = Number(segmentPoints[i - 1].altitudeMeters);
      const a2 = Number(segmentPoints[i].altitudeMeters);
      if (Number.isFinite(a1) && Number.isFinite(a2)) {
        const delta = a2 - a1;
        if (delta > 0) gainMeters += delta;
        if (delta < 0) lossMeters += -delta;
      }
      const g = Number(segmentPoints[i].gradePercent);
      if (Number.isFinite(g)) grades.push(g);
    }
    const firstAlt = Number(first.altitudeMeters);
    const lastAlt = Number(last.altitudeMeters);
    const vertical = Number.isFinite(firstAlt) && Number.isFinite(lastAlt) ? lastAlt - firstAlt : 0;
    const averageGrade = distanceMeters >= 1 ? (vertical / distanceMeters) * 100 : 0;
    const isClimb = item.direction > 0;
    const significant = isClimb
      ? distanceMeters >= 300 && gainMeters >= 40 && averageGrade >= 1.5
      : distanceMeters >= 300 && lossMeters >= 40 && averageGrade <= -1.5;
    if (!significant) continue;

    const maxGrade = grades.length
      ? (isClimb ? Math.max(...grades) : Math.min(...grades))
      : null;
    const score = isClimb
      ? gainMeters * (1 + Math.max(0, averageGrade) / 10) * (1 + Math.log10(1 + distanceMeters / 1000))
      : lossMeters * (1 + Math.max(0, -averageGrade) / 12);

    segments.push({
      id: `${isClimb ? "C" : "D"}-${item.startIndex}-${item.endIndex}`,
      type: isClimb ? "climb" : "descent",
      startIndex: item.startIndex,
      endIndex: item.endIndex,
      points: segmentPoints,
      distanceMeters,
      gainMeters,
      lossMeters,
      averageGrade,
      maxGrade,
      startAltitude: Number.isFinite(firstAlt) ? firstAlt : null,
      endAltitude: Number.isFinite(lastAlt) ? lastAlt : null,
      startDistanceMeters: numberOrZero(first.distanceMeters),
      endDistanceMeters: numberOrZero(last.distanceMeters),
      score
    });
  }

  const climbs = segments.filter((segment) => segment.type === "climb").sort((a, b) => b.score - a.score);
  climbs.forEach((segment, index) => { segment.rank = index + 1; });
  const descents = segments.filter((segment) => segment.type === "descent").sort((a, b) => b.lossMeters - a.lossMeters);
  descents.forEach((segment, index) => { segment.rank = index + 1; });
  return [...climbs, ...descents];
}

function renderRouteAnalysis(route) {
  if (!ui.routeSegmentList || !ui.routeAnalysisMeta) return;
  selectedRouteSegment = null;
  renderRouteSegmentDetail(null);
  ui.routeSegmentList.innerHTML = "";
  const segments = detectRouteSegments(route);
  route.segments = segments;
  const climbs = segments.filter((segment) => segment.type === "climb");
  const descents = segments.filter((segment) => segment.type === "descent");
  ui.routeAnalysisMeta.textContent = `${climbs.length} montée(s) · ${descents.length} descente(s) détectée(s)`;
  ui.routeAnalysisClearButton.disabled = true;

  if (!segments.length) {
    const empty = document.createElement("div");
    empty.className = "route-analysis-empty";
    empty.textContent = "Aucune montée ou descente significative détectée sur ce tracé.";
    ui.routeSegmentList.appendChild(empty);
    return;
  }

  const addGroup = (title, items) => {
    if (!items.length) return;
    const group = document.createElement("div");
    group.className = "route-segment-group";
    const heading = document.createElement("h4");
    heading.textContent = title;
    group.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "route-segment-grid";
    for (const segment of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `route-segment-card ${segment.type}`;
      button.dataset.segmentId = segment.id;
      const vertical = segment.type === "climb" ? segment.gainMeters : segment.lossMeters;
      const symbol = segment.type === "climb" ? "+" : "−";
      const label = segment.type === "climb" ? `Montée #${segment.rank}` : `Descente #${segment.rank}`;
      button.innerHTML = `
        <span class="route-segment-title">${label}</span>
        <strong>${(segment.distanceMeters / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km · ${symbol}${Math.round(vertical)} m</strong>
        <span>${segment.averageGrade >= 0 ? "+" : ""}${segment.averageGrade.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % moy. · max ${Number.isFinite(segment.maxGrade) ? `${segment.maxGrade >= 0 ? "+" : ""}${segment.maxGrade.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—"}</span>
        <span>${Number.isFinite(segment.startAltitude) ? Math.round(segment.startAltitude) : "—"} → ${Number.isFinite(segment.endAltitude) ? Math.round(segment.endAltitude) : "—"} m · km ${(segment.startDistanceMeters / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} → ${(segment.endDistanceMeters / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</span>`;
      button.addEventListener("click", () => selectRouteSegment(segment));
      grid.appendChild(button);
    }
    group.appendChild(grid);
    ui.routeSegmentList.appendChild(group);
  };

  addGroup("Ascensions classées par importance", climbs);
  addGroup("Descentes", descents);
}


function buildKilometerSegments(route) {
  const points = route?.points || [];
  if (points.length < 2) return [];
  const totalDistance = numberOrZero(points[points.length - 1].distanceMeters);
  if (totalDistance <= 0) return [];
  const result = [];
  const count = Math.ceil(totalDistance / 1000);

  for (let kmIndex = 0; kmIndex < count; kmIndex++) {
    const startMeters = kmIndex * 1000;
    const endMeters = Math.min(totalDistance, (kmIndex + 1) * 1000);
    const segmentPoints = points.filter((p) =>
      numberOrZero(p.distanceMeters) >= startMeters - 0.1 &&
      numberOrZero(p.distanceMeters) <= endMeters + 0.1
    );
    const before = [...points].reverse().find((p) => numberOrZero(p.distanceMeters) <= startMeters);
    const after = points.find((p) => numberOrZero(p.distanceMeters) >= endMeters);
    if (before && (!segmentPoints.length || segmentPoints[0] !== before)) segmentPoints.unshift(before);
    if (after && segmentPoints[segmentPoints.length - 1] !== after) segmentPoints.push(after);
    if (segmentPoints.length < 2) continue;

    let gainMeters = 0, lossMeters = 0, maxGrade = null;
    const altitudes = [];
    for (let i = 0; i < segmentPoints.length; i++) {
      const alt = Number(segmentPoints[i].altitudeMeters);
      if (Number.isFinite(alt)) altitudes.push(alt);
      const grade = Number(segmentPoints[i].gradePercent);
      if (Number.isFinite(grade) && (maxGrade === null || Math.abs(grade) > Math.abs(maxGrade))) maxGrade = grade;
      if (i > 0) {
        const a = Number(segmentPoints[i-1].altitudeMeters), b = Number(segmentPoints[i].altitudeMeters);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          const delta = b-a;
          if (delta > 0) gainMeters += delta; else lossMeters += -delta;
        }
      }
    }
    const firstAlt = Number(segmentPoints[0].altitudeMeters);
    const lastAlt = Number(segmentPoints[segmentPoints.length-1].altitudeMeters);
    const distanceMeters = Math.max(1, endMeters-startMeters);
    const averageGrade = Number.isFinite(firstAlt) && Number.isFinite(lastAlt)
      ? ((lastAlt-firstAlt)/distanceMeters)*100 : null;

    result.push({
      id: `KM-${kmIndex+1}`,
      type: "kilometer",
      rank: kmIndex+1,
      points: segmentPoints,
      startDistanceMeters: startMeters,
      endDistanceMeters: endMeters,
      distanceMeters,
      gainMeters,
      lossMeters,
      averageGrade,
      maxGrade,
      minAltitude: altitudes.length ? Math.min(...altitudes) : null,
      maxAltitude: altitudes.length ? Math.max(...altitudes) : null
    });
  }
  return result;
}


function routePointTimeMs(point) {
  const value = Number(point?.timeMs);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function routePointHeartRate(point) {
  const value = Number(point?.heartRateBpm);
  return Number.isFinite(value) && value >= 20 && value <= 260 ? value : null;
}

function routePointSpeedMps(point) {
  const value = Number(point?.speedMps);
  return Number.isFinite(value) && value > 0.2 && value < 30 ? value : null;
}

function formatPaceFromSeconds(secondsPerKm) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "—";
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total/60)}:${String(total%60).padStart(2,"0")} /km`;
}

function routePointGapSecondsPerKm(point) {
  const value = Number(point?.gapSecondsPerKm);
  return Number.isFinite(value) && value > 30 && value < 3600 ? value : null;
}

function kilometerPerformanceValues(segment) {
  const points = segment?.points || [];
  if (!points.length) return {pace:null, gap:null, avgHr:null};

  const first = points[0], last = points[points.length-1];
  const t0 = routePointTimeMs(first), t1 = routePointTimeMs(last);
  let pace = null;

  if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0 && segment.distanceMeters > 0) {
    pace = ((t1-t0)/1000) / (segment.distanceMeters/1000);
  } else {
    const speeds = points.map(routePointSpeedMps).filter(Number.isFinite);
    if (speeds.length) {
      const avgSpeed = speeds.reduce((a,b)=>a+b,0)/speeds.length;
      pace = 1000 / avgSpeed;
    }
  }

  const hrs = points.map(routePointHeartRate).filter(Number.isFinite);
  const avgHr = hrs.length ? hrs.reduce((a,b)=>a+b,0)/hrs.length : null;
  const gaps = points.map(routePointGapSecondsPerKm).filter(Number.isFinite);
  const gap = gaps.length ? gaps.reduce((a,b)=>a+b,0)/gaps.length : null;

  return {pace, gap, avgHr};
}

function renderKilometerAnalysis(route) {
  if (!ui.routeKmAnalysisList || !ui.routeKmAnalysisMeta) return;
  const segments = buildKilometerSegments(route);
  route.kilometerSegments = segments;
  ui.routeKmAnalysisList.innerHTML = "";
  ui.routeKmAnalysisMeta.textContent = `${segments.length} tronçon(s)`;
  if (ui.routeKmClearButton) ui.routeKmClearButton.disabled = true;

  if (!segments.length) {
    ui.routeKmAnalysisList.innerHTML = '<div class="muted">Aucun tronçon kilométrique exploitable.</div>';
    return;
  }

  const table = document.createElement("table");
  table.className = "route-km-table";
  table.classList.add("route-km-performance-table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Km</th>
        <th>Allure moy.</th>
        <th>GAP</th>
        <th>D+</th>
        <th>D−</th>
        <th>FC moy.</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  let detailedPace = false;
  let detailedHr = false;

  for (const segment of segments) {
    const perf = kilometerPerformanceValues(segment);
    if (Number.isFinite(perf.pace)) detailedPace = true;
    if (Number.isFinite(perf.avgHr)) detailedHr = true;

    const row = document.createElement("tr");
    row.className = "route-km-row";
    row.dataset.segmentId = segment.id;
    row.tabIndex = 0;
    const kmLabel = segment.distanceMeters >= 995 ? String(segment.rank) : `${segment.rank}*`;

    row.innerHTML = `
      <th scope="row">${kmLabel}</th>
      <td>${formatPaceFromSeconds(perf.pace)}</td>
      <td>${formatPaceFromSeconds(perf.gap)}</td>
      <td>+${Math.round(segment.gainMeters)} m</td>
      <td>−${Math.round(segment.lossMeters)} m</td>
      <td>${Number.isFinite(perf.avgHr) ? `${Math.round(perf.avgHr)} bpm` : "—"}</td>`;

    row.addEventListener("click", () => selectKilometerSegment(segment));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectKilometerSegment(segment);
      }
    });
    tbody.appendChild(row);
  }

  ui.routeKmAnalysisList.appendChild(table);

  if (!detailedPace || !detailedHr) {
    const note = document.createElement("p");
    note.className = "map-help route-km-data-note";
    note.textContent =
      "Allure, GAP et FC par km nécessitent les séries point-par-point publiées dans activity_routes. Le GAP n’est jamais estimé par le Web : il reste vide tant qu’une série GAP fiable n’est pas fournie. D+ et D− restent disponibles.";
    ui.routeKmAnalysisList.appendChild(note);
  }
}

function selectKilometerSegment(segment) {
  selectRouteSegment(segment);
  document.querySelectorAll(".route-km-card, .route-km-row").forEach((node) => {
    node.classList.toggle("selected", node.dataset.segmentId === segment.id);
  });
  document.querySelectorAll(".route-segment-card.selected").forEach((node) => node.classList.remove("selected"));
  document.querySelectorAll(".climb-subsegment-card.selected").forEach((node) => node.classList.remove("selected"));
  document.querySelectorAll(".route-km-card.selected, .route-km-row.selected").forEach((node) => node.classList.remove("selected"));
  if (ui.routeKmClearButton) ui.routeKmClearButton.disabled = false;
  if (ui.routeAnalysisClearButton) ui.routeAnalysisClearButton.disabled = false;
  if (ui.routeSegmentDetail) ui.routeSegmentDetail.classList.add("hidden");
  ui.profileLive.textContent =
    `Kilomètre ${segment.rank} · D+ ${Math.round(segment.gainMeters)} m · D− ${Math.round(segment.lossMeters)} m` +
    (Number.isFinite(segment.averageGrade) ? ` · ${segment.averageGrade >= 0 ? "+" : ""}${segment.averageGrade.toLocaleString("fr-FR",{maximumFractionDigits:1})} % moy.` : "");
}


function classifyClimbGrade(grade) {
  if (!Number.isFinite(grade)) return { key: "unknown", label: "Indéterminé", cls: "unknown", order: -1 };
  if (grade < 5) return { key: "recovery", label: "Relance", cls: "recovery", order: 0 };
  if (grade < 10) return { key: "steady", label: "Soutenu", cls: "steady", order: 1 };
  if (grade < 15) return { key: "steep", label: "Raide", cls: "steep", order: 2 };
  return { key: "very-steep", label: "Très raide", cls: "very-steep", order: 3 };
}

function smoothedGradeAt(points, index, windowMeters = 120) {
  if (!points?.length) return null;
  const center = numberOrZero(points[index]?.distanceMeters);
  const half = windowMeters / 2;
  let left = index, right = index;
  while (left > 0 && center - numberOrZero(points[left].distanceMeters) < half) left--;
  while (right < points.length - 1 && numberOrZero(points[right].distanceMeters) - center < half) right++;
  const d = numberOrZero(points[right].distanceMeters) - numberOrZero(points[left].distanceMeters);
  const a = Number(points[left].altitudeMeters), b = Number(points[right].altitudeMeters);
  if (d < 35 || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return ((b - a) / d) * 100;
}

function buildClimbSubsegments(segment) {
  if (!segment || segment.type !== "climb" || !segment.points?.length) return [];
  const points = segment.points;
  const labeled = points.map((point, index) => ({ point, index, grade: smoothedGradeAt(points, index, 120) }));
  const raw = [];
  let active = null;
  for (const item of labeled) {
    const category = classifyClimbGrade(item.grade);
    if (!active || active.category.key !== category.key) {
      if (active) raw.push(active);
      active = { category, startIndex: item.index, endIndex: item.index, grades: [item.grade] };
    } else {
      active.endIndex = item.index;
      active.grades.push(item.grade);
    }
  }
  if (active) raw.push(active);

  // Fusionne les zones très courtes avec leur voisine la plus proche pour éviter un découpage bruité.
  const merged = raw.map((x) => ({ ...x }));
  const zoneDistance = (z) => numberOrZero(points[z.endIndex]?.distanceMeters) - numberOrZero(points[z.startIndex]?.distanceMeters);
  for (let i = 0; i < merged.length; i++) {
    if (merged.length <= 1 || zoneDistance(merged[i]) >= 140) continue;
    const prev = i > 0 ? merged[i-1] : null;
    const next = i < merged.length-1 ? merged[i+1] : null;
    let targetIndex;
    if (!prev) targetIndex = i+1;
    else if (!next) targetIndex = i-1;
    else {
      const currentOrder = merged[i].category.order;
      targetIndex = Math.abs(prev.category.order-currentOrder) <= Math.abs(next.category.order-currentOrder) ? i-1 : i+1;
    }
    if (targetIndex < i) {
      merged[targetIndex].endIndex = merged[i].endIndex;
      merged.splice(i,1); i--;
    } else {
      merged[targetIndex].startIndex = merged[i].startIndex;
      merged.splice(i,1); i--;
    }
  }

  return merged.map((zone, index) => {
    const zonePoints = points.slice(zone.startIndex, zone.endIndex + 1);
    const first = zonePoints[0], last = zonePoints[zonePoints.length-1];
    const distanceMeters = Math.max(1, numberOrZero(last.distanceMeters)-numberOrZero(first.distanceMeters));
    const firstAlt = Number(first.altitudeMeters), lastAlt = Number(last.altitudeMeters);
    const vertical = Number.isFinite(firstAlt)&&Number.isFinite(lastAlt) ? lastAlt-firstAlt : 0;
    let gainMeters = 0, maxGrade = null;
    for (let j=1;j<zonePoints.length;j++) {
      const a=Number(zonePoints[j-1].altitudeMeters), b=Number(zonePoints[j].altitudeMeters);
      if (Number.isFinite(a)&&Number.isFinite(b)&&b>a) gainMeters += b-a;
      const g=smoothedGradeAt(points, zone.startIndex+j, 120);
      if (Number.isFinite(g) && (maxGrade===null || g>maxGrade)) maxGrade=g;
    }
    const averageGrade = (vertical/distanceMeters)*100;
    const category = classifyClimbGrade(Number.isFinite(averageGrade) ? averageGrade : 0);
    return {
      id: `${segment.id}-Z${index+1}`,
      type: "climb-zone",
      rank: index+1,
      parentSegmentId: segment.id,
      category,
      points: zonePoints,
      startDistanceMeters: numberOrZero(first.distanceMeters),
      endDistanceMeters: numberOrZero(last.distanceMeters),
      distanceMeters,
      gainMeters,
      averageGrade,
      maxGrade,
      startAltitude: Number.isFinite(firstAlt)?firstAlt:null,
      endAltitude: Number.isFinite(lastAlt)?lastAlt:null
    };
  }).filter((z) => z.distanceMeters >= 60);
}

function renderClimbSubsegments(segment) {
  if (!ui.climbSubsegmentsBlock || !ui.climbSubsegmentsList || !ui.climbSubsegmentsMeta) return;
  if (!segment || segment.type !== "climb") {
    ui.climbSubsegmentsBlock.classList.add("hidden");
    ui.climbSubsegmentsList.innerHTML = "";
    return;
  }
  const zones = buildClimbSubsegments(segment);
  segment.subsegments = zones;
  ui.climbSubsegmentsBlock.classList.remove("hidden");
  ui.climbSubsegmentsMeta.textContent = `${zones.length} zone(s)`;
  ui.climbSubsegmentsList.innerHTML = "";
  for (const zone of zones) {
    const button=document.createElement("button");
    button.type="button";
    button.className=`climb-subsegment-card ${zone.category.cls}`;
    button.dataset.subsegmentId=zone.id;
    const kmStart=(zone.startDistanceMeters/1000).toLocaleString("fr-FR",{maximumFractionDigits:2});
    const kmEnd=(zone.endDistanceMeters/1000).toLocaleString("fr-FR",{maximumFractionDigits:2});
    button.innerHTML=`
      <span class="climb-zone-badge">Zone ${zone.rank} · ${zone.category.label}</span>
      <strong>${(zone.distanceMeters/1000).toLocaleString("fr-FR",{maximumFractionDigits:2})} km · +${Math.round(zone.gainMeters)} m</strong>
      <span>${zone.averageGrade>=0?"+":""}${zone.averageGrade.toLocaleString("fr-FR",{maximumFractionDigits:1})} % moy. · max ${Number.isFinite(zone.maxGrade)?`+${zone.maxGrade.toLocaleString("fr-FR",{maximumFractionDigits:1})} %`:"—"}</span>
      <span>km ${kmStart} → ${kmEnd}</span>`;
    button.addEventListener("click",()=>selectClimbSubsegment(zone));
    ui.climbSubsegmentsList.appendChild(button);
  }
}

function selectClimbSubsegment(zone) {
  if (!zone?.points?.length) return;
  // Réutilise le moteur carte/profil de WEBCARTO003 sans remplacer la fiche de l'ascension par une fiche secondaire.
  const proxy={...zone,type:"kilometer"};
  selectRouteSegment(proxy);
  document.querySelectorAll(".climb-subsegment-card").forEach((node)=>node.classList.toggle("selected",node.dataset.subsegmentId===zone.id));
  document.querySelectorAll(".route-segment-card").forEach((node)=>node.classList.toggle("selected",node.dataset.segmentId===zone.parentSegmentId));
  if (ui.routeSegmentDetail) ui.routeSegmentDetail.classList.remove("hidden");
  if (ui.profileLive) ui.profileLive.textContent=`Zone ${zone.rank} · ${zone.category.label} · ${(zone.distanceMeters/1000).toLocaleString("fr-FR",{maximumFractionDigits:2})} km · +${Math.round(zone.gainMeters)} m · ${zone.averageGrade>=0?"+":""}${zone.averageGrade.toLocaleString("fr-FR",{maximumFractionDigits:1})} % moy.`;
}

function segmentGradeAnalysis(segment) {
  const points = segment?.points || [];
  const bands = [
    { label: "0–5 %", min: 0, max: 5, cls: "easy" },
    { label: "5–10 %", min: 5, max: 10, cls: "moderate" },
    { label: "10–15 %", min: 10, max: 15, cls: "hard" },
    { label: "≥ 15 %", min: 15, max: Infinity, cls: "extreme" }
  ].map((band) => ({ ...band, meters: 0 }));
  let total = 0;
  for (let i=1;i<points.length;i++) {
    const dx=Math.max(0,numberOrZero(points[i].distanceMeters)-numberOrZero(points[i-1].distanceMeters));
    if (!dx) continue;
    const grade=Math.abs(Number(points[i].gradePercent));
    if (!Number.isFinite(grade)) continue;
    const band=bands.find((b)=>grade>=b.min && grade<b.max);
    if (band) band.meters += dx;
    total += dx;
  }
  const windows = [100, 500].map((windowMeters) => {
    let best=null, left=0;
    for (let right=1;right<points.length;right++) {
      while (left<right && numberOrZero(points[right].distanceMeters)-numberOrZero(points[left].distanceMeters)>windowMeters*1.15) left++;
      let start=left;
      while (start>0 && numberOrZero(points[right].distanceMeters)-numberOrZero(points[start].distanceMeters)<windowMeters*0.90) start--;
      const dist=numberOrZero(points[right].distanceMeters)-numberOrZero(points[start].distanceMeters);
      if (dist<windowMeters*0.75) continue;
      const a=Number(points[start].altitudeMeters), b=Number(points[right].altitudeMeters);
      if (!Number.isFinite(a)||!Number.isFinite(b)) continue;
      const grade=((b-a)/dist)*100;
      const score=segment.type==='climb'?grade:-grade;
      if (!best || score>best.score) best={windowMeters,grade,score,startDistanceMeters:numberOrZero(points[start].distanceMeters),endDistanceMeters:numberOrZero(points[right].distanceMeters)};
    }
    return best;
  }).filter(Boolean);
  const vertical=segment.type==='climb'?segment.gainMeters:segment.lossMeters;
  const avg=Math.abs(segment.averageGrade);
  const difficultyScore=Math.round(vertical * (1 + avg/12) * (1 + Math.log10(1 + segment.distanceMeters/1000)));
  const difficulty=difficultyScore>=1600?'Extrême':difficultyScore>=900?'Très difficile':difficultyScore>=450?'Difficile':difficultyScore>=200?'Soutenu':'Modéré';
  return { bands, total, windows, difficultyScore, difficulty };
}

function renderRouteSegmentDetail(segment) {
  if (!ui.routeSegmentDetail) return;
  if (!segment) { ui.routeSegmentDetail.classList.add('hidden'); renderClimbSubsegments(null); return; }
  const analysis=segmentGradeAnalysis(segment);
  const label=segment.type==='climb'?`Montée #${segment.rank}`:`Descente #${segment.rank}`;
  ui.routeSegmentDetail.classList.remove('hidden');
  ui.routeSegmentDetailTitle.textContent=`${label} · analyse détaillée`;
  ui.routeSegmentDifficulty.textContent=`${analysis.difficulty} · ${analysis.difficultyScore} pts`;
  const vertical=segment.type==='climb'?segment.gainMeters:segment.lossMeters;
  const vals=[['Distance',`${(segment.distanceMeters/1000).toLocaleString('fr-FR',{maximumFractionDigits:2})} km`],[segment.type==='climb'?'D+':'D−',`${Math.round(vertical)} m`],['Pente moyenne',`${Math.abs(segment.averageGrade).toLocaleString('fr-FR',{maximumFractionDigits:1})} %`],['Pente max.',Number.isFinite(segment.maxGrade)?`${Math.abs(segment.maxGrade).toLocaleString('fr-FR',{maximumFractionDigits:1})} %`:'—']];
  ui.routeSegmentDetailStats.innerHTML=vals.map(([k,v])=>`<div class="route-segment-detail-stat"><span>${k}</span><strong>${v}</strong></div>`).join('');
  ui.routeGradeBands.innerHTML=analysis.bands.map((b)=>{const pct=analysis.total?Math.round(b.meters/analysis.total*100):0;return `<div class="route-grade-band ${b.cls}"><span>${b.label}</span><div class="route-grade-track"><div class="route-grade-fill" style="width:${pct}%"></div></div><strong>${pct} %</strong></div>`}).join('');
  ui.routeSteepestWindows.innerHTML=analysis.windows.length?analysis.windows.map((w)=>`<div class="route-steep-window"><span>${w.windowMeters} m les plus raides · km ${(w.startDistanceMeters/1000).toLocaleString('fr-FR',{maximumFractionDigits:2})}</span><strong>${Math.abs(w.grade).toLocaleString('fr-FR',{maximumFractionDigits:1})} %</strong></div>`).join(''):'<span class="muted">Segment trop court pour calculer les passages raides.</span>';
  renderClimbSubsegments(segment);
}

function selectRouteSegment(segment) {
  if (!segment?.points?.length || !activityMapInstance || !window.L) return;
  selectedRouteSegment = segment;
  if (activitySegmentHighlightLayer) {
    try { activityMapInstance.removeLayer(activitySegmentHighlightLayer); } catch (_) {}
  }
  activitySegmentHighlightLayer = window.L.polyline(
    segment.points.map((point) => [point.latitude, point.longitude]),
    {
      color: "#ffffff",
      weight: 9,
      opacity: 0.92,
      lineJoin: "round",
      lineCap: "round",
      interactive: false
    }
  ).addTo(activityMapInstance);
  activitySegmentHighlightLayer.bringToFront?.();
  const bounds = activitySegmentHighlightLayer.getBounds?.();
  if (bounds?.isValid?.()) activityMapInstance.fitBounds(bounds, { padding: [42, 42], maxZoom: 16 });

  document.querySelectorAll(".route-segment-card").forEach((node) => {
    node.classList.toggle("selected", node.dataset.segmentId === segment.id);
  });
  ui.routeAnalysisClearButton.disabled = false;
  profileSegmentHighlighter?.(segment);
  if (segment.type !== "kilometer") renderRouteSegmentDetail(segment);

  if (segment.type === "kilometer") return;
  const vertical = segment.type === "climb" ? segment.gainMeters : segment.lossMeters;
  const label = segment.type === "climb" ? `Montée #${segment.rank}` : `Descente #${segment.rank}`;
  ui.profileLive.textContent = `${label} · ${(segment.distanceMeters / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km · ${segment.type === "climb" ? "+" : "−"}${Math.round(vertical)} m · ${segment.averageGrade >= 0 ? "+" : ""}${segment.averageGrade.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % moy.`;
}

function clearRouteSegmentSelection() {
  selectedRouteSegment = null;
  if (activityMapInstance && activitySegmentHighlightLayer) {
    try { activityMapInstance.removeLayer(activitySegmentHighlightLayer); } catch (_) {}
  }
  activitySegmentHighlightLayer = null;
  document.querySelectorAll(".route-segment-card.selected").forEach((node) => node.classList.remove("selected"));
  if (ui.routeAnalysisClearButton) ui.routeAnalysisClearButton.disabled = true;
  if (ui.routeKmClearButton) ui.routeKmClearButton.disabled = true;
  profileSegmentHighlighter?.(null);
  if (ui.profileLive) ui.profileLive.textContent = "Survolez la carte ou le profil pour suivre votre position.";
  recenterActivityMap();
}


function populateRouteComparisonSelect(currentActivity) {
  if (!ui.routeComparisonSelect) return;
  const currentKey = activityKey(currentActivity);
  const candidates = activities
    .filter((activity) => activity.deleted_at_ms == null && activityKey(activity) !== currentKey)
    .sort((a,b) => numberOrZero(b.start_time_ms)-numberOrZero(a.start_time_ms));
  ui.routeComparisonSelect.innerHTML = '<option value="">Choisir une activité…</option>';
  for (const activity of candidates) {
    const option = document.createElement('option');
    option.value = activityKey(activity);
    option.textContent = `${formatDate(activity.start_time_ms)} · ${activity.custom_title || sportName(activity.sport)} · ${formatDistance(activity.distance_m)}`;
    ui.routeComparisonSelect.appendChild(option);
  }
  ui.routeComparisonButton.disabled = candidates.length === 0;
  ui.routeComparisonClearButton.disabled = true;
  ui.routeComparisonMetrics?.classList.add('hidden');
  ui.routeComparisonLegend?.classList.add('hidden');
  if (ui.routeComparisonStatus) ui.routeComparisonStatus.textContent = candidates.length
    ? 'Choisissez une activité pour superposer son tracé et son profil.'
    : 'Aucune autre activité disponible dans les données chargées.';
}

function signedMetric(value, formatter) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${formatter(n)}`;
}

function renderRouteComparisonMetrics(current, other) {
  if (!ui.routeComparisonMetrics) return;
  const durationDelta = numberOrZero(other.elapsed_time_ms) - numberOrZero(current.elapsed_time_ms);
  const distanceDelta = numberOrZero(other.distance_m) - numberOrZero(current.distance_m);
  const ascentDelta = numberOrZero(other.ascent_m) - numberOrZero(current.ascent_m);
  const rows = [
    ['Activité comparée', `${formatDate(other.start_time_ms)} · ${other.custom_title || sportName(other.sport)}`],
    ['Écart distance', signedMetric(distanceDelta, (v) => `${(v/1000).toLocaleString('fr-FR',{maximumFractionDigits:2})} km`)],
    ['Écart D+', signedMetric(ascentDelta, (v) => `${Math.round(v)} m`)],
    ['Écart durée', signedMetric(durationDelta, (v) => formatDuration(Math.abs(v)))],
  ];
  ui.routeComparisonMetrics.innerHTML = rows.map(([label,value]) => `<div class="route-comparison-metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
  ui.routeComparisonMetrics.classList.remove('hidden');
}

async function compareSelectedActivity() {
  const key = ui.routeComparisonSelect?.value || '';
  if (!key || !currentUser || !activeRoute || !activityMapInstance) return;
  const other = activities.find((activity) => activityKey(activity) === key);
  if (!other) return;
  ui.routeComparisonButton.disabled = true;
  ui.routeComparisonStatus.textContent = 'Chargement du tracé de comparaison…';
  try {
    const snapshot = await getDoc(doc(db, ROOT, currentUser.uid, 'activity_routes', key));
    if (!snapshot.exists()) throw new Error('Tracé Web non publié pour cette activité.');
    const route = normalizeRoute(snapshot.data());
    if (route.points.length < 2) throw new Error('Tracé de comparaison insuffisant.');
    clearRouteComparison(false);
    comparedActivity = other;
    comparedRoute = route;
    drawComparisonRouteLayer(route);
    profileComparisonRenderer?.(route);
    renderRouteComparisonMetrics(activities.find((activity) => activityKey(activity) === currentDetailId) || {}, other);
    ui.routeComparisonLegend?.classList.remove('hidden');
    ui.routeComparisonClearButton.disabled = false;
    ui.routeComparisonStatus.textContent = `${formatDate(other.start_time_ms)} · ${formatDistance(other.distance_m)} · ${formatMeters(other.ascent_m)} D+`;
  } catch (error) {
    ui.routeComparisonStatus.textContent = error?.message || 'Comparaison impossible.';
  } finally {
    ui.routeComparisonButton.disabled = false;
  }
}

function drawComparisonRouteLayer(route) {
  if (!activityMapInstance || !window.L || !route?.points?.length) return;
  if (comparisonRouteLayer) {
    try { activityMapInstance.removeLayer(comparisonRouteLayer); } catch (_) {}
  }
  comparisonRouteLayer = window.L.polyline(route.points.map((p) => [p.latitude,p.longitude]), {
    color:'#38a7ff', weight:4, opacity:.92, dashArray:'10 7', lineJoin:'round', lineCap:'round', interactive:false
  }).addTo(activityMapInstance);
  const combined = window.L.latLngBounds(activeRoute.points.map((p)=>[p.latitude,p.longitude]));
  combined.extend(window.L.latLngBounds(route.points.map((p)=>[p.latitude,p.longitude])));
  if (combined.isValid()) activityMapInstance.fitBounds(combined,{padding:[34,34],maxZoom:16});
  activitySegmentHighlightLayer?.bringToFront?.();
}

function clearRouteComparison(updateStatus = true) {
  if (activityMapInstance && comparisonRouteLayer) {
    try { activityMapInstance.removeLayer(comparisonRouteLayer); } catch (_) {}
  }
  comparisonRouteLayer = null;
  comparedActivity = null;
  comparedRoute = null;
  profileComparisonClearer?.();
  if (ui.routeComparisonMetrics) ui.routeComparisonMetrics.classList.add('hidden');
  if (ui.routeComparisonLegend) ui.routeComparisonLegend.classList.add('hidden');
  if (ui.routeComparisonClearButton) ui.routeComparisonClearButton.disabled = true;
  if (updateStatus && ui.routeComparisonStatus) ui.routeComparisonStatus.textContent = 'Choisissez une activité pour superposer son tracé et son profil.';
  recenterActivityMap();
}

function renderLeafletMap(route) {
  if (!window.L) {
    throw new Error("Leaflet n'a pas pu être chargé.");
  }

  const latLngs = route.points.map((point) => [point.latitude, point.longitude]);

  activityMapInstance = window.L.map(ui.activityMap, {
    zoomControl: true,
    preferCanvas: true
  });

  activityBaseLayers = {
    osm: window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }),
    topo: window.L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: "© OpenStreetMap · SRTM · OpenTopoMap"
    })
  };

  const preferredLayer = ui.mapLayerSelect.value || "topo";
  activityBaseLayer = activityBaseLayers[preferredLayer] || activityBaseLayers.topo;
  activityBaseLayer.addTo(activityMapInstance);

  activityRouteBounds = window.L.latLngBounds(latLngs);
  redrawRouteOverlay();

  const start = route.points[0];
  const finish = route.points[route.points.length - 1];

  window.L.marker([start.latitude, start.longitude], {
    icon: routeEndIcon("D", false)
  }).addTo(activityMapInstance).bindTooltip("Départ");

  window.L.marker([finish.latitude, finish.longitude], {
    icon: routeEndIcon("A", true)
  }).addTo(activityMapInstance).bindTooltip("Arrivée");

  activityHoverMarker = window.L.circleMarker([start.latitude, start.longitude], {
    radius: 6,
    color: "#ffffff",
    weight: 2,
    fillColor: "#9cff22",
    fillOpacity: 1,
    interactive: false
  }).addTo(activityMapInstance);
  activityHoverMarker.bindTooltip("", { direction: "top", offset: [0, -6], opacity: 0.95 });

  renderKmMarkers(route);
  recenterActivityMap();

  activityMapInstance.on("mousemove", (event) => {
    if (!profileHoverUpdater) return;
    let bestPoint = null;
    let bestDistance = Infinity;
    for (const point of route.points) {
      if (!Number.isFinite(point.altitudeMeters)) continue;
      const distance = haversineMeters(
        event.latlng.lat,
        event.latlng.lng,
        point.latitude,
        point.longitude
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPoint = point;
      }
    }
    if (bestPoint) profileHoverUpdater(bestPoint);
  });

  ui.activityMap.onmouseleave = () => {
    if (profileHoverClearer) profileHoverClearer();
  };
}

function redrawRouteOverlay() {
  if (!activityMapInstance || !activeRoute?.points?.length) return;

  for (const layer of activityRouteLayers) {
    try { activityMapInstance.removeLayer(layer); } catch (_) {}
  }
  activityRouteLayers = [];
  activityRouteLayer = null;

  const mode = ui.mapRouteModeSelect?.value || "classic";
  if (ui.mapSlopeLegend) ui.mapSlopeLegend.classList.toggle("hidden", mode !== "slope");

  if (mode === "slope") {
    for (let i = 1; i < activeRoute.points.length; i++) {
      const p1 = activeRoute.points[i - 1];
      const p2 = activeRoute.points[i];
      const grade = Number.isFinite(p2.gradePercent) ? p2.gradePercent : p1.gradePercent;
      const layer = window.L.polyline(
        [[p1.latitude, p1.longitude], [p2.latitude, p2.longitude]],
        {
          color: gradeColor(grade),
          weight: 5,
          opacity: 0.96,
          lineJoin: "round",
          lineCap: "round",
          interactive: false
        }
      ).addTo(activityMapInstance);
      activityRouteLayers.push(layer);
    }
  } else {
    activityRouteLayer = window.L.polyline(
      activeRoute.points.map((point) => [point.latitude, point.longitude]),
      {
        color: "#9cff22",
        weight: 4,
        opacity: 0.94,
        lineJoin: "round",
        lineCap: "round",
        interactive: false
      }
    ).addTo(activityMapInstance);
    activityRouteLayers.push(activityRouteLayer);
  }
  activitySegmentHighlightLayer?.bringToFront?.();
}

function gradeColor(rawGrade) {
  const grade = Number(rawGrade);
  if (!Number.isFinite(grade)) return "#9cff22";
  if (grade <= -6) return "#38a7ff";
  if (grade < -2) return "#63c7ff";
  if (grade < 3) return "#9cff22";
  if (grade < 7) return "#ffe55c";
  if (grade < 12) return "#ff9e42";
  return "#ff5a57";
}

function routeMarkerStepKm(route) {
  const totalKm = numberOrZero(route?.points?.[route.points.length - 1]?.distanceMeters) / 1000;
  if (totalKm <= 30) return 1;
  if (totalKm <= 100) return 5;
  if (totalKm <= 250) return 10;
  return 20;
}

function renderKmMarkers(route) {
  if (!activityMapInstance || !window.L || !route?.points?.length) return;
  if (activityKmMarkersLayer) {
    activityMapInstance.removeLayer(activityKmMarkersLayer);
    activityKmMarkersLayer = null;
  }

  const group = window.L.layerGroup();
  const stepKm = routeMarkerStepKm(route);
  const maxDistance = numberOrZero(route.points[route.points.length - 1].distanceMeters);

  for (let km = stepKm; km * 1000 < maxDistance - 100; km += stepKm) {
    const target = km * 1000;
    let best = route.points[0];
    let bestDelta = Infinity;
    for (const point of route.points) {
      const delta = Math.abs(numberOrZero(point.distanceMeters) - target);
      if (delta < bestDelta) {
        best = point;
        bestDelta = delta;
      }
    }

    const marker = window.L.marker([best.latitude, best.longitude], {
      interactive: false,
      icon: window.L.divIcon({
        className: "route-km-icon",
        html: `<span>${km}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      })
    });
    group.addLayer(marker);
  }

  activityKmMarkersLayer = group;
  if (showKmMarkers) group.addTo(activityMapInstance);
  updateKmMarkerButton();
}

function toggleKmMarkers() {
  showKmMarkers = !showKmMarkers;
  if (activityMapInstance && activityKmMarkersLayer) {
    if (showKmMarkers) activityKmMarkersLayer.addTo(activityMapInstance);
    else activityMapInstance.removeLayer(activityKmMarkersLayer);
  }
  updateKmMarkerButton();
}

function updateKmMarkerButton() {
  if (!ui.mapKmMarkersToggle) return;
  ui.mapKmMarkersToggle.classList.toggle("active", showKmMarkers);
  ui.mapKmMarkersToggle.setAttribute("aria-pressed", showKmMarkers ? "true" : "false");
  ui.mapKmMarkersToggle.textContent = showKmMarkers ? "Km ✓" : "Km";
}

function recenterActivityMap() {
  if (!activityMapInstance || !activityRouteBounds?.isValid?.()) return;
  activityMapInstance.fitBounds(activityRouteBounds, { padding: [28, 28], maxZoom: 16 });
}

function routeEndIcon(letter, finish) {
  return window.L.divIcon({
    className: `route-end-icon${finish ? " finish" : ""}`,
    html: letter,
    iconSize: [27, 27],
    iconAnchor: [13, 13]
  });
}

function switchBaseLayer(key) {
  if (!activityMapInstance || !activityBaseLayers[key]) return;
  if (activityBaseLayer) activityMapInstance.removeLayer(activityBaseLayer);
  activityBaseLayer = activityBaseLayers[key];
  activityBaseLayer.addTo(activityMapInstance);
  for (const layer of activityRouteLayers) {
    if (typeof layer?.bringToFront === "function") layer.bringToFront();
  }
  comparisonRouteLayer?.bringToFront?.();
  activitySegmentHighlightLayer?.bringToFront?.();
  if (activityKmMarkersLayer && showKmMarkers && activityMapInstance.hasLayer(activityKmMarkersLayer)) {
    activityKmMarkersLayer.eachLayer((layer) => layer.setZIndexOffset?.(600));
  }
}

async function toggleMapFullscreen() {
  if (!ui.mapStage) return;
  try {
    if (document.fullscreenElement === ui.mapStage) {
      await document.exitFullscreen();
    } else if (ui.mapStage.requestFullscreen) {
      await ui.mapStage.requestFullscreen();
    }
  } catch (error) {
    console.warn("Plein écran indisponible", error);
  }
}

function handleFullscreenChange() {
  const active = document.fullscreenElement === ui.mapStage;
  ui.mapFullscreenButton.textContent = active ? "✕ Quitter plein écran" : "⛶ Plein écran";
  window.setTimeout(() => activityMapInstance?.invalidateSize(false), 80);
}

function renderElevationProfile(route) {
  const svg = ui.elevationProfile;
  svg.innerHTML = "";
  profileHoverUpdater = null;
  profileHoverClearer = null;
  profileSegmentHighlighter = null;
  profileComparisonRenderer = null;
  profileComparisonClearer = null;

  const altitudePoints = route.points.filter((point) => Number.isFinite(point.altitudeMeters));
  if (altitudePoints.length < 2) {
    const message = svgText(500, 120, "Altitude indisponible pour ce tracé", "profile-hover-label");
    message.setAttribute("text-anchor", "middle");
    svg.appendChild(message);
    return;
  }

  const W = 1000;
  const H = 240;
  const left = 54;
  const right = 20;
  const top = 20;
  const bottom = 42;
  const plotW = W - left - right;
  const plotH = H - top - bottom;

  const maxDistance = Math.max(
    1,
    ...altitudePoints.map((point) => numberOrZero(point.distanceMeters))
  );
  const minAltitude = Math.min(...altitudePoints.map((point) => point.altitudeMeters));
  const maxAltitude = Math.max(...altitudePoints.map((point) => point.altitudeMeters));
  const altitudeSpan = Math.max(20, maxAltitude - minAltitude);
  const yMin = minAltitude - altitudeSpan * 0.08;
  const yMax = maxAltitude + altitudeSpan * 0.08;

  const xFor = (distanceMeters) =>
    left + (Math.max(0, distanceMeters) / maxDistance) * plotW;
  const yFor = (altitudeMeters) =>
    top + ((yMax - altitudeMeters) / Math.max(1, yMax - yMin)) * plotH;

  for (let i = 0; i <= 4; i++) {
    const y = top + (plotH * i) / 4;
    const grid = document.createElementNS("http://www.w3.org/2000/svg", "line");
    grid.setAttribute("x1", left);
    grid.setAttribute("x2", W - right);
    grid.setAttribute("y1", y);
    grid.setAttribute("y2", y);
    grid.setAttribute("class", "profile-grid-line");
    svg.appendChild(grid);

    const altitudeLabel = yMax - ((yMax - yMin) * i) / 4;
    const label = svgText(left - 8, y + 7, `${Math.round(altitudeLabel)} m`, "profile-label");
    label.setAttribute("text-anchor", "end");
    svg.appendChild(label);
  }

  const plotPoints = altitudePoints.map((point) => [
    xFor(point.distanceMeters),
    yFor(point.altitudeMeters),
    point
  ]);

  const lineD = plotPoints
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");

  const areaD =
    `${lineD} L${plotPoints[plotPoints.length - 1][0].toFixed(2)},${(top + plotH).toFixed(2)} `
    + `L${plotPoints[0][0].toFixed(2)},${(top + plotH).toFixed(2)} Z`;

  const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
  area.setAttribute("d", areaD);
  area.setAttribute("class", "profile-area");
  svg.appendChild(area);

  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line.setAttribute("d", lineD);
  line.setAttribute("class", "profile-line");
  svg.appendChild(line);

  const segmentHighlight = document.createElementNS("http://www.w3.org/2000/svg", "path");
  segmentHighlight.setAttribute("class", "profile-segment-highlight");
  segmentHighlight.setAttribute("visibility", "hidden");
  svg.appendChild(segmentHighlight);

  profileSegmentHighlighter = (segment) => {
    if (!segment?.points?.length) {
      segmentHighlight.setAttribute("visibility", "hidden");
      return;
    }
    const selectedPoints = segment.points.filter((point) => Number.isFinite(point.altitudeMeters));
    if (selectedPoints.length < 2) {
      segmentHighlight.setAttribute("visibility", "hidden");
      return;
    }
    const d = selectedPoints.map((point, index) =>
      `${index === 0 ? "M" : "L"}${xFor(point.distanceMeters).toFixed(2)},${yFor(point.altitudeMeters).toFixed(2)}`
    ).join(" ");
    segmentHighlight.setAttribute("d", d);
    segmentHighlight.setAttribute("visibility", "visible");
  };

  svg.appendChild(svgText(left, H - 11, "0 km", "profile-label"));
  const endLabel = svgText(
    W - right,
    H - 11,
    `${(maxDistance / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`,
    "profile-label"
  );
  endLabel.setAttribute("text-anchor", "end");
  svg.appendChild(endLabel);

  let comparisonProfileLine = null;
  profileComparisonClearer = () => {
    if (comparisonProfileLine?.parentNode) comparisonProfileLine.parentNode.removeChild(comparisonProfileLine);
    comparisonProfileLine = null;
  };
  profileComparisonRenderer = (routeToCompare) => {
    profileComparisonClearer?.();
    const comparePoints = (routeToCompare?.points || []).filter((point) => Number.isFinite(point.altitudeMeters));
    if (comparePoints.length < 2) return;
    const compareD = comparePoints.map((point, index) => {
      const x = xFor(Math.min(maxDistance, numberOrZero(point.distanceMeters)));
      const rawY = yFor(point.altitudeMeters);
      const y = Math.max(top, Math.min(top + plotH, rawY));
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
    comparisonProfileLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    comparisonProfileLine.setAttribute("d", compareD);
    comparisonProfileLine.setAttribute("class", "profile-comparison-line");
    svg.appendChild(comparisonProfileLine);
  };

  const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  hoverLine.setAttribute("class", "profile-hover-line");
  hoverLine.setAttribute("y1", top);
  hoverLine.setAttribute("y2", top + plotH);
  hoverLine.setAttribute("visibility", "hidden");
  svg.appendChild(hoverLine);

  const hoverDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  hoverDot.setAttribute("class", "profile-hover-dot");
  hoverDot.setAttribute("r", "6");
  hoverDot.setAttribute("visibility", "hidden");
  svg.appendChild(hoverDot);

  const hoverText = svgText(left + 12, top + 28, "", "profile-hover-label");
  hoverText.setAttribute("visibility", "hidden");
  svg.appendChild(hoverText);

  const updateHoverForPoint = (requestedPoint) => {
    let bestIndex = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < plotPoints.length; i++) {
      const point = plotPoints[i][2];
      const delta = Math.abs(point.distanceMeters - requestedPoint.distanceMeters);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = i;
      }
    }

    const [x, y, point] = plotPoints[bestIndex];
    hoverLine.setAttribute("x1", x);
    hoverLine.setAttribute("x2", x);
    hoverLine.setAttribute("visibility", "visible");
    hoverDot.setAttribute("cx", x);
    hoverDot.setAttribute("cy", y);
    hoverDot.setAttribute("visibility", "visible");

    const km = point.distanceMeters / 1000;
    const gain = numberOrZero(point.cumulativeAscentMeters);
    const grade = Number.isFinite(point.gradePercent)
      ? `${point.gradePercent >= 0 ? "+" : ""}${point.gradePercent.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`
      : "pente —";
    const compact = `${km.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km · ${Math.round(point.altitudeMeters)} m · ${grade}`;
    hoverText.textContent = compact;
    hoverText.setAttribute("x", Math.min(W - 260, Math.max(left + 10, x + 12)));
    hoverText.setAttribute("visibility", "visible");

    ui.profileLive.textContent =
      `${compact} · D+ cumulé ${Math.round(gain).toLocaleString("fr-FR")} m`;

    if (activityHoverMarker) {
      activityHoverMarker.setLatLng([point.latitude, point.longitude]);
      activityHoverMarker.setTooltipContent(
        `${km.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km · ${Math.round(point.altitudeMeters)} m · ${grade} · D+ ${Math.round(gain)} m`
      );
      activityHoverMarker.openTooltip();
    }
  };

  const clearHover = () => {
    hoverLine.setAttribute("visibility", "hidden");
    hoverDot.setAttribute("visibility", "hidden");
    hoverText.setAttribute("visibility", "hidden");
    ui.profileLive.textContent = "Survolez la carte ou le profil pour suivre votre position.";
    activityHoverMarker?.closeTooltip();
  };

  profileHoverUpdater = updateHoverForPoint;
  profileHoverClearer = clearHover;

  svg.addEventListener("pointermove", (event) => {
    const box = svg.getBoundingClientRect();
    if (box.width <= 0) return;

    const x = ((event.clientX - box.left) / box.width) * W;
    const clamped = Math.max(left, Math.min(W - right, x));
    const ratio = (clamped - left) / plotW;
    const targetDistance = ratio * maxDistance;

    let bestPoint = altitudePoints[0];
    let bestDelta = Infinity;
    for (const point of altitudePoints) {
      const delta = Math.abs(point.distanceMeters - targetDistance);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestPoint = point;
      }
    }
    updateHoverForPoint(bestPoint);
  });

  svg.addEventListener("pointerleave", clearHover);
}

function svgText(x, y, content, className) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
  node.setAttribute("x", x);
  node.setAttribute("y", y);
  node.setAttribute("class", className);
  node.textContent = content;
  return node;
}

function showRouteUnavailable(message) {
  destroyActivityMap();
  ui.mapStatus.textContent = "Tracé indisponible";
  ui.mapStatus.className = "pill neutral";
  ui.profileMeta.textContent = "";
  ui.profileLive.textContent = "Aucun profil disponible.";
  ui.routeStats.innerHTML = "";
  if (ui.routeSegmentList) ui.routeSegmentList.innerHTML = "";
  if (ui.routeAnalysisMeta) ui.routeAnalysisMeta.textContent = "";
  if (ui.routeAnalysisClearButton) ui.routeAnalysisClearButton.disabled = true;
  ui.elevationProfile.innerHTML = "";

  ui.activityMap.className = "activity-map route-empty";
  ui.activityMap.textContent = message;
}

function destroyActivityMap() {
  if (activityMapInstance) {
    activityMapInstance.remove();
    activityMapInstance = null;
  }
  activityRouteLayer = null;
  activityRouteLayers = [];
  activityKmMarkersLayer = null;
  activityRouteBounds = null;
  activityHoverMarker = null;
  activitySegmentHighlightLayer = null;
  selectedRouteSegment = null;
  activityBaseLayers = {};
  activityBaseLayer = null;
  activeRoute = null;
  profileHoverUpdater = null;
  profileHoverClearer = null;
  profileSegmentHighlighter = null;
  if (ui.routeSegmentList) ui.routeSegmentList.innerHTML = "";
  if (ui.routeAnalysisMeta) ui.routeAnalysisMeta.textContent = "";
  if (ui.routeAnalysisClearButton) ui.routeAnalysisClearButton.disabled = true;

  if (ui.activityMap) {
    ui.activityMap.className = "activity-map";
    ui.activityMap.textContent = "";
  }
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}


function resetPerformanceTerrainAnalysis(activity) {
  if (!ui.performanceTerrainMetrics) return;
  ui.performanceTerrainMeta.textContent = "En attente du tracé GPS pour contextualiser la performance.";
  ui.performanceBenchmarkBadge.textContent = "Benchmark";
  ui.performanceBenchmarkBadge.className = "pill neutral";
  ui.performanceTerrainMetrics.innerHTML = "";
  ui.performanceGradeDistribution.innerHTML = "";
  ui.performanceBenchmark.innerHTML = "";
  ui.performanceInsight.innerHTML = "";
  resetPerformanceProgression();

  const basic = [
    ["Allure / vitesse", primarySpeedMetric(activity)],
    ["FC moyenne", formatHeartRate(activity.avg_hr)],
    ["FC maximale", formatHeartRate(activity.max_hr)],
    ["D+", formatMeters(activity.ascent_m)]
  ];
  for (const [label,value] of basic) {
    const box=document.createElement("div");
    box.className="performance-terrain-metric";
    box.innerHTML=`<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
    ui.performanceTerrainMetrics.appendChild(box);
  }
}


function renderRecurringLandmarkHistory(activity) {
  if (!ui.recurringLandmarksList || !ui.recurringLandmarksMeta) return;
  const links = linksForActivity(activity);
  ui.recurringLandmarksList.innerHTML = "";

  if (!links.length) {
    ui.recurringLandmarksMeta.textContent = "Aucun repère personnel lié à cette activité.";
    ui.recurringLandmarksList.innerHTML =
      '<div class="recurring-empty">Aucun repère associé. La reconnaissance géographique des ascensions reste disponible.</div>';
    return;
  }

  let totalOccurrences = 0;
  for (const link of links) {
    const code = String(link.landmark_code ?? "?");
    const currentOccurrences = Math.max(1, numberOrZero(link.occurrences));
    totalOccurrences += currentOccurrences;
    const meta = landmarks.get(code) || {};
    const usage = landmarkUsage(code);

    const card = document.createElement("article");
    card.className = "recurring-landmark-card";
    card.innerHTML = `
      <div class="recurring-landmark-code">${escapeHtml(code)}</div>
      <div class="recurring-landmark-main">
        <strong>${escapeHtml(meta.name || `Repère ${code}`)}</strong>
        <span>${escapeHtml(meta.landmark_type || "Repère")} · ${usage.hasReference ? "référence GPS" : "sans référence GPS"}</span>
      </div>
      <div class="recurring-landmark-stats">
        <span><b>${formatNumber(currentOccurrences)}</b> sur cette activité</span>
        <span><b>${formatNumber(usage.activityLinks)}</b> activité(s)</span>
        <span><b>${formatNumber(usage.occurrences)}</b> passage(s) total</span>
      </div>`;
    ui.recurringLandmarksList.appendChild(card);
  }

  ui.recurringLandmarksMeta.textContent =
    `${links.length} repère(s) lié(s) · ${formatNumber(totalOccurrences)} occurrence(s) sur cette activité`;
}

function resetRecurringClimbAnalysis() {
  recurringClimbScanToken++;
  recurringClimbScanBusy = false;
  if (ui.recurringClimbsList) ui.recurringClimbsList.innerHTML = "";
  if (ui.recurringClimbsStatus) {
    ui.recurringClimbsStatus.textContent =
      "Lancez l’analyse pour comparer les montées de cette activité aux tracés GPS du catalogue chargé.";
  }
  if (ui.scanRecurringClimbsButton) {
    ui.scanRecurringClimbsButton.disabled = !activeRoute;
    ui.scanRecurringClimbsButton.textContent = "Analyser les ascensions récurrentes";
  }
}

function climbGeometry(segment) {
  if (!segment?.points?.length) return null;
  const first = segment.points[0];
  const last = segment.points[segment.points.length - 1];
  return {
    startLat: Number(first.latitude),
    startLon: Number(first.longitude),
    endLat: Number(last.latitude),
    endLon: Number(last.longitude),
    distanceMeters: numberOrZero(segment.distanceMeters),
    gainMeters: numberOrZero(segment.gainMeters),
    averageGrade: Number(segment.averageGrade)
  };
}

function recurringClimbsMatch(reference, candidate) {
  const a = climbGeometry(reference);
  const b = climbGeometry(candidate);
  if (!a || !b) return false;

  const startGap = haversineMeters(a.startLat, a.startLon, b.startLat, b.startLon);
  const endGap = haversineMeters(a.endLat, a.endLon, b.endLat, b.endLon);
  if (startGap > 300 || endGap > 300) return false;

  const distanceRatio = Math.max(a.distanceMeters, b.distanceMeters) /
    Math.max(1, Math.min(a.distanceMeters, b.distanceMeters));
  const gainRatio = Math.max(a.gainMeters, b.gainMeters) /
    Math.max(1, Math.min(a.gainMeters, b.gainMeters));

  if (distanceRatio > 1.35 || gainRatio > 1.45) return false;

  if (Number.isFinite(a.averageGrade) && Number.isFinite(b.averageGrade)
      && Math.abs(a.averageGrade - b.averageGrade) > 4.5) return false;

  return true;
}

function recurringClimbMatchScore(reference, candidate) {
  const a = climbGeometry(reference), b = climbGeometry(candidate);
  if (!a || !b) return Infinity;
  const startGap = haversineMeters(a.startLat, a.startLon, b.startLat, b.startLon);
  const endGap = haversineMeters(a.endLat, a.endLon, b.endLat, b.endLon);
  const distanceDelta = Math.abs(a.distanceMeters - b.distanceMeters) / Math.max(1, a.distanceMeters);
  const gainDelta = Math.abs(a.gainMeters - b.gainMeters) / Math.max(1, a.gainMeters);
  return startGap + endGap + distanceDelta * 250 + gainDelta * 250;
}


function nextAscensionLandmarkCode() {
  for (let index = 1; index <= 999; index++) {
    const code = `A${String(index).padStart(2, "0")}`;
    if (!landmarks.has(code)) return code;
  }
  return `A${Date.now().toString().slice(-5)}`.slice(0, 8);
}

function validActivityForLandmarkLink(activity) {
  const activityId = Number(activity?.id ?? activity?.__docId);
  return Number.isFinite(activityId) && activityId > 0;
}

async function createOfficialLandmarkFromRecurringClimb(reference, matches = []) {
  const activity = currentDetailActivity();
  if (!activity || !reference) return;

  const suggestedCode = nextAscensionLandmarkCode();
  const suggestedName =
    `Ascension ${(reference.distanceMeters / 1000).toLocaleString("fr-FR", {maximumFractionDigits: 2})} km +${Math.round(reference.gainMeters)} m`;

  const nameRaw = window.prompt(
    "Nom du nouveau repère d’ascension :",
    suggestedName
  );
  if (nameRaw === null) return;

  const name = String(nameRaw).trim();
  if (!name) {
    setMessage("WEB028 · création annulée : le nom du repère est obligatoire.", "error");
    return;
  }

  const codeRaw = window.prompt(
    "Code du repère (1 à 8 caractères, lettres/chiffres/_/-) :",
    suggestedCode
  );
  if (codeRaw === null) return;

  const code = normalizeLandmarkCode(codeRaw);
  const row = {
    code,
    name,
    landmark_type: "Ascension",
    sort_order: nextLandmarkSortOrder()
  };

  try {
    validateLandmarkRow(row, true);
  } catch (error) {
    handleError(error, "Création du repère refusée");
    return;
  }

  const recognizedActivities = matches
    .map((match) => match.activity)
    .filter(validActivityForLandmarkLink);

  const linkHistory = recognizedActivities.length > 0 &&
    window.confirm(
      `${recognizedActivities.length} autre(s) passage(s) de cette ascension ont été reconnus.\n\n` +
      "OK : associer aussi ces passages historiques au nouveau repère.\n" +
      "Annuler : associer uniquement l’activité courante."
    );

  const totalLinks = 1 + (linkHistory ? recognizedActivities.length : 0);
  const confirmed = window.confirm(
    `Créer le repère « ${name} » (${code}) de type Ascension et l’associer à ${totalLinks} activité(s) ?`
  );
  if (!confirmed) return;

  setMessage("WEB028 · création du repère et synchronisation en cours…", "info");

  try {
    await commitWebMutation({
      table: "personal_landmarks",
      rowKey: row.code,
      operation: "UPSERT",
      row,
      materializedCollection: "landmarks",
      materializedData: row,
      metaIncrements: {
        landmarkCount: 1,
        expectedDocuments: 1
      }
    });

    landmarks.set(row.code, row);
    adjustMetric(ui.landmarkCount, 1);
    adjustMetric(ui.expectedDocuments, 1);
    rebuildLandmarkFilter();
    renderLandmarkManager();

    const targets = [activity, ...(linkHistory ? recognizedActivities : [])];
    let linked = 0;
    let skipped = 0;

    for (const target of targets) {
      if (!validActivityForLandmarkLink(target)) {
        skipped++;
        continue;
      }
      try {
        await setLandmarkOccurrence(target, row.code, 1);
        linked++;
      } catch (error) {
        console.error("WEB028 landmark link", error);
        skipped++;
      }
    }

    renderPersonal(activity);
    renderRecurringLandmarkHistory(activity);
    setMessage(
      `WEB028 · repère « ${name} » créé et associé à ${linked} activité(s)` +
      (skipped ? ` · ${skipped} association(s) ignorée(s)` : "") +
      ".",
      skipped ? "info" : "success"
    );

    // Rejoue l'analyse afin que le nouveau repère et son historique soient visibles immédiatement.
    window.setTimeout(() => {
      if (currentDetailActivity() && activityKey(currentDetailActivity()) === activityKey(activity)) {
        void analyzeRecurringClimbsForCurrentActivity();
      }
    }, 250);
  } catch (error) {
    console.error(error);
    handleError(error, "Création du repère d’ascension impossible");
  }
}

async function analyzeRecurringClimbsForCurrentActivity() {
  const activity = currentDetailActivity();
  if (!activity || !activeRoute || recurringClimbScanBusy) return;

  const currentClimbs = (activeRoute.segments || detectRouteSegments(activeRoute))
    .filter((segment) => segment.type === "climb");

  if (!currentClimbs.length) {
    ui.recurringClimbsStatus.textContent = "Aucune ascension significative détectée sur l’activité courante.";
    ui.recurringClimbsList.innerHTML = "";
    return;
  }

  recurringClimbScanBusy = true;
  const token = ++recurringClimbScanToken;
  ui.scanRecurringClimbsButton.disabled = true;
  ui.scanRecurringClimbsButton.textContent = "Analyse…";
  ui.recurringClimbsList.innerHTML = "";

  const currentKey = activityKey(activity);
  const candidates = activities.filter((row) =>
    row.deleted_at_ms == null &&
    activityKey(row) !== currentKey &&
    numberOrZero(row.gps_point_count) > 1
  );

  ui.recurringClimbsStatus.textContent =
    `Comparaison de ${currentClimbs.length} montée(s) avec ${formatNumber(candidates.length)} activité(s) GPS chargée(s)…`;

  try {
    let completed = 0;
    const routes = await mapWithConcurrency(candidates, async (row) => {
      const route = await loadGlobalRoute(row);
      completed++;
      if (token === recurringClimbScanToken && (completed % 10 === 0 || completed === candidates.length)) {
        ui.recurringClimbsStatus.textContent =
          `Lecture des tracés : ${formatNumber(completed)} / ${formatNumber(candidates.length)}…`;
      }
      return route ? { activity: row, route } : null;
    }, 8);

    if (token !== recurringClimbScanToken) return;

    const routeRows = routes.filter(Boolean).map((item) => ({
      ...item,
      climbs: detectRouteSegments(item.route).filter((segment) => segment.type === "climb")
    }));

    let recurrentCount = 0;
    for (const reference of currentClimbs) {
      const matches = [];
      for (const item of routeRows) {
        const same = item.climbs
          .filter((climb) => recurringClimbsMatch(reference, climb))
          .sort((a,b) => recurringClimbMatchScore(reference,a) - recurringClimbMatchScore(reference,b))[0];
        if (same) matches.push({ activity: item.activity, climb: same });
      }

      matches.sort((a,b) => numberOrZero(b.activity.start_time_ms)-numberOrZero(a.activity.start_time_ms));
      if (matches.length) recurrentCount++;

      const card = document.createElement("article");
      card.className = `recurring-climb-card${matches.length ? " recurrent" : ""}`;
      const latest = matches.slice(0,5).map((match) =>
        `${formatDate(match.activity.start_time_ms)} · ${escapeHtml(match.activity.custom_title || sportName(match.activity.sport))}`
      ).join("<br>");
      card.innerHTML = `
        <div class="recurring-climb-head">
          <div>
            <span class="route-segment-title">Montée #${reference.rank}</span>
            <strong>${(reference.distanceMeters/1000).toLocaleString("fr-FR",{maximumFractionDigits:2})} km · +${Math.round(reference.gainMeters)} m</strong>
          </div>
          <span class="pill ${matches.length ? "ok" : "neutral"}">${matches.length + 1} passage${matches.length ? "s" : ""}</span>
        </div>
        <div class="recurring-climb-meta">
          ${reference.averageGrade.toLocaleString("fr-FR",{maximumFractionDigits:1})} % moy. ·
          départ/arrivée comparés à ±300 m · distance/D+ tolérés
        </div>
        <div class="recurring-climb-history">
          ${matches.length ? `<strong>Autres passages reconnus</strong><span>${latest}</span>` : '<span>Aucun autre passage reconnu dans le catalogue chargé.</span>'}
        </div>
        <div class="recurring-climb-actions">
          <button type="button" class="secondary recurring-climb-select">Voir sur carte / profil</button>
          <button type="button" class="primary recurring-climb-promote">Valider comme repère</button>
        </div>`;

      card.querySelector(".recurring-climb-select")?.addEventListener("click", (event) => {
        event.stopPropagation();
        selectRouteSegment(reference);
      });
      card.querySelector(".recurring-climb-promote")?.addEventListener("click", (event) => {
        event.stopPropagation();
        void createOfficialLandmarkFromRecurringClimb(reference, matches);
      });
      card.addEventListener("click", () => selectRouteSegment(reference));
      ui.recurringClimbsList.appendChild(card);
    }

    ui.recurringClimbsStatus.textContent =
      `${recurrentCount} ascension(s) récurrente(s) reconnue(s) sur ${currentClimbs.length} · ` +
      `${formatNumber(routeRows.length)} tracé(s) comparés · validation manuelle disponible.`;
  } catch (error) {
    console.error(error);
    ui.recurringClimbsStatus.textContent = `Analyse impossible : ${error?.message || String(error)}`;
  } finally {
    if (token === recurringClimbScanToken) {
      recurringClimbScanBusy = false;
      ui.scanRecurringClimbsButton.disabled = false;
      ui.scanRecurringClimbsButton.textContent = "Analyser les ascensions récurrentes";
    }
  }
}

function routeTerrainAnalysis(route) {
  const points=route?.points || [];
  if (points.length < 2) return null;
  let total=0, climb10=0, climb15=0, descent10=0, flat=0;
  const bands=[
    {label:"Descente ≤ −10 %", key:"down", meters:0},
    {label:"−10 à +3 %", key:"easy", meters:0},
    {label:"+3 à +10 %", key:"moderate", meters:0},
    {label:"+10 à +15 %", key:"hard", meters:0},
    {label:"≥ +15 %", key:"extreme", meters:0}
  ];
  for(let i=1;i<points.length;i++){
    const dx=Math.max(0,numberOrZero(points[i].distanceMeters)-numberOrZero(points[i-1].distanceMeters));
    if(!dx) continue;
    const g=Number(points[i].gradePercent);
    if(!Number.isFinite(g)) continue;
    total+=dx;
    if(g<=-10){descent10+=dx;bands[0].meters+=dx;}
    else if(g<3){flat+=dx;bands[1].meters+=dx;}
    else if(g<10){bands[2].meters+=dx;}
    else if(g<15){climb10+=dx;bands[3].meters+=dx;}
    else {climb10+=dx;climb15+=dx;bands[4].meters+=dx;}
  }
  const stats=routeStatsForAnalysis(route);
  return {
    total,
    bands,
    climb10Pct: total ? climb10/total*100 : 0,
    climb15Pct: total ? climb15/total*100 : 0,
    descent10Pct: total ? descent10/total*100 : 0,
    flatPct: total ? flat/total*100 : 0,
    ...stats
  };
}

function routeStatsForAnalysis(route){
  const pts=route?.points||[];
  const alts=pts.map(p=>Number(p.altitudeMeters)).filter(Number.isFinite);
  const distance=pts.length?numberOrZero(pts[pts.length-1].distanceMeters):0;
  const ascent=pts.length?numberOrZero(pts[pts.length-1].cumulativeAscentMeters):0;
  return {
    distanceMeters:distance,
    ascentMeters:ascent,
    ascentPerKm:distance>0?ascent/(distance/1000):0,
    minAltitude:alts.length?Math.min(...alts):null,
    maxAltitude:alts.length?Math.max(...alts):null,
    altitudeRange:alts.length?Math.max(...alts)-Math.min(...alts):null
  };
}

function comparableActivities(activity) {
  const distance=numberOrZero(activity.distance_m);
  const ascent=numberOrZero(activity.ascent_m);
  const density=distance>0?ascent/(distance/1000):0;
  const key=activityKey(activity);

  return activities.filter((row)=>{
    if(activityKey(row)===key || row.deleted_at_ms!=null) return false;
    if(Number(row.sport)!==Number(activity.sport)) return false;
    const d=numberOrZero(row.distance_m);
    if(!distance || !d) return false;
    if(d < distance*0.75 || d > distance*1.25) return false;
    const rd=numberOrZero(row.ascent_m);
    const rowDensity=d>0?rd/(d/1000):0;
    const tolerance=Math.max(25,density*0.45);
    return Math.abs(rowDensity-density)<=tolerance;
  });
}

function benchmarkPerformance(activity) {
  const peers=comparableActivities(activity);
  const currentSpeed=averageSpeedKmh(activity);
  const speeds=peers.map(averageSpeedKmh).filter(v=>Number.isFinite(v)&&v>0);
  const hrs=peers.map(r=>Number(r.avg_hr)).filter(v=>Number.isFinite(v)&&v>0);
  let rank=null;
  if(Number.isFinite(currentSpeed) && currentSpeed>0 && speeds.length){
    rank=1+speeds.filter(v=>v>currentSpeed).length;
  }
  const avgPeerSpeed=speeds.length?speeds.reduce((a,b)=>a+b,0)/speeds.length:null;
  const avgPeerHr=hrs.length?hrs.reduce((a,b)=>a+b,0)/hrs.length:null;
  return {peers,rank,avgPeerSpeed,avgPeerHr};
}

function formatBenchmarkSpeed(activity, speed){
  if(!Number.isFinite(speed)||speed<=0) return "—";
  const sport=Number(activity?.sport);
  if([1,6,11,17].includes(sport)){
    const seconds=Math.round(3600/speed);
    const minutes=Math.floor(seconds/60), rest=seconds%60;
    return `${minutes}:${String(rest).padStart(2,"0")} /km`;
  }
  return `${speed.toLocaleString("fr-FR",{maximumFractionDigits:1})} km/h`;
}

function performanceInsightText(activity,terrain,benchmark){
  const parts=[];
  if(terrain.ascentPerKm>=150) parts.push("profil très vertical");
  else if(terrain.ascentPerKm>=80) parts.push("profil fortement vallonné");
  else if(terrain.ascentPerKm>=30) parts.push("profil vallonné");
  else parts.push("profil peu vertical");

  if(terrain.climb15Pct>=15) parts.push(`${terrain.climb15Pct.toLocaleString("fr-FR",{maximumFractionDigits:0})} % du tracé au-dessus de 15 %`);
  else if(terrain.climb10Pct>=15) parts.push(`${terrain.climb10Pct.toLocaleString("fr-FR",{maximumFractionDigits:0})} % du tracé au-dessus de 10 %`);

  const avgHr=Number(activity.avg_hr),maxHr=Number(activity.max_hr);
  if(Number.isFinite(avgHr)&&Number.isFinite(maxHr)&&maxHr>avgHr) {
    parts.push(`FC ${Math.round(avgHr)} moy. / ${Math.round(maxHr)} max`);
  }

  if(benchmark.rank!=null && benchmark.peers.length>=2){
    parts.push(`${benchmark.rank}e vitesse/allure sur ${benchmark.peers.length+1} activités comparables chargées`);
  }
  return parts.join(" · ");
}


function resetPerformanceProgression() {
  if (!ui.performanceProgressionSummary) return;
  ui.performanceProgressionMeta.textContent = "Historique du groupe comparable actuellement chargé.";
  ui.performanceProgressionTrend.textContent = "Tendance";
  ui.performanceProgressionTrend.className = "pill neutral";
  ui.performanceProgressionSummary.innerHTML = "";
  ui.performanceProgressionWindows.innerHTML = "";
  ui.performanceProgressionChart.innerHTML = "";
  ui.performanceProgressionHistory.innerHTML = "";
}

function progressionCohort(activity) {
  const rows = [activity, ...comparableActivities(activity)]
    .filter((row) => {
      const speed = averageSpeedKmh(row);
      return Number.isFinite(speed) && speed > 0 && numberOrZero(row.start_time_ms) > 0;
    });

  const unique = [];
  const seen = new Set();
  for (const row of rows) {
    const key = activityKey(row) || `${row.start_time_ms}-${row.distance_m}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  unique.sort((a,b) => numberOrZero(a.start_time_ms) - numberOrZero(b.start_time_ms));
  return unique;
}

function averageNumbers(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum,value) => sum + value, 0) / valid.length : null;
}

function progressionWindow(rows, size) {
  if (!rows.length) return null;
  const current = rows.slice(-size);
  const previous = rows.slice(Math.max(0, rows.length - size * 2), Math.max(0, rows.length - size));
  const currentSpeed = averageNumbers(current.map(averageSpeedKmh));
  const previousSpeed = averageNumbers(previous.map(averageSpeedKmh));
  const currentHr = averageNumbers(current.map((row) => Number(row.avg_hr)));
  const previousHr = averageNumbers(previous.map((row) => Number(row.avg_hr)));

  const speedDeltaPct = Number.isFinite(currentSpeed) && Number.isFinite(previousSpeed) && previousSpeed > 0
    ? ((currentSpeed - previousSpeed) / previousSpeed) * 100
    : null;
  const hrDelta = Number.isFinite(currentHr) && Number.isFinite(previousHr)
    ? currentHr - previousHr
    : null;

  return {
    size,
    count: current.length,
    previousCount: previous.length,
    currentSpeed,
    previousSpeed,
    currentHr,
    previousHr,
    speedDeltaPct,
    hrDelta
  };
}

function progressionTrendInfo(rows) {
  const five = progressionWindow(rows, 5);
  const delta = five?.speedDeltaPct;
  if (!Number.isFinite(delta) || five.previousCount < 2) {
    return { label: "Historique insuffisant", cls: "neutral", delta: null };
  }
  if (delta >= 2) return { label: `En hausse · +${delta.toLocaleString("fr-FR",{maximumFractionDigits:1})} %`, cls: "ok", delta };
  if (delta <= -2) return { label: `En baisse · ${delta.toLocaleString("fr-FR",{maximumFractionDigits:1})} %`, cls: "warn", delta };
  return { label: `Stable · ${delta >= 0 ? "+" : ""}${delta.toLocaleString("fr-FR",{maximumFractionDigits:1})} %`, cls: "neutral", delta };
}

function progressionRank(activity, rows) {
  const currentSpeed = averageSpeedKmh(activity);
  if (!Number.isFinite(currentSpeed)) return null;
  return 1 + rows.filter((row) => averageSpeedKmh(row) > currentSpeed).length;
}

function progressionBest(rows) {
  return rows.reduce((best,row) => {
    const speed = averageSpeedKmh(row);
    return !best || speed > best.speed ? { row, speed } : best;
  }, null);
}

function progressionAsOfCurrent(activity, rows) {
  const currentTime = numberOrZero(activity.start_time_ms);
  if (!currentTime) return rows;
  const prior = rows.filter((row) => numberOrZero(row.start_time_ms) <= currentTime);
  return prior.length ? prior : rows;
}

function progressionSparkline(rows, activity) {
  if (!ui.performanceProgressionChart) return;
  const recent = rows.slice(-10);
  if (recent.length < 2) {
    ui.performanceProgressionChart.innerHTML = '<p class="muted">Au moins deux séances comparables sont nécessaires.</p>';
    return;
  }

  const speeds = recent.map(averageSpeedKmh);
  const min = Math.min(...speeds);
  const max = Math.max(...speeds);
  const width = 520, height = 160, padX = 18, padY = 18;
  const span = Math.max(0.001, max - min);
  const points = recent.map((row,index) => {
    const x = padX + (recent.length === 1 ? 0 : index * (width - padX*2) / (recent.length-1));
    const y = height - padY - ((averageSpeedKmh(row)-min)/span)*(height-padY*2);
    return {row,x,y};
  });
  const poly = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const currentKey = activityKey(activity);

  ui.performanceProgressionChart.innerHTML = `
    <svg class="progression-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Évolution de l'allure ou de la vitesse">
      <polyline points="${poly}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${points.map((point) => {
        const selected = activityKey(point.row) === currentKey;
        return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${selected ? 7 : 5}" class="${selected ? "current" : ""}"></circle>`;
      }).join("")}
    </svg>
    <div class="progression-sparkline-labels">
      <span>${escapeHtml(formatDate(recent[0].start_time_ms))}</span>
      <strong>${escapeHtml(formatBenchmarkSpeed(activity,max))} meilleur</strong>
      <span>${escapeHtml(formatDate(recent[recent.length-1].start_time_ms))}</span>
    </div>`;
}

function renderPerformanceProgression(activity) {
  if (!ui.performanceProgressionSummary) return;

  const cohort = progressionCohort(activity);
  const asOfCurrent = progressionAsOfCurrent(activity, cohort);
  if (cohort.length < 2) {
    resetPerformanceProgression();
    ui.performanceProgressionMeta.textContent =
      "Pas assez d’activités comparables chargées pour calculer une progression.";
    ui.performanceProgressionHistory.innerHTML =
      '<div class="recurring-empty">Il faut au moins deux activités comparables avec une durée et une distance exploitables.</div>';
    return;
  }

  const currentSpeed = averageSpeedKmh(activity);
  const best = progressionBest(cohort);
  const avgAll = averageNumbers(cohort.map(averageSpeedKmh));
  const rank = progressionRank(activity, cohort);
  const trend = progressionTrendInfo(asOfCurrent);

  ui.performanceProgressionTrend.textContent = trend.label;
  ui.performanceProgressionTrend.className = `pill ${trend.cls}`;
  ui.performanceProgressionMeta.textContent =
    `${cohort.length} séances comparables chargées · progression calculée jusqu’au ${formatDate(activity.start_time_ms)}`;

  const summary = [
    ["Rang de cette séance", rank ? `${rank} / ${cohort.length}` : "—"],
    ["Meilleure allure / vitesse", best ? formatBenchmarkSpeed(activity,best.speed) : "—"],
    ["Moyenne du groupe", Number.isFinite(avgAll) ? formatBenchmarkSpeed(activity,avgAll) : "—"],
    ["Écart au meilleur", best && Number.isFinite(currentSpeed) ? `${((currentSpeed-best.speed)/best.speed*100).toLocaleString("fr-FR",{maximumFractionDigits:1})} %` : "—"]
  ];

  ui.performanceProgressionSummary.innerHTML = summary.map(([label,value]) =>
    `<div class="performance-progression-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
  ).join("");

  ui.performanceProgressionWindows.innerHTML = [3,5,10].map((size) => {
    const item = progressionWindow(asOfCurrent,size);
    if (!item || !Number.isFinite(item.currentSpeed)) return "";
    const delta = item.speedDeltaPct;
    const deltaClass = Number.isFinite(delta) ? (delta >= 2 ? "positive" : delta <= -2 ? "negative" : "stable") : "stable";
    const deltaText = Number.isFinite(delta) && item.previousCount
      ? `${delta >= 0 ? "+" : ""}${delta.toLocaleString("fr-FR",{maximumFractionDigits:1})} % vs ${item.previousCount} précédentes`
      : "pas assez d’historique précédent";
    const hrText = Number.isFinite(item.currentHr)
      ? `${Math.round(item.currentHr)} bpm moy.${Number.isFinite(item.hrDelta) && item.previousCount ? ` · ${item.hrDelta>=0?"+":""}${Math.round(item.hrDelta)} bpm` : ""}`
      : "FC indisponible";

    return `<div class="performance-progression-window">
      <div><strong>${item.count} dernière${item.count>1?"s":""}</strong><span>fenêtre ${size}</span></div>
      <b>${escapeHtml(formatBenchmarkSpeed(activity,item.currentSpeed))}</b>
      <span class="${deltaClass}">${escapeHtml(deltaText)}</span>
      <small>${escapeHtml(hrText)}</small>
    </div>`;
  }).join("");

  progressionSparkline(asOfCurrent, activity);

  const currentKey = activityKey(activity);
  const lastTen = asOfCurrent.slice(-10).reverse();
  ui.performanceProgressionHistory.innerHTML = `
    <div class="performance-progression-history-head">
      <strong>Historique récent</strong>
      <span>${Math.min(10,asOfCurrent.length)} séance(s) affichée(s)</span>
    </div>
    <div class="performance-progression-history-list">
      ${lastTen.map((row) => {
        const selected = activityKey(row) === currentKey;
        const speed = averageSpeedKmh(row);
        return `<button type="button" class="performance-progression-history-row${selected ? " current" : ""}" data-activity-key="${escapeHtml(activityKey(row))}">
          <span>${escapeHtml(formatDate(row.start_time_ms))}</span>
          <strong>${escapeHtml(formatBenchmarkSpeed(activity,speed))}</strong>
          <span>${escapeHtml(formatHeartRate(row.avg_hr))}</span>
          <span>${escapeHtml(formatDistance(row.distance_m))} · ${escapeHtml(formatMeters(row.ascent_m))}</span>
        </button>`;
      }).join("")}
    </div>`;

  ui.performanceProgressionHistory.querySelectorAll("[data-activity-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = activities.find((row) => activityKey(row) === button.dataset.activityKey);
      if (target) showActivity(target);
    });
  });
}

function renderPerformanceTerrainAnalysis(activity, route) {
  if(!ui.performanceTerrainMetrics) return;
  const terrain=routeTerrainAnalysis(route);
  if(!terrain){ resetPerformanceTerrainAnalysis(activity); return; }
  const benchmark=benchmarkPerformance(activity);

  ui.performanceTerrainMetrics.innerHTML="";
  const altitudeLabel=Number.isFinite(terrain.minAltitude)&&Number.isFinite(terrain.maxAltitude)
    ? `${Math.round(terrain.minAltitude)}–${Math.round(terrain.maxAltitude)} m` : "—";
  const metrics=[
    ["Allure / vitesse",primarySpeedMetric(activity)],
    ["FC moyenne / max",`${formatHeartRate(activity.avg_hr)} / ${formatHeartRate(activity.max_hr)}`],
    ["D+ par km",`${terrain.ascentPerKm.toLocaleString("fr-FR",{maximumFractionDigits:0})} m/km`],
    ["Amplitude altitude",altitudeLabel],
    ["Distance ≥ 10 %",`${terrain.climb10Pct.toLocaleString("fr-FR",{maximumFractionDigits:1})} %`],
    ["Distance ≥ 15 %",`${terrain.climb15Pct.toLocaleString("fr-FR",{maximumFractionDigits:1})} %`]
  ];
  for(const [label,value] of metrics){
    const box=document.createElement("div");
    box.className="performance-terrain-metric";
    box.innerHTML=`<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
    ui.performanceTerrainMetrics.appendChild(box);
  }

  ui.performanceGradeDistribution.innerHTML=terrain.bands.map((band)=>{
    const pct=terrain.total?band.meters/terrain.total*100:0;
    return `<div class="performance-grade-row ${band.key}">
      <span>${escapeHtml(band.label)}</span>
      <div class="performance-grade-track"><i style="width:${Math.max(0,Math.min(100,pct))}%"></i></div>
      <strong>${pct.toLocaleString("fr-FR",{maximumFractionDigits:1})} %</strong>
    </div>`;
  }).join("");

  if(!benchmark.peers.length){
    ui.performanceBenchmark.innerHTML='<p class="muted">Pas encore d’activité suffisamment proche dans le catalogue chargé.</p>';
    ui.performanceBenchmarkBadge.textContent="0 comparable";
    ui.performanceBenchmarkBadge.className="pill neutral";
  } else {
    const currentSpeed=averageSpeedKmh(activity);
    const speedDelta=Number.isFinite(currentSpeed)&&Number.isFinite(benchmark.avgPeerSpeed)
      ? currentSpeed-benchmark.avgPeerSpeed:null;
    const hr=Number(activity.avg_hr);
    const hrDelta=Number.isFinite(hr)&&Number.isFinite(benchmark.avgPeerHr)?hr-benchmark.avgPeerHr:null;
    ui.performanceBenchmark.innerHTML=`
      <div class="performance-benchmark-row"><span>Activités comparables chargées</span><strong>${benchmark.peers.length}</strong></div>
      <div class="performance-benchmark-row"><span>Référence allure / vitesse</span><strong>${escapeHtml(formatBenchmarkSpeed(activity,benchmark.avgPeerSpeed))}</strong></div>
      <div class="performance-benchmark-row"><span>Écart de vitesse</span><strong>${Number.isFinite(speedDelta)?`${speedDelta>=0?"+":""}${speedDelta.toLocaleString("fr-FR",{maximumFractionDigits:2})} km/h`:"—"}</strong></div>
      <div class="performance-benchmark-row"><span>Écart FC moyenne</span><strong>${Number.isFinite(hrDelta)?`${hrDelta>=0?"+":""}${Math.round(hrDelta)} bpm`:"—"}</strong></div>
      <div class="performance-benchmark-row"><span>Rang vitesse / allure</span><strong>${benchmark.rank!=null?`${benchmark.rank} / ${benchmark.peers.length+1}`:"—"}</strong></div>`;
    ui.performanceBenchmarkBadge.textContent=`${benchmark.peers.length} comparable${benchmark.peers.length>1?"s":""}`;
    ui.performanceBenchmarkBadge.className="pill ok";
  }

  ui.performanceInsight.innerHTML=`<strong>Lecture de la séance</strong><p>${escapeHtml(performanceInsightText(activity,terrain,benchmark))}</p>`;
  ui.performanceTerrainMeta.textContent =
    "Allure/FC globales croisées avec altitude et pente du tracé GPS ; benchmark limité au catalogue actuellement chargé.";
  renderPerformanceProgression(activity);
}

function renderPerformance(activity) {
  ui.detailPerformanceGrid.innerHTML = "";

  addDetailItem(ui.detailPerformanceGrid, "FC moyenne", formatHeartRate(activity.avg_hr));
  addDetailItem(ui.detailPerformanceGrid, "FC maximale", formatHeartRate(activity.max_hr));
  addDetailItem(ui.detailPerformanceGrid, "Cadence moyenne", formatCadence(activity.avg_cadence));
  addDetailItem(ui.detailPerformanceGrid, "Vitesse moyenne", formatAverageSpeed(activity));
  addDetailItem(ui.detailPerformanceGrid, "Allure moyenne", formatPace(activity));
  addDetailItem(ui.detailPerformanceGrid, "Ressenti", scoreText(activity.feeling_score));
  addDetailItem(ui.detailPerformanceGrid, "Difficulté", scoreText(activity.difficulty_score));
}

function renderPersonal(activity) {
  ui.detailPersonalGrid.innerHTML = "";
  ui.detailLandmarks.innerHTML = "";

  const currentEditorKey = activityKey(activity);
  if (editorActivityKey !== currentEditorKey || !activityEditDirty) {
    ui.editTitleInput.value = activity.custom_title || "";
    ui.editDescriptionInput.value = activity.description || "";
    ui.editNoteInput.value = activity.personal_note || "";
  }
  editorActivityKey = currentEditorKey;

  rebuildEquipmentEditor(activity);
  ui.editFeelingSelect.value = activity.feeling_score == null ? "" : String(activity.feeling_score);
  ui.editDifficultySelect.value = activity.difficulty_score == null ? "" : String(activity.difficulty_score);
  ui.editPrivacySelect.value = normalizePrivacy(activity.privacy);

  addDetailItem(ui.detailPersonalGrid, "Matériel", activity.equipment_name || "—", "wide");
  addDetailItem(
    ui.detailPersonalGrid,
    "Affectation matériel",
    numberOrZero(activity.equipment_manual) === 1 ? "Manuelle" : "Automatique"
  );
  addDetailItem(ui.detailPersonalGrid, "Confidentialité", activity.privacy || "—");
  addDetailItem(ui.detailPersonalGrid, "Titre personnalisé", activity.custom_title || "—", "wide");
  addDetailItem(ui.detailPersonalGrid, "Description", activity.description || "—", "wide");
  addDetailItem(ui.detailPersonalGrid, "Note personnelle", activity.personal_note || "—", "full");

  const links = linksForActivity(activity);
  rebuildAddLandmarkSelect(links);
  renderQuickLandmarkButtons(activity, links);

  if (!links.length) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "Aucun repère associé.";
    ui.detailLandmarks.appendChild(empty);
    return;
  }

  links
    .slice()
    .sort((a, b) => String(a.landmark_code ?? "").localeCompare(String(b.landmark_code ?? ""), "fr"))
    .forEach((link) => {
      const code = String(link.landmark_code ?? "?");
      const meta = landmarks.get(code);
      const chip = document.createElement("div");
      chip.className = "landmark-chip";

      const codeNode = document.createElement("span");
      codeNode.className = "landmark-code";
      codeNode.textContent = code;

      const label = document.createElement("span");
      const count = Math.max(1, numberOrZero(link.occurrences));
      const source = link.source ? ` · ${link.source}` : "";
      label.textContent =
        `${meta?.name || meta?.label || "Repère"}${count > 1 ? ` ×${count}` : ""}${source}`;

      const controls = document.createElement("span");
      controls.className = "landmark-controls";

      const minus = document.createElement("button");
      minus.type = "button";
      minus.className = "landmark-control";
      minus.textContent = "−";
      minus.title = count > 1 ? "Réduire le compteur" : "Retirer le repère";
      minus.addEventListener("click", () => changeLandmarkOccurrence(activity, code, -1));

      const plus = document.createElement("button");
      plus.type = "button";
      plus.className = "landmark-control";
      plus.textContent = "+";
      plus.title = "Augmenter le compteur";
      plus.addEventListener("click", () => changeLandmarkOccurrence(activity, code, 1));

      controls.append(minus, plus);
      chip.append(codeNode, label, controls);
      ui.detailLandmarks.appendChild(chip);
    });
}


function renderQuickLandmarkButtons(activity, links = linksForActivity(activity)) {
  if (!ui.quickLandmarkButtons) return;
  ui.quickLandmarkButtons.innerHTML = "";

  const counts = new Map();
  for (const link of links || []) {
    counts.set(String(link.landmark_code ?? ""), Math.max(1, numberOrZero(link.occurrences)));
  }

  const rows = [...landmarks.entries()]
    .sort((a,b) =>
      Number(a[1]?.sort_order ?? 999) - Number(b[1]?.sort_order ?? 999) ||
      String(a[0]).localeCompare(String(b[0]), "fr")
    );

  if (!rows.length) {
    ui.quickLandmarkButtons.innerHTML = '<span class="muted">Aucun repère configuré</span>';
    return;
  }

  rows.forEach(([code,row]) => {
    const count = counts.get(String(code)) || 0;
    const wrap = document.createElement("div");
    wrap.className = `quick-landmark-stepper${count ? " active" : ""}`;

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "quick-landmark-plus";
    plus.innerHTML = `<strong>${escapeHtml(code)}</strong>${count ? `<span>×${count}</span>` : ""}`;
    plus.title = `${row?.name || row?.label || "Repère"} · ajouter une occurrence`;
    plus.addEventListener("click", async () => {
      plus.disabled = true;
      try { await changeLandmarkOccurrence(activity, code, +1); }
      finally { plus.disabled = false; }
    });

    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "quick-landmark-minus";
    minus.textContent = "−";
    minus.title = `Retirer une occurrence de ${code}`;
    minus.disabled = count <= 0;
    minus.addEventListener("click", async () => {
      minus.disabled = true;
      try { await changeLandmarkOccurrence(activity, code, -1); }
      finally { minus.disabled = false; }
    });

    wrap.append(plus, minus);
    ui.quickLandmarkButtons.appendChild(wrap);
  });
}

function rebuildAddLandmarkSelect(links) {
  const used = new Set((links || []).map((link) => String(link.landmark_code ?? "")));
  const selected = ui.addLandmarkSelect.value;
  ui.addLandmarkSelect.innerHTML = '<option value="">Choisir…</option>';

  [...landmarks.entries()]
    .sort((a, b) => Number(a[1]?.sort_order ?? 999) - Number(b[1]?.sort_order ?? 999))
    .forEach(([code, row]) => {
      if (used.has(code)) return;
      const option = document.createElement("option");
      option.value = code;
      option.textContent = `${code} · ${row.name || row.label || "Repère"}`;
      ui.addLandmarkSelect.appendChild(option);
    });

  if ([...ui.addLandmarkSelect.options].some((option) => option.value === selected)) {
    ui.addLandmarkSelect.value = selected;
  }
}

function renderLinkedRecords(activity) {
  const key = Number(activity.id ?? activity.__docId);
  const linked = records.filter((record) => Number(record.activity_id) === key);

  ui.detailRecordsList.innerHTML = "";
  ui.detailRecordsSection.classList.toggle("hidden", linked.length === 0);

  linked.forEach((record) => {
    const row = document.createElement("div");
    row.className = "record-row";

    const left = document.createElement("strong");
    left.textContent = recordLabel(record.record_type);

    const right = document.createElement("span");
    right.className = "muted";
    right.textContent = formatRecordValue(record);

    row.append(left, right);
    ui.detailRecordsList.appendChild(row);
  });
}


function renderTechnicalSummary(activity) {
  if (!ui.detailTechnicalSummary) return;
  ui.detailTechnicalSummary.innerHTML = "";
  addDetailItem(ui.detailTechnicalSummary, "Points GPS", formatInteger(activity.gps_point_count));
  addDetailItem(ui.detailTechnicalSummary, "Points d’enregistrement", formatInteger(activity.record_count));
  addDetailItem(ui.detailTechnicalSummary, "ID activité", valueOrDash(activity.id ?? activity.__docId));
  const calories = activityCaloriesPresentation(activity);
  addDetailItem(ui.detailTechnicalSummary, "Calories", calories.value);
  addDetailItem(ui.detailTechnicalSummary, "Origine calories", calories.label.replace("Calories · ", "") || "—");
}

function renderImport(activity) {
  ui.detailImportGrid.innerHTML = "";

  addDetailItem(ui.detailImportGrid, "Source", activity.import_source || "—");
  addDetailItem(ui.detailImportGrid, "Profil d'import", activity.import_profile || "—");
  addDetailItem(ui.detailImportGrid, "Fichier", activity.file_name || "—", "wide");
  addDetailItem(ui.detailImportGrid, "Fabricant", activity.manufacturer || "—");
  addDetailItem(ui.detailImportGrid, "Produit", activity.product_name || "—");
  addDetailItem(ui.detailImportGrid, "Product ID", valueOrDash(activity.product_id));
  addDetailItem(
    ui.detailImportGrid,
    "Segment",
    segmentText(activity)
  );
  addDetailItem(ui.detailImportGrid, "Raison de découpe", activity.split_reason || "—", "wide");
  addDetailItem(ui.detailImportGrid, "Taille du fichier", formatBytes(activity.file_size_bytes));
  addDetailItem(ui.detailImportGrid, "Importé le", formatDateLong(activity.imported_at_ms));
  addDetailItem(
    ui.detailImportGrid,
    "Protocole FIT",
    protocolText(activity)
  );
  addDetailItem(ui.detailImportGrid, "Version profil FIT", valueOrDash(activity.profile_version));
}

function renderRaw(activity) {
  ui.detailRawGrid.innerHTML = "";

  Object.keys(activity)
    .sort((a, b) => a.localeCompare(b, "fr"))
    .forEach((key) => {
      const row = document.createElement("div");
      row.className = "raw-row";

      const keyNode = document.createElement("div");
      keyNode.className = "raw-key";
      keyNode.textContent = key;

      const valueNode = document.createElement("div");
      valueNode.className = "raw-value";
      valueNode.textContent = rawValue(activity[key]);

      row.append(keyNode, valueNode);
      ui.detailRawGrid.appendChild(row);
    });
}

function addDetailItem(container, label, value, width = "") {
  const box = document.createElement("div");
  box.className = `detail-item ${width}`.trim();

  const span = document.createElement("span");
  span.textContent = label;

  const strong = document.createElement("strong");
  strong.textContent = value == null || value === "" ? "—" : String(value);

  box.append(span, strong);
  container.appendChild(box);
}

function renderRecords() {
  ui.recordsList.innerHTML = "";

  if (!records.length) {
    ui.recordsList.innerHTML = '<div class="empty">Aucun record Firestore.</div>';
    if (ui.recordsManagerStatus) setRecordsManagerStatus("Aucun record matérialisé", "pending");
    return;
  }

  const order = new Map([["distance", 0], ["duration", 1], ["ascent", 2]]);
  records
    .slice()
    .sort((a, b) => {
      const aType = String(a.record_type ?? "").toLowerCase();
      const bType = String(b.record_type ?? "").toLowerCase();
      const rank = (value) => order.has(value) ? order.get(value) : 99;
      return rank(aType) - rank(bType) || aType.localeCompare(bType, "fr");
    })
    .forEach((record) => {
      const row = document.createElement("div");
      row.className = "record-row record-managed-row";

      const left = document.createElement("div");
      left.className = "record-managed-main";

      const title = document.createElement("strong");
      title.textContent = recordLabel(record.record_type);

      const detail = document.createElement("span");
      detail.className = "muted";
      const activityId = Number(record.activity_id);
      const linked = activities.find((activity) => Number(activity.id ?? activity.__docId) === activityId);
      detail.textContent = linked
        ? `${formatRecordValue(record)} · ${formatDate(linked.start_time_ms)} · ${linked.custom_title || sportName(linked.sport)}`
        : `${formatRecordValue(record)} · activité #${Number.isFinite(activityId) ? activityId : "?"}`;

      left.append(title, detail);

      const actions = document.createElement("div");
      actions.className = "record-managed-actions";

      const open = document.createElement("button");
      open.type = "button";
      open.className = "secondary";
      open.textContent = "Ouvrir l’activité";
      open.disabled = !Number.isFinite(activityId) || activityId <= 0;
      open.addEventListener("click", () => { void openRecordActivity(record); });
      actions.appendChild(open);

      row.append(left, actions);
      ui.recordsList.appendChild(row);
    });

  if (ui.recordsManagerStatus && !recordsRebuildRunning) {
    setRecordsManagerStatus(`${records.length} record(s) matérialisé(s)`, "ok");
  }
}

async function openRecordActivity(record) {
  const activityId = Number(record?.activity_id);
  if (!Number.isFinite(activityId) || activityId <= 0 || !currentUser) return;

  let activity = activities.find((item) => Number(item.id ?? item.__docId) === activityId);

  if (!activity) {
    try {
      const snapshot = await getDoc(doc(db, ROOT, currentUser.uid, "activities", String(activityId)));
      if (!snapshot.exists()) throw new Error(`Activité #${activityId} absente de Firestore.`);
      activity = { __docId: snapshot.id, ...snapshot.data() };
      activities.push(activity);
      rebuildDynamicFilters();
      applyFiltersAndRender();
    } catch (error) {
      handleError(error, "Ouverture de l’activité du record impossible");
      return;
    }
  }

  showActivity(activity);
}

function setRecordsManagerStatus(text, state = "ok") {
  if (!ui.recordsManagerStatus) return;
  ui.recordsManagerStatus.textContent = text;
  ui.recordsManagerStatus.className =
    state === "pending" ? "pill pending" :
    state === "error" ? "pill error" :
    "pill ok";
}

async function rebuildRecordsFromFirestore() {
  if (!currentUser || recordsRebuildRunning) return;

  recordsRebuildRunning = true;
  ui.rebuildRecordsButton.disabled = true;
  setRecordsManagerStatus("Recalcul des 3 records…", "pending");

  try {
    const specs = [
      { type: "distance", field: "distance_m" },
      { type: "duration", field: "timer_time_ms" },
      { type: "ascent", field: "ascent_m" }
    ];

    const desired = new Map();

    for (const spec of specs) {
      const activityDoc = await topActiveActivityByField(spec.field);
      if (!activityDoc) continue;

      const activity = activityDoc.data();
      const activityId = Number(activity.id ?? activityDoc.id);
      const value = Number(activity[spec.field]);

      if (!Number.isFinite(activityId) || activityId <= 0 || !Number.isFinite(value) || value <= 0) {
        continue;
      }

      desired.set(spec.type, {
        record_type: spec.type,
        activity_id: activityId,
        record_value: value,
        updated_at_ms: Date.now()
      });
    }

    const existingStandard = new Map(
      records
        .filter((record) => ["distance", "duration", "ascent"].includes(String(record.record_type ?? "").toLowerCase()))
        .map((record) => [String(record.record_type).toLowerCase(), record])
    );

    const batch = writeBatch(db);
    const rootBase = [ROOT, currentUser.uid];
    const now = Date.now();
    let countDelta = 0;

    for (const spec of specs) {
      const type = spec.type;
      const wanted = desired.get(type);
      const exists = existingStandard.has(type);

      if (wanted) {
        const seq = nextWebFirebaseSeq();
        const eventId = makeWebEventId(seq);

        batch.set(
          doc(db, ...rootBase, "records", type),
          { ...wanted, __sportKey: type, __updatedAtMs: now },
          { merge: true }
        );
        batch.set(
          doc(db, ...rootBase, "changes", eventId),
          {
            eventId,
            deviceId: webDeviceId,
            firebaseSeq: seq,
            sourceChangeSeq: 0,
            table: "records",
            rowKey: type,
            operation: "UPSERT",
            changedAtMs: now,
            publishedAt: serverTimestamp(),
            androidVersion: 0,
            webVersion: "WEB041",
            row: wanted
          }
        );
        if (!exists) countDelta += 1;
      } else if (exists) {
        const seq = nextWebFirebaseSeq();
        const eventId = makeWebEventId(seq);

        batch.delete(doc(db, ...rootBase, "records", type));
        batch.set(
          doc(db, ...rootBase, "changes", eventId),
          {
            eventId,
            deviceId: webDeviceId,
            firebaseSeq: seq,
            sourceChangeSeq: 0,
            table: "records",
            rowKey: type,
            operation: "DELETE",
            changedAtMs: now,
            publishedAt: serverTimestamp(),
            androidVersion: 0,
            webVersion: "WEB041"
          }
        );
        countDelta -= 1;
      }
    }

    const metaPatch = {
      updatedAtMs: now,
      sourceDeviceId: webDeviceId,
      webVersion: "WEB041"
    };
    if (countDelta !== 0) {
      metaPatch.recordCount = increment(countDelta);
      metaPatch.expectedDocuments = increment(countDelta);
    }
    batch.set(doc(db, ...rootBase, "meta", "state"), metaPatch, { merge: true });

    await batch.commit();

    const nonStandard = records.filter(
      (record) => !["distance", "duration", "ascent"].includes(String(record.record_type ?? "").toLowerCase())
    );
    records = [
      ...nonStandard,
      ...[...desired.values()].map((row) => ({ __docId: row.record_type, ...row }))
    ];

    if (countDelta !== 0) {
      adjustMetric(ui.recordCount, countDelta);
      adjustMetric(ui.expectedDocuments, countDelta);
    }

    renderRecords();
    const current = currentDetailActivity();
    if (current) renderLinkedRecords(current);

    setRecordsManagerStatus("Records recalculés et synchronisés", "ok");
    // WEB045 · résultat technique volontairement silencieux dans l'interface.
  } catch (error) {
    console.error(error);
    setRecordsManagerStatus("Recalcul impossible", "error");
    handleError(error, "Recalcul des records impossible");
  } finally {
    recordsRebuildRunning = false;
    ui.rebuildRecordsButton.disabled = false;
  }
}

function linksForActivity(activity) {
  const id = String(activity.id ?? activity.__docId ?? "").trim();
  return activityLandmarks.get(id) || [];
}

function markerSummary(activity) {
  const links = linksForActivity(activity);
  if (!links.length) return "—";

  return links
    .map((link) => {
      const code = String(link.landmark_code ?? "?");
      const count = Math.max(1, numberOrZero(link.occurrences));
      return count > 1 ? `${code}×${count}` : code;
    })
    .join(" · ");
}







// -----------------------------------------------------------------------------
// WEB041 · WEBEQUIPMAP001 — table de correspondance matériel automatique
// Règle compatible avec la logique Android existante : import_source + sport +
// sub_sport -> equipment_name. Les choix manuels (equipment_manual=1) restent
// prioritaires et ne sont jamais écrasés.
// -----------------------------------------------------------------------------

const EQUIPMENT_MAPPING_ALL_SOURCES = "*";

function equipmentMappingIsAllSources(value) {
  return String(value || "").trim().toUpperCase() === EQUIPMENT_MAPPING_ALL_SOURCES;
}

function equipmentMappingActivityKey(sport, subSport) {
  return `${Number(sport) || 0}|${Number(subSport) || 0}`;
}

function equipmentMappingActivityLabel(sport, subSport) {
  const sportLabel = sportName(Number(sport) || 0);
  const subLabel = subSportName(Number(subSport) || 0);
  const sub = Number(subSport) || 0;

  if (!sub || !subLabel || subLabel === "—" || subLabel === "Aucun") return sportLabel;
  return `${subLabel} · ${sportLabel}`;
}

function equipmentMappingObservedActivities() {
  const map = new Map();

  for (const activity of activities.filter((item) => item && item.deleted_at_ms == null)) {
    const sport = Number(activity.sport) || 0;
    const subSport = Number(activity.sub_sport) || 0;
    const key = equipmentMappingActivityKey(sport, subSport);

    if (!map.has(key)) {
      map.set(key, {
        sport,
        sub_sport: subSport,
        label: equipmentMappingActivityLabel(sport, subSport),
        count: 0
      });
    }

    map.get(key).count += 1;
  }

  return [...map.values()].sort((a, b) =>
    String(a.label).localeCompare(String(b.label), "fr", { sensitivity: "base" })
  );
}

function equipmentMappingObservedSources() {
  const values = new Set();

  for (const activity of activities.filter((item) => item && item.deleted_at_ms == null)) {
    const source = String(activity.import_source || "").trim().toUpperCase();
    if (source) values.add(source);
  }

  for (const rule of equipmentMappingRows) {
    const source = String(rule.import_source || "").trim().toUpperCase();
    if (source && !equipmentMappingIsAllSources(source)) values.add(source);
  }

  return [...values].sort((a, b) =>
    equipmentMappingSourceLabel(a).localeCompare(
      equipmentMappingSourceLabel(b),
      "fr",
      { sensitivity: "base" }
    )
  );
}

function rebuildEquipmentMappingSourceSelectWeb050() {
  const select = document.getElementById("equipmentMappingSourceChoice");
  if (!select) return;

  const current = select.value || EQUIPMENT_MAPPING_ALL_SOURCES;
  select.innerHTML = "";

  const all = document.createElement("option");
  all.value = EQUIPMENT_MAPPING_ALL_SOURCES;
  all.textContent = "Toutes les sources";
  select.appendChild(all);

  for (const source of equipmentMappingObservedSources()) {
    const option = document.createElement("option");
    option.value = source;
    option.textContent = equipmentMappingSourceLabel(source);
    select.appendChild(option);
  }

  select.value = [...select.options].some((option) => option.value === current)
    ? current
    : EQUIPMENT_MAPPING_ALL_SOURCES;
}

function rebuildEquipmentMappingActivitySelectWeb050() {
  const select = document.getElementById("equipmentMappingActivityChoice");
  if (!select) return;

  const current = select.value;
  select.innerHTML = '<option value="">Choisir un type d’activité…</option>';

  const observed = equipmentMappingObservedActivities();

  for (const item of observed) {
    const option = document.createElement("option");
    option.value = equipmentMappingActivityKey(item.sport, item.sub_sport);
    option.textContent = `${item.label} · ${item.count} activité(s)`;
    option.dataset.sport = String(item.sport);
    option.dataset.subSport = String(item.sub_sport);
    select.appendChild(option);
  }

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
}

function syncEquipmentMappingLegacyFieldsWeb050() {
  const sourceSelect = document.getElementById("equipmentMappingSourceChoice");
  const activitySelect = document.getElementById("equipmentMappingActivityChoice");

  if (sourceSelect && ui.equipmentMappingSource) {
    ui.equipmentMappingSource.value = sourceSelect.value || EQUIPMENT_MAPPING_ALL_SOURCES;
  }

  if (activitySelect?.value) {
    const [sport, subSport] = activitySelect.value.split("|").map(Number);
    if (ui.equipmentMappingSport) ui.equipmentMappingSport.value = String(sport || 0);
    if (ui.equipmentMappingSubSport) ui.equipmentMappingSubSport.value = String(subSport || 0);
  }
}

function equipmentMappingRuleScopeLabel(rule) {
  return equipmentMappingIsAllSources(rule.import_source)
    ? "Générale"
    : "Spécifique";
}

function equipmentMappingUnmatchedGroups() {
  const groups = new Map();

  for (const activity of activities.filter((item) => item && item.deleted_at_ms == null)) {
    if (Number(activity.equipment_manual) === 1) continue;
    if (resolveAutomaticEquipmentMapping(activity)) continue;

    const sport = Number(activity.sport) || 0;
    const subSport = Number(activity.sub_sport) || 0;
    const key = equipmentMappingActivityKey(sport, subSport);

    if (!groups.has(key)) {
      groups.set(key, {
        sport,
        sub_sport: subSport,
        count: 0,
        label: equipmentMappingActivityLabel(sport, subSport)
      });
    }

    groups.get(key).count += 1;
  }

  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));
}

function renderEquipmentMappingUnmatchedWeb050() {
  const host = document.getElementById("equipmentMappingUnmatched");
  if (!host) return;

  const groups = equipmentMappingUnmatchedGroups();
  host.innerHTML = "";

  if (!groups.length) {
    host.innerHTML =
      '<div class="equipment-map-empty-web050">Toutes les activités chargées sont couvertes par une règle ou un choix manuel.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const group of groups) {
    const row = document.createElement("div");
    row.className = "equipment-map-unmatched-row-web050";

    const text = document.createElement("div");
    text.innerHTML =
      `<strong>${group.label}</strong><span>${group.count} activité(s) sans règle</span>`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = "Créer la règle";
    button.addEventListener("click", () => {
      const select = document.getElementById("equipmentMappingActivityChoice");
      if (select) {
        select.value = equipmentMappingActivityKey(group.sport, group.sub_sport);
        select.dispatchEvent(new Event("change"));
        select.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    row.append(text, button);
    fragment.appendChild(row);
  }

  host.appendChild(fragment);
}

function editEquipmentMappingRuleWeb050(rule) {
  const sourceSelect = document.getElementById("equipmentMappingSourceChoice");
  const activitySelect = document.getElementById("equipmentMappingActivityChoice");

  if (sourceSelect) {
    const source = String(rule.import_source || "").trim().toUpperCase() || EQUIPMENT_MAPPING_ALL_SOURCES;

    if (![...sourceSelect.options].some((option) => option.value === source) && !equipmentMappingIsAllSources(source)) {
      const option = document.createElement("option");
      option.value = source;
      option.textContent = equipmentMappingSourceLabel(source);
      sourceSelect.appendChild(option);
    }

    sourceSelect.value = source;
  }

  if (activitySelect) {
    const key = equipmentMappingActivityKey(rule.sport, rule.sub_sport);

    if (![...activitySelect.options].some((option) => option.value === key)) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = equipmentMappingActivityLabel(rule.sport, rule.sub_sport);
      activitySelect.appendChild(option);
    }

    activitySelect.value = key;
  }

  if (ui.equipmentMappingEquipment) {
    ui.equipmentMappingEquipment.value = String(rule.equipment_name || "");
  }

  syncEquipmentMappingLegacyFieldsWeb050();

  const add = ui.equipmentMappingAddButton;
  if (add) add.textContent = "Mettre à jour la correspondance";
}

function installEquipmentMappingEditorWeb050() {
  if (window.__web050EquipmentMapInstalled) return;
  window.__web050EquipmentMapInstalled = true;

  const sourceSelect = document.getElementById("equipmentMappingSourceChoice");
  const activitySelect = document.getElementById("equipmentMappingActivityChoice");

  sourceSelect?.addEventListener("change", syncEquipmentMappingLegacyFieldsWeb050);
  activitySelect?.addEventListener("change", syncEquipmentMappingLegacyFieldsWeb050);

  rebuildEquipmentMappingSourceSelectWeb050();
  rebuildEquipmentMappingActivitySelectWeb050();
  syncEquipmentMappingLegacyFieldsWeb050();
}


function equipmentMappingKey(source,sport,subSport) {
  return `${String(source || "").trim().toUpperCase()}|${Number(sport)||0}|${Number(subSport)||0}`;
}

function equipmentMappingSourceLabel(value) {
  const source=String(value || "").trim().toUpperCase();
  const labels={
    KINOMAP_STRAVA_WEB:"Kinomap via Strava",
    STRAVA_WEB:"Strava Web",
    WEB_MANUAL_FIT:"FIT importé sur le Web",
    WEB_MANUAL:"Ajout manuel Web",
    WEB_SPLIT:"Découpe Web"
  };
  return labels[source] || source || "Source vide";
}

function activeEquipmentOptions() {
  return equipmentRows
    .filter((row)=>String(row.status || "ACTIVE").toUpperCase()!=="RETIRED")
    .slice()
    .sort((a,b)=>equipmentDisplayName(a).localeCompare(equipmentDisplayName(b),"fr",{sensitivity:"base"}));
}

function rebuildEquipmentMappingEquipmentSelect() {
  if (!ui.equipmentMappingEquipment) return;
  const current=ui.equipmentMappingEquipment.value;
  ui.equipmentMappingEquipment.innerHTML='<option value="">Choisir un matériel…</option>';
  for (const row of activeEquipmentOptions()) {
    const option=document.createElement("option");
    option.value=equipmentDisplayName(row);
    option.textContent=equipmentDisplayName(row);
    ui.equipmentMappingEquipment.appendChild(option);
  }
  if ([...ui.equipmentMappingEquipment.options].some((o)=>o.value===current)) {
    ui.equipmentMappingEquipment.value=current;
  }
}

function resolveAutomaticEquipmentMapping(activity) {
  if (!activity) return null;

  const source = String(activity.import_source || "").trim().toUpperCase();
  const sport = Number(activity.sport) || 0;
  const subSport = Number(activity.sub_sport) || 0;

  const exactKey = equipmentMappingKey(source, sport, subSport);
  const generalKey = equipmentMappingKey(EQUIPMENT_MAPPING_ALL_SOURCES, sport, subSport);

  const enabled = equipmentMappingRows.filter((rule) => rule.enabled !== false);

  const exact = enabled.find((rule) =>
    equipmentMappingKey(rule.import_source, rule.sport, rule.sub_sport) === exactKey
  );

  if (exact) return exact;

  return enabled.find((rule) =>
    equipmentMappingKey(rule.import_source, rule.sport, rule.sub_sport) === generalKey
  ) || null;
}

function applyAutomaticEquipmentMappingToDraft(activity) {
  if (!activity || numberOrZero(activity.equipment_manual)===1) return activity;
  const rule=resolveAutomaticEquipmentMapping(activity);
  if (!rule) {
    if (activity.equipment_manual==null) activity.equipment_manual=0;
    return activity;
  }
  activity.equipment_name=String(rule.equipment_name || "").trim();
  activity.equipment_manual=0;
  activity.equipment_mapping_id=rule.__docId || null;
  activity.equipment_mapping_applied_at_ms=Date.now();
  return activity;
}


const EQUIPMENT_PROFILES_WEB053 = Object.freeze([
  { key: "RUN", label: "Course à pied" },
  { key: "TRAIL", label: "Trail" },
  { key: "TREADMILL", label: "Tapis de course" },
  { key: "BIKE", label: "Vélo" },
  { key: "MTB", label: "VTT" },
  { key: "TRAINER", label: "Home Trainer" },
]);

function equipmentProfileLabelWeb053(key) {
  return EQUIPMENT_PROFILES_WEB053.find((profile) => profile.key === key)?.label || key || "";
}

function equipmentProfileFromTechnicalOptionWeb053(option) {
  if (!option) return "";

  const value = String(option.value || "");
  const label = String(option.textContent || option.label || "").toLowerCase();
  const [sportRaw, subSportRaw] = value.split("|");
  const sport = Number(sportRaw);
  const subSport = Number(subSportRaw);

  const running =
    sport === 1 ||
    /course|running|trail|tapis|treadmill/.test(label);

  const cycling =
    sport === 2 ||
    /vélo|velo|bike|cycling|vtt|mtb|mountain|trainer/.test(label);

  if (running) {
    if (/tapis|treadmill|indoor running/.test(label) || [1, 21, 45].includes(subSport)) {
      return "TREADMILL";
    }

    if (/trail/.test(label) || subSport === 3) {
      return "TRAIL";
    }

    return "RUN";
  }

  if (cycling) {
    if (/home.?trainer|trainer|indoor|spin|virtuel|virtual|kinomap/.test(label) ||
        [5, 6, 58].includes(subSport)) {
      return "TRAINER";
    }

    if (/vtt|mtb|mountain/.test(label) || [8, 47].includes(subSport)) {
      return "MTB";
    }

    return "BIKE";
  }

  return "";
}

function equipmentTechnicalOptionsForProfileWeb053(profileKey) {
  const technical = document.getElementById("equipmentMappingActivityChoice");
  if (!technical) return [];

  return [...technical.options].filter((option) =>
    option.value &&
    equipmentProfileFromTechnicalOptionWeb053(option) === profileKey
  );
}

function refreshEquipmentProfileEditorWeb053() {
  const profileSelect = document.getElementById("equipmentMappingProfileChoice");
  const technical = document.getElementById("equipmentMappingActivityChoice");
  const hint = document.getElementById("equipmentMappingProfileHintWeb053");

  if (!profileSelect || !technical) return;

  const previous = profileSelect.value;

  for (const option of profileSelect.options) {
    if (!option.value) continue;

    const matches = equipmentTechnicalOptionsForProfileWeb053(option.value);
    const profile = EQUIPMENT_PROFILES_WEB053.find((item) => item.key === option.value);
    const label = profile?.label || option.value;

    option.textContent =
      matches.length > 0
        ? `${label} · ${matches.length} signature(s) reconnue(s)`
        : label;
  }

  if (previous) profileSelect.value = previous;

  const currentMatches = equipmentTechnicalOptionsForProfileWeb053(profileSelect.value);

  if (hint) {
    if (!profileSelect.value) {
      hint.textContent = "Choisis simplement l’un des 6 profils utilisés sur ta Garmin.";
    } else if (currentMatches.length === 0) {
      hint.textContent =
        "Aucune signature technique actuellement détectée pour ce profil. " +
        "Les réglages avancés restent disponibles si nécessaire.";
    } else {
      hint.textContent =
        `${currentMatches.length} signature(s) technique(s) seront associées automatiquement à ce profil.`;
    }
  }

  if (profileSelect.value && currentMatches.length > 0) {
    technical.value = currentMatches[0].value;
    technical.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function installEquipmentProfileEditorWeb053() {
  if (document.getElementById("equipmentMappingProfileChoice")) {
    refreshEquipmentProfileEditorWeb053();
    return;
  }

  const technical = document.getElementById("equipmentMappingActivityChoice");
  const source =
    document.getElementById("equipmentMappingSourceChoice") ||
    ui.equipmentMappingSource;

  if (!technical) return;

  const technicalContainer = technical.closest("label") || technical.parentElement;
  const sourceContainer = source ? (source.closest("label") || source.parentElement) : null;

  const profileContainer = document.createElement("label");
  profileContainer.className = "web053-profile-field";

  const title = document.createElement("span");
  title.className = "web053-profile-label";
  title.textContent = "Profil sportif";

  const profileSelect = document.createElement("select");
  profileSelect.id = "equipmentMappingProfileChoice";
  profileSelect.innerHTML =
    '<option value="">Choisir un profil…</option>' +
    EQUIPMENT_PROFILES_WEB053.map(
      (profile) => `<option value="${profile.key}">${profile.label}</option>`
    ).join("");

  const hint = document.createElement("small");
  hint.id = "equipmentMappingProfileHintWeb053";
  hint.className = "muted";
  hint.textContent = "Choisis simplement l’un des 6 profils utilisés sur ta Garmin.";

  profileContainer.append(title, profileSelect, hint);

  if (technicalContainer?.parentElement) {
    technicalContainer.parentElement.insertBefore(profileContainer, technicalContainer);
  } else {
    technical.parentElement?.insertBefore(profileContainer, technical);
  }

  const advanced = document.createElement("details");
  advanced.id = "equipmentMappingAdvancedWeb053";
  advanced.className = "web053-equipment-advanced";

  const summary = document.createElement("summary");
  summary.textContent = "Réglages avancés";
  advanced.appendChild(summary);

  const advancedBody = document.createElement("div");
  advancedBody.className = "web053-equipment-advanced-body";
  advanced.appendChild(advancedBody);

  if (technicalContainer?.parentElement) {
    technicalContainer.parentElement.insertBefore(advanced, technicalContainer);
  } else {
    profileContainer.parentElement?.appendChild(advanced);
  }

  if (sourceContainer && sourceContainer !== technicalContainer) {
    advancedBody.appendChild(sourceContainer);
  }

  if (technicalContainer) {
    advancedBody.appendChild(technicalContainer);
  }

  profileSelect.addEventListener("change", refreshEquipmentProfileEditorWeb053);

  technical.addEventListener("change", () => {
    const detected = equipmentProfileFromTechnicalOptionWeb053(
      technical.options[technical.selectedIndex]
    );

    if (detected && !profileSelect.value) {
      profileSelect.value = detected;
    }
  });

  refreshEquipmentProfileEditorWeb053();
}

function renderEquipmentMappingPanel() {
  if (!ui.equipmentMappingSection) return;

  rebuildEquipmentMappingEquipmentSelect();
  rebuildEquipmentMappingSourceSelectWeb050();
  rebuildEquipmentMappingActivitySelectWeb050();
  syncEquipmentMappingLegacyFieldsWeb050();

  if (!ui.equipmentMappingList || !ui.equipmentMappingStatus) return;

  const rows = equipmentMappingRows.slice().sort((a,b) => {
    const generalA = equipmentMappingIsAllSources(a.import_source) ? 1 : 0;
    const generalB = equipmentMappingIsAllSources(b.import_source) ? 1 : 0;
    if (generalA !== generalB) return generalA - generalB;

    const activityCmp = equipmentMappingActivityLabel(a.sport, a.sub_sport)
      .localeCompare(equipmentMappingActivityLabel(b.sport, b.sub_sport), "fr");
    if (activityCmp) return activityCmp;

    return equipmentMappingSourceLabel(a.import_source)
      .localeCompare(equipmentMappingSourceLabel(b.import_source), "fr");
  });

  ui.equipmentMappingStatus.textContent = rows.length
    ? `${rows.length} correspondance(s) active(s) · choix manuel > règle spécifique > règle générale.`
    : "Aucune correspondance automatique.";

  ui.equipmentMappingList.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucune règle. Utilise « Ajouter une correspondance » ci-dessus.";
    ui.equipmentMappingList.appendChild(empty);
  } else {
    const fragment = document.createDocumentFragment();

    for (const rule of rows) {
      const card = document.createElement("div");
      card.className = "equipment-map-rule-web050";

      const main = document.createElement("div");
      main.className = "equipment-map-rule-main-web050";

      const title = document.createElement("strong");
      title.textContent = String(rule.equipment_name || "Matériel non défini");

      const meta = document.createElement("span");
      const sourceLabel = equipmentMappingIsAllSources(rule.import_source)
        ? "Toutes les sources"
        : equipmentMappingSourceLabel(rule.import_source);

      meta.textContent =
        `${equipmentMappingActivityLabel(rule.sport, rule.sub_sport)} · ${sourceLabel}`;

      main.append(title, meta);

      const badges = document.createElement("div");
      badges.className = "equipment-map-rule-badges-web050";

      const scope = document.createElement("span");
      scope.className = "pill neutral";
      scope.textContent = equipmentMappingRuleScopeLabel(rule);

      badges.append(scope);

      const actions = document.createElement("div");
      actions.className = "equipment-map-rule-actions-web050";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "secondary";
      edit.textContent = "Modifier";
      edit.addEventListener("click", () => editEquipmentMappingRuleWeb050(rule));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.textContent = "Supprimer";
      remove.addEventListener("click", () => { void deleteEquipmentMappingRule(rule); });

      actions.append(edit, remove);
      card.append(main, badges, actions);
      fragment.appendChild(card);
    }

    ui.equipmentMappingList.appendChild(fragment);
  }

  renderEquipmentMappingUnmatchedWeb050();

  if (ui.equipmentMappingAddButton) {
    ui.equipmentMappingAddButton.textContent = "Enregistrer la correspondance";
  }

  queueMicrotask(() => { installEquipmentProfileEditorWeb053(); refreshEquipmentProfileEditorWeb053(); });
}


async function addEquipmentMappingRule() {
  const profileSelect = document.getElementById("equipmentMappingProfileChoice");
  const technical = document.getElementById("equipmentMappingActivityChoice");

  if (!profileSelect || !technical || !profileSelect.value) {
    return addEquipmentMappingRuleLegacyWeb053();
  }

  const profileKey = profileSelect.value;
  const profileLabel = equipmentProfileLabelWeb053(profileKey);
  const technicalValues =
    equipmentTechnicalOptionsForProfileWeb053(profileKey).map((option) => option.value);

  if (technicalValues.length === 0) {
    setMessage(
      `WEBEQUIPMAP003 · aucune signature reconnue pour « ${profileLabel} ». Ouvre Réglages avancés si nécessaire.`,
      "error"
    );
    return;
  }

  const originalValue = technical.value;
  let saved = 0;

  for (const value of technicalValues) {
    const currentTechnical = document.getElementById("equipmentMappingActivityChoice");
    if (!currentTechnical) break;

    const exists = [...currentTechnical.options].some((option) => option.value === value);
    if (!exists) continue;

    currentTechnical.value = value;
    currentTechnical.dispatchEvent(new Event("change", { bubbles: true }));

    await addEquipmentMappingRuleLegacyWeb053();
    saved += 1;
  }

  const restoredTechnical = document.getElementById("equipmentMappingActivityChoice");
  if (restoredTechnical && [...restoredTechnical.options].some((option) => option.value === originalValue)) {
    restoredTechnical.value = originalValue;
  }

  const restoredProfile = document.getElementById("equipmentMappingProfileChoice");
  if (restoredProfile) restoredProfile.value = profileKey;

  refreshEquipmentProfileEditorWeb053();

  setMessage(
    `WEBEQUIPMAP003 · ${profileLabel} : correspondance enregistrée pour ${saved} signature(s).`,
    "success"
  );
}

async function addEquipmentMappingRuleLegacyWeb053() {
  if (!currentUser) return;

  syncEquipmentMappingLegacyFieldsWeb050();

  const source = String(
    document.getElementById("equipmentMappingSourceChoice")?.value ||
    ui.equipmentMappingSource?.value ||
    EQUIPMENT_MAPPING_ALL_SOURCES
  ).trim().toUpperCase();

  const activityValue = String(
    document.getElementById("equipmentMappingActivityChoice")?.value || ""
  );

  let sport = Number(ui.equipmentMappingSport?.value || 0);
  let subSport = Number(ui.equipmentMappingSubSport?.value || 0);

  if (activityValue.includes("|")) {
    [sport, subSport] = activityValue.split("|").map(Number);
  }

  const equipmentName = String(ui.equipmentMappingEquipment?.value || "").trim();

  if (!source) {
    setMessage("WEBEQUIPMAP002 · choisis une source ou Toutes les sources.", "error");
    return;
  }

  if (!Number.isFinite(sport) || sport < 0 || !Number.isFinite(subSport) || subSport < 0) {
    setMessage("WEBEQUIPMAP002 · type d’activité invalide.", "error");
    return;
  }

  if (!equipmentName) {
    setMessage("WEBEQUIPMAP002 · choisis un matériel.", "error");
    return;
  }

  const tuple = equipmentMappingKey(source, sport, subSport);
  const existing = equipmentMappingRows.find((rule) =>
    equipmentMappingKey(rule.import_source, rule.sport, rule.sub_sport) === tuple
  );

  const ref = existing
    ? doc(db, ROOT, currentUser.uid, "equipment_mappings", existing.__docId)
    : doc(userCollection("equipment_mappings"));

  const row = {
    import_source: source,
    sport,
    sub_sport: subSport,
    equipment_name: equipmentName,
    enabled: true,
    mapping_version: "WEBEQUIPMAP002",
    updated_at_ms: Date.now()
  };

  const batch = writeBatch(db);
  batch.set(ref, row, { merge: true });
  await batch.commit();

  if (existing) Object.assign(existing, row);
  else equipmentMappingRows.push({ ...row, __docId: ref.id });

  renderEquipmentMappingPanel();

  const scope = equipmentMappingIsAllSources(source)
    ? "Toutes les sources"
    : equipmentMappingSourceLabel(source);

  setMessage(
    `WEBEQUIPMAP002 · ${equipmentMappingActivityLabel(sport, subSport)} → ${equipmentName} (${scope}).`,
    "success"
  );
}

async function deleteEquipmentMappingRule(rule) {
  if (!currentUser || !rule?.__docId) return;
  const ok=window.confirm(`Supprimer la correspondance vers « ${rule.equipment_name || "matériel"} » ?`);
  if (!ok) return;
  const batch=writeBatch(db);
  batch.delete(doc(db,ROOT,currentUser.uid,"equipment_mappings",rule.__docId));
  await batch.commit();
  equipmentMappingRows=equipmentMappingRows.filter((item)=>item.__docId!==rule.__docId);
  renderEquipmentMappingPanel();
  setMessage("WEBEQUIPMAP001 · correspondance supprimée.","success");
}

async function applyEquipmentMappingsToExistingActivities() {
  if (!currentUser || !equipmentMappingRows.length) return;
  const ok=window.confirm(
    "Appliquer les correspondances aux activités existantes ?\n\n"+
    "Seules les activités sans choix manuel de matériel seront modifiées."
  );
  if (!ok) return;

  ui.equipmentMappingApplyButton.disabled=true;
  let changed=0;
  let scanned=0;
  const seen=new Set();
  try {
    for (const rule of equipmentMappingRows.filter((item)=>item.enabled!==false)) {
      const source=String(rule.import_source || "").trim();
      if (!source) continue;
      ui.equipmentMappingStatus.textContent=`Application · ${equipmentMappingSourceLabel(source)}…`;
      const snap=await getDocs(query(userCollection("activities"),where("import_source","==",source)));
      for (const hit of snap.docs) {
        if (seen.has(hit.id)) continue;
        const current={__docId:hit.id,...hit.data()};
        scanned++;
        if (current.deleted_at_ms!=null || numberOrZero(current.equipment_manual)===1) continue;
        const match=resolveAutomaticEquipmentMapping(current);
        if (!match || match.__docId!==rule.__docId) continue;
        const equipmentName=String(match.equipment_name || "").trim();
        if (String(current.equipment_name || "").trim()===equipmentName && String(current.equipment_mapping_id || "")===String(match.__docId || "")) {
          seen.add(hit.id);
          continue;
        }

        const patch={
          equipment_name:equipmentName,
          equipment_manual:0,
          equipment_mapping_id:match.__docId || null,
          equipment_mapping_applied_at_ms:Date.now()
        };
        const row={...current,...patch};
        delete row.__docId;
        await commitWebMutation({
          table:"activities",
          rowKey:hit.id,
          operation:"UPSERT",
          row,
          materializedCollection:"activities",
          materializedData:patch
        });
        const local=activities.find((item)=>String(item.__docId || item.id)===String(hit.id));
        if (local) Object.assign(local,patch);
        seen.add(hit.id);
        changed++;
        ui.equipmentMappingStatus.textContent=`Application en cours · ${changed} activité(s) mise(s) à jour…`;
      }
    }
    rebuildDynamicFilters();
    applyFiltersAndRender();
    await loadWebDashboard();
    renderEquipmentMappingPanel();
    setMessage(`WEBEQUIPMAP001 · ${changed} activité(s) mise(s) à jour sur ${scanned} examinée(s).`,"success");
  } catch (error) {
    console.error("WEBEQUIPMAP001 apply",error);
    ui.equipmentMappingStatus.textContent=`Application interrompue : ${error?.message || error}`;
    setMessage("WEBEQUIPMAP001 · application des correspondances interrompue.","error");
  } finally {
    ui.equipmentMappingApplyButton.disabled=false;
  }
}

// -----------------------------------------------------------------------------
// WEB041 · WEBSTRAVA002-FIX2 + WEBEQUIPMAP001 — Strava + matériel automatique
// -----------------------------------------------------------------------------
function webStravaBridgeUrl() {
  const custom=String(ui.webStravaBackendUrl?.value || localStorage.getItem("sport_web_strava_bridge_url") || "").trim();
  return custom || DEFAULT_STRAVA_BRIDGE_URL;
}

function initializeWebStravaModule() {
  if (!ui.webStravaBackendUrl) return;
  ui.webStravaBackendUrl.value=
    localStorage.getItem("sport_web_strava_bridge_url") || DEFAULT_STRAVA_BRIDGE_URL;

  if (!webStravaAutoHooksWired) {
    webStravaAutoHooksWired=true;
    window.addEventListener("online",()=>{
      if (currentUser) void autoSyncWebStrava({reason:"online",force:true});
    });
    window.addEventListener("focus",()=>{
      if (currentUser) void autoSyncWebStrava({reason:"focus"});
    });
    document.addEventListener("visibilitychange",()=>{
      if (!document.hidden && currentUser) void autoSyncWebStrava({reason:"visible"});
    });
  }

  renderWebStravaState();
}

async function webStravaFetch(action,options={}) {
  if (!currentUser) throw new Error("Connexion SPORT requise.");
  const token=await currentUser.getIdToken();
  const url=new URL(webStravaBridgeUrl());
  url.searchParams.set("action",action);
  for (const [key,value] of Object.entries(options.query || {})) {
    if (value!==undefined && value!==null && value!=="") url.searchParams.set(key,String(value));
  }

  const response=await fetch(url.toString(),{
    method:options.method || "GET",
    headers:{
      "Authorization":`Bearer ${token}`,
      ...(options.body ? {"Content-Type":"application/json"} : {})
    },
    body:options.body ? JSON.stringify(options.body) : undefined
  });

  let payload=null;
  const text=await response.text();
  try { payload=text ? JSON.parse(text) : null; }
  catch { payload={error:text}; }

  if (!response.ok) {
    const message=payload?.error || payload?.message || `Backend Strava ${response.status}`;
    const error=new Error(message);
    error.status=response.status;
    throw error;
  }
  return payload;
}


function renderUnifiedConnectionBadgeWeb051() {
  if (!ui.authState) return;

  const googleFirebaseOk = Boolean(currentUser);
  const stravaOk = Boolean(webStravaConnected);
  const networkOk = navigator.onLine !== false;
  const allConnected = googleFirebaseOk && stravaOk && networkOk;

  ui.authState.textContent = allConnected ? "Connecté" : "Non connecté";
  ui.authState.className =
    allConnected
      ? "pill auth-pill web051-unified-connection connected"
      : "pill auth-pill web051-unified-connection disconnected";

  ui.authState.title =
    `Google/Firebase : ${googleFirebaseOk ? "OK" : "NON"} · Strava : ${stravaOk ? "OK" : "NON"} · Réseau : ${networkOk ? "OK" : "NON"}`;
}

function renderWebStravaState() {
  if (!ui.webStravaBadge) return;
  ui.webStravaBadge.textContent=webStravaConnected ? "Connecté · Auto" : "Non connecté";
  ui.webStravaBadge.className=webStravaConnected ? "pill ok" : "pill neutral";
  ui.webStravaRefreshButton.disabled=!webStravaConnected || webStravaBusy;
  ui.webStravaDisconnectButton.disabled=!webStravaConnected || webStravaBusy;
  ui.webStravaConnectButton.disabled=webStravaBusy;
  renderWebStravaCandidates();

  renderUnifiedConnectionBadgeWeb051();
}

async function testWebStravaBackend() {
  ui.webStravaStatus.textContent="Test du backend sécurisé…";
  try {
    const status=await webStravaFetch("health");
    ui.webStravaStatus.textContent=
      `Backend Strava opérationnel · ${status?.region || "Firebase Functions"} · configuration ${status?.configured ? "prête" : "incomplète"}.`;
    setMessage(`WEBSTRAVA003 · backend ${status?.server_sync_version || "Strava"} joignable.`,"success");
  } catch (error) {
    ui.webStravaStatus.textContent=
      `Backend Strava indisponible : ${error?.message || error}`;
    setMessage("Le backend Strava doit être déployé/configuré avant OAuth.","error");
  }
}

async function refreshWebStravaStatus(options={}) {
  if (!ui.webStravaSection || webStravaBusy || !currentUser) return;
  ui.webStravaStatus.textContent="Vérification Strava…";
  try {
    const status=await webStravaFetch("status");
    webStravaConnected=Boolean(status?.connected);
    webStravaAthleteProfile=status?.athlete || null;
    webStravaServerAutomatic=Boolean(status?.webhook?.active);
    webStravaServerSubscriptionId=status?.webhook?.subscription_id || null;
    renderWebStravaAthlete();
    if (webStravaConnected) {
      const scope=status?.scope ? ` · ${status.scope}` : "";
      if (webStravaServerAutomatic) {
        ui.webStravaStatus.textContent=
          `Strava connecté${scope} · synchronisation serveur automatique active`+
          (webStravaServerSubscriptionId ? ` · webhook #${webStravaServerSubscriptionId}` : "")+".";
      } else {
        ui.webStravaStatus.textContent=
          `Strava connecté${scope} · serveur automatique indisponible`+
          (status?.webhook?.error ? ` · ${status.webhook.error}` : "")+
          " · rattrapage navigateur actif.";
      }

      // Un seul rattrapage navigateur à l'ouverture couvre les activités créées
      // juste avant l'activation initiale du webhook. Ensuite le serveur prend la main.
      if (options.autoSync) window.setTimeout(()=>{
        void autoSyncWebStrava({reason:"status",force:true});
      },0);
    } else {
      webStravaServerAutomatic=false;
      webStravaServerSubscriptionId=null;
      ui.webStravaStatus.textContent=
        status?.configured===false
          ? "Backend présent mais STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET ne sont pas encore configurés."
          : "Strava n’est pas encore autorisé.";
    }
  } catch (error) {
    webStravaConnected=false;
    webStravaAthleteProfile=null;
    webStravaServerAutomatic=false;
    webStravaServerSubscriptionId=null;
    ui.webStravaStatus.textContent=
      `Backend Strava indisponible : ${error?.message || error}`;
  }
  renderWebStravaState();
}

function renderWebStravaAthlete() {
  if (!ui.webStravaAthlete) return;
  const athlete=webStravaAthleteProfile;
  if (!athlete) {
    ui.webStravaAthlete.classList.add("hidden");
    ui.webStravaAthlete.innerHTML="";
    return;
  }
  ui.webStravaAthlete.classList.remove("hidden");
  const name=[athlete.firstname,athlete.lastname].filter(Boolean).join(" ") || `Athlète ${athlete.id || ""}`;
  ui.webStravaAthlete.innerHTML=`
    <strong>${escapeHtml(name)}</strong>
    <span>${athlete.id ? `Strava #${escapeHtml(String(athlete.id))}` : "Compte Strava"}</span>`;
}

async function connectWebStrava() {
  if (webStravaBusy) return;
  webStravaBusy=true;
  renderWebStravaState();
  ui.webStravaStatus.textContent="Préparation de l’autorisation Strava…";

  try {
    const start=await webStravaFetch("oauth_start");
    if (!start?.authorize_url) throw new Error("URL OAuth Strava absente.");

    const popup=window.open(
      start.authorize_url,
      "sport_strava_oauth",
      "popup=yes,width=620,height=760,resizable=yes,scrollbars=yes"
    );
    if (!popup) throw new Error("La fenêtre OAuth a été bloquée par le navigateur.");

    ui.webStravaStatus.textContent="Autorisez SPORT dans la fenêtre Strava…";

    const started=Date.now();
    while (Date.now()-started < 120000) {
      await new Promise((resolve)=>setTimeout(resolve,1500));
      if (popup.closed) {
        const status=await webStravaFetch("status");
        if (status?.connected) {
          webStravaConnected=true;
          webStravaAthleteProfile=status.athlete || null;
          renderWebStravaAthlete();
          ui.webStravaStatus.textContent="Strava connecté · première synchronisation automatique…";
          setMessage("WEBSTRAVA002 · connexion Strava réussie.","success");
          window.setTimeout(()=>{
            void autoSyncWebStrava({reason:"oauth",force:true});
          },0);
          return;
        }
      }
    }
    throw new Error("Autorisation Strava non confirmée dans le délai prévu.");
  } catch (error) {
    console.error(error);
    ui.webStravaStatus.textContent=`Connexion Strava impossible : ${error?.message || error}`;
  } finally {
    webStravaBusy=false;
    renderWebStravaState();
  }
}

async function disconnectWebStrava() {
  if (!webStravaConnected || webStravaBusy) return;
  const ok=window.confirm(
    "Déconnecter Strava de SPORT ?\n\nLes activités déjà importées resteront intactes."
  );
  if (!ok) return;

  webStravaBusy=true;
  renderWebStravaState();
  try {
    await webStravaFetch("disconnect",{method:"POST"});
    webStravaConnected=false;
    webStravaAthleteProfile=null;
    webStravaServerAutomatic=false;
    webStravaServerSubscriptionId=null;
    webStravaCandidates=[];
    renderWebStravaAthlete();
    ui.webStravaStatus.textContent="Strava déconnecté.";
    setMessage("WEBSTRAVA002 · Strava déconnecté. Les activités SPORT sont conservées.","success");
  } catch (error) {
    ui.webStravaStatus.textContent=`Déconnexion impossible : ${error?.message || error}`;
  } finally {
    webStravaBusy=false;
    renderWebStravaState();
  }
}

function stravaSportToFitSport(type,sportType) {
  const value=String(sportType || type || "").toLowerCase();
  if (value.includes("run")) return 1;
  if (value.includes("ride") || value.includes("cycle")) return 2;
  if (value.includes("walk")) return 11;
  if (value.includes("hike")) return 17;
  if (value.includes("swim")) return 5;
  return 0;
}

function stravaSummaryStartMs(summary) {
  const value=Date.parse(summary?.start_date || summary?.start_date_local || "");
  return Number.isFinite(value) ? value : null;
}

function stravaSummaryDurationMs(summary) {
  const seconds=numberOrZero(summary?.elapsed_time) || numberOrZero(summary?.moving_time);
  return seconds>0 ? seconds*1000 : 0;
}

function isProbableActivityForStrava(activity,summary) {
  if (!activity || activity.deleted_at_ms!=null) return false;

  const startMs=stravaSummaryStartMs(summary);
  if (!Number.isFinite(startMs)) return false;

  const remoteSport=stravaSportToFitSport(summary?.type,summary?.sport_type);
  const localSport=Number(activity.sport);
  if (remoteSport>0 && Number.isFinite(localSport) && localSport>0 && localSport!==remoteSport) return false;

  const timeDelta=Math.abs(numberOrZero(activity.start_time_ms)-startMs);
  if (timeDelta>WEB_STRAVA_DUPLICATE_TIME_WINDOW_MS) return false;

  const remoteDistance=numberOrZero(summary?.distance);
  const localDistance=numberOrZero(activity.distance_m);
  if (remoteDistance>0 && localDistance>0) {
    const distanceDelta=Math.abs(localDistance-remoteDistance);
    if (distanceDelta>Math.max(100,remoteDistance*0.02)) return false;
  }

  const remoteDuration=stravaSummaryDurationMs(summary);
  const localDuration=numberOrZero(activity.elapsed_time_ms) || numberOrZero(activity.timer_time_ms);
  if (remoteDuration>0 && localDuration>0) {
    const durationDelta=Math.abs(localDuration-remoteDuration);
    if (durationDelta>Math.max(180000,remoteDuration*0.10)) return false;
  }

  return true;
}

function probableExistingActivityForStrava(summary) {
  const stravaId=String(summary?.id || "");

  const exact=activities.find((activity)=>
    activity.deleted_at_ms==null && String(activity.strava_activity_id || "")===stravaId
  );
  if (exact) return {kind:"exact",activity:exact,label:"Déjà importée depuis Strava"};

  const probable=activities.find((activity)=>isProbableActivityForStrava(activity,summary));
  return probable ? {kind:"probable",activity:probable,label:"Activité SPORT probablement identique"} : null;
}

async function existingActivityForStravaAuto(summary) {
  const local=probableExistingActivityForStrava(summary);
  if (local) return local;
  if (!currentUser || !summary?.id) return null;

  try {
    // 1. Identifiant Strava exact. Une ligne en corbeille ne bloque jamais une réimportation.
    const exactSnap=await getDocs(query(
      userCollection("activities"),
      where("strava_activity_id","==",String(summary.id)),
      limit(5)
    ));
    for (const hit of exactSnap.docs) {
      const row={__docId:hit.id,...hit.data()};
      if (row.deleted_at_ms==null) {
        return {kind:"exact",activity:row,label:"Déjà importée depuis Strava"};
      }
    }

    // 2. Anti-doublon inter-plateformes : l'activité Android/Kinomap peut ne pas
    // encore porter strava_activity_id. On recherche donc directement Firestore
    // autour de l'heure de départ, indépendamment des 250 lignes chargées à l'écran.
    const startMs=stravaSummaryStartMs(summary);
    if (Number.isFinite(startMs)) {
      const probableSnap=await getDocs(query(
        userCollection("activities"),
        where("start_time_ms",">=",startMs-WEB_STRAVA_DUPLICATE_TIME_WINDOW_MS),
        where("start_time_ms","<=",startMs+WEB_STRAVA_DUPLICATE_TIME_WINDOW_MS),
        limit(25)
      ));
      for (const hit of probableSnap.docs) {
        const row={__docId:hit.id,...hit.data()};
        if (isProbableActivityForStrava(row,summary)) {
          return {kind:"probable",activity:row,label:"Activité SPORT probablement identique"};
        }
      }
    }
  } catch (error) {
    console.warn("WEBSTRAVA002-FIX1 duplicate lookup",summary.id,error);
  }
  return null;
}

function isWebStravaKinomapActivity(activity) {
  const text=[activity?.name,activity?.device_name].map((v)=>String(v || "").toLowerCase()).join(" ");
  return text.includes("kinomap");
}

function isWebStravaTreadmillActivity(activity) {
  if (stravaSportToFitSport(activity?.type,activity?.sport_type)!==1) return false;
  const text=[activity?.sport_type,activity?.type,activity?.name,activity?.device_name]
    .map((v)=>String(v || "").toLowerCase())
    .join(" ");
  return Boolean(activity?.trainer)
    || text.includes("virtualrun")
    || text.includes("virtual run")
    || text.includes("treadmill")
    || text.includes("tapis")
    || text.includes("kinomap");
}

function treadmillAscentMeters(distanceMeters,slopePercent=WEB_STRAVA_TREADMILL_SLOPE_PERCENT) {
  return Math.max(0,Math.round(numberOrZero(distanceMeters)*Math.max(0,numberOrZero(slopePercent))/100));
}

function applyWebStravaTreadmillSlope(route,totalDistanceMeters,slopePercent=WEB_STRAVA_TREADMILL_SLOPE_PERCENT) {
  const count=Math.max(
    route?.lat?.length || 0,
    route?.lon?.length || 0,
    route?.alt_m?.length || 0,
    route?.distance_m?.length || 0,
    route?.time_ms?.length || 0
  );
  if (!route || count<=0) return route;

  const total=Math.max(0,numberOrZero(totalDistanceMeters));
  const slope=Math.max(0,numberOrZero(slopePercent));
  const firstAltitude=(route.alt_m || []).find((value)=>Number.isFinite(Number(value)));
  const baseAltitude=Number.isFinite(Number(firstAltitude)) ? Number(firstAltitude) : 0;
  let previousDistance=0;

  while (route.distance_m.length<count) route.distance_m.push(null);
  while (route.alt_m.length<count) route.alt_m.push(null);

  for (let i=0;i<count;i++) {
    const stored=Number(route.distance_m[i]);
    let distance=Number.isFinite(stored) && stored>=0
      ? stored
      : (count<=1 ? 0 : total*i/(count-1));
    distance=Math.max(previousDistance,Math.min(total,distance));
    previousDistance=distance;
    route.distance_m[i]=distance;
    route.alt_m[i]=baseAltitude + distance*slope/100;
  }

  route.route_format="WEBSTRAVA002-TREADMILL12";
  return route;
}

function makeWebStravaActivityId(startMs,stravaId) {
  const base=Math.max(1,Math.floor(Number(startMs)||Date.now()));
  const text=String(stravaId || "");
  let suffix=0;
  for (let i=0;i<text.length;i++) suffix=(suffix*31+text.charCodeAt(i))%1000;
  return base*1000+suffix;
}

function webStravaAutoStorageKey() {
  return `sport_web_strava_auto_last_success_${currentUser?.uid || "anonymous"}`;
}

function lastWebStravaAutoSuccessMs() {
  try {
    return Math.max(0,Number(localStorage.getItem(webStravaAutoStorageKey()) || 0));
  } catch {
    return 0;
  }
}

function saveWebStravaAutoSuccessMs(value) {
  try {
    localStorage.setItem(webStravaAutoStorageKey(),String(Math.max(0,Number(value)||0)));
  } catch {
    // Le prochain contrôle repartira simplement sur la fenêtre initiale.
  }
}

function startWebStravaAutoSync() {
  stopWebStravaAutoSync();
  if (!currentUser || webStravaServerAutomatic) return;
  // WEBSTRAVA003 : le polling navigateur n'est plus le moteur principal.
  // Il reste uniquement comme filet de sécurité si le webhook serveur est absent.
  webStravaAutoSyncTimer=window.setInterval(()=>{
    void autoSyncWebStrava({reason:"timer"});
  },WEB_STRAVA_AUTO_INTERVAL_MS);
}

function stopWebStravaAutoSync() {
  if (webStravaAutoSyncTimer != null) {
    window.clearInterval(webStravaAutoSyncTimer);
    webStravaAutoSyncTimer=null;
  }
}

async function autoSyncWebStrava(options={}) {
  if (webStravaAutoSyncPromise) return webStravaAutoSyncPromise;
  if (!currentUser || !navigator.onLine || !webStravaConnected) return null;
  if (webStravaBusy) return null;

  const now=Date.now();
  if (!options.force && now-webStravaLastAutoAttemptMs < WEB_STRAVA_AUTO_MIN_GAP_MS) return null;
  webStravaLastAutoAttemptMs=now;

  webStravaAutoSyncPromise=(async()=>{
    webStravaBusy=true;
    renderWebStravaState();

    const previousSuccess=lastWebStravaAutoSuccessMs();
    const initialAfter=now-WEB_STRAVA_AUTO_INITIAL_LOOKBACK_DAYS*86400000;
    const afterMs=previousSuccess>0
      ? Math.max(initialAfter,previousSuccess-WEB_STRAVA_AUTO_OVERLAP_MS)
      : initialAfter;
    const after=Math.floor(afterMs/1000);

    let imported=0;
    let skipped=0;
    let failed=0;

    try {
      ui.webStravaStatus.textContent="Synchronisation Strava automatique…";
      const payload=await webStravaFetch("activities",{query:{after}});
      const rows=Array.isArray(payload?.activities)?payload.activities:[];

      for (const summary of rows.slice().reverse()) {
        const duplicate=await existingActivityForStravaAuto(summary);
        if (duplicate) {
          skipped++;
          continue;
        }

        const candidate={
          summary,
          duplicate:null,
          selected:false,
          imported:false,
          error:null
        };

        try {
          await commitOneWebStravaActivity(candidate);
          imported++;
        } catch (error) {
          failed++;
          console.error("WEBSTRAVA003 browser fallback import",summary?.id,error);
        }
      }

      saveWebStravaAutoSuccessMs(Date.now());
      if (imported>0) {
        rebuildDynamicFilters();
        applyFiltersAndRender();
        await loadWebDashboard();
      }

      ui.webStravaStatus.textContent=
        `Synchronisation automatique terminée · ${imported} importée(s) · ${skipped} déjà connue(s)`+
        (failed?` · ${failed} échec(s)`:"")+".";

      if (imported>0) {
        setMessage(
          `WEBSTRAVA003 · ${imported} nouvelle(s) activité(s) rattrapée(s) par le navigateur.`,
          failed?"info":"success"
        );
      }

      return {imported,skipped,failed,reason:options.reason || "auto"};
    } catch (error) {
      console.error("WEBSTRAVA003 browser fallback sync",error);
      ui.webStravaStatus.textContent=
        `Synchronisation Strava automatique impossible : ${error?.message || error}`;
      return {imported,skipped,failed:failed+1,error};
    } finally {
      webStravaBusy=false;
      webStravaAutoSyncPromise=null;
      renderWebStravaState();
    }
  })();

  return webStravaAutoSyncPromise;
}

async function loadWebStravaActivities() {
  if (!webStravaConnected || webStravaBusy) return;
  webStravaBusy=true;
  renderWebStravaState();
  const days=Math.max(1,Number(ui.webStravaDays.value || 30));
  const after=Math.floor((Date.now()-days*86400000)/1000);
  ui.webStravaStatus.textContent=`Lecture de Strava · ${days} jours…`;

  try {
    const payload=await webStravaFetch("activities",{query:{after}});
    const rows=Array.isArray(payload?.activities)?payload.activities:[];
    webStravaCandidates=rows.map((summary)=>{
      const duplicate=probableExistingActivityForStrava(summary);
      return {
        summary,
        duplicate,
        selected:!duplicate,
        imported:false,
        error:null
      };
    });
    ui.webStravaStatus.textContent=
      `${rows.length} activité(s) Strava reçue(s) · ${webStravaCandidates.filter(c=>c.duplicate).length} doublon(s) probable(s).`;
  } catch (error) {
    ui.webStravaStatus.textContent=`Lecture Strava impossible : ${error?.message || error}`;
  } finally {
    webStravaBusy=false;
    renderWebStravaState();
  }
}

function renderWebStravaCandidates() {
  if (!ui.webStravaPreviewList) return;
  ui.webStravaPreviewList.innerHTML="";
  let selected=0;

  for (const candidate of webStravaCandidates) {
    const a=candidate.summary;
    if (candidate.selected) selected++;
    const card=document.createElement("article");
    card.className=`web-strava-preview${candidate.duplicate?" duplicate":""}${candidate.error?" error":""}`;
    const startMs=Date.parse(a.start_date || a.start_date_local || "");
    card.innerHTML=`
      <label class="web-strava-preview-check">
        <input type="checkbox" ${candidate.selected?"checked":""} ${candidate.imported?"disabled":""}>
        <span>
          <strong>${escapeHtml(a.name || sportName(stravaSportToFitSport(a.type,a.sport_type)))}</strong>
          <small>Strava #${escapeHtml(String(a.id))}${candidate.duplicate?` · ${escapeHtml(candidate.duplicate.label)}`:""}</small>
        </span>
      </label>
      <div class="web-strava-preview-metrics">
        <span><small>Sport</small><strong>${escapeHtml(sportName(stravaSportToFitSport(a.type,a.sport_type)))}</strong></span>
        <span><small>Date</small><strong>${Number.isFinite(startMs)?escapeHtml(formatDateLong(startMs)):"—"}</strong></span>
        <span><small>Distance</small><strong>${escapeHtml(formatDistance(a.distance))}</strong></span>
        <span><small>Durée</small><strong>${escapeHtml(formatDuration(numberOrZero(a.elapsed_time)*1000))}</strong></span>
        <span><small>D+</small><strong>${escapeHtml(formatMeters(a.total_elevation_gain))}</strong></span>
        <span><small>FC moy.</small><strong>${escapeHtml(formatHeartRate(a.average_heartrate))}</strong></span>
      </div>
      ${candidate.error?`<p class="warning-text">${escapeHtml(candidate.error)}</p>`:""}`;

    const checkbox=card.querySelector('input[type="checkbox"]');
    checkbox?.addEventListener("change",()=>{
      candidate.selected=checkbox.checked;
      renderWebStravaCandidates();
    });
    ui.webStravaPreviewList.appendChild(card);
  }

  ui.webStravaImportButton.disabled=!webStravaConnected || webStravaBusy || selected===0;
  ui.webStravaImportButton.textContent=selected
    ? `Importer ${selected} activité${selected>1?"s":""}`
    : "Importer la sélection";
}

function normalizeStravaDetail(payload) {
  const a=payload.activity || {};
  const streams=payload.streams || {};
  const latlng=Array.isArray(streams.latlng?.data)?streams.latlng.data:[];
  const time=Array.isArray(streams.time?.data)?streams.time.data:[];
  const distance=Array.isArray(streams.distance?.data)?streams.distance.data:[];
  const altitude=Array.isArray(streams.altitude?.data)?streams.altitude.data:[];
  const hr=Array.isArray(streams.heartrate?.data)?streams.heartrate.data:[];
  const speed=Array.isArray(streams.velocity_smooth?.data)?streams.velocity_smooth.data:[];
  const cadence=Array.isArray(streams.cadence?.data)?streams.cadence.data:[];
  const moving=Array.isArray(streams.moving?.data)?streams.moving.data:[];

  const startMs=Date.parse(a.start_date || a.start_date_local || "");
  const count=Math.max(latlng.length,time.length,distance.length,altitude.length,hr.length,speed.length,cadence.length,moving.length);
  const route={
    lat:[],lon:[],alt_m:[],distance_m:[],time_ms:[],hr_bpm:[],speed_mps:[],cadence:[],moving:[],
    source_point_count:count,
    web_preview_point_count:count,
    route_format:"WEBSTRAVA003"
  };

  for (let i=0;i<count;i++) {
    const ll=latlng[i];
    route.lat.push(Array.isArray(ll)&&Number.isFinite(Number(ll[0]))?Number(ll[0]):null);
    route.lon.push(Array.isArray(ll)&&Number.isFinite(Number(ll[1]))?Number(ll[1]):null);
    route.alt_m.push(splitFiniteNumber(altitude[i]));
    route.distance_m.push(splitFiniteNumber(distance[i]));
    const relativeTime=splitFiniteNumber(time[i]);
    route.time_ms.push(relativeTime!=null&&Number.isFinite(startMs)?startMs+relativeTime*1000:null);
    route.hr_bpm.push(splitFiniteNumber(hr[i]));
    route.speed_mps.push(splitFiniteNumber(speed[i]));
    route.cadence.push(splitFiniteNumber(cadence[i]));
    route.moving.push(typeof moving[i]==="boolean"?moving[i]:null);
  }

  const treadmill=isWebStravaTreadmillActivity(a);
  const kinomap=isWebStravaKinomapActivity(a);
  const distanceMeters=numberOrZero(a.distance);
  if (treadmill) {
    applyWebStravaTreadmillSlope(route,distanceMeters,WEB_STRAVA_TREADMILL_SLOPE_PERCENT);
  }

  const activity={
    // FIX1 : identifiant déterministe pour qu'un même Strava soit idempotent
    // même si deux déclencheurs automatiques se succèdent.
    id:makeWebStravaActivityId(startMs,a.id),
    sport:stravaSportToFitSport(a.type,a.sport_type),
    sub_sport:treadmill?21:0,
    start_time_ms:startMs,
    elapsed_time_ms:numberOrZero(a.elapsed_time)*1000,
    timer_time_ms:numberOrZero(a.moving_time)*1000 || numberOrZero(a.elapsed_time)*1000,
    distance_m:distanceMeters,
    ascent_m:treadmill
      ? treadmillAscentMeters(distanceMeters,WEB_STRAVA_TREADMILL_SLOPE_PERCENT)
      : numberOrZero(a.total_elevation_gain),
    descent_m:0,
    calories:Number.isFinite(Number(a.calories))&&Number(a.calories)>0?Math.round(Number(a.calories)):null,
    avg_hr:Number.isFinite(Number(a.average_heartrate))?Math.round(Number(a.average_heartrate)):null,
    max_hr:Number.isFinite(Number(a.max_heartrate))?Math.round(Number(a.max_heartrate)):null,
    avg_speed_mps:Number.isFinite(Number(a.average_speed))?Number(a.average_speed):null,
    max_speed_mps:Number.isFinite(Number(a.max_speed))?Number(a.max_speed):null,
    custom_title:String(a.name || "").trim(),
    equipment_name:"",
    strava_activity_id:String(a.id),
    strava_type:a.type || null,
    strava_sport_type:a.sport_type || null,
    strava_device_name:a.device_name || null,
    import_source:kinomap?"KINOMAP_STRAVA_WEB":"STRAVA_WEB",
    import_profile:treadmill?"WEBSTRAVA003_TREADMILL12":"WEBSTRAVA003",
    imported_at_ms:Date.now(),
    gps_point_count:route.lat.filter((v,i)=>Number.isFinite(v)&&Number.isFinite(route.lon[i])).length,
    record_count:count,
    deleted_at_ms:null
  };

  applyAutomaticEquipmentMappingToDraft(activity);
  return {activity,route};
}

async function commitOneWebStravaActivity(candidate) {
  const payload=await webStravaFetch("activity",{query:{id:candidate.summary.id}});
  const normalized=normalizeStravaDetail(payload);
  const parts=automaticSplitPartsFromRawRoute(normalized.route,normalized.activity,[]);
  const items=parts.length>1 ? parts : [{child:normalized.activity,route:normalized.route}];
  const created=[];

  for (const item of items) {
    const activity=item.child;
    const route=item.route;
    const key=String(activity.id);
    await commitWebMutation({
      table:"activities",rowKey:key,operation:"UPSERT",row:activity,
      materializedCollection:"activities",materializedData:activity,
      metaIncrements:{activityCount:1,expectedDocuments:1}
    });
    if (Math.max(route.time_ms?.length||0,route.lat?.length||0)>=2) {
      await commitWebMutation({
        table:"activity_routes",rowKey:key,operation:"UPSERT",
        row:{id:activity.id,source_point_count:route.source_point_count,strava_activity_id:activity.strava_activity_id,split_part:activity.split_part||null},
        materializedCollection:"activity_routes",materializedData:route
      });
    }
    activities.push({...activity,__docId:key});
    created.push(activity);
  }
  return created;
}

async function importSelectedWebStravaActivities() {
  if (webStravaBusy) return;
  const selected=webStravaCandidates.filter((candidate)=>candidate.selected&&!candidate.imported);
  if (!selected.length) return;

  const forced=selected.filter((candidate)=>candidate.duplicate).length;
  if (forced) {
    const ok=window.confirm(
      `${forced} activité(s) présentent une alerte de doublon.\n\nLes importer quand même ?`
    );
    if (!ok) return;
  }

  webStravaBusy=true;
  renderWebStravaState();
  let success=0,failed=0;

  try {
    for (let i=0;i<selected.length;i++) {
      const candidate=selected[i];
      ui.webStravaStatus.textContent=
        `Import Strava ${i+1}/${selected.length} · ${candidate.summary.name || candidate.summary.id}`;
      try {
        await commitOneWebStravaActivity(candidate);
        candidate.imported=true;
        candidate.selected=false;
        success++;
      } catch (error) {
        console.error(error);
        candidate.error=error?.message || String(error);
        candidate.selected=false;
        failed++;
      }
      renderWebStravaCandidates();
    }

    rebuildDynamicFilters();
    applyFiltersAndRender();
    await loadWebDashboard();
    ui.webStravaStatus.textContent=
      `${success} activité(s) Strava importée(s)`+(failed?` · ${failed} échec(s)`:"")+".";
    setMessage(
      `WEBSTRAVA002 · ${success} activité(s) importée(s) depuis Strava.`,
      failed?"info":"success"
    );
  } finally {
    webStravaBusy=false;
    renderWebStravaState();
  }
}

// -----------------------------------------------------------------------------
// WEB039 · WEBDRIVE001 — archive Google Drive des FIT originaux
// -----------------------------------------------------------------------------
function driveStorageKey(name) {
  return `sport_web_drive_${currentUser?.uid || "anonymous"}_${name}`;
}

function restoreWebDriveState() {
  webDriveFolderId = localStorage.getItem(driveStorageKey("folder_id")) || null;
  renderWebDriveState();
}

function renderWebDriveState() {
  if (!ui.webDriveBadge) return;
  const connected=Boolean(webDriveAccessToken);
  ui.webDriveBadge.textContent=connected ? "Connecté" : "Déconnecté";
  ui.webDriveBadge.className=connected ? "pill ok" : "pill neutral";
  ui.webDriveConnectButton.textContent=connected ? "Reconnecter Drive" : "Connecter Drive";
  ui.webDriveUploadMissingButton.disabled=!connected || webDriveBusy;

  const originals=webFileVaultEntries.filter((entry)=>entry.kind==="original");
  const missing=originals.filter((entry)=>!entry.drive_file_id).length;

  if (connected) {
    ui.webDriveStatus.textContent=
      `${missing} original(aux) local(aux) sans sauvegarde Drive connue.`;
  } else {
    ui.webDriveStatus.textContent="Drive non connecté pour cette session.";
  }

  ui.webDriveFolderMeta.textContent=webDriveFolderId
    ? `Dossier SPORT Drive : ${webDriveFolderId}`
    : "Le dossier SPORT sera créé dans Mon Drive lors de la première sauvegarde.";
}

async function connectWebDrive() {
  if (webDriveBusy) return;
  webDriveBusy=true;
  ui.webDriveConnectButton.disabled=true;
  ui.webDriveStatus.textContent="Autorisation Google Drive…";

  try {
    const driveProvider=new GoogleAuthProvider();
    driveProvider.addScope(WEB_DRIVE_SCOPE);
    driveProvider.setCustomParameters({
      prompt:"consent select_account",
      access_type:"online"
    });

    const result=await signInWithPopup(auth,driveProvider);
    const credential=GoogleAuthProvider.credentialFromResult(result);
    const token=credential?.accessToken;
    if (!token) throw new Error("Jeton d’accès Google Drive absent.");

    webDriveAccessToken=token;
    await ensureWebDriveFolder();
    renderWebDriveState();
    setMessage("WEBDRIVE001 · Google Drive connecté.","success");
  } catch (error) {
    console.error(error);
    webDriveAccessToken=null;
    ui.webDriveStatus.textContent=
      `Connexion Drive impossible : ${error?.message || error}`;
    renderWebDriveState();
  } finally {
    webDriveBusy=false;
    ui.webDriveConnectButton.disabled=false;
    renderWebDriveState();
  }
}

async function driveApiFetch(url,options={}) {
  if (!webDriveAccessToken) throw new Error("Google Drive n’est pas connecté.");
  const headers=new Headers(options.headers || {});
  headers.set("Authorization",`Bearer ${webDriveAccessToken}`);
  const response=await fetch(url,{...options,headers});
  if (response.status===401 || response.status===403) {
    const text=await response.text();
    throw new Error(`Google Drive refuse l’accès (${response.status}) : ${text.slice(0,180)}`);
  }
  if (!response.ok) {
    const text=await response.text();
    throw new Error(`Erreur Google Drive ${response.status} : ${text.slice(0,220)}`);
  }
  if (response.status===204) return null;
  return response.json();
}

async function validateStoredWebDriveFolder() {
  if (!webDriveFolderId || !webDriveAccessToken) return false;
  try {
    const result=await driveApiFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(webDriveFolderId)}?fields=id,name,mimeType,trashed`
    );
    return Boolean(result?.id && !result.trashed && result.mimeType==="application/vnd.google-apps.folder");
  } catch (error) {
    console.warn("WEBDRIVE001 stored folder invalid",error);
    return false;
  }
}

async function findWebDriveFolder() {
  const q=[
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `name = '${WEB_DRIVE_FOLDER_NAME.replace(/'/g,"\\'")}'`,
    "appProperties has { key='sport_app' and value='DESPORTE' }"
  ].join(" and ");
  const result=await driveApiFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name,createdTime)&pageSize=10`
  );
  return result?.files?.[0] || null;
}

async function createWebDriveFolder() {
  return driveApiFetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,createdTime,webViewLink",
    {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        name:WEB_DRIVE_FOLDER_NAME,
        mimeType:"application/vnd.google-apps.folder",
        appProperties:{
          sport_app:"DESPORTE",
          sport_role:"archive_root"
        }
      })
    }
  );
}

async function ensureWebDriveFolder() {
  if (await validateStoredWebDriveFolder()) {
    renderWebDriveState();
    return webDriveFolderId;
  }

  let folder=await findWebDriveFolder();
  if (!folder) folder=await createWebDriveFolder();
  if (!folder?.id) throw new Error("Impossible de créer ou retrouver le dossier SPORT.");

  webDriveFolderId=folder.id;
  localStorage.setItem(driveStorageKey("folder_id"),webDriveFolderId);
  renderWebDriveState();
  return webDriveFolderId;
}

async function updateWebImportArchiveMetadata(sha256,patch) {
  const db=await openWebImportArchive();
  try {
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(WEB_IMPORT_ARCHIVE_STORE,"readwrite");
      const store=tx.objectStore(WEB_IMPORT_ARCHIVE_STORE);
      const request=store.get(String(sha256));
      request.onsuccess=()=>{
        const current=request.result;
        if (!current) {
          reject(new Error("FIT original introuvable dans le coffre local."));
          return;
        }
        store.put({...current,...patch});
      };
      request.onerror=()=>reject(request.error || new Error("Lecture IndexedDB impossible."));
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error || new Error("Mise à jour IndexedDB impossible."));
    });
  } finally {
    db.close();
  }
}

function driveSafeFileName(name) {
  const cleaned=String(name || "activity.fit")
    .replace(/[\/\\:*?"<>|]/g,"_")
    .trim();
  return cleaned.toLowerCase().endsWith(".fit") ? cleaned : `${cleaned}.fit`;
}

async function findDriveFileBySha(sha256) {
  const folderId=await ensureWebDriveFolder();
  const q=[
    `'${folderId}' in parents`,
    "trashed = false",
    `appProperties has { key='sport_sha256' and value='${String(sha256).replace(/'/g,"\\'")}' }`
  ].join(" and ");
  const result=await driveApiFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name,size,createdTime,webViewLink,appProperties)&pageSize=10`
  );
  return result?.files?.[0] || null;
}

async function uploadBlobToDrive(blob,fileName,sha256) {
  const folderId=await ensureWebDriveFolder();

  const existing=await findDriveFileBySha(sha256);
  if (existing) return {...existing,reused:true};

  const boundary=`sport_web_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const metadata={
    name:driveSafeFileName(fileName),
    parents:[folderId],
    mimeType:"application/octet-stream",
    appProperties:{
      sport_app:"DESPORTE",
      sport_kind:"original_fit",
      sport_sha256:String(sha256)
    }
  };

  const prefix=
    `--${boundary}\r\n`+
    `Content-Type: application/json; charset=UTF-8\r\n\r\n`+
    `${JSON.stringify(metadata)}\r\n`+
    `--${boundary}\r\n`+
    `Content-Type: application/octet-stream\r\n\r\n`;
  const suffix=`\r\n--${boundary}--`;

  const body=new Blob([prefix,blob,suffix],{
    type:`multipart/related; boundary=${boundary}`
  });

  return driveApiFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime,webViewLink,appProperties",
    {
      method:"POST",
      headers:{"Content-Type":`multipart/related; boundary=${boundary}`},
      body
    }
  );
}

async function uploadOriginalEntryToDrive(entry,button=null) {
  if (entry.kind!=="original") return;
  if (!webDriveAccessToken) {
    await connectWebDrive();
    if (!webDriveAccessToken) return;
  }

  button && (button.disabled=true);
  if (button) button.textContent="Envoi Drive…";

  try {
    const stored=await readWebImportArchiveEntry(entry.sha256);
    if (!stored?.blob) throw new Error("Copie locale FIT introuvable.");

    // Integrity is checked before cloud upload.
    const digest=await sha256Hex(await stored.blob.arrayBuffer());
    if (digest!==entry.sha256) {
      throw new Error("Le SHA-256 local ne correspond plus à l’empreinte enregistrée.");
    }

    const remote=await uploadBlobToDrive(stored.blob,entry.file_name,entry.sha256);
    const patch={
      drive_file_id:remote.id,
      drive_file_name:remote.name,
      drive_folder_id:webDriveFolderId,
      drive_uploaded_at_ms:Date.now(),
      drive_web_view_link:remote.webViewLink || null,
      drive_sha256:entry.sha256
    };
    await updateWebImportArchiveMetadata(entry.sha256,patch);
    Object.assign(entry,patch);
    renderWebDriveState();

    if (button) {
      button.textContent=remote.reused ? "✓ Déjà sur Drive" : "✓ Sauvegardé";
      button.classList.add("verified");
    }
    setMessage(
      `WEBDRIVE001 · ${entry.file_name} ${remote.reused?"déjà présent":"sauvegardé"} dans Google Drive.`,
      "success"
    );
  } catch (error) {
    console.error(error);
    if (button) button.textContent="⚠ Échec Drive";
    setMessage(`Sauvegarde Drive impossible : ${error?.message || error}`,"error");
  } finally {
    if (button) {
      window.setTimeout(()=>{
        button.disabled=false;
        renderWebFileVaultList();
      },1200);
    }
  }
}

async function uploadMissingOriginalsToDrive() {
  if (webDriveBusy) return;
  if (!webDriveAccessToken) {
    await connectWebDrive();
    if (!webDriveAccessToken) return;
  }

  const missing=webFileVaultEntries.filter((entry)=>entry.kind==="original" && !entry.drive_file_id);
  if (!missing.length) {
    setMessage("WEBDRIVE001 · tous les FIT originaux connus sont déjà sauvegardés.","success");
    return;
  }

  const ok=window.confirm(
    `Sauvegarder ${missing.length} FIT original(aux) dans Google Drive ?\n\n`+
    `Dossier : ${WEB_DRIVE_FOLDER_NAME}\n`+
    `Les copies locales resteront intactes.`
  );
  if (!ok) return;

  webDriveBusy=true;
  ui.webDriveUploadMissingButton.disabled=true;
  let success=0,failed=0;

  try {
    for (let i=0;i<missing.length;i++) {
      const entry=missing[i];
      ui.webDriveStatus.textContent=
        `Sauvegarde Drive ${i+1}/${missing.length} · ${entry.file_name}`;
      try {
        const stored=await readWebImportArchiveEntry(entry.sha256);
        if (!stored?.blob) throw new Error("FIT local introuvable.");
        const digest=await sha256Hex(await stored.blob.arrayBuffer());
        if (digest!==entry.sha256) throw new Error("SHA local invalide.");

        const remote=await uploadBlobToDrive(stored.blob,entry.file_name,entry.sha256);
        const patch={
          drive_file_id:remote.id,
          drive_file_name:remote.name,
          drive_folder_id:webDriveFolderId,
          drive_uploaded_at_ms:Date.now(),
          drive_web_view_link:remote.webViewLink || null,
          drive_sha256:entry.sha256
        };
        await updateWebImportArchiveMetadata(entry.sha256,patch);
        Object.assign(entry,patch);
        success++;
      } catch (error) {
        console.error("WEBDRIVE001 batch",entry.file_name,error);
        failed++;
      }
      renderWebDriveState();
    }

    renderWebFileVaultList();
    ui.webDriveStatus.textContent=
      `${success} sauvegarde(s) Drive réussie(s)`+(failed?` · ${failed} échec(s)`:"")+".";
    setMessage(
      `WEBDRIVE001 · ${success} FIT sauvegardé(s) sur Drive${failed?` · ${failed} échec(s)`:""}.`,
      failed?"info":"success"
    );
  } finally {
    webDriveBusy=false;
    renderWebDriveState();
  }
}

// -----------------------------------------------------------------------------
// WEB038 · WEBFILES001 — coffre de fichiers local + relations activité/fichier
// -----------------------------------------------------------------------------
async function listWebImportArchiveEntries() {
  const db=await openWebImportArchive();
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(WEB_IMPORT_ARCHIVE_STORE,"readonly");
      const request=tx.objectStore(WEB_IMPORT_ARCHIVE_STORE).getAll();
      request.onsuccess=()=>resolve(Array.isArray(request.result)?request.result:[]);
      request.onerror=()=>reject(request.error || new Error("Lecture du coffre impossible."));
    });
  } finally {
    db.close();
  }
}

async function readWebImportArchiveEntry(sha256) {
  const db=await openWebImportArchive();
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(WEB_IMPORT_ARCHIVE_STORE,"readonly");
      const request=tx.objectStore(WEB_IMPORT_ARCHIVE_STORE).get(String(sha256));
      request.onsuccess=()=>resolve(request.result || null);
      request.onerror=()=>reject(request.error || new Error("Lecture du fichier impossible."));
    });
  } finally {
    db.close();
  }
}

async function deleteWebImportArchiveEntry(sha256) {
  const db=await openWebImportArchive();
  try {
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(WEB_IMPORT_ARCHIVE_STORE,"readwrite");
      tx.objectStore(WEB_IMPORT_ARCHIVE_STORE).delete(String(sha256));
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error || new Error("Suppression locale impossible."));
    });
  } finally {
    db.close();
  }
}

function webFileActivityLinksForSha(sha256) {
  const key=String(sha256||"");
  return activities.filter((activity)=>String(activity.source_sha256||"")===key);
}

function sourceActivityForSplit(child) {
  const parent=String(child?.split_parent_activity_id||"");
  if (!parent) return null;
  return activities.find((activity)=>String(activityKey(activity))===parent) || null;
}

function webDerivedFileEntries() {
  return activities
    .filter((activity)=>String(activity.import_profile||"").includes("WEBSPLIT00") || String(activity.import_source||"")==="WEB_SPLIT")
    .map((activity)=>{
      const parent=sourceActivityForSplit(activity);
      return {
        kind:"derived",
        key:`derived:${activityKey(activity)}`,
        activity,
        parent,
        file_name:`${activity.custom_title || sportName(activity.sport)}.fit`,
        file_size_bytes:null,
        sha256:null,
        imported_at_ms:numberOrZero(activity.split_created_at_ms),
        blob:null,
        linkedActivities:[activity],
        originalAvailable:Boolean(parent?.source_sha256),
        originalSha:parent?.source_sha256 || null
      };
    });
}

async function buildWebFileVaultEntries() {
  const originals=await listWebImportArchiveEntries();
  const mappedOriginals=originals.map((entry)=>({
    kind:"original",
    key:`original:${entry.sha256}`,
    ...entry,
    linkedActivities:webFileActivityLinksForSha(entry.sha256)
  }));
  return [...mappedOriginals,...webDerivedFileEntries()];
}

function webFileEntryDate(entry) {
  const linked=entry.linkedActivities?.[0];
  return numberOrZero(linked?.start_time_ms) || numberOrZero(entry.imported_at_ms);
}

function webFileEntrySearchText(entry) {
  const linked=(entry.linkedActivities||[])
    .map((activity)=>`${activity.custom_title||""} ${sportName(activity.sport)} ${formatDateLong(activity.start_time_ms)}`)
    .join(" ");
  return `${entry.file_name||""} ${entry.sha256||""} ${linked}`.toLowerCase();
}

function webFileEntryMatchesFilter(entry) {
  const filter=ui.webFilesFilter?.value || "all";
  if (filter==="originals" && entry.kind!=="original") return false;
  if (filter==="derived" && entry.kind!=="derived") return false;
  if (filter==="unlinked" && (entry.linkedActivities?.length || 0)>0) return false;
  const search=String(ui.webFilesSearch?.value||"").trim().toLowerCase();
  return !search || webFileEntrySearchText(entry).includes(search);
}

function updateWebFileVaultSummary() {
  if (!ui.webFilesSummaryBadge) return;
  const originals=webFileVaultEntries.filter((entry)=>entry.kind==="original");
  const derived=webFileVaultEntries.filter((entry)=>entry.kind==="derived");
  const bytes=originals.reduce((sum,entry)=>sum+numberOrZero(entry.file_size_bytes),0);
  const linked=new Set(
    originals.flatMap((entry)=>(entry.linkedActivities||[]).map((activity)=>activityKey(activity)))
  );

  ui.webFilesSummaryBadge.textContent=`${formatNumber(originals.length)} FIT`;
  ui.webFilesSummaryBadge.className=originals.length?"pill ok":"pill neutral";
  ui.webFilesOriginalCount.textContent=formatNumber(originals.length);
  ui.webFilesLocalSize.textContent=formatBytes(bytes);
  ui.webFilesLinkedCount.textContent=formatNumber(linked.size);
  ui.webFilesDerivedCount.textContent=formatNumber(derived.length);
}

function triggerBlobDownload(blob,fileName) {
  if (!blob) return;
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download=fileName || "activity.fit";
  anchor.style.display="none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),30000);
}

async function verifyWebFileIntegrity(entry,button) {
  if (entry.kind!=="original" || !entry.sha256) return;
  button.disabled=true;
  const old=button.textContent;
  button.textContent="Vérification…";
  try {
    const stored=await readWebImportArchiveEntry(entry.sha256);
    if (!stored?.blob) throw new Error("Binaire local introuvable.");
    const buffer=await stored.blob.arrayBuffer();
    const digest=await sha256Hex(buffer);
    if (digest!==entry.sha256) {
      throw new Error(`SHA différent : ${digest.slice(0,12)}…`);
    }
    button.textContent="✓ Intègre";
    button.classList.add("verified");
    setMessage(`WEBFILES001 · intégrité confirmée pour ${entry.file_name}.`,"success");
  } catch (error) {
    button.textContent="⚠ Erreur";
    setMessage(`Intégrité non confirmée : ${error?.message||error}`,"error");
  } finally {
    window.setTimeout(()=>{
      button.disabled=false;
      if (!button.classList.contains("verified")) button.textContent=old;
    },1200);
  }
}

async function removeLocalWebFile(entry) {
  if (entry.kind!=="original") return;
  const linked=entry.linkedActivities?.length || 0;
  const ok=window.confirm(
    `Supprimer uniquement la copie locale « ${entry.file_name} » ?\n\n`+
    `${linked} activité(s) Firestore restent intactes. Cette action ne supprime aucune activité.`
  );
  if (!ok) return;

  try {
    await deleteWebImportArchiveEntry(entry.sha256);
    webFileVaultEntries=[];
    await renderWebFileVault(true);
    setMessage("WEBFILES001 · copie locale supprimée. Les activités sont conservées.","success");
  } catch (error) {
    handleError(error,"Suppression du fichier local impossible");
  }
}

function openLinkedWebFileActivity(entry) {
  const activity=entry.linkedActivities?.[0];
  if (activity) showActivity(activity);
}

function webFileOriginalCard(entry) {
  const linked=entry.linkedActivities || [];
  const date=webFileEntryDate(entry);
  const names=linked.slice(0,3).map((activity)=>
    `${formatDate(activity.start_time_ms)} · ${activity.custom_title || sportName(activity.sport)}`
  ).join("<br>");

  const card=document.createElement("article");
  card.className="web-file-card original";
  card.innerHTML=`
    <div class="web-file-card-head">
      <div>
        <div class="web-file-badges">
          <span class="pill ok">FIT original</span>
          ${entry.drive_file_id?'<span class="pill ok">Drive ✓</span>':'<span class="pill neutral">Drive —</span>'}
        </div>
        <strong>${escapeHtml(entry.file_name || "activity.fit")}</strong>
        <small>${escapeHtml(formatBytes(entry.file_size_bytes))} · ${date?escapeHtml(formatDateLong(date)):"date inconnue"}</small>
      </div>
      <span class="web-file-sha" title="${escapeHtml(entry.sha256)}">${escapeHtml(String(entry.sha256||"").slice(0,16))}…</span>
    </div>
    <div class="web-file-link-summary">
      <span><b>${linked.length}</b> activité(s) liée(s)</span>
      ${names?`<span>${names}</span>`:'<span class="warning-text">Aucune activité liée à ce SHA</span>'}
    </div>
    <div class="web-file-actions">
      <button class="primary web-file-drive" type="button">${entry.drive_file_id?"Drive ✓":"Sauvegarder Drive"}</button>
      <button class="secondary web-file-download" type="button">Télécharger</button>
      <button class="secondary web-file-verify" type="button">Vérifier SHA</button>
      ${entry.drive_web_view_link?'<button class="secondary web-file-drive-open" type="button">Ouvrir Drive</button>':""}
      ${linked.length?'<button class="secondary web-file-open" type="button">Ouvrir activité</button>':""}
      <button class="secondary danger-soft web-file-delete" type="button">Supprimer copie locale</button>
    </div>`;

  card.querySelector(".web-file-drive")?.addEventListener("click",(event)=>{
    void uploadOriginalEntryToDrive(entry,event.currentTarget);
  });
  card.querySelector(".web-file-drive-open")?.addEventListener("click",()=>{
    if (entry.drive_web_view_link) window.open(entry.drive_web_view_link,"_blank","noopener,noreferrer");
  });
  card.querySelector(".web-file-download")?.addEventListener("click",async()=>{
    const stored=await readWebImportArchiveEntry(entry.sha256);
    if (stored?.blob) triggerBlobDownload(stored.blob,entry.file_name);
  });
  card.querySelector(".web-file-verify")?.addEventListener("click",(event)=>{
    void verifyWebFileIntegrity(entry,event.currentTarget);
  });
  card.querySelector(".web-file-open")?.addEventListener("click",()=>openLinkedWebFileActivity(entry));
  card.querySelector(".web-file-delete")?.addEventListener("click",()=>{ void removeLocalWebFile(entry); });
  return card;
}

function webFileDerivedCard(entry) {
  const activity=entry.activity;
  const parent=entry.parent;
  const card=document.createElement("article");
  card.className="web-file-card derived";
  card.innerHTML=`
    <div class="web-file-card-head">
      <div>
        <span class="pill pending">Dérivé</span>
        <strong>${escapeHtml(entry.file_name)}</strong>
        <small>${escapeHtml(formatDateLong(activity.start_time_ms))} · ${escapeHtml(formatDistance(activity.distance_m))}</small>
      </div>
      <span class="pill neutral">FIT non généré</span>
    </div>
    <div class="web-file-link-summary">
      <span>Activité dérivée #${escapeHtml(String(activityKey(activity)))}</span>
      <span>${parent?`Source #${escapeHtml(String(activityKey(parent)))}${parent.source_sha256?" · original localisable par SHA":""}`:"Source non chargée"}</span>
    </div>
    <div class="web-file-actions">
      <button class="secondary web-file-open" type="button">Ouvrir activité</button>
      ${parent?'<button class="secondary web-file-open-source" type="button">Ouvrir source</button>':""}
    </div>`;
  card.querySelector(".web-file-open")?.addEventListener("click",()=>showActivity(activity));
  card.querySelector(".web-file-open-source")?.addEventListener("click",()=>{ if (parent) showActivity(parent); });
  return card;
}

function renderWebFileVaultList() {
  if (!ui.webFilesList) return;
  ui.webFilesList.innerHTML="";
  const rows=webFileVaultEntries
    .filter(webFileEntryMatchesFilter)
    .sort((a,b)=>webFileEntryDate(b)-webFileEntryDate(a));

  if (!rows.length) {
    ui.webFilesList.innerHTML='<div class="web-files-empty">Aucun fichier correspondant.</div>';
    return;
  }

  rows.forEach((entry)=>{
    ui.webFilesList.appendChild(entry.kind==="original"
      ? webFileOriginalCard(entry)
      : webFileDerivedCard(entry));
  });
}

async function renderWebFileVault(force=false) {
  if (!ui.webFilesSection || webFileVaultLoading) return;
  if (webFileVaultEntries.length && !force) {
    updateWebFileVaultSummary();
    renderWebFileVaultList();
    restoreWebDriveState();
    return;
  }

  webFileVaultLoading=true;
  ui.webFilesStatus.textContent="Lecture du coffre local…";
  try {
    webFileVaultEntries=await buildWebFileVaultEntries();
    updateWebFileVaultSummary();
    renderWebFileVaultList();
    restoreWebDriveState();

    const originals=webFileVaultEntries.filter((entry)=>entry.kind==="original").length;
    const derived=webFileVaultEntries.filter((entry)=>entry.kind==="derived").length;
    ui.webFilesStatus.textContent=
      `${originals} original(aux) FIT dans ce navigateur · ${derived} activité(s) dérivée(s) sans nouveau FIT binaire.`;
  } catch (error) {
    console.error(error);
    ui.webFilesStatus.textContent=`Coffre indisponible : ${error?.message||error}`;
  } finally {
    webFileVaultLoading=false;
  }
}

// -----------------------------------------------------------------------------
// WEB044 · WEBSPLIT003 — découpe automatique prioritaire + secours manuel + reconstruction
// -----------------------------------------------------------------------------
function splitRouteHasTimeline(route) {
  const points=route?.points || [];
  const valid=points.filter((point)=>Number.isFinite(Number(point.timeMs)) && Number(point.timeMs)>0);
  return valid.length >= Math.max(2, Math.floor(points.length*0.7));
}

function closeSplitActivityPanel() {
  ui.splitActivityPanel?.classList.add("hidden");
  if (ui.splitActivityWorkspace) ui.splitActivityWorkspace.classList.add("hidden");
  if (ui.splitActivityStatus) ui.splitActivityStatus.textContent="Chargement du tracé détaillé…";
  splitActivityRoute=null;
  splitActivitySource=null;
  splitActivitySessions=[];
}

function splitFiniteNumber(value) {
  if (value==null || value==="") return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function normalizeSplitRoute(data) {
  const equipmentSource=Array.isArray(data?.equipment_key)?data.equipment_key
    :Array.isArray(data?.gear_id)?data.gear_id
    :Array.isArray(data?.equipment_name)?data.equipment_name:[];
  const fields = {
    lat:Array.isArray(data?.lat)?data.lat:[],
    lon:Array.isArray(data?.lon)?data.lon:[],
    alt:Array.isArray(data?.alt_m)?data.alt_m:[],
    distance:Array.isArray(data?.distance_m)?data.distance_m:[],
    time:Array.isArray(data?.time_ms)?data.time_ms:Array.isArray(data?.timestamp_ms)?data.timestamp_ms:[],
    hr:Array.isArray(data?.hr_bpm)?data.hr_bpm:[],
    speed:Array.isArray(data?.speed_mps)?data.speed_mps:[],
    moving:Array.isArray(data?.moving)?data.moving:[],
    equipment:equipmentSource
  };
  const count=Math.max(...Object.values(fields).map((values)=>values.length),0);
  const points=[];
  for (let index=0;index<count;index++) {
    const lat=splitFiniteNumber(fields.lat[index]),lon=splitFiniteNumber(fields.lon[index]);
    const equipmentRaw=fields.equipment[index];
    points.push({
      latitude:lat,
      longitude:lon,
      altitudeMeters:splitFiniteNumber(fields.alt[index]),
      distanceMeters:splitFiniteNumber(fields.distance[index]),
      timeMs:splitFiniteNumber(fields.time[index]),
      heartRateBpm:splitFiniteNumber(fields.hr[index]),
      speedMps:splitFiniteNumber(fields.speed[index]),
      moving:typeof fields.moving[index]==="boolean"?fields.moving[index]:null,
      equipmentKey:equipmentRaw==null?null:String(equipmentRaw).trim() || null,
      sourceIndex:index
    });
  }
  return {points,raw:data || {},sessions:Array.isArray(data?.fit_sessions)?data.fit_sessions:[]};
}

async function persistRecoveredSplitRoute(activity, rawRoute) {
  if (!currentUser || !activity || !rawRoute) return;
  const key=activityKey(activity);
  const materialized={...rawRoute,route_format:`${WEB_SPLIT_VERSION}-RECOVERED`,__sportKey:key,__updatedAtMs:Date.now()};
  try {
    await setDoc(doc(db,ROOT,currentUser.uid,"activity_routes",key),materialized,{merge:true});
  } catch (error) {
    console.warn("WEBSPLIT003 persist recovered route",error);
  }
}

async function recoverSplitRouteForActivity(activity) {
  const key=activityKey(activity);
  const snapshot=await getDoc(doc(db,ROOT,currentUser.uid,"activity_routes",key));
  if (snapshot.exists()) {
    const recovered=normalizeSplitRoute(snapshot.data());
    if (recovered.points.length>=2) return recovered;
  }

  if (activity?.strava_activity_id) {
    try {
      const payload=await webStravaFetch("activity",{query:{id:activity.strava_activity_id}});
      const normalized=normalizeStravaDetail(payload);
      const recovered=normalizeSplitRoute(normalized.route);
      if (recovered.points.length>=2) {
        await persistRecoveredSplitRoute(activity,normalized.route);
        return recovered;
      }
    } catch (error) {
      console.warn("WEBSPLIT003 Strava reconstruction",error);
    }
  }

  if (activity?.source_sha256) {
    const stored=await readWebImportArchiveEntry(activity.source_sha256);
    if (stored?.blob) {
      const parsed=decodeFitActivity(await stored.blob.arrayBuffer(),stored.file_name || activity.file_name || "activity.fit");
      let raw=buildWebImportRoute(parsed);
      const start=Number(activity.start_time_ms);
      const end=start + Math.max(0,numberOrZero(activity.elapsed_time_ms));
      if (Number.isFinite(start) && end>start && Array.isArray(raw.time_ms)) {
        const indices=[];
        raw.time_ms.forEach((value,index)=>{
          const t=Number(value);
          if (Number.isFinite(t) && t>=start-1000 && t<=end+1000) indices.push(index);
        });
        if (indices.length>=2) raw=sliceWebRouteData(raw,indices[0],indices[indices.length-1]);
      }
      const recovered=normalizeSplitRoute(raw);
      recovered.sessions=parsed.sessions || [];
      if (recovered.points.length>=2) {
        await persistRecoveredSplitRoute(activity,raw);
        return recovered;
      }
    }
  }

  throw new Error("Chronologie détaillée introuvable. Aucun activity_routes, stream Strava ou FIT local exploitable.");
}

async function openSplitActivityPanel() {
  const activity=currentDetailActivity();
  if (!activity || splitActivitySaving) return;

  splitActivitySource=activity;
  ui.splitActivityPanel.classList.remove("hidden");
  ui.splitActivityWorkspace.classList.add("hidden");
  ui.splitActivityStatus.textContent="WEBSPLIT003 · recherche des ruptures automatiques…";
  ui.splitActivityStatus.className="split-activity-status pending";
  ui.splitActivityPanel.scrollIntoView({behavior:"smooth",block:"start"});

  try {
    let route=null;
    try {
      route=await recoverSplitRouteForActivity(activity);
    } catch (recoveryError) {
      if (activeRoute && splitRouteHasTimeline(activeRoute)) route=activeRoute;
      else throw recoveryError;
    }

    if (!route?.points?.length || route.points.length<4) {
      throw new Error("La chronologie ne contient pas assez de points pour être découpée.");
    }
    if (!splitRouteHasTimeline(route)) {
      throw new Error("Cette activité ne possède pas une chronologie point-par-point suffisante pour une découpe fiable.");
    }

    splitActivityRoute=route;
    splitActivitySessions=Array.isArray(route.sessions)?route.sessions:[];
    const rawRoute=splitRouteDocument(route.points);
    const automaticParts=automaticSplitPartsFromRawRoute(rawRoute,activity,splitActivitySessions);
    const automaticBoundaries=detectAutomaticSplitBoundariesFromPoints(route.points,splitActivitySessions);

    ui.splitActivityWorkspace.classList.remove("hidden");

    if (automaticParts.length>=2 && automaticBoundaries.length) {
      setSplitManualControlsVisible(false);
      if (ui.splitActivityAutoButton) {
        ui.splitActivityAutoButton.disabled=false;
        ui.splitActivityAutoButton.hidden=false;
        ui.splitActivityAutoButton.textContent=`Appliquer la découpe automatique · ${automaticParts.length} parties`;
      }
      ui.splitActivityStatus.textContent=
        `WEBSPLIT003 · ${automaticBoundaries.length} rupture(s) détectée(s) · ${automaticParts.length} parties · aucune manipulation du curseur nécessaire.`;
      ui.splitActivityStatus.className="split-activity-status success";
      renderAutomaticSplitPreview(automaticParts,automaticBoundaries);
      return;
    }

    setSplitManualControlsVisible(true);
    ui.splitActivityRange.value="50";
    ui.splitActivityTitleA.value=activity.custom_title ? `${activity.custom_title} · 1` : `${sportName(activity.sport)} · partie 1`;
    ui.splitActivityTitleB.value=activity.custom_title ? `${activity.custom_title} · 2` : `${sportName(activity.sport)} · partie 2`;
    if (ui.splitActivityAutoButton) {
      ui.splitActivityAutoButton.disabled=true;
      ui.splitActivityAutoButton.hidden=true;
      ui.splitActivityAutoButton.textContent="Aucune rupture automatique détectée";
    }
    const gapDiag=splitGapDiagnostics(route.points);
    ui.splitActivityStatus.textContent=
      `WEBSPLIT003 · ${formatNumber(route.points.length)} points · aucune rupture automatique · saut temporel max ${formatSplitGap(gapDiag.maxAdjacent)||"—"} · signal mouvement ${Math.round(gapDiag.signalCoverage*100)} % · découpe manuelle disponible.`;
    ui.splitActivityStatus.className="split-activity-status muted";
    renderSplitActivityPreview();
  } catch (error) {
    console.error(error);
    ui.splitActivityStatus.textContent=error?.message || String(error);
    ui.splitActivityStatus.className="split-activity-status error";
  }
}

function splitIndexFromPercent(route,percent) {
  const points=route?.points || [];
  if (points.length<2) return 0;
  const target=Math.max(0,Math.min(1,Number(percent)/100));
  const total=numberOrZero(points[points.length-1].distanceMeters)-numberOrZero(points[0].distanceMeters);
  if (total<=0) return Math.max(1,Math.min(points.length-2,Math.round(target*(points.length-1))));
  const targetDistance=numberOrZero(points[0].distanceMeters)+total*target;
  let best=1, bestDelta=Infinity;
  for (let i=1;i<points.length-1;i++) {
    const delta=Math.abs(numberOrZero(points[i].distanceMeters)-targetDistance);
    if (delta<bestDelta) { best=i; bestDelta=delta; }
  }
  return best;
}

function splitPartStats(points) {
  if (!points?.length) return null;
  const first=points[0], last=points[points.length-1];
  const distance=Math.max(0,numberOrZero(last.distanceMeters)-numberOrZero(first.distanceMeters));
  const firstTime=Number(first.timeMs), lastTime=Number(last.timeMs);
  const duration=Number.isFinite(firstTime)&&Number.isFinite(lastTime)&&lastTime>=firstTime ? lastTime-firstTime : null;

  let ascent=0,descent=0;
  for (let i=1;i<points.length;i++) {
    const a=Number(points[i-1].altitudeMeters), b=Number(points[i].altitudeMeters);
    if (!Number.isFinite(a)||!Number.isFinite(b)) continue;
    const d=b-a;
    if (d>0) ascent+=d; else descent-=d;
  }
  const hrs=points.map((p)=>Number(p.heartRateBpm)).filter((v)=>Number.isFinite(v)&&v>=20&&v<=260);
  const avgHr=hrs.length ? Math.round(hrs.reduce((a,b)=>a+b,0)/hrs.length) : null;
  const maxHr=hrs.length ? Math.max(...hrs) : null;

  return {
    start_time_ms:Number(first.timeMs),
    end_time_ms:Number(last.timeMs),
    elapsed_time_ms:duration,
    timer_time_ms:duration,
    distance_m:distance,
    ascent_m:Math.round(ascent),
    descent_m:Math.round(descent),
    avg_hr:avgHr,
    max_hr:maxHr,
    gps_point_count:points.length,
    record_count:points.length,
    avg_speed_mps:Number.isFinite(duration)&&duration>0 ? distance/(duration/1000) : null
  };
}

function renderSplitProfile(route,index) {
  if (!ui.splitProfileSvg) return;
  const points=route?.points || [];
  if (points.length<2) {
    ui.splitProfileSvg.innerHTML="";
    return;
  }
  const width=1000,height=220,padX=20,padY=18;
  const alts=points.map((p)=>Number(p.altitudeMeters)).filter(Number.isFinite);
  if (!alts.length) {
    ui.splitProfileSvg.innerHTML='<text x="20" y="40" class="metric-chart-label">Altitude indisponible</text>';
    return;
  }
  const minAlt=Math.min(...alts),maxAlt=Math.max(...alts),span=Math.max(1,maxAlt-minAlt);
  const firstD=numberOrZero(points[0].distanceMeters),lastD=numberOrZero(points[points.length-1].distanceMeters);
  const total=Math.max(1,lastD-firstD);
  const x=(p)=>padX+((numberOrZero(p.distanceMeters)-firstD)/total)*(width-padX*2);
  const y=(p)=>padY+((maxAlt-numberOrZero(p.altitudeMeters))/span)*(height-padY*2);
  const valid=points.filter((p)=>Number.isFinite(Number(p.altitudeMeters)));
  const poly=valid.map((p)=>`${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const cutX=x(points[index]);
  ui.splitProfileSvg.innerHTML=`
    <polyline points="${poly}" class="split-profile-line"></polyline>
    <line x1="${cutX}" y1="0" x2="${cutX}" y2="${height}" class="split-cut-line"></line>
    <text x="${Math.min(width-110,cutX+8)}" y="24" class="metric-chart-label">Coupure</text>`;
}

function splitPreviewCard(label,stats) {
  const pace=Number.isFinite(stats?.elapsed_time_ms)&&stats.elapsed_time_ms>0&&stats.distance_m>0
    ? formatPaceFromSeconds((stats.elapsed_time_ms/1000)/(stats.distance_m/1000))
    : "—";
  return `<article class="split-preview-card">
    <strong>${escapeHtml(label)}</strong>
    <div>
      <span><small>Distance</small><b>${escapeHtml(formatDistance(stats.distance_m))}</b></span>
      <span><small>Durée</small><b>${escapeHtml(formatDuration(stats.elapsed_time_ms))}</b></span>
      <span><small>D+</small><b>${escapeHtml(formatMeters(stats.ascent_m))}</b></span>
      <span><small>D−</small><b>${escapeHtml(formatMeters(stats.descent_m))}</b></span>
      <span><small>Allure</small><b>${escapeHtml(pace)}</b></span>
      <span><small>FC</small><b>${escapeHtml(formatHeartRate(stats.avg_hr))}</b></span>
    </div>
  </article>`;
}

function currentSplitParts() {
  const route=splitActivityRoute;
  if (!route) return null;
  const index=splitIndexFromPercent(route,ui.splitActivityRange?.value || 50);
  const pointsA=route.points.slice(0,index+1);
  const pointsB=route.points.slice(index);
  return {
    index,
    pointsA,
    pointsB,
    statsA:splitPartStats(pointsA),
    statsB:splitPartStats(pointsB)
  };
}

function renderSplitActivityPreview() {
  if (!splitActivityRoute) return;
  const parts=currentSplitParts();
  const pct=Number(ui.splitActivityRange.value);
  ui.splitActivityRangeLabel.textContent=`${pct.toLocaleString("fr-FR",{maximumFractionDigits:1})} % · ${formatDistance(parts.statsA.distance_m)}`;
  renderSplitProfile(splitActivityRoute,parts.index);
  ui.splitActivityPreview.innerHTML=
    splitPreviewCard("Partie 1",parts.statsA)+splitPreviewCard("Partie 2",parts.statsB);
}


function splitEquipmentKey(value) {
  if (value==null) return "";
  if (typeof value==="object") {
    for (const key of ["equipment_id","gear_id","equipment_name","gear_name","equipment","gear"]) {
      const nested=value?.[key];
      if (nested!=null && String(nested).trim()) return String(nested).trim().toLowerCase();
    }
    return "";
  }
  return String(value).trim().toLowerCase();
}

function splitSessionEquipmentKey(session) {
  if (!session || typeof session!=="object") return "";
  for (const key of ["equipment_id","gear_id","equipment_name","gear_name","equipment","gear"]) {
    const value=session[key];
    if (value!=null && String(value).trim()) return splitEquipmentKey(value);
  }
  return "";
}

function splitSessionEquipmentName(session) {
  if (!session || typeof session!=="object") return "";
  for (const key of ["equipment_name","gear_name","equipment"]) {
    const value=session[key];
    if (value!=null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function splitBoundaryReasonLabel(reason) {
  if (reason==="PAUSE_OVER_THRESHOLD") return "GAP > 15 min";
  if (reason==="SPORT_CHANGED") return "changement de sport";
  if (reason==="SUB_SPORT_CHANGED") return "changement de sous-sport";
  if (reason==="EQUIPMENT_CHANGED") return "changement de matériel";
  return String(reason || "rupture automatique");
}

function formatSplitGap(ms) {
  const value=Number(ms);
  return Number.isFinite(value) && value>0 ? formatDuration(value) : "";
}

function setSplitManualControlsVisible(visible) {
  const range=ui.splitActivityRange?.closest(".split-range-label");
  const options=ui.splitActivityTitleA?.closest(".split-activity-options");
  if (range) range.classList.toggle("hidden",!visible);
  if (options) options.classList.toggle("hidden",!visible);
  if (ui.splitActivityCommitButton) ui.splitActivityCommitButton.hidden=!visible;
}

function renderAutomaticSplitProfile(route,boundaries) {
  if (!ui.splitProfileSvg) return;
  const points=route?.points || [];
  if (points.length<2) { ui.splitProfileSvg.innerHTML=""; return; }
  const width=1000,height=220,padX=20,padY=18;
  const alts=points.map((p)=>Number(p.altitudeMeters)).filter(Number.isFinite);
  if (!alts.length) {
    ui.splitProfileSvg.innerHTML='<text x="20" y="40" class="metric-chart-label">Altitude indisponible</text>';
    return;
  }
  const minAlt=Math.min(...alts),maxAlt=Math.max(...alts),span=Math.max(1,maxAlt-minAlt);
  const firstD=numberOrZero(points[0].distanceMeters),lastD=numberOrZero(points.at(-1).distanceMeters);
  const total=Math.max(1,lastD-firstD);
  const x=(p)=>padX+((numberOrZero(p.distanceMeters)-firstD)/total)*(width-padX*2);
  const y=(p)=>padY+((maxAlt-numberOrZero(p.altitudeMeters))/span)*(height-padY*2);
  const poly=points.filter((p)=>Number.isFinite(Number(p.altitudeMeters)))
    .map((p)=>`${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const cuts=(boundaries||[]).map((boundary,index)=>{
    const point=points[Math.max(0,Math.min(points.length-1,Number(boundary.index)||0))];
    const cutX=x(point);
    return `<line x1="${cutX}" y1="0" x2="${cutX}" y2="${height}" class="split-cut-line"></line>`+
      `<text x="${Math.min(width-150,cutX+8)}" y="${24+(index%3)*18}" class="metric-chart-label">${escapeHtml(splitBoundaryReasonLabel(boundary.reason))}</text>`;
  }).join("");
  ui.splitProfileSvg.innerHTML=`<polyline points="${poly}" class="split-profile-line"></polyline>${cuts}`;
}

function renderAutomaticSplitPreview(parts,boundaries) {
  renderAutomaticSplitProfile(splitActivityRoute,boundaries);
  const cards=parts.map((item,index)=>{
    const stats=splitPartStats(normalizeSplitRoute(item.route).points);
    return splitPreviewCard(`Partie ${index+1}`,stats);
  }).join("");
  const breaks=(boundaries||[]).map((boundary,index)=>{
    const gap=boundary.reason==="PAUSE_OVER_THRESHOLD" && boundary.gap_ms ? ` · ${escapeHtml(formatSplitGap(boundary.gap_ms))}` : "";
    return `<article class="split-preview-card"><strong>Rupture ${index+1}</strong><div><span><small>Cause</small><b>${escapeHtml(splitBoundaryReasonLabel(boundary.reason))}${gap}</b></span></div></article>`;
  }).join("");
  ui.splitActivityPreview.innerHTML=cards+breaks;
}

function sliceWebRouteData(route,startIndex,endIndex) {
  const fields=["lat","lon","alt_m","distance_m","time_ms","hr_bpm","speed_mps","cadence","moving","gap_sec_per_km","equipment_key"];
  const result={};
  for (const field of fields) {
    const values=Array.isArray(route?.[field])?route[field]:[];
    result[field]=values.slice(startIndex,endIndex+1);
  }
  const first=result.distance_m.find((value)=>Number.isFinite(Number(value)));
  const base=Number.isFinite(Number(first))?Number(first):0;
  result.distance_m=result.distance_m.map((value)=>Number.isFinite(Number(value))?Math.max(0,Number(value)-base):null);
  const count=Math.max(...fields.map((field)=>result[field].length),0);
  result.source_point_count=count;
  result.web_preview_point_count=count;
  result.route_format=WEB_SPLIT_VERSION;
  return result;
}

function splitPointTimeMs(point) {
  return splitFiniteNumber(point?.timeMs ?? point?.time_ms);
}

function splitPointDistanceM(point) {
  return splitFiniteNumber(point?.distanceMeters ?? point?.distance_m);
}

function splitPointMovingSignal(point) {
  if (typeof point?.moving==="boolean") return point.moving;
  const speed=splitFiniteNumber(point?.speedMps ?? point?.speed_mps);
  if (speed!=null) return speed>WEB_SPLIT_INACTIVE_SPEED_MPS;
  return null;
}

function detectInactiveSignalBoundaries(points) {
  const runs=[];
  let start=-1,end=-1,before=-1;
  const closeRun=()=>{
    if (start<0 || end<start) { start=end=before=-1; return; }
    const after=end+1;
    if (before>=0 && after<points.length) {
      const t0=splitPointTimeMs(points[before]);
      const t1=splitPointTimeMs(points[after]);
      if (t0!=null && t1!=null && t1-t0>WEB_SPLIT_AUTO_GAP_MS) {
        runs.push({index:after,before_index:before,after_index:after,reason:"PAUSE_OVER_THRESHOLD",gap_ms:t1-t0,gap_kind:"INACTIVE_SIGNAL"});
      }
    }
    start=end=before=-1;
  };

  for (let index=1;index<points.length-1;index++) {
    const signal=splitPointMovingSignal(points[index]);
    if (signal===false) {
      if (start<0) { start=index; before=index-1; }
      end=index;
      continue;
    }
    if (signal===true && start>=0) {
      const lastIdleTime=splitPointTimeMs(points[end]);
      const currentTime=splitPointTimeMs(points[index]);
      if (lastIdleTime!=null && currentTime!=null && currentTime-lastIdleTime<=WEB_SPLIT_INACTIVE_MERGE_MS) {
        // Un bref mouvement parasite (GPS / vitesse lissée) ne clôt pas une pause longue.
        continue;
      }
      closeRun();
    }
  }
  closeRun();
  return runs;
}

function detectDistancePlateauBoundaries(points) {
  const valid=[];
  for (let index=0;index<points.length;index++) {
    const time=splitPointTimeMs(points[index]);
    const distance=splitPointDistanceM(points[index]);
    if (time!=null && distance!=null) valid.push({index,time,distance});
  }
  if (valid.length<4) return [];

  const boundaries=[];
  let left=0;
  let candidate=null;
  for (let right=1;right<valid.length;right++) {
    while (left<right && valid[right].distance-valid[left].distance>WEB_SPLIT_DISTANCE_PLATEAU_M) {
      if (candidate && candidate.left===left) {
        const before=Math.max(0,valid[left].index-1);
        const after=valid[right].index;
        const t0=splitPointTimeMs(points[before]);
        const t1=splitPointTimeMs(points[after]);
        if (before>=1 && after<points.length-1 && t0!=null && t1!=null && t1-t0>WEB_SPLIT_AUTO_GAP_MS) {
          boundaries.push({index:after,before_index:before,after_index:after,reason:"PAUSE_OVER_THRESHOLD",gap_ms:t1-t0,gap_kind:"DISTANCE_PLATEAU"});
        }
        candidate=null;
        left=right;
        break;
      }
      left++;
    }
    if (left>=right) continue;
    if (valid[right].time-valid[left].time>WEB_SPLIT_AUTO_GAP_MS) {
      candidate={left,right};
    }
  }
  return boundaries;
}

function splitGapDiagnostics(points) {
  let maxAdjacent=0;
  for (let index=1;index<points.length;index++) {
    const a=splitPointTimeMs(points[index-1]),b=splitPointTimeMs(points[index]);
    if (a!=null && b!=null && b>=a) maxAdjacent=Math.max(maxAdjacent,b-a);
  }
  const signalCoverage=points.length ? points.filter((point)=>splitPointMovingSignal(point)!=null).length/points.length : 0;
  return {maxAdjacent,signalCoverage};
}

function detectAutomaticSplitBoundariesFromPoints(points, sessions=[]) {
  const boundaries=[];
  for (let index=1;index<points.length;index++) {
    const previous=splitPointTimeMs(points[index-1]);
    const current=splitPointTimeMs(points[index]);
    if (previous!=null&&current!=null&&current-previous>WEB_SPLIT_AUTO_GAP_MS) {
      boundaries.push({index,before_index:index-1,after_index:index,reason:"PAUSE_OVER_THRESHOLD",gap_ms:current-previous,gap_kind:"TIMESTAMP_JUMP"});
    }
    const previousEquipment=splitEquipmentKey(points[index-1]?.equipmentKey ?? points[index-1]?.equipment_key);
    const currentEquipment=splitEquipmentKey(points[index]?.equipmentKey ?? points[index]?.equipment_key);
    if (previousEquipment && currentEquipment && previousEquipment!==currentEquipment) {
      boundaries.push({index,before_index:index-1,after_index:index,reason:"EQUIPMENT_CHANGED",equipment_before:previousEquipment,equipment_after:currentEquipment});
    }
  }

  const signalCoverage=points.length ? points.filter((point)=>splitPointMovingSignal(point)!=null).length/points.length : 0;
  if (signalCoverage>=0.30) boundaries.push(...detectInactiveSignalBoundaries(points));
  else boundaries.push(...detectDistancePlateauBoundaries(points));

  const ordered=(Array.isArray(sessions)?sessions:[])
    .filter((session)=>Number.isFinite(Number(session?.start_time_ms)))
    .slice().sort((a,b)=>Number(a.start_time_ms)-Number(b.start_time_ms));
  for (let index=1;index<ordered.length;index++) {
    const previous=ordered[index-1],current=ordered[index];
    const sportChanged=Number(previous.sport)!==Number(current.sport);
    const subChanged=!sportChanged && Number(previous.sub_sport)!==Number(current.sub_sport);
    const previousEquipment=splitSessionEquipmentKey(previous);
    const currentEquipment=splitSessionEquipmentKey(current);
    const equipmentChanged=Boolean(previousEquipment && currentEquipment && previousEquipment!==currentEquipment);
    if (!sportChanged&&!subChanged&&!equipmentChanged) continue;

    const boundaryTime=Number(current.start_time_ms);
    let best=-1,bestDelta=Infinity;
    for (let pointIndex=1;pointIndex<points.length;pointIndex++) {
      const t=splitPointTimeMs(points[pointIndex]);
      if (t==null) continue;
      const delta=Math.abs(t-boundaryTime);
      if (delta<bestDelta) { best=pointIndex; bestDelta=delta; }
    }
    if (best>0) {
      const reason=equipmentChanged?"EQUIPMENT_CHANGED":sportChanged?"SPORT_CHANGED":"SUB_SPORT_CHANGED";
      boundaries.push({index:best,before_index:best-1,after_index:best,reason,session:current,equipment_before:previousEquipment||null,equipment_after:currentEquipment||null});
    }
  }

  const priority={EQUIPMENT_CHANGED:5,SPORT_CHANGED:4,SUB_SPORT_CHANGED:3,PAUSE_OVER_THRESHOLD:2};
  const orderedBoundaries=boundaries
    .map((boundary)=>({
      ...boundary,
      before_index:Number.isFinite(Number(boundary.before_index))?Number(boundary.before_index):Number(boundary.index)-1,
      after_index:Number.isFinite(Number(boundary.after_index))?Number(boundary.after_index):Number(boundary.index)
    }))
    .filter((boundary)=>boundary.before_index>=1 && boundary.after_index<=points.length-2 && boundary.after_index>boundary.before_index)
    .sort((a,b)=>a.after_index-b.after_index || b.before_index-a.before_index);

  const dedup=[];
  for (const boundary of orderedBoundaries) {
    const previous=dedup.at(-1);
    if (previous && boundary.before_index<=previous.after_index+2) {
      if ((priority[boundary.reason]||0)>(priority[previous.reason]||0)) {
        boundary.gap_ms=Math.max(Number(boundary.gap_ms)||0,Number(previous.gap_ms)||0)||null;
        dedup[dedup.length-1]=boundary;
      } else {
        previous.gap_ms=Math.max(Number(previous.gap_ms)||0,Number(boundary.gap_ms)||0)||previous.gap_ms;
        previous.before_index=Math.min(previous.before_index,boundary.before_index);
        previous.after_index=Math.max(previous.after_index,boundary.after_index);
        previous.index=previous.after_index;
      }
      continue;
    }
    boundary.index=boundary.after_index;
    dedup.push(boundary);
  }
  return dedup;
}

function sessionForTime(sessions,timeMs,fallback={}) {
  const ordered=(Array.isArray(sessions)?sessions:[])
    .filter((session)=>Number.isFinite(Number(session?.start_time_ms)))
    .slice().sort((a,b)=>Number(a.start_time_ms)-Number(b.start_time_ms));
  let chosen=null;
  for (const session of ordered) {
    if (Number(session.start_time_ms)<=Number(timeMs)) chosen=session;
    else break;
  }
  return chosen || fallback || {};
}

function automaticSplitPartsFromRawRoute(rawRoute, sourceActivity, sessions=[]) {
  const normalized=normalizeSplitRoute(rawRoute);
  const points=normalized.points;
  const boundaries=detectAutomaticSplitBoundariesFromPoints(points,sessions);
  if (!boundaries.length) return [];

  const ranges=[];
  let start=0;
  for (const boundary of boundaries) {
    const end=Math.max(start,Number(boundary.before_index));
    if (end-start+1>=2) ranges.push({start,end});
    start=Math.max(end+1,Number(boundary.after_index));
  }
  if (points.length-start>=2) ranges.push({start,end:points.length-1});
  if (ranges.length<2) return [];

  const prepared=ranges.map((range)=>({
    range,
    partPoints:points.slice(range.start,range.end+1)
  })).map((item)=>({...item,stats:splitPartStats(item.partPoints)}));
  const totalDuration=Math.max(1,prepared.reduce((sum,item)=>sum+Math.max(0,numberOrZero(item.stats?.elapsed_time_ms)),0));
  return prepared.map(({range,partPoints,stats},index)=>{
    const session=sessionForTime(sessions,stats?.start_time_ms,sourceActivity);
    const id=makeWebImportedActivityId(stats.start_time_ms)+(index+1);
    const child=buildSplitChild(
      sourceActivity,
      stats,
      id,
      `${sourceActivity.custom_title || sportName(session.sport ?? sourceActivity.sport)} · ${index+1}/${ranges.length}`,
      index+1,
      totalDuration
    );
    child.sport=Number.isFinite(Number(session.sport))?Number(session.sport):Number(sourceActivity.sport)||0;
    child.sub_sport=Number.isFinite(Number(session.sub_sport))?Number(session.sub_sport):Number(sourceActivity.sub_sport)||0;
    const explicitEquipment=splitSessionEquipmentName(session);
    if (explicitEquipment) child.equipment_name=explicitEquipment;
    else applyAutomaticEquipmentMappingToDraft(child);
    child.gps_point_count=partPoints.filter((point)=>Number.isFinite(Number(point.latitude))&&Number.isFinite(Number(point.longitude))).length;
    child.record_count=partPoints.length;
    child.import_source=sourceActivity.import_source;
    child.import_profile=`${sourceActivity.import_profile || "WEB"}_${WEB_SPLIT_VERSION}`;
    const entryBoundary=index>0 ? boundaries[index-1] : null;
    child.split_reason=entryBoundary?.reason || "SOURCE_START";
    child.split_gap_ms=Number(entryBoundary?.gap_ms || 0) || null;
    child.split_total=ranges.length;
    const route=sliceWebRouteData(rawRoute,range.start,range.end);
    route.split_part=index+1;
    route.split_total=ranges.length;
    route.split_reason=child.split_reason;
    return {child,route};
  });
}

function splitRouteDocument(points) {
  const firstDistance=numberOrZero(points[0]?.distanceMeters);
  return {
    lat:points.map((p)=>p.latitude),
    lon:points.map((p)=>p.longitude),
    alt_m:points.map((p)=>Number.isFinite(Number(p.altitudeMeters))?Number(p.altitudeMeters):null),
    distance_m:points.map((p)=>Math.max(0,numberOrZero(p.distanceMeters)-firstDistance)),
    time_ms:points.map((p)=>Number.isFinite(Number(p.timeMs))?Number(p.timeMs):null),
    hr_bpm:points.map((p)=>Number.isFinite(Number(p.heartRateBpm))?Number(p.heartRateBpm):null),
    speed_mps:points.map((p)=>splitFiniteNumber(p.speedMps)),
    moving:points.map((p)=>typeof p.moving==="boolean"?p.moving:null),
    equipment_key:points.map((p)=>p?.equipmentKey==null?null:String(p.equipmentKey)),
    gap_sec_per_km:points.map((p)=>Number.isFinite(Number(p.gapSecondsPerKm))?Number(p.gapSecondsPerKm):null),
    source_point_count:points.length,
    web_preview_point_count:points.length,
    route_format:WEB_SPLIT_VERSION
  };
}

function splitCalories(source,partDuration,totalDuration) {
  const calories=originalCalories(source);
  if (!Number.isFinite(calories)||!Number.isFinite(partDuration)||!Number.isFinite(totalDuration)||totalDuration<=0) return null;
  return Math.max(0,Math.round(calories*(partDuration/totalDuration)));
}

function buildSplitChild(source,stats,id,title,partNumber,totalDuration) {
  const calories=splitCalories(source,stats.elapsed_time_ms,totalDuration);
  const sourceData={...source};
  delete sourceData.__docId;
  return {
    ...sourceData,
    id,

    custom_title:String(title||"").trim(),
    start_time_ms:stats.start_time_ms,
    elapsed_time_ms:stats.elapsed_time_ms,
    timer_time_ms:stats.timer_time_ms,
    distance_m:stats.distance_m,
    ascent_m:stats.ascent_m,
    descent_m:stats.descent_m,
    avg_hr:stats.avg_hr,
    max_hr:stats.max_hr,
    avg_speed_mps:stats.avg_speed_mps,
    calories,
    gps_point_count:stats.gps_point_count,
    record_count:stats.record_count,
    import_source:"WEB_SPLIT",
    import_profile:WEB_SPLIT_VERSION,
    split_parent_activity_id:String(activityKey(source)),
    split_part:partNumber,
    split_created_at_ms:Date.now(),
    calories_split_method:Number.isFinite(calories) ? "PROPORTIONAL_TIME" : null,
    deleted_at_ms:null
  };
}


async function commitAutomaticSplitActivity() {
  if (splitActivitySaving || !splitActivitySource || !splitActivityRoute) return;
  const source=splitActivitySource;
  const rawRoute=splitRouteDocument(splitActivityRoute.points);
  const boundaries=detectAutomaticSplitBoundariesFromPoints(splitActivityRoute.points,splitActivitySessions);
  const parts=automaticSplitPartsFromRawRoute(rawRoute,source,splitActivitySessions);
  if (parts.length<2 || !boundaries.length) {
    setMessage("WEBSPLIT003 · aucune rupture automatique détectée.","info");
    return;
  }

  const reasons=[...new Set(boundaries.map((item)=>splitBoundaryReasonLabel(item.reason)))];
  const ok=window.confirm(
    `WEBSPLIT003 a détecté ${parts.length} parties (${reasons.join(", ")}).\n\n`+
    `Les points de coupure sont déjà calculés automatiquement. Créer les ${parts.length} activités et placer l’activité source dans la corbeille ?`
  );
  if (!ok) return;

  splitActivitySaving=true;
  ui.splitActivityAutoButton.disabled=true;
  ui.splitActivityCommitButton.disabled=true;
  ui.splitActivityStatus.textContent="WEBSPLIT003 · découpe automatique en cours…";
  ui.splitActivityStatus.className="split-activity-status pending";

  try {
    const childIds=[];
    for (const item of parts) {
      const child=item.child,route=item.route,key=String(child.id);
      await commitWebMutation({
        table:"activities",rowKey:key,operation:"UPSERT",row:child,
        materializedCollection:"activities",materializedData:child,
        metaIncrements:{activityCount:1,expectedDocuments:1}
      });
      await commitWebMutation({
        table:"activity_routes",rowKey:key,operation:"UPSERT",
        row:{id:child.id,source_point_count:route.source_point_count,split_parent_activity_id:String(activityKey(source))},
        materializedCollection:"activity_routes",materializedData:route
      });
      activities.push({...child,__docId:key});
      childIds.push(key);
    }

    const sourceKey=String(activityKey(source));
    const sourcePatch={
      ...source,
      deleted_at_ms:Date.now(),
      split_status:"SOURCE_AUTO",
      split_profile:WEB_SPLIT_VERSION,
      split_children_ids:childIds,
      split_updated_at_ms:Date.now()
    };
    delete sourcePatch.__docId;
    await commitWebMutation({
      table:"activities",rowKey:sourceKey,operation:"UPSERT",row:sourcePatch,
      materializedCollection:"activities",materializedData:sourcePatch
    });

    activities=activities.filter((item)=>activityKey(item)!==sourceKey);
    trashActivities.set(sourceKey,{...sourcePatch,__docId:sourceKey});
    rebuildDynamicFilters();
    applyFiltersAndRender();
    renderTrash();
    await loadWebDashboard();
    closeSplitActivityPanel();
    showCatalog(false);
    setMessage(`WEBSPLIT003 · ${parts.length} activités créées automatiquement · source placée dans la corbeille.`,"success");
  } catch (error) {
    console.error("WEBSPLIT003 automatic split",error);
    ui.splitActivityStatus.textContent=`Découpe automatique impossible : ${error?.message||error}`;
    ui.splitActivityStatus.className="split-activity-status error";
  } finally {
    splitActivitySaving=false;
    ui.splitActivityCommitButton.disabled=false;
    if (ui.splitActivityAutoButton) ui.splitActivityAutoButton.disabled=false;
  }
}

async function commitSplitActivity() {
  if (splitActivitySaving || !splitActivitySource || !splitActivityRoute) return;
  const parts=currentSplitParts();
  if (!parts || parts.pointsA.length<2 || parts.pointsB.length<2) return;

  const durationA=parts.statsA.elapsed_time_ms,durationB=parts.statsB.elapsed_time_ms;
  if (!Number.isFinite(durationA)||!Number.isFinite(durationB)||durationA<=0||durationB<=0) {
    setMessage("WEBSPLIT003 · chronologie insuffisante pour créer des activités fiables.","error");
    return;
  }

  const source=splitActivitySource;
  const confirmText=
    `Créer deux activités dérivées ?\n\n`+
    `Partie 1 : ${formatDistance(parts.statsA.distance_m)} · ${formatDuration(durationA)}\n`+
    `Partie 2 : ${formatDistance(parts.statsB.distance_m)} · ${formatDuration(durationB)}\n\n`+
    `L’activité source ${activityKey(source)} restera intacte.`;
  if (!window.confirm(confirmText)) return;

  splitActivitySaving=true;
  ui.splitActivityCommitButton.disabled=true;
  ui.splitActivityCommitButton.textContent="Création…";
  ui.splitActivityStatus.textContent="Création des activités dérivées…";
  ui.splitActivityStatus.className="split-activity-status pending";

  try {
    const totalDuration=durationA+durationB;
    const idA=makeWebImportedActivityId(parts.statsA.start_time_ms);
    let idB=makeWebImportedActivityId(parts.statsB.start_time_ms);
    if (idB===idA) idB+=1;

    const childA=buildSplitChild(source,parts.statsA,idA,ui.splitActivityTitleA.value,1,totalDuration);
    const childB=buildSplitChild(source,parts.statsB,idB,ui.splitActivityTitleB.value,2,totalDuration);
    const routeA=splitRouteDocument(parts.pointsA);
    const routeB=splitRouteDocument(parts.pointsB);

    for (const [child,route] of [[childA,routeA],[childB,routeB]]) {
      const key=String(child.id);
      const materialized={...child};
      delete materialized.__docId;

      await commitWebMutation({
        table:"activities",rowKey:key,operation:"UPSERT",row:materialized,
        materializedCollection:"activities",materializedData:materialized,
        metaIncrements:{activityCount:1,expectedDocuments:1}
      });
      await commitWebMutation({
        table:"activity_routes",rowKey:key,operation:"UPSERT",
        row:{id:child.id,source_point_count:route.source_point_count,split_parent_activity_id:String(activityKey(source))},
        materializedCollection:"activity_routes",materializedData:route
      });
      activities.push({...materialized,__docId:key});
    }

    const sourcePatch={
      ...source,
      split_status:"SOURCE",
      split_children_ids:[String(idA),String(idB)],
      split_updated_at_ms:Date.now()
    };
    delete sourcePatch.__docId;

    await commitWebMutation({
      table:"activities",rowKey:String(activityKey(source)),operation:"UPSERT",
      row:sourcePatch,materializedCollection:"activities",materializedData:sourcePatch
    });
    Object.assign(source,sourcePatch);

    rebuildDynamicFilters();
    applyFiltersAndRender();
    await loadWebDashboard();

    ui.splitActivityStatus.textContent=
      `Découpe terminée · ${formatDistance(childA.distance_m)} + ${formatDistance(childB.distance_m)} · source conservée.`;
    ui.splitActivityStatus.className="split-activity-status success";
    webFileVaultEntries = [];
    setMessage("WEBSPLIT001 · 2 activités dérivées créées. L’activité source reste intacte.","success");
  } catch (error) {
    console.error(error);
    ui.splitActivityStatus.textContent=`Découpe impossible : ${error?.message||error}`;
    ui.splitActivityStatus.className="split-activity-status error";
    handleError(error,"Découpe impossible");
  } finally {
    splitActivitySaving=false;
    ui.splitActivityCommitButton.disabled=false;
    ui.splitActivityCommitButton.textContent="Créer manuellement les 2 activités";
  }
}

// -----------------------------------------------------------------------------
// WEB036 · WEBMANUAL001 — création manuelle d'activités
// -----------------------------------------------------------------------------
function parseManualDurationMs(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const parts = text.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 1) return Math.round(parts[0] * 60000);
  if (parts.length === 2) return Math.round((parts[0] * 60 + parts[1]) * 1000);
  if (parts.length === 3) return Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000);
  return null;
}

function manualSportChoices() {
  const candidates = [...new Set(
    activities
      .map((activity) => Number(activity.sport))
      .filter(Number.isFinite)
  )];
  if (!candidates.length) return [1,2,11];
  return candidates.sort((a,b) => sportName(a).localeCompare(sportName(b), "fr"));
}

function initializeWebManualForm() {
  if (!ui.webManualSport) return;

  const previous = ui.webManualSport.value;
  ui.webManualSport.innerHTML = "";
  for (const sport of manualSportChoices()) {
    const option = document.createElement("option");
    option.value = String(sport);
    option.textContent = sportName(sport);
    ui.webManualSport.appendChild(option);
  }
  if (previous && [...ui.webManualSport.options].some((o) => o.value === previous)) {
    ui.webManualSport.value = previous;
  }

  if (!ui.webManualDate.value) {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset()*60000);
    ui.webManualDate.value = local.toISOString().slice(0,10);
    ui.webManualTime.value = local.toISOString().slice(11,16);
  }

  rebuildWebManualEquipment();
  renderWebManualLandmarks();
  updateWebManualPreview();
}

function rebuildWebManualEquipment() {
  if (!ui.webManualEquipment) return;
  const current = ui.webManualEquipment.value;
  ui.webManualEquipment.innerHTML = '<option value="">Aucun matériel</option>';

  const fakeActivity = {sport:Number(ui.webManualSport?.value)};
  const allowed = equipmentCategoriesForSport(fakeActivity);

  const rows = equipmentRows
    .filter((item) => String(item.status ?? "ACTIVE").toUpperCase() === "ACTIVE")
    .filter((item) => !allowed || allowed.has(String(item.category ?? "").toUpperCase()))
    .slice()
    .sort((a,b) => equipmentDisplayName(a).localeCompare(equipmentDisplayName(b),"fr",{sensitivity:"base"}));

  const seen = new Set();
  for (const item of rows) {
    const value = equipmentDisplayName(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    ui.webManualEquipment.appendChild(option);
  }

  if ([...ui.webManualEquipment.options].some((o) => o.value === current)) {
    ui.webManualEquipment.value = current;
  }
}

function renderWebManualLandmarks() {
  if (!ui.webManualLandmarkButtons) return;
  ui.webManualLandmarkButtons.innerHTML = "";

  const rows = [...landmarks.entries()]
    .sort((a,b) =>
      Number(a[1]?.sort_order ?? 999) - Number(b[1]?.sort_order ?? 999) ||
      String(a[0]).localeCompare(String(b[0]),"fr")
    );

  if (!rows.length) {
    ui.webManualLandmarkButtons.innerHTML = '<span class="muted">Aucun repère configuré.</span>';
    return;
  }

  rows.forEach(([code,row]) => {
    const count = webManualLandmarkCounts.get(code) || 0;
    const wrap = document.createElement("div");
    wrap.className = `quick-landmark-stepper${count ? " active" : ""}`;

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "quick-landmark-plus";
    plus.innerHTML = `<strong>${escapeHtml(code)}</strong>${count ? `<span>×${count}</span>` : ""}`;
    plus.title = `${row?.name || row?.label || "Repère"} · ajouter`;
    plus.addEventListener("click", () => {
      webManualLandmarkCounts.set(code, count + 1);
      renderWebManualLandmarks();
      updateWebManualPreview();
    });

    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "quick-landmark-minus";
    minus.textContent = "−";
    minus.disabled = count <= 0;
    minus.addEventListener("click", () => {
      if (count <= 1) webManualLandmarkCounts.delete(code);
      else webManualLandmarkCounts.set(code, count - 1);
      renderWebManualLandmarks();
      updateWebManualPreview();
    });

    wrap.append(plus,minus);
    ui.webManualLandmarkButtons.appendChild(wrap);
  });
}

function manualStartTimeMs() {
  const date = ui.webManualDate?.value;
  const time = ui.webManualTime?.value || "00:00";
  if (!date) return null;
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
}

function buildWebManualDraft() {
  const start = manualStartTimeMs();
  const duration = parseManualDurationMs(ui.webManualDuration?.value);
  const distanceKm = Number(ui.webManualDistanceKm?.value || 0);

  if (!Number.isFinite(start)) throw new Error("Date/heure invalide.");
  if (duration == null) throw new Error("Durée invalide. Utilisez HH:MM:SS ou MM:SS.");
  if (!Number.isFinite(distanceKm) || distanceKm < 0) throw new Error("Distance invalide.");

  const avgHr = ui.webManualAvgHr?.value ? Number(ui.webManualAvgHr.value) : null;
  const maxHr = ui.webManualMaxHr?.value ? Number(ui.webManualMaxHr.value) : null;
  const calories = ui.webManualCalories?.value ? Number(ui.webManualCalories.value) : null;

  const activity={
    sport:Number(ui.webManualSport?.value || 1),
    sub_sport:0,
    start_time_ms:start,
    elapsed_time_ms:duration,
    timer_time_ms:duration,
    distance_m:Math.round(distanceKm*1000),
    ascent_m:Math.max(0,Number(ui.webManualAscent?.value || 0)),
    descent_m:Math.max(0,Number(ui.webManualDescent?.value || 0)),
    avg_hr:Number.isFinite(avgHr)?Math.round(avgHr):null,
    max_hr:Number.isFinite(maxHr)?Math.round(maxHr):null,
    calories:Number.isFinite(calories)?Math.round(calories):null,
    equipment_name:String(ui.webManualEquipment?.value || ""),
    equipment_manual:String(ui.webManualEquipment?.value || "").trim() ? 1 : 0,
    custom_title:String(ui.webManualTitle?.value || "").trim(),
    notes:String(ui.webManualNotes?.value || "").trim(),
    import_source:"WEB_MANUAL",
    import_profile:"WEBMANUAL001",
    gps_point_count:0,
    record_count:0,
    imported_at_ms:Date.now(),
    deleted_at_ms:null
  };
  if (numberOrZero(activity.equipment_manual)!==1) applyAutomaticEquipmentMappingToDraft(activity);
  return activity;
}

async function probableManualDuplicate(draft) {
  const min = draft.start_time_ms - 120000;
  const max = draft.start_time_ms + 120000;

  try {
    const snap = await getDocs(query(
      userCollection("activities"),
      where("start_time_ms",">=",min),
      where("start_time_ms","<=",max),
      limit(20)
    ));
    for (const docSnap of snap.docs) {
      const a = docSnap.data();
      const distDiff = Math.abs(numberOrZero(a.distance_m) - numberOrZero(draft.distance_m));
      const tolerance = Math.max(100, numberOrZero(draft.distance_m)*0.02);
      if (distDiff <= tolerance) return a;
    }
  } catch (error) {
    console.warn("WEBMANUAL001 duplicate query", error);
  }
  return null;
}

function updateWebManualPreview() {
  if (!ui.webManualPreview) return;
  try {
    const draft = buildWebManualDraft();
    const landmarkCount = [...webManualLandmarkCounts.values()].reduce((a,b)=>a+b,0);
    const calories = Number.isFinite(draft.calories) && draft.calories > 0
      ? `${formatNumber(draft.calories)} kcal`
      : "⚠ calories absentes";

    ui.webManualPreview.innerHTML = `
      <strong>${escapeHtml(sportName(draft.sport))}</strong> ·
      ${escapeHtml(formatDateLong(draft.start_time_ms))} ·
      ${escapeHtml(formatDistance(draft.distance_m))} ·
      ${escapeHtml(formatDuration(draft.elapsed_time_ms))} ·
      ${escapeHtml(formatMeters(draft.ascent_m))} D+ ·
      ${escapeHtml(calories)} ·
      ${landmarkCount} repère(s)`;
    ui.webManualPreview.className = `web-manual-preview${draft.calories ? "" : " warning"}`;
  } catch (error) {
    ui.webManualPreview.textContent = error?.message || "Informations incomplètes.";
    ui.webManualPreview.className = "web-manual-preview muted";
  }
}

function resetWebManualForm() {
  if (!ui.webManualForm || webManualSaving) return;
  ui.webManualForm.reset();
  webManualLandmarkCounts = new Map();

  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset()*60000);
  ui.webManualDate.value = local.toISOString().slice(0,10);
  ui.webManualTime.value = local.toISOString().slice(11,16);

  initializeWebManualForm();
  renderWebManualLandmarks();
  updateWebManualPreview();
}

async function commitWebManualActivity() {
  if (webManualSaving) return;

  let draft;
  try {
    draft = buildWebManualDraft();
  } catch (error) {
    setMessage(error?.message || "Activité manuelle invalide.", "error");
    return;
  }

  if (!draft.elapsed_time_ms && !draft.distance_m) {
    setMessage("Renseignez au moins une durée ou une distance.", "error");
    return;
  }

  if (!draft.calories || draft.calories <= 0) {
    const ok = window.confirm(
      "Aucune calorie n’est renseignée.\n\nCréer tout de même cette activité ?"
    );
    if (!ok) return;
  }

  const duplicate = await probableManualDuplicate(draft);
  if (duplicate) {
    const ok = window.confirm(
      `Doublon probable détecté : ${formatDateLong(duplicate.start_time_ms)} · ${formatDistance(duplicate.distance_m)}.\n\nCréer quand même cette activité ?`
    );
    if (!ok) return;
  }

  webManualSaving = true;
  ui.webManualCommitButton.disabled = true;
  ui.webManualCommitButton.textContent = "Création…";

  try {
    const id = makeWebImportedActivityId(draft.start_time_ms);
    const row = {...draft,id};

    await commitWebMutation({
      table:"activities",
      rowKey:String(id),
      operation:"UPSERT",
      row,
      materializedCollection:"activities",
      materializedData:row,
      metaIncrements:{activityCount:1,expectedDocuments:1}
    });

    activities.push({...row,__docId:String(id)});

    for (const [code,count] of webManualLandmarkCounts.entries()) {
      if (count <= 0) continue;
      await setLandmarkOccurrence(row,code,count);
    }

    rebuildDynamicFilters();
    applyFiltersAndRender();
    await loadWebDashboard();

    setMessage(`WEBMANUAL001 · activité créée : ${sportName(row.sport)} · ${formatDateLong(row.start_time_ms)}.`, "success");
    resetWebManualForm();
  } catch (error) {
    console.error(error);
    handleError(error,"Création manuelle impossible");
  } finally {
    webManualSaving = false;
    ui.webManualCommitButton.disabled = false;
    ui.webManualCommitButton.textContent = "Créer l’activité";
  }
}

// -----------------------------------------------------------------------------
// WEB035 · WEBIMPORT001 — import FIT natif dans le navigateur
// -----------------------------------------------------------------------------
function fitBaseTypeInfo(baseType) {
  const type = baseType & 0x1f;
  const map = {
    0:{size:1,kind:"uint",invalid:0xff}, 1:{size:1,kind:"sint",invalid:0x7f},
    2:{size:1,kind:"uint",invalid:0xff}, 3:{size:2,kind:"sint",invalid:0x7fff},
    4:{size:2,kind:"uint",invalid:0xffff}, 5:{size:4,kind:"sint",invalid:0x7fffffff},
    6:{size:4,kind:"uint",invalid:0xffffffff}, 7:{size:1,kind:"string",invalid:null},
    8:{size:4,kind:"float",invalid:null}, 9:{size:8,kind:"float",invalid:null},
    10:{size:1,kind:"uint",invalid:0}, 11:{size:2,kind:"uint",invalid:0},
    12:{size:4,kind:"uint",invalid:0}, 13:{size:1,kind:"byte",invalid:0xff},
    14:{size:8,kind:"sint64",invalid:null}, 15:{size:8,kind:"uint64",invalid:null},
    16:{size:8,kind:"uint64",invalid:0}
  };
  return map[type] || {size:1,kind:"byte",invalid:null};
}

function readFitScalar(view, offset, fieldSize, baseType, littleEndian) {
  const info = fitBaseTypeInfo(baseType);
  if (fieldSize < info.size) return null;
  try {
    let value;
    if (info.kind === "string") {
      let text="";
      for (let i=0;i<fieldSize;i++) {
        const c=view.getUint8(offset+i);
        if (!c) break;
        text += String.fromCharCode(c);
      }
      return text;
    }
    if (info.kind === "float") {
      value = info.size === 4 ? view.getFloat32(offset,littleEndian) : view.getFloat64(offset,littleEndian);
    } else if (info.kind === "sint") {
      value = info.size===1 ? view.getInt8(offset)
        : info.size===2 ? view.getInt16(offset,littleEndian)
        : view.getInt32(offset,littleEndian);
    } else if (info.kind === "uint" || info.kind === "byte") {
      value = info.size===1 ? view.getUint8(offset)
        : info.size===2 ? view.getUint16(offset,littleEndian)
        : view.getUint32(offset,littleEndian);
    } else if (info.kind === "sint64") {
      value = Number(view.getBigInt64(offset,littleEndian));
    } else if (info.kind === "uint64") {
      value = Number(view.getBigUint64(offset,littleEndian));
    } else return null;
    if (info.invalid != null && value === info.invalid) return null;
    return value;
  } catch {
    return null;
  }
}

function fitDateTimeMs(value) {
  const n=Number(value);
  return Number.isFinite(n) && n>0 ? FIT_UNIX_EPOCH_MS + n*1000 : null;
}

function fitSemicircles(value) {
  const n=Number(value);
  return Number.isFinite(n) ? n * (180 / 2147483648) : null;
}

function decodeFitActivity(arrayBuffer, fileName="activity.fit") {
  const view=new DataView(arrayBuffer);
  if (view.byteLength < 14) throw new Error("Fichier FIT trop court.");
  const headerSize=view.getUint8(0);
  if (headerSize < 12 || headerSize > view.byteLength) throw new Error("En-tête FIT invalide.");
  const signature=String.fromCharCode(...new Uint8Array(arrayBuffer,8,4));
  if (signature !== ".FIT") throw new Error("Signature FIT absente.");
  const protocolVersion=view.getUint8(1);
  const profileVersion=view.getUint16(2,true);
  const dataSize=view.getUint32(4,true);
  const dataEnd=Math.min(view.byteLength, headerSize + dataSize);

  const definitions=new Map();
  const session={};
  const sessions=[];
  const fileId={};
  const records=[];
  let offset=headerSize;
  let lastTimestampSec=null;

  const assignSession=(target,field,value)=>{
    if (value==null) return;
    if (field===2) target.start_time_ms=fitDateTimeMs(value);
    else if (field===5) target.sport=Number(value);
    else if (field===6) target.sub_sport=Number(value);
    else if (field===7) target.elapsed_time_ms=Number(value);
    else if (field===8) target.timer_time_ms=Number(value);
    else if (field===9) target.distance_m=Number(value)/100;
    else if (field===11) target.calories=Number(value);
    else if (field===14) target.avg_speed_mps=Number(value)/1000;
    else if (field===15) target.max_speed_mps=Number(value)/1000;
    else if (field===16) target.avg_hr=Number(value);
    else if (field===17) target.max_hr=Number(value);
    else if (field===22) target.ascent_m=Number(value);
    else if (field===23) target.descent_m=Number(value);
    else if (field===253) target.end_time_ms=fitDateTimeMs(value);
  };

  const assignFileId=(field,value)=>{
    if (value==null) return;
    if (field===1) fileId.manufacturer=Number(value);
    else if (field===2) fileId.product_id=Number(value);
    else if (field===3) fileId.serial_number=String(value);
    else if (field===4) fileId.created_at_ms=fitDateTimeMs(value);
  };

  while (offset < dataEnd) {
    const header=view.getUint8(offset++);
    let localType, compressedTime=null;

    if (header & 0x80) {
      localType=(header>>5)&0x03;
      const timeOffset=header&0x1f;
      if (lastTimestampSec!=null) {
        let candidate=(lastTimestampSec & ~0x1f) + timeOffset;
        if (candidate < lastTimestampSec) candidate += 0x20;
        compressedTime=candidate;
      }
    } else {
      localType=header&0x0f;
    }

    const isDefinition=!(header&0x80) && Boolean(header&0x40);
    const hasDeveloper=!(header&0x80) && Boolean(header&0x20);

    if (isDefinition) {
      if (offset+5>dataEnd) break;
      offset++; // reserved
      const architecture=view.getUint8(offset++);
      const little=architecture===0;
      const globalMessage=view.getUint16(offset,little); offset+=2;
      const fieldCount=view.getUint8(offset++);
      const fields=[];
      for (let i=0;i<fieldCount;i++) {
        if (offset+3>dataEnd) break;
        fields.push({
          field:view.getUint8(offset++),
          size:view.getUint8(offset++),
          baseType:view.getUint8(offset++)
        });
      }
      const developerFields=[];
      if (hasDeveloper && offset<dataEnd) {
        const count=view.getUint8(offset++);
        for (let i=0;i<count;i++) {
          if (offset+3>dataEnd) break;
          developerFields.push({
            field:view.getUint8(offset++),
            size:view.getUint8(offset++),
            developerIndex:view.getUint8(offset++)
          });
        }
      }
      definitions.set(localType,{globalMessage,little,fields,developerFields});
      continue;
    }

    const def=definitions.get(localType);
    if (!def) throw new Error(`Définition FIT locale ${localType} manquante.`);

    const values=new Map();
    for (const f of def.fields) {
      if (offset+f.size>dataEnd) { offset=dataEnd; break; }
      const value=readFitScalar(view,offset,f.size,f.baseType,def.little);
      values.set(f.field,value);
      offset+=f.size;
    }
    for (const f of def.developerFields || []) {
      offset=Math.min(dataEnd,offset+f.size);
    }

    let timestamp=values.get(253);
    if (timestamp!=null) lastTimestampSec=Number(timestamp);
    else if (compressedTime!=null) {
      timestamp=compressedTime;
      lastTimestampSec=compressedTime;
    }

    if (def.globalMessage===0) {
      values.forEach((value,field)=>assignFileId(field,value));
    } else if (def.globalMessage===18) {
      const decodedSession={};
      values.forEach((value,field)=>assignSession(decodedSession,field,value));
      if (timestamp!=null) assignSession(decodedSession,253,timestamp);
      sessions.push(decodedSession);
    } else if (def.globalMessage===20) {
      const lat=fitSemicircles(values.get(0));
      const lon=fitSemicircles(values.get(1));
      const enhancedAlt=values.get(78);
      const standardAlt=values.get(2);
      const altitude=enhancedAlt!=null ? Number(enhancedAlt)/5-500
        : standardAlt!=null ? Number(standardAlt)/5-500 : null;
      const enhancedSpeed=values.get(73);
      const standardSpeed=values.get(6);
      const speed=enhancedSpeed!=null ? Number(enhancedSpeed)/1000
        : standardSpeed!=null ? Number(standardSpeed)/1000 : null;
      records.push({
        time_ms: fitDateTimeMs(timestamp),
        lat, lon, alt_m: altitude,
        hr_bpm: values.get(3)!=null ? Number(values.get(3)) : null,
        cadence: values.get(4)!=null ? Number(values.get(4)) : null,
        distance_m: values.get(5)!=null ? Number(values.get(5))/100 : null,
        speed_mps: speed
      });
    }
  }

  if (sessions.length) {
    sessions.sort((a,b)=>numberOrZero(a.start_time_ms)-numberOrZero(b.start_time_ms));
    const first=sessions[0],last=sessions[sessions.length-1];
    Object.assign(session,first);
    session.start_time_ms=first.start_time_ms;
    session.end_time_ms=last.end_time_ms || last.start_time_ms;
    if (sessions.length>1) {
      session.elapsed_time_ms=sessions.reduce((sum,item)=>sum+numberOrZero(item.elapsed_time_ms),0);
      session.timer_time_ms=sessions.reduce((sum,item)=>sum+numberOrZero(item.timer_time_ms),0);
      session.distance_m=sessions.reduce((sum,item)=>sum+numberOrZero(item.distance_m),0);
      session.ascent_m=sessions.reduce((sum,item)=>sum+numberOrZero(item.ascent_m),0);
      session.descent_m=sessions.reduce((sum,item)=>sum+numberOrZero(item.descent_m),0);
      session.calories=sessions.reduce((sum,item)=>sum+numberOrZero(item.calories),0) || null;
      session.max_hr=Math.max(...sessions.map((item)=>numberOrZero(item.max_hr)),0) || null;
    }
  }

  const gps=records.filter(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lon)&&Math.abs(r.lat)<=90&&Math.abs(r.lon)<=180);
  const timed=records.filter(r=>Number.isFinite(r.time_ms));
  const distances=records.map(r=>r.distance_m).filter(Number.isFinite);
  const hrs=records.map(r=>r.hr_bpm).filter(v=>Number.isFinite(v)&&v>=20&&v<=260);
  const alts=records.map(r=>r.alt_m).filter(Number.isFinite);

  if (!session.start_time_ms) session.start_time_ms=timed[0]?.time_ms || fileId.created_at_ms || null;
  if (!session.elapsed_time_ms && timed.length>1) session.elapsed_time_ms=Math.max(0,timed[timed.length-1].time_ms-timed[0].time_ms);
  if (!session.distance_m && distances.length) session.distance_m=Math.max(...distances);
  if (!session.avg_hr && hrs.length) session.avg_hr=Math.round(hrs.reduce((a,b)=>a+b,0)/hrs.length);
  if (!session.max_hr && hrs.length) session.max_hr=Math.max(...hrs);

  if ((!session.ascent_m || !session.descent_m) && alts.length>1) {
    let ascent=0, descent=0, prev=null;
    for (const r of records) {
      if (!Number.isFinite(r.alt_m)) continue;
      if (prev!=null) {
        const delta=r.alt_m-prev;
        if (delta>0) ascent+=delta; else descent-=delta;
      }
      prev=r.alt_m;
    }
    if (!session.ascent_m) session.ascent_m=Math.round(ascent);
    if (!session.descent_m) session.descent_m=Math.round(descent);
  }

  if (!Number.isFinite(session.start_time_ms)) throw new Error("Date de début FIT introuvable.");
  if (!Number.isFinite(session.distance_m)) session.distance_m=0;
  if (!Number.isFinite(session.elapsed_time_ms)) session.elapsed_time_ms=0;

  return {
    protocolVersion,
    profileVersion,
    fileId,
    session,
    sessions,
    records,
    gps,
    fileName
  };
}

async function sha256Hex(buffer) {
  const digest=await crypto.subtle.digest("SHA-256",buffer);
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
}

function openWebImportArchive() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(WEB_IMPORT_ARCHIVE_DB,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if (!db.objectStoreNames.contains(WEB_IMPORT_ARCHIVE_STORE)) {
        const store=db.createObjectStore(WEB_IMPORT_ARCHIVE_STORE,{keyPath:"sha256"});
        store.createIndex("imported_at_ms","imported_at_ms");
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error || new Error("IndexedDB indisponible."));
  });
}

async function archiveOriginalFit(candidate) {
  const db=await openWebImportArchive();
  try {
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(WEB_IMPORT_ARCHIVE_STORE,"readwrite");
      tx.objectStore(WEB_IMPORT_ARCHIVE_STORE).put({
        sha256:candidate.sha256,
        file_name:candidate.file.name,
        file_size_bytes:candidate.file.size,
        file_last_modified:candidate.file.lastModified,
        imported_at_ms:Date.now(),
        blob:candidate.file
      });
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error || new Error("Échec archivage local."));
    });
  } finally { db.close(); }
}

function makeWebImportedActivityId(startMs) {
  const base=Math.max(1,Math.floor(Number(startMs)||Date.now()));
  return base*1000 + Math.floor(Math.random()*1000);
}

function decimateFitRecords(records,maxPoints=800) {
  if (records.length<=maxPoints) return records.slice();
  const result=[];
  const step=(records.length-1)/(maxPoints-1);
  for (let i=0;i<maxPoints;i++) result.push(records[Math.round(i*step)]);
  return result;
}

function buildWebImportRoute(parsed) {
  // WEBSPLIT003 conserve aussi les points sans GPS : la chronologie doit rester
  // exploitable pour les tapis et les fichiers multisports. La carte ignorera
  // naturellement les coordonnées absentes.
  const source=Array.isArray(parsed.records)?parsed.records:[];
  const rows=decimateFitRecords(source,800);
  return {
    lat:rows.map(r=>r.lat),
    lon:rows.map(r=>r.lon),
    alt_m:rows.map(r=>Number.isFinite(r.alt_m)?r.alt_m:null),
    distance_m:rows.map(r=>Number.isFinite(r.distance_m)?r.distance_m:null),
    time_ms:rows.map(r=>Number.isFinite(r.time_ms)?r.time_ms:null),
    hr_bpm:rows.map(r=>Number.isFinite(r.hr_bpm)?r.hr_bpm:null),
    speed_mps:rows.map(r=>Number.isFinite(r.speed_mps)?r.speed_mps:null),
    source_point_count:source.length,
    web_preview_point_count:rows.length,
    route_format:"WEBIMPORT001",
    fit_sessions:Array.isArray(parsed.sessions)?parsed.sessions:[]
  };
}

function buildWebImportActivity(candidate,id) {
  const p=candidate.parsed, s=p.session;
  const activity={
    id,
    sport:Number.isFinite(s.sport)?s.sport:1,
    sub_sport:Number.isFinite(s.sub_sport)?s.sub_sport:0,
    start_time_ms:Math.round(s.start_time_ms),
    elapsed_time_ms:Math.round(numberOrZero(s.elapsed_time_ms)),
    timer_time_ms:Math.round(numberOrZero(s.timer_time_ms)||numberOrZero(s.elapsed_time_ms)),
    distance_m:numberOrZero(s.distance_m),
    ascent_m:numberOrZero(s.ascent_m),
    descent_m:numberOrZero(s.descent_m),
    calories:Number.isFinite(s.calories)?Math.round(s.calories):null,
    avg_hr:Number.isFinite(s.avg_hr)?Math.round(s.avg_hr):null,
    max_hr:Number.isFinite(s.max_hr)?Math.round(s.max_hr):null,
    avg_speed_mps:Number.isFinite(s.avg_speed_mps)?s.avg_speed_mps:null,
    max_speed_mps:Number.isFinite(s.max_speed_mps)?s.max_speed_mps:null,
    gps_point_count:p.gps.length,
    record_count:p.records.length,
    file_name:candidate.file.name,
    file_size_bytes:candidate.file.size,
    import_source:"WEB_MANUAL_FIT",
    import_profile:"WEBIMPORT001",
    imported_at_ms:Date.now(),
    protocol_version:p.protocolVersion,
    profile_version:p.profileVersion,
    manufacturer:p.fileId.manufacturer ?? null,
    product_id:p.fileId.product_id ?? null,
    source_sha256:candidate.sha256,
    original_archive:ui.webImportArchiveOriginals?.checked ? "INDEXEDDB_LOCAL" : "NONE",
    deleted_at_ms:null
  };
  applyAutomaticEquipmentMappingToDraft(activity);
  return activity;
}

async function findProbableWebImportDuplicate(parsed,sha256) {
  const start=parsed.session.start_time_ms;
  const distance=numberOrZero(parsed.session.distance_m);

  if (activities.some(a=>String(a.source_sha256||"")===sha256)) {
    return {kind:"exact",label:"Même fichier déjà importé"};
  }

  const min=start-120000, max=start+120000;
  try {
    const snap=await getDocs(query(
      userCollection("activities"),
      where("start_time_ms",">=",min),
      where("start_time_ms","<=",max),
      limit(30)
    ));
    for (const docSnap of snap.docs) {
      const a=docSnap.data();
      if (String(a.source_sha256||"")===sha256) return {kind:"exact",label:"Même fichier déjà importé"};
      const delta=Math.abs(numberOrZero(a.distance_m)-distance);
      const tolerance=Math.max(100,distance*0.02);
      if (delta<=tolerance) return {
        kind:"probable",
        label:`Doublon probable · ${formatDateLong(a.start_time_ms)} · ${formatDistance(a.distance_m)}`
      };
    }
  } catch (error) {
    console.warn("WEBIMPORT001 duplicate query",error);
    for (const a of activities) {
      if (Math.abs(numberOrZero(a.start_time_ms)-start)<=120000 &&
          Math.abs(numberOrZero(a.distance_m)-distance)<=Math.max(100,distance*0.02)) {
        return {kind:"probable",label:"Doublon probable dans le catalogue chargé"};
      }
    }
  }
  return null;
}

async function prepareWebImportCandidate(file) {
  if (!file?.name?.toLowerCase().endsWith(".fit")) {
    throw new Error(`${file?.name||"Fichier"} : WEBIMPORT001 accepte actuellement les fichiers FIT.`);
  }
  const buffer=await file.arrayBuffer();
  const parsed=decodeFitActivity(buffer,file.name);
  const sha256=await sha256Hex(buffer);
  const duplicate=await findProbableWebImportDuplicate(parsed,sha256);
  const previewActivity=buildWebImportActivity({parsed,file,sha256},makeWebImportedActivityId(parsed.session.start_time_ms));
  const autoSplitParts=automaticSplitPartsFromRawRoute(buildWebImportRoute(parsed),previewActivity,parsed.sessions || []);
  return {
    id:`candidate_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    file, parsed, sha256, duplicate, autoSplitParts,
    selected:!duplicate,
    force:false,
    error:null
  };
}

async function handleWebImportFiles(files) {
  if (!files?.length || webImportRunning) return;
  ui.webImportStatus.textContent=`Analyse de ${files.length} fichier(s)…`;
  ui.webImportStatus.className="web-import-status pending";
  for (const file of files) {
    try {
      const candidate=await prepareWebImportCandidate(file);
      webImportCandidates.push(candidate);
    } catch (error) {
      webImportCandidates.push({
        id:`error_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file, error:String(error?.message||error), selected:false
      });
    }
    renderWebImportCandidates();
  }
  ui.webImportStatus.textContent=`${webImportCandidates.length} fichier(s) préparé(s). Vérifiez avant validation.`;
  ui.webImportStatus.className="web-import-status";
}

function clearWebImportCandidates() {
  if (webImportRunning) return;
  webImportCandidates=[];
  renderWebImportCandidates();
  ui.webImportStatus.textContent="Aucun fichier sélectionné.";
}

function renderWebImportCandidates() {
  if (!ui.webImportPreviewList) return;
  ui.webImportPreviewList.innerHTML="";
  let selectedCount=0;

  for (const c of webImportCandidates) {
    const card=document.createElement("article");
    card.className=`web-import-preview${c.error?" error":c.duplicate?" duplicate":""}`;

    if (c.error) {
      card.innerHTML=`<div><strong>${escapeHtml(c.file?.name||"Fichier")}</strong><span class="pill error">Erreur</span></div>
        <p>${escapeHtml(c.error)}</p>`;
      ui.webImportPreviewList.appendChild(card);
      continue;
    }

    const a=c.parsed.session;
    if (c.selected) selectedCount++;
    const calories=Number.isFinite(a.calories)?`${formatNumber(a.calories)} kcal`:"Calories absentes";
    card.innerHTML=`
      <label class="web-import-preview-check">
        <input type="checkbox" ${c.selected?"checked":""}>
        <span>
          <strong>${escapeHtml(c.file.name)}</strong>
          <small>${escapeHtml(formatBytes(c.file.size))} · SHA ${escapeHtml(c.sha256.slice(0,10))}…</small>
        </span>
      </label>
      <div class="web-import-preview-metrics">
        <span><small>Sport</small><strong>${escapeHtml(sportName(a.sport))}</strong></span>
        <span><small>Date</small><strong>${escapeHtml(formatDateLong(a.start_time_ms))}</strong></span>
        <span><small>Distance</small><strong>${escapeHtml(formatDistance(a.distance_m))}</strong></span>
        <span><small>Durée</small><strong>${escapeHtml(formatDuration(a.elapsed_time_ms))}</strong></span>
        <span><small>D+</small><strong>${escapeHtml(formatMeters(a.ascent_m))}</strong></span>
        <span><small>FC</small><strong>${escapeHtml(formatHeartRate(a.avg_hr))}</strong></span>
        <span><small>Calories</small><strong>${escapeHtml(calories)}</strong></span>
        <span><small>GPS</small><strong>${formatNumber(c.parsed.gps.length)}</strong></span>
      </div>
      ${Array.isArray(c.autoSplitParts)&&c.autoSplitParts.length>1?`<div class="web-import-duplicate-warning"><span class="pill ok">${WEB_SPLIT_VERSION}</span><strong>Découpe automatique : ${c.autoSplitParts.length} activités</strong><small>GAP &gt; 15 min et/ou changement de sport, sous-sport ou matériel détecté dans la source.</small></div>`:""}
      ${c.duplicate?`<div class="web-import-duplicate-warning"><span class="pill warning">${c.duplicate.kind==="exact"?"Doublon":"À vérifier"}</span><strong>${escapeHtml(c.duplicate.label)}</strong><small>Cochez la ligne uniquement si vous souhaitez réellement importer ce fichier malgré l’alerte.</small></div>`:""}`;

    const checkbox=card.querySelector('input[type="checkbox"]');
    checkbox.addEventListener("change",()=>{
      c.selected=checkbox.checked;
      c.force=Boolean(c.duplicate && checkbox.checked);
      renderWebImportCandidates();
    });
    ui.webImportPreviewList.appendChild(card);
  }

  ui.webImportClearButton.disabled=!webImportCandidates.length || webImportRunning;
  ui.webImportCommitButton.disabled=!selectedCount || webImportRunning;
  ui.webImportCommitButton.textContent=selectedCount
    ? `Importer ${selectedCount} activité${selectedCount>1?"s":""}`
    : "Importer les activités sélectionnées";
}

async function commitOneWebImport(candidate) {
  if (ui.webImportArchiveOriginals?.checked) await archiveOriginalFit(candidate);

  const sourceId=makeWebImportedActivityId(candidate.parsed.session.start_time_ms);
  const sourceActivity=buildWebImportActivity(candidate,sourceId);
  const rawRoute=buildWebImportRoute(candidate.parsed);
  const parts=automaticSplitPartsFromRawRoute(rawRoute,sourceActivity,candidate.parsed.sessions || []);
  const items=parts.length>1 ? parts : [{child:sourceActivity,route:rawRoute}];
  const created=[];

  for (const item of items) {
    const activity=item.child;
    const route=item.route;
    const key=String(activity.id);

    await commitWebMutation({
      table:"activities",rowKey:key,operation:"UPSERT",row:activity,
      materializedCollection:"activities",materializedData:activity,
      metaIncrements:{activityCount:1,expectedDocuments:1}
    });
    if (Math.max(route.time_ms?.length||0,route.lat?.length||0)>=2) {
      await commitWebMutation({
        table:"activity_routes",rowKey:key,operation:"UPSERT",
        row:{id:activity.id,source_point_count:route.source_point_count,split_part:activity.split_part||null},
        materializedCollection:"activity_routes",materializedData:route
      });
    }
    activities.push({...activity,__docId:key});
    created.push(activity);
  }
  return created;
}

async function commitSelectedWebImports() {
  if (webImportRunning) return;
  const selected=webImportCandidates.filter(c=>c.selected&&!c.error);
  if (!selected.length) return;

  const forced=selected.filter(c=>c.duplicate).length;
  if (forced) {
    const ok=window.confirm(
      `${forced} fichier(s) présentent une alerte de doublon.\n\nContinuer malgré tout ?`
    );
    if (!ok) return;
  }

  webImportRunning=true;
  renderWebImportCandidates();
  let success=0, failed=0;

  try {
    for (let i=0;i<selected.length;i++) {
      const c=selected[i];
      ui.webImportStatus.textContent=`Import ${i+1}/${selected.length} · ${c.file.name}`;
      ui.webImportStatus.className="web-import-status pending";
      try {
        await commitOneWebImport(c);
        c.imported=true;
        c.selected=false;
        success++;
      } catch (error) {
        c.error=`Import impossible : ${error?.message||error}`;
        c.selected=false;
        failed++;
      }
      renderWebImportCandidates();
    }

    webImportCandidates=webImportCandidates.filter(c=>!c.imported);
    rebuildDynamicFilters();
    applyFiltersAndRender();
    await loadWebDashboard();

    ui.webImportStatus.textContent=
      `${success} activité(s) importée(s)` + (failed?` · ${failed} échec(s)`:"") +
      (ui.webImportArchiveOriginals?.checked?" · originaux conservés dans le coffre local.":".");
    ui.webImportStatus.className=`web-import-status ${failed?"warning":"success"}`;
    webFileVaultEntries = [];
    setMessage(`WEBIMPORT001 · ${success} activité(s) créée(s) depuis le Web.`,failed?"info":"success");
  } finally {
    webImportRunning=false;
    renderWebImportCandidates();
  }
}

function activityKey(activity) {
  return String(activity.id ?? activity.__docId ?? "");
}


function currentDetailActivity() {
  if (!currentDetailId) return null;
  return activities.find((activity) => activityKey(activity) === currentDetailId) || null;
}

function loadWebDeviceId() {
  try {
    const key = "sport_web006_device_id";
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const random = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID().replaceAll("-", "")
      : `${Date.now()}${Math.random().toString(36).slice(2)}`;
    const value = `web_${random.slice(0, 32)}`;
    localStorage.setItem(key, value);
    return value;
  } catch {
    return `web_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  }
}

function nextWebFirebaseSeq() {
  try {
    const key = "sport_web_interop_firebase_seq";
    const next = Math.max(1, Number(localStorage.getItem(key) || 0) + 1);
    localStorage.setItem(key, String(next));
    return next;
  } catch {
    return Date.now();
  }
}

function makeWebEventId(seq) {
  const random = Math.random().toString(36).slice(2, 9);
  return `${webDeviceId}_${seq}_${Date.now()}_${random}`;
}

function setInteropStatus(text, state = "ok") {
  ui.interopStatus.textContent = text;
  ui.interopStatus.className =
    state === "pending" ? "pill pending" :
    state === "error" ? "pill error" :
    "pill ok";
}

async function commitWebMutation(args) {
  if (!currentUser) throw new Error("Connexion Firebase absente.");

  const payload = normalizePendingMutation(args);

  if (!navigator.onLine) {
    enqueuePendingWebMutation(payload);
    window.setTimeout(() => {
      setInteropStatus("Hors ligne · modification en attente", "pending");
      setMessage(
        "WEB018 · réseau indisponible : modification conservée localement et reprise automatiquement au retour de la connexion.",
        "info"
      );
      renderSyncHealth();
    }, 0);
    return { queued: true, now: Date.now() };
  }

  try {
    const result = await commitWebMutationOnline(payload);
    await publishWebHealth("OK", "");
    return result;
  } catch (error) {
    await publishWebHealth("ERROR", String(error?.message || error));
    throw error;
  }
}

function normalizePendingMutation(args) {
  return {
    table: String(args?.table ?? ""),
    rowKey: String(args?.rowKey ?? ""),
    operation: String(args?.operation ?? "UPSERT"),
    row: args?.row ?? null,
    materializedCollection: String(args?.materializedCollection ?? ""),
    materializedData: args?.materializedData ?? null,
    deleteMaterialized: Boolean(args?.deleteMaterialized),
    metaIncrements: args?.metaIncrements && typeof args.metaIncrements === "object"
      ? { ...args.metaIncrements }
      : null,
    queuedAtMs: Date.now()
  };
}

async function commitWebMutationOnline({
  table,
  rowKey,
  operation,
  row,
  materializedCollection,
  materializedData,
  deleteMaterialized = false,
  metaIncrements = null
}) {
  if (!currentUser) throw new Error("Connexion Firebase absente.");

  const seq = nextWebFirebaseSeq();
  const eventId = makeWebEventId(seq);
  const now = Date.now();

  const batch = writeBatch(db);
  const businessRef = doc(db, ROOT, currentUser.uid, materializedCollection, rowKey);
  const changeRef = doc(db, ROOT, currentUser.uid, "changes", eventId);
  const metaRef = doc(db, ROOT, currentUser.uid, "meta", "state");

  if (deleteMaterialized) {
    batch.delete(businessRef);
  } else {
    batch.set(
      businessRef,
      {
        ...(materializedData || row || {}),
        __sportKey: rowKey,
        __updatedAtMs: now
      },
      { merge: true }
    );
  }

  const event = {
    eventId,
    deviceId: webDeviceId,
    firebaseSeq: seq,
    sourceChangeSeq: 0,
    table,
    rowKey,
    operation,
    changedAtMs: now,
    publishedAt: serverTimestamp(),
    androidVersion: 0,
    webVersion: "WEB041"
  };
  if (row != null) event.row = row;

  batch.set(changeRef, event);

  const metaPatch = {
    updatedAtMs: now,
    sourceDeviceId: webDeviceId,
    webVersion: "WEB041"
  };
  if (metaIncrements && typeof metaIncrements === "object") {
    for (const [field, delta] of Object.entries(metaIncrements)) {
      const amount = Number(delta);
      if (Number.isFinite(amount) && amount !== 0) metaPatch[field] = increment(amount);
    }
  }

  batch.set(metaRef, metaPatch, { merge: true });
  await batch.commit();
  return { eventId, now, queued: false };
}

function pendingWebMutations() {
  try {
    const raw = localStorage.getItem(WEB_PENDING_MUTATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePendingWebMutations(items) {
  localStorage.setItem(WEB_PENDING_MUTATIONS_KEY, JSON.stringify(Array.isArray(items) ? items : []));
  renderSyncHealth();
}

function enqueuePendingWebMutation(payload) {
  const queue = pendingWebMutations();
  queue.push({ ...payload, localQueueId: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}` });
  savePendingWebMutations(queue);
}

async function flushPendingWebMutations() {
  if (!currentUser || !navigator.onLine || webMutationRetryRunning) {
    renderSyncHealth();
    return;
  }

  let queue = pendingWebMutations();
  if (!queue.length) {
    await publishWebHealth("OK", "");
    renderSyncHealth();
    return;
  }

  webMutationRetryRunning = true;
  ui.syncHealthRetryButton.disabled = true;
  setMessage(`WEB018 · reprise de ${queue.length} mutation(s) Web en attente…`, "info");

  try {
    while (queue.length && navigator.onLine) {
      const mutation = queue[0];
      await commitWebMutationOnline(mutation);
      queue.shift();
      savePendingWebMutations(queue);
    }

    if (!queue.length) {
      await publishWebHealth("OK", "");
      setMessage("WEB018 · toutes les mutations Web en attente ont été réémises.", "success");
    } else {
      await publishWebHealth("OFFLINE", "");
    }
  } catch (error) {
    await publishWebHealth("ERROR", String(error?.message || error));
    setMessage(
      "WEB018 · reprise automatique interrompue : " + (error?.message || error),
      "error"
    );
  } finally {
    webMutationRetryRunning = false;
    ui.syncHealthRetryButton.disabled = false;
    renderSyncHealth();
  }
}

function scheduleCurrentActivityAutosave() {
  const activity = currentDetailActivity();
  if (!activity) return;

  const key = activityKey(activity);
  if (!key) return;

  editorActivityKey = key;
  activityEditDirty = true;
  activityAutosaveGeneration += 1;
  const generation = activityAutosaveGeneration;
  const title = ui.editTitleInput.value.trim();
  const description = ui.editDescriptionInput.value.trim();
  const note = ui.editNoteInput.value.trim();

  if (activityAutosaveTimer) clearTimeout(activityAutosaveTimer);

  setInteropStatus("Modification détectée · envoi automatique…", "pending");

  activityAutosaveTimer = window.setTimeout(() => {
    activityAutosaveTimer = null;
    void queueActivityAutosave(activity, title, description, note, generation);
  }, AUTOSAVE_DELAY_MS);
}

function flushCurrentActivityAutosave() {
  if (!activityEditDirty || !editorActivityKey) return activityAutosaveQueue;

  const activity = activities.find((item) => activityKey(item) === editorActivityKey);
  if (!activity) return activityAutosaveQueue;

  if (activityAutosaveTimer) {
    clearTimeout(activityAutosaveTimer);
    activityAutosaveTimer = null;
  }

  activityAutosaveGeneration += 1;
  const generation = activityAutosaveGeneration;
  const title = ui.editTitleInput.value.trim();
  const description = ui.editDescriptionInput.value.trim();
  const note = ui.editNoteInput.value.trim();

  return queueActivityAutosave(activity, title, description, note, generation);
}

function queueActivityAutosave(activity, title, description, note, generation) {
  const run = () => persistActivityEdits(activity, title, description, note, generation);
  activityAutosaveQueue = activityAutosaveQueue.then(run, run);
  return activityAutosaveQueue;
}

async function persistActivityEdits(activity, title, description, note, generation) {
  const key = activityKey(activity);
  if (!key) return;

  const patch = {
    id: Number(key),
    custom_title: title || null,
    description: description || null,
    personal_note: note || null
  };

  const unchanged =
    String(activity.custom_title ?? "") === title &&
    String(activity.description ?? "") === description &&
    String(activity.personal_note ?? "") === note;

  if (unchanged) {
    if (generation === activityAutosaveGeneration && editorActivityKey === key) {
      activityEditDirty = false;
      setInteropStatus("Synchronisation automatique active", "ok");
    }
    return;
  }

  setInteropStatus("Synchronisation automatique…", "pending");

  try {
    await commitWebMutation({
      table: "activities",
      rowKey: key,
      operation: "UPSERT",
      row: patch,
      materializedCollection: "activities",
      materializedData: patch
    });

    Object.assign(activity, patch);

    if (generation === activityAutosaveGeneration && editorActivityKey === key) {
      activityEditDirty = false;

      if (currentDetailId === key) {
        ui.detailTitle.textContent = title || sportName(activity.sport);
        document.title = `${title || sportName(activity.sport)} · SPORT Web`;
        renderPersonal(activity);
      }

      setInteropStatus("Synchronisé automatiquement", "ok");
      setMessage(
        "WEB018 · modification propagée automatiquement vers téléphone et tablette.",
        "success"
      );
    }

    applyFiltersAndRender();
  } catch (error) {
    console.error(error);
    if (generation === activityAutosaveGeneration && editorActivityKey === key) {
      activityEditDirty = true;
      setInteropStatus("Échec de synchronisation automatique", "error");
    }
    handleError(error, "Modification Web impossible");
  }
}


function nullableSelectNumber(value, min, max) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizePrivacy(value) {
  const normalized = String(value || "PRIVATE").trim().toUpperCase();
  if (normalized === "PUBLIC" || normalized === "UNLISTED") return normalized;
  return "PRIVATE";
}

function equipmentDisplayName(item) {
  if (!item) return "";
  const custom = String(item.custom_name ?? "").trim();
  if (custom) return custom;

  const brand = String(item.brand ?? "").trim();
  const model = String(item.model ?? "").trim();
  const specimen = Number(item.specimen_number);
  let label = [brand, model].filter(Boolean).join(" ").trim();
  if (!label) label = String(item.id ?? item.__docId ?? "Matériel");
  if (Number.isFinite(specimen) && specimen > 1) label += ` #${specimen}`;
  return label;
}

function rebuildEquipmentEditor(activity) {
  const selected = String(activity.equipment_name ?? "");
  ui.editEquipmentSelect.innerHTML = "";

  const none = document.createElement("option");
  none.value = "";
  none.textContent = "Aucun matériel";
  ui.editEquipmentSelect.appendChild(none);

  const allowedCategories = equipmentCategoriesForSport(activity);
  const rows = equipmentRows
    .filter((item) => {
      const active = String(item.status ?? "ACTIVE").toUpperCase() === "ACTIVE";
      if (!active) return false;
      if (!allowedCategories) return true;
      return allowedCategories.has(String(item.category ?? "").toUpperCase());
    })
    .slice()
    .sort((a,b) =>
      equipmentDisplayName(a).localeCompare(equipmentDisplayName(b), "fr", {sensitivity:"base"})
    );

  const values = new Set();
  for (const item of rows) {
    const value = equipmentDisplayName(item);
    if (!value || values.has(value)) continue;
    values.add(value);
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    ui.editEquipmentSelect.appendChild(option);
  }

  // Une affectation historique en réserve/archivée reste visible, mais n'est pas proposée pour un nouveau choix.
  if (selected && !values.has(selected)) {
    const legacy = document.createElement("option");
    legacy.value = selected;
    legacy.textContent = `${selected} · affectation historique`;
    legacy.disabled = true;
    legacy.selected = true;
    ui.editEquipmentSelect.appendChild(legacy);
  } else {
    ui.editEquipmentSelect.value = selected;
  }
}

async function saveImmediateActivityFields(partialPatch, successLabel) {
  const activity = currentDetailActivity();
  if (!activity) return;
  const key = activityKey(activity);
  if (!key) return;

  const patch = { id: Number(key), ...(partialPatch || {}) };
  const changed = Object.entries(partialPatch || {}).some(([field, value]) => {
    const current = activity[field];
    if (value == null && current == null) return false;
    return String(current ?? "") !== String(value ?? "");
  });
  if (!changed) return;

  setInteropStatus("Synchronisation automatique…", "pending");
  try {
    await commitWebMutation({
      table: "activities",
      rowKey: key,
      operation: "UPSERT",
      row: patch,
      materializedCollection: "activities",
      materializedData: patch
    });

    Object.assign(activity, patch);
    renderHeroMetrics(activity);
    renderSummary(activity);
    renderPerformance(activity);
    renderPersonal(activity);
    renderRaw(activity);
    applyFiltersAndRender();

    setInteropStatus(successLabel || "Synchronisé automatiquement", "ok");
    setMessage("WEB018 · modification propagée automatiquement sur les trois plateformes.", "success");
  } catch (error) {
    console.error(error);
    setInteropStatus("Échec de synchronisation automatique", "error");
    handleError(error, "Modification Web impossible");
  }
}

async function addSelectedLandmark() {
  const activity = currentDetailActivity();
  if (!activity) return;

  const code = ui.addLandmarkSelect.value;
  if (!code) {
    setInteropStatus("Choisis un repère", "pending");
    return;
  }

  await setLandmarkOccurrence(activity, code, 1);
}

async function changeLandmarkOccurrence(activity, code, delta) {
  const current = linksForActivity(activity)
    .find((link) => String(link.landmark_code ?? "") === String(code));
  const currentCount = current ? Math.max(1, numberOrZero(current.occurrences)) : 0;
  const next = Math.max(0, Math.min(99, currentCount + delta));
  await setLandmarkOccurrence(activity, code, next);
}

async function setLandmarkOccurrence(activity, code, occurrences) {
  const activityId = Number(activity.id ?? activity.__docId);
  if (!Number.isFinite(activityId) || activityId <= 0 || !code) return;

  const rowKey = `${activityId}:${code}`;
  const now = Date.now();
  const next = Math.max(0, Math.min(99, Number(occurrences) || 0));

  setInteropStatus(next > 0 ? "Repère en cours d’envoi…" : "Suppression en cours…", "pending");

  try {
    if (next <= 0) {
      await commitWebMutation({
        table: "activity_landmarks",
        rowKey,
        operation: "DELETE",
        row: null,
        materializedCollection: "activity_landmarks",
        deleteMaterialized: true
      });
      applyActivityLandmarkLocally(activityId, code, null, "DELETE");
    } else {
      const row = {
        activity_id: activityId,
        landmark_code: code,
        occurrences: next,
        source: "WEB",
        updated_at_ms: now
      };
      await commitWebMutation({
        table: "activity_landmarks",
        rowKey,
        operation: "UPSERT",
        row,
        materializedCollection: "activity_landmarks",
        materializedData: row
      });
      applyActivityLandmarkLocally(activityId, code, row, "UPSERT");
    }

    renderPersonal(activity);
    applyFiltersAndRender();
    setInteropStatus("Repère synchronisé automatiquement", "ok");
    setMessage("WEB018 · repère synchronisé automatiquement sur les trois plateformes.", "success");
  } catch (error) {
    console.error(error);
    setInteropStatus("Échec repère", "error");
    handleError(error, "Modification du repère impossible");
  }
}

function applyActivityLandmarkLocally(activityId, code, row, operation) {
  const key = String(activityId);
  const list = (activityLandmarks.get(key) || [])
    .filter((item) => String(item.landmark_code ?? "") !== String(code));

  if (operation !== "DELETE" && row) list.push(row);

  if (list.length) activityLandmarks.set(key, list);
  else activityLandmarks.delete(key);
}


function stopSyncHealthWatch() {
  if (syncHealthUnsubscribe) {
    try { syncHealthUnsubscribe(); } catch {}
  }
  syncHealthUnsubscribe = null;
  syncHealthRows = [];
}

function startSyncHealthWatch() {
  stopSyncHealthWatch();
  if (!currentUser) return;

  syncHealthUnsubscribe = onSnapshot(
    userCollection("sync_health"),
    (snapshot) => {
      syncHealthRows = snapshot.docs.map((item) => ({ __healthId: item.id, ...item.data() }));
      renderSyncHealth();
    },
    (error) => {
      console.error(error);
      ui.syncHealthMeta.textContent = "État de santé Firestore indisponible";
    }
  );
}

function stopWebHealthHeartbeat() {
  if (syncHealthHeartbeatTimer) window.clearInterval(syncHealthHeartbeatTimer);
  syncHealthHeartbeatTimer = null;
}

function startWebHealthHeartbeat() {
  stopWebHealthHeartbeat();
  syncHealthHeartbeatTimer = window.setInterval(() => {
    if (!currentUser) return;
    void publishWebHealth(navigator.onLine ? "OK" : "OFFLINE", "");
  }, SYNC_HEALTH_HEARTBEAT_MS);
}

async function publishWebHealth(state = "OK", errorMessage = "") {
  renderSyncHealth();
  if (!currentUser || !navigator.onLine) return;

  try {
    const now = Date.now();
    const batch = writeBatch(db);
    const ref = doc(db, ROOT, currentUser.uid, "sync_health", webDeviceId);
    const platform =
      navigator.userAgentData?.platform ||
      navigator.platform ||
      "Navigateur";

    const health = {
      deviceId: webDeviceId,
      clientType: "WEB",
      deviceLabel: `Web · ${platform}`,
      state: String(state || "OK"),
      online: true,
      pendingMutations: pendingWebMutations().length,
      lastError: String(errorMessage || ""),
      lastSeenAt: serverTimestamp(),
      lastSeenAtMs: now,
      lastSyncAtMs: state === "OK" ? now : 0,
      lastStatus: state === "ERROR" ? "Erreur Web" : "SPORT Web actif",
      webVersion: "WEB041",
      androidVersion: 0
    };
    batch.set(ref, health, { merge: true });
    await batch.commit();
  } catch (error) {
    console.error("SYNCHEALTH001 publishWebHealth", error);
  }
}

function healthTimeMs(row) {
  const timestamp = row?.lastSeenAt;
  if (timestamp && typeof timestamp.toMillis === "function") return timestamp.toMillis();
  if (timestamp?.seconds) return Number(timestamp.seconds) * 1000;
  return Number(row?.lastSeenAtMs) || 0;
}

function healthSyncMs(row) {
  return Number(row?.lastSyncAtMs) || healthTimeMs(row);
}

function healthClientLabel(row) {
  const type = String(row?.clientType || "").toUpperCase();
  const label = String(row?.deviceLabel || row?.deviceId || "Client SPORT");
  if (type === "WEB") return label;
  return `Android · ${label}`;
}

function healthState(row, now = Date.now()) {
  if (String(row?.state || "").toUpperCase() === "ERROR") return "ERROR";
  if (String(row?.state || "").toUpperCase() === "OFFLINE") return "OFFLINE";
  const seen = healthTimeMs(row);
  if (!seen || now - seen > SYNC_HEALTH_STALE_MS) return "STALE";
  if (Number(row?.pendingMutations) > 0) return "PENDING";
  if (String(row?.state || "").toUpperCase() === "SYNCING") return "SYNCING";
  return "OK";
}

function healthStateLabel(state) {
  return {
    OK: "OK",
    SYNCING: "Synchronisation…",
    PENDING: "En attente",
    OFFLINE: "Hors ligne",
    STALE: "Inactif / ancien",
    ERROR: "Erreur"
  }[state] || state;
}

function renderSyncHealth() {
  if (!ui.syncHealthList) return;

  const now = Date.now();
  const localQueue = pendingWebMutations();
  let rows = syncHealthRows.slice();

  const currentIndex = rows.findIndex((row) => String(row.deviceId || row.__healthId) === webDeviceId);
  const syntheticWeb = {
    deviceId: webDeviceId,
    clientType: "WEB",
    deviceLabel: `Web · ${navigator.userAgentData?.platform || navigator.platform || "Navigateur"}`,
    state: navigator.onLine ? (localQueue.length ? "PENDING" : "OK") : "OFFLINE",
    pendingMutations: localQueue.length,
    lastError: "",
    lastSeenAtMs: now,
    lastSyncAtMs: now,
    webVersion: "WEB041",
    androidVersion: 0,
    __synthetic: true
  };
  if (currentIndex >= 0) rows[currentIndex] = { ...rows[currentIndex], ...syntheticWeb };
  else rows.unshift(syntheticWeb);

  rows.sort((a, b) => {
    const aWeb = String(a.clientType).toUpperCase() === "WEB" ? 0 : 1;
    const bWeb = String(b.clientType).toUpperCase() === "WEB" ? 0 : 1;
    if (aWeb !== bWeb) return aWeb - bWeb;
    return healthClientLabel(a).localeCompare(healthClientLabel(b), "fr");
  });

  const states = rows.map((row) => healthState(row, now));
  const healthy = states.filter((state) => state === "OK" || state === "SYNCING").length;
  const pending = rows.reduce((sum, row) => sum + Math.max(0, Number(row.pendingMutations) || 0), 0);
  const errors = states.filter((state) => state === "ERROR").length;

  ui.syncHealthClientCount.textContent = formatNumber(rows.length);
  ui.syncHealthHealthyCount.textContent = formatNumber(healthy);
  ui.syncHealthPendingCount.textContent = formatNumber(pending);
  ui.syncHealthErrorCount.textContent = formatNumber(errors);
  ui.syncHealthNetwork.textContent = navigator.onLine ? "En ligne" : "Hors ligne";
  ui.syncHealthNetwork.className = navigator.onLine ? "health-network-ok" : "health-network-error";
  ui.syncHealthRetryButton.disabled = !navigator.onLine || localQueue.length === 0 || webMutationRetryRunning;

  const androidCount = rows.filter((row) => String(row.clientType).toUpperCase() === "ANDROID").length;
  ui.syncHealthMeta.textContent =
    `${rows.length} client(s) connu(s) · ${androidCount} Android · heartbeat Web 60 s · inactif après 15 min sans nouvelle`;

  ui.syncHealthList.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const state = healthState(row, now);
    const card = document.createElement("article");
    card.className = `sync-health-card state-${state.toLowerCase()}`;

    const heading = document.createElement("div");
    heading.className = "sync-health-card-heading";

    const title = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = healthClientLabel(row);
    const version = document.createElement("span");
    version.textContent = String(row.clientType).toUpperCase() === "WEB"
      ? String(row.webVersion || "Web")
      : `SPORT v${row.androidVersion || "?"}`;
    title.append(strong, version);

    const badge = document.createElement("span");
    badge.className =
      state === "OK" ? "pill ok" :
      state === "ERROR" || state === "OFFLINE" ? "pill error" :
      "pill pending";
    badge.textContent = healthStateLabel(state);

    heading.append(title, badge);

    const grid = document.createElement("div");
    grid.className = "sync-health-card-grid";
    grid.append(
      healthDatum("Dernière présence", relativeHealthTime(healthTimeMs(row), now)),
      healthDatum("Dernier échange", relativeHealthTime(healthSyncMs(row), now)),
      healthDatum("En attente", formatNumber(Math.max(0, Number(row.pendingMutations) || 0))),
      healthDatum("Dernier état", String(row.lastStatus || "—"))
    );

    card.append(heading, grid);

    if (row.lastError) {
      const error = document.createElement("div");
      error.className = "sync-health-error";
      error.textContent = `Erreur : ${row.lastError}`;
      card.appendChild(error);
    }

    fragment.appendChild(card);
  }

  ui.syncHealthList.appendChild(fragment);
}

function healthDatum(label, value) {
  const box = document.createElement("div");
  const span = document.createElement("span");
  span.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  box.append(span, strong);
  return box;
}

function relativeHealthTime(ms, now = Date.now()) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "—";
  const delta = Math.max(0, now - value);
  if (delta < 15_000) return "à l’instant";
  if (delta < 60_000) return `${Math.round(delta / 1000)} s`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)} min`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)} h`;
  return `${Math.round(delta / 86_400_000)} j`;
}

function stopSyncHistoryWatch() {
  if (syncHistoryUnsubscribe) {
    try { syncHistoryUnsubscribe(); } catch {}
  }
  syncHistoryUnsubscribe = null;
}

function startSyncHistoryWatch() {
  stopSyncHistoryWatch();
  if (!currentUser) return;
  const historyQuery = query(userCollection("changes"), orderBy("publishedAt", "desc"), limit(SYNC_HISTORY_LIMIT));
  syncHistoryUnsubscribe = onSnapshot(historyQuery, (snapshot) => {
    syncHistoryEvents = snapshot.docs.map((item) => ({ __eventId: item.id, ...item.data() }));
    syncHistoryEvents.sort((a,b)=>syncEventTime(b)-syncEventTime(a));
    renderSyncHistory();
    renderTrash();
  }, (error) => {
    console.error(error);
    ui.syncCenterMeta.textContent = "Historique temps réel indisponible";
  });
}

function syncEventTime(event) {
  const published = event?.publishedAt;
  if (published && typeof published.toMillis === "function") return published.toMillis();
  if (published?.seconds) return Number(published.seconds) * 1000;
  return Number(event?.changedAtMs) || 0;
}

function syncEventSource(event) {
  if (String(event?.deviceId || "") === webDeviceId) return "WEB";
  if (Number(event?.androidVersion) > 0) return "ANDROID";
  return String(event?.webVersion || "").startsWith("WEB") ? "WEB" : "ANDROID";
}

function syncSourceLabel(event) {
  const source = syncEventSource(event);
  if (source === "WEB") return `Web${event.webVersion ? ` · ${event.webVersion}` : ""}`;
  return `Android${event.androidVersion ? ` · v${event.androidVersion}` : ""}`;
}

function detectSyncConflicts(events) {
  const sorted = events.slice().sort((a,b)=>syncEventTime(b)-syncEventTime(a));
  const latestByKey = new Map();
  const conflictIds = new Set();
  const conflictKeys = new Set();
  for (const event of sorted) {
    const key = `${event.table || ""}|${event.rowKey || ""}`;
    if (!event.table || !event.rowKey) continue;
    const previous = latestByKey.get(key);
    if (previous) {
      const differentDevice = String(previous.deviceId || "") !== String(event.deviceId || "");
      const delta = Math.abs(syncEventTime(previous) - syncEventTime(event));
      if (differentDevice && delta <= CONFLICT_WINDOW_MS) {
        conflictIds.add(previous.__eventId); conflictIds.add(event.__eventId); conflictKeys.add(key);
      }
    }
    latestByKey.set(key,event);
  }
  return { conflictIds, conflictKeys };
}

function renderSyncHistory() {
  if (!ui.syncHistoryList) return;
  const tableFilter=String(ui.syncHistoryTableFilter.value||"");
  const sourceFilter=String(ui.syncHistorySourceFilter.value||"");
  const conflicts=detectSyncConflicts(syncHistoryEvents);
  const filtered=syncHistoryEvents.filter((event)=>{
    if(tableFilter && String(event.table)!==tableFilter) return false;
    if(sourceFilter && syncEventSource(event)!==sourceFilter) return false;
    return true;
  });

  ui.syncEventCount.textContent=formatNumber(syncHistoryEvents.length);
  ui.syncConflictCount.textContent=formatNumber(conflicts.conflictKeys.size);
  ui.syncLastSource.textContent=syncHistoryEvents.length?syncSourceLabel(syncHistoryEvents[0]):"—";
  ui.syncCenterMeta.textContent=`${syncHistoryEvents.length} dernier(s) événement(s) Firestore · écoute en direct`;
  ui.syncConflictBanner.classList.toggle("hidden", conflicts.conflictKeys.size===0);
  ui.syncConflictBanner.textContent=conflicts.conflictKeys.size
    ? `⚠ ${conflicts.conflictKeys.size} donnée(s) ont été modifiées par deux appareils différents à moins de 30 secondes d’intervalle. Vérifie les lignes signalées avant de réappliquer une version.`
    : "";

  ui.syncHistoryList.innerHTML="";
  if(!filtered.length){ ui.syncHistoryList.innerHTML='<div class="empty compact-empty">Aucun événement correspondant.</div>'; return; }
  const fragment=document.createDocumentFragment();
  filtered.forEach((event)=>{
    const conflict=conflicts.conflictIds.has(event.__eventId);
    const row=document.createElement("article"); row.className=`sync-history-row${conflict?" conflict":""}`;
    const source=document.createElement("div"); source.className=`sync-source-badge ${syncEventSource(event).toLowerCase()}`; source.textContent=syncEventSource(event)==="WEB"?"WEB":"ANDROID";
    const main=document.createElement("div"); main.className="sync-history-main";
    const title=document.createElement("strong"); title.textContent=`${syncTableLabel(event.table)} · ${event.rowKey || "—"}`;
    const meta=document.createElement("span"); meta.textContent=`${syncSourceLabel(event)} · ${event.operation || "?"} · ${formatSyncEventDate(syncEventTime(event))}`;
    main.append(title,meta);
    const actions=document.createElement("div"); actions.className="sync-history-actions";
    if(conflict){ const badge=document.createElement("span"); badge.className="pill error"; badge.textContent="Conflit potentiel"; actions.appendChild(badge); }
    if(event.operation!=="DELETE" && event.row && supportedReplayCollection(event.table)){
      const replay=document.createElement("button"); replay.type="button"; replay.className="secondary"; replay.textContent="Réappliquer cette version";
      replay.addEventListener("click",()=>{ void replaySyncEvent(event); }); actions.appendChild(replay);
    }
    row.append(source,main,actions); fragment.appendChild(row);
  });
  ui.syncHistoryList.appendChild(fragment);
}

function syncTableLabel(table) {
  const labels={activities:"Activité",equipment:"Matériel",personal_landmarks:"Repère",activity_landmarks:"Affectation repère",records:"Record",sport_goals:"Objectif",journal_entries:"Poids"};
  return labels[String(table||"")]||String(table||"Donnée");
}

function formatSyncEventDate(ms) {
  if(!Number.isFinite(Number(ms))||Number(ms)<=0) return "heure inconnue";
  return new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(Number(ms)));
}

function supportedReplayCollection(table) {
  const map={activities:"activities",equipment:"equipment",personal_landmarks:"landmarks",personal_landmark_references:"landmark_references",activity_landmarks:"activity_landmarks",records:"records",sport_goals:"sport_goals",journal_entries:"journal_entries"};
  return map[String(table||"")]||null;
}

async function replaySyncEvent(event) {
  const collectionName=supportedReplayCollection(event.table);
  if(!collectionName || !event.row || event.operation==="DELETE") return;
  const confirmed=window.confirm(`Réappliquer cette version de ${syncTableLabel(event.table)} « ${event.rowKey} » ?\n\nCette action crée une nouvelle modification WEB018, qui devient la version la plus récente et sera envoyée au téléphone et à la tablette.`);
  if(!confirmed) return;
  try {
    await commitWebMutation({ table:String(event.table), rowKey:String(event.rowKey), operation:"UPSERT", row:event.row, materializedCollection:collectionName, materializedData:event.row });
    setMessage("WEB018 · version réappliquée et propagée aux trois plateformes.","success");
  } catch(error){ handleError(error,"Résolution du conflit impossible"); }
}

function stopInteropWatch() {
  if (interopUnsubscribe) {
    try { interopUnsubscribe(); } catch {}
  }
  interopUnsubscribe = null;
}

function startInteropWatch() {
  stopInteropWatch();
  if (!currentUser) return;

  interopWatchStartedAtMs = Date.now() - 4000;
  const watchQuery = query(
    userCollection("changes"),
    where("publishedAt", ">", Timestamp.fromMillis(interopWatchStartedAtMs)),
    orderBy("publishedAt", "asc"),
    limit(100)
  );

  interopUnsubscribe = onSnapshot(
    watchQuery,
    (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type !== "added" && change.type !== "modified") continue;
        const data = change.doc.data();
        applyRealtimeChange(data);
      }
    },
    (error) => {
      console.error(error);
      setInteropStatus("Temps réel interrompu", "error");
      setMessage("WEB018 · écoute temps réel indisponible : " + (error?.message || error), "error");
    }
  );
}

function applyRealtimeChange(event) {
  if (!event || !event.table || !event.rowKey || !event.operation) return;

  const table = String(event.table);
  const operation = String(event.operation);
  const rowKey = String(event.rowKey);
  const row = event.row && typeof event.row === "object" ? event.row : null;
  const fromWeb = String(event.deviceId || "") === webDeviceId;

  if (table === "activities") {
    const activity = activities.find((item) => activityKey(item) === rowKey);

    if (operation === "DELETE") {
      activities = activities.filter((item) => activityKey(item) !== rowKey);
      trashActivities.delete(rowKey);
      rebuildDynamicFilters();
      applyFiltersAndRender();
      renderTrash();
      scheduleDashboardRefresh();

      if (currentDetailId === rowKey) {
        showCatalog(false);
        setMessage("WEB018 · suppression définitive reçue d’un appareil Android.", "info");
      }
      void loadWebDashboard();
      return;
    }

    if (row) {
      let merged;
      if (activity) {
        Object.assign(activity, row);
        merged = activity;
      } else {
        const trashedExisting = trashActivities.get(rowKey);
        merged = { ...(trashedExisting || {}), __docId: rowKey, ...row };
        if (merged.deleted_at_ms == null) activities.push(merged);
      }

      if (merged.deleted_at_ms != null) {
        trashActivities.set(rowKey, { ...merged });
        if (currentDetailId === rowKey) {
          showCatalog(false);
          if (!fromWeb) setMessage("WEB018 · mise à la corbeille reçue d’un appareil Android.", "success");
        }
      } else {
        trashActivities.delete(rowKey);
        if (!activities.some((item) => activityKey(item) === rowKey)) activities.push(merged);
        if (!fromWeb && row.deleted_at_ms === null) {
          setMessage("WEB018 · restauration reçue d’un appareil Android.", "success");
        }
      }

      rebuildDynamicFilters();
      applyFiltersAndRender();
      renderTrash();
      void loadWebDashboard();

      if (currentDetailId === rowKey && merged.deleted_at_ms == null) {
        ui.detailTitle.textContent = merged.custom_title || sportName(merged.sport);
        renderHeroMetrics(merged);
        renderSummary(merged);
        renderPerformance(merged);
        renderPersonal(merged);
        renderRaw(merged);
      }
    }
  } else if (table === "activity_landmarks") {
    const split = rowKey.indexOf(":");
    const activityId = split > 0 ? rowKey.substring(0, split) : String(row?.activity_id ?? "");
    const code = split > 0 ? rowKey.substring(split + 1) : String(row?.landmark_code ?? "");

    if (activityId && code) {
      applyActivityLandmarkLocally(activityId, code, row, operation);
      applyFiltersAndRender();

      const current = currentDetailActivity();
      if (current && activityKey(current) === activityId) renderPersonal(current);
    }
  } else if (table === "personal_landmarks") {
    const code = String(row?.code ?? rowKey);
    if (operation === "DELETE") landmarks.delete(code);
    else if (row) landmarks.set(code, row);
    rebuildLandmarkFilter();
    renderLandmarkManager();
    const current = currentDetailActivity();
    if (current) renderPersonal(current);

    if (landmarkEditorMode === "edit" && landmarkEditorCode === code && !landmarkEditorDirty) {
      const fresh = landmarks.get(code);
      if (fresh) populateLandmarkEditor(code, fresh);
    }
  } else if (table === "personal_landmark_references") {
    const code = String(row?.landmark_code ?? rowKey);
    if (operation === "DELETE") landmarkReferences.delete(code);
    else if (row) landmarkReferences.set(code, row);
    renderLandmarkManager();

    if (landmarkEditorMode === "edit" && landmarkEditorCode === code && !landmarkEditorDirty) {
      const fresh = landmarks.get(code);
      if (fresh) populateLandmarkEditor(code, fresh);
    }
  } else if (table === "equipment") {
    equipmentRows = equipmentRows.filter((item) => String(item.id ?? item.__docId) !== rowKey);
    if (operation !== "DELETE" && row) equipmentRows.push({ __docId: rowKey, ...row });
    renderEquipmentManager();
    renderDashboardEquipment();

    const current = currentDetailActivity();
    if (current) renderPersonal(current);

    if (equipmentEditorMode === "edit" && equipmentEditorRowId === rowKey && !equipmentEditorDirty) {
      const fresh = equipmentRows.find((item) => equipmentKey(item) === rowKey);
      if (fresh) populateEquipmentEditor(fresh);
    }
  } else if (table === "records") {
    records = records.filter((item) => String(item.record_type ?? item.__docId) !== rowKey);
    if (operation !== "DELETE" && row) records.push({ __docId: rowKey, ...row });
    renderRecords();
    setRecordsManagerStatus(fromWeb ? "Records synchronisés" : "Records Android reçus", "ok");
    const current = currentDetailActivity();
    if (current) renderLinkedRecords(current);
  } else if (table === "sport_goals") {
    if (operation === "DELETE") sportGoals.delete(rowKey);
    else if (row) sportGoals.set(rowKey, { __docId: rowKey, ...row });
    if (!goalEditorDirty && String(selectedGoalSport) === rowKey) populateGoalEditor();
    updatePersonalSyncMeta();
    void loadGoalProgress();
  } else if (table === "journal_entries") {
    if (operation === "DELETE") journalEntries.delete(rowKey);
    else if (row) journalEntries.set(rowKey, { __docId: rowKey, ...row });
    const selectedKey = String(dayStartMsFromDateInput(ui.weightDateInput.value));
    if (!weightEditorDirty && selectedKey === rowKey) populateWeightEditorForDate();
    renderWeightHistory();
    updatePersonalSyncMeta();
  }

  if (!fromWeb) {
    setInteropStatus("Modification Android reçue", "ok");
    setMessage("WEB018 · changement reçu automatiquement depuis un appareil Android.", "success");
  }
}

const SEEDED_LANDMARK_CODES = new Set(["B", "Q", "C", "M", "R", "Y", "V", "A", "X", "F"]);

function normalizeLandmarkCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 8);
}

function landmarkUsage(code) {
  let activityLinks = 0;
  let occurrences = 0;

  for (const links of activityLandmarks.values()) {
    for (const link of links) {
      if (String(link.landmark_code ?? "") !== code) continue;
      activityLinks += 1;
      occurrences += Math.max(1, Number(link.occurrences) || 1);
    }
  }

  return {
    activityLinks,
    occurrences,
    hasReference: landmarkReferences.has(code)
  };
}

function renderLandmarkManager() {
  if (!ui.landmarkManagerList) return;

  const needle = String(ui.landmarkManagerSearch?.value ?? "").trim().toLowerCase();

  const rows = [...landmarks.entries()]
    .map(([code, row]) => ({ code, ...row }))
    .filter((row) => {
      if (!needle) return true;
      const haystack = [
        row.code,
        row.name,
        row.landmark_type,
        row.sort_order
      ].map((value) => String(value ?? "").toLowerCase()).join(" ");
      return haystack.includes(needle);
    })
    .sort((a, b) =>
      (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999) ||
      String(a.code).localeCompare(String(b.code), "fr")
    );

  let totalLinks = 0;
  let totalOccurrences = 0;
  for (const code of landmarks.keys()) {
    const usage = landmarkUsage(code);
    totalLinks += usage.activityLinks;
    totalOccurrences += usage.occurrences;
  }

  ui.landmarkManagerMeta.textContent =
    `${landmarks.size} repères · ${totalLinks} activité(s) liées · ${totalOccurrences} occurrence(s)`;

  ui.landmarkManagerList.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucun repère correspondant.";
    ui.landmarkManagerList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const code = String(row.code ?? "");
    const usage = landmarkUsage(code);

    const card = document.createElement("article");
    card.className = "landmark-manager-card";

    const codeNode = document.createElement("div");
    codeNode.className = "landmark-manager-code";
    codeNode.textContent = code;

    const main = document.createElement("div");
    main.className = "landmark-manager-main";

    const title = document.createElement("strong");
    title.textContent = row.name || `Repère ${code}`;

    const meta = document.createElement("span");
    meta.textContent =
      `${row.landmark_type || "—"} · ordre ${Number(row.sort_order) || "—"}` +
      (usage.hasReference ? " · référence GPS" : "");

    main.append(title, meta);

    const stats = document.createElement("div");
    stats.className = "landmark-manager-stats";
    stats.append(
      landmarkStatDatum("Activités", formatNumber(usage.activityLinks)),
      landmarkStatDatum("Occurrences", formatNumber(usage.occurrences))
    );

    const actions = document.createElement("div");
    actions.className = "landmark-manager-card-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary";
    edit.textContent = "Modifier";
    edit.addEventListener("click", () => openLandmarkEditor(code, row));
    actions.appendChild(edit);

    card.append(codeNode, main, stats, actions);
    fragment.appendChild(card);
  }

  ui.landmarkManagerList.appendChild(fragment);
}

function landmarkStatDatum(label, value) {
  const box = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = value;
  const span = document.createElement("span");
  span.textContent = label;
  box.append(strong, span);
  return box;
}

function nextLandmarkSortOrder() {
  let max = 0;
  for (const row of landmarks.values()) {
    max = Math.max(max, Number(row.sort_order) || 0);
  }
  return max + 1;
}

function openNewLandmarkEditor() {
  landmarkEditorMode = "new";
  landmarkEditorCode = null;
  landmarkEditorDirty = false;

  if (landmarkAutosaveTimer) {
    clearTimeout(landmarkAutosaveTimer);
    landmarkAutosaveTimer = null;
  }

  ui.landmarkEditor.classList.remove("hidden");
  ui.landmarkEditorEyebrow.textContent = "NOUVEAU REPÈRE";
  ui.landmarkEditorTitle.textContent = "Créer un repère personnel";
  ui.landmarkEditorHint.textContent =
    "Le code devient la clé métier SPORT. Après création il restera fixe ; le libellé et l’ordre resteront modifiables.";
  ui.landmarkCodeInput.disabled = false;
  ui.landmarkTypeInput.disabled = false;
  ui.createLandmarkButton.classList.remove("hidden");
  ui.deleteLandmarkButton.classList.add("hidden");

  ui.landmarkCodeInput.value = "";
  ui.landmarkNameInput.value = "";
  ui.landmarkTypeInput.value = "Trajet";
  ui.landmarkSortOrderInput.value = String(nextLandmarkSortOrder());
  ui.landmarkEditorInfo.textContent = "";
  setLandmarkEditorStatus("Prêt à créer", "ok");

  ui.landmarkEditor.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function openLandmarkEditor(code, row) {
  const safeCode = normalizeLandmarkCode(code);
  if (!safeCode) return;

  landmarkEditorMode = "edit";
  landmarkEditorCode = safeCode;
  landmarkEditorDirty = false;

  if (landmarkAutosaveTimer) {
    clearTimeout(landmarkAutosaveTimer);
    landmarkAutosaveTimer = null;
  }

  ui.landmarkEditor.classList.remove("hidden");
  ui.landmarkEditorEyebrow.textContent = "WEB018 · MODIFICATION AUTOMATIQUE";
  ui.landmarkEditorTitle.textContent = row.name || `Repère ${safeCode}`;
  ui.landmarkEditorHint.textContent =
    "Aucun bouton Enregistrer. Le code reste fixe ; un changement de type est refusé lorsqu’une référence GPS existe.";
  ui.landmarkCodeInput.disabled = true;
  ui.createLandmarkButton.classList.add("hidden");

  populateLandmarkEditor(safeCode, row);
  ui.landmarkEditor.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function populateLandmarkEditor(code, row) {
  const usage = landmarkUsage(code);

  ui.landmarkCodeInput.value = code;
  ui.landmarkNameInput.value = String(row.name ?? "");
  ui.landmarkTypeInput.value =
    String(row.landmark_type ?? "Trajet").toLowerCase() === "ascension" ? "Ascension" : "Trajet";
  ui.landmarkSortOrderInput.value = String(Math.max(1, Number(row.sort_order) || 1));
  ui.landmarkTypeInput.disabled = usage.hasReference;

  const seeded = SEEDED_LANDMARK_CODES.has(code);
  const deletable = !seeded && usage.activityLinks === 0 && !usage.hasReference;
  ui.deleteLandmarkButton.classList.toggle("hidden", !deletable);

  const parts = [
    `${usage.activityLinks} activité(s)`,
    `${usage.occurrences} occurrence(s)`
  ];
  if (usage.hasReference) parts.push("référence GPS protégée");
  if (seeded) parts.push("repère SPORT d’origine protégé contre la suppression");
  ui.landmarkEditorInfo.textContent = parts.join(" · ");

  setLandmarkEditorStatus("Synchronisation automatique active", "ok");
}

async function closeLandmarkEditor() {
  await flushLandmarkAutosave();
  landmarkEditorMode = "closed";
  landmarkEditorCode = null;
  landmarkEditorDirty = false;
  ui.landmarkEditor.classList.add("hidden");
}

function landmarkRowFromEditor(codeOverride = null) {
  const code = normalizeLandmarkCode(codeOverride ?? ui.landmarkCodeInput.value);
  return {
    code,
    name: String(ui.landmarkNameInput.value ?? "").trim(),
    landmark_type: ui.landmarkTypeInput.value === "Ascension" ? "Ascension" : "Trajet",
    sort_order: Math.max(1, Math.min(9999, Math.round(Number(ui.landmarkSortOrderInput.value) || 1)))
  };
}

function validateLandmarkRow(row, creating = false) {
  if (!row.code) throw new Error("Le code du repère est obligatoire.");
  if (!/^[A-Z0-9_-]{1,8}$/.test(row.code)) {
    throw new Error("Le code doit contenir 1 à 8 caractères : lettres, chiffres, _ ou -.");
  }
  if (!row.name) throw new Error("Le libellé du repère est obligatoire.");

  if (creating && landmarks.has(row.code)) {
    throw new Error(`Le code « ${row.code} » existe déjà.`);
  }

  const duplicateName = [...landmarks.entries()].find(([code, item]) =>
    code !== row.code &&
    String(item.name ?? "").trim().toLowerCase() === row.name.toLowerCase()
  );
  if (duplicateName) {
    throw new Error(`Un autre repère porte déjà le libellé « ${row.name} ».`);
  }
}

function scheduleLandmarkAutosave() {
  if (landmarkEditorMode !== "edit" || !landmarkEditorCode) return;

  landmarkEditorDirty = true;
  landmarkAutosaveGeneration += 1;
  const generation = landmarkAutosaveGeneration;

  if (landmarkAutosaveTimer) clearTimeout(landmarkAutosaveTimer);
  setLandmarkEditorStatus("Modification détectée…", "pending");

  landmarkAutosaveTimer = window.setTimeout(() => {
    landmarkAutosaveTimer = null;
    void queueLandmarkAutosave(generation);
  }, AUTOSAVE_DELAY_MS);
}

function flushLandmarkAutosave() {
  if (landmarkEditorMode !== "edit" || !landmarkEditorDirty) return landmarkAutosaveQueue;

  if (landmarkAutosaveTimer) {
    clearTimeout(landmarkAutosaveTimer);
    landmarkAutosaveTimer = null;
  }

  landmarkAutosaveGeneration += 1;
  return queueLandmarkAutosave(landmarkAutosaveGeneration);
}

function queueLandmarkAutosave(generation) {
  const run = () => persistLandmarkEditor(generation);
  landmarkAutosaveQueue = landmarkAutosaveQueue.then(run, run);
  return landmarkAutosaveQueue;
}

function saveLandmarkEditorImmediate() {
  if (landmarkEditorMode !== "edit") return Promise.resolve();

  landmarkEditorDirty = true;
  if (landmarkAutosaveTimer) {
    clearTimeout(landmarkAutosaveTimer);
    landmarkAutosaveTimer = null;
  }
  landmarkAutosaveGeneration += 1;
  return queueLandmarkAutosave(landmarkAutosaveGeneration);
}

async function persistLandmarkEditor(generation) {
  const code = landmarkEditorCode;
  const previous = landmarks.get(code);
  if (!previous) return;

  const next = landmarkRowFromEditor(code);

  try {
    validateLandmarkRow(next, false);

    if (landmarkReferences.has(code) &&
        String(previous.landmark_type ?? "Trajet") !== next.landmark_type) {
      throw new Error(
        "Ce repère possède une référence GPS. Son type Trajet/Ascension doit rester inchangé tant que cette référence existe."
      );
    }

    const unchanged =
      String(previous.name ?? "") === next.name &&
      String(previous.landmark_type ?? "") === next.landmark_type &&
      Number(previous.sort_order) === Number(next.sort_order);

    if (unchanged) {
      if (generation === landmarkAutosaveGeneration) {
        landmarkEditorDirty = false;
        setLandmarkEditorStatus("Synchronisation automatique active", "ok");
      }
      return;
    }

    setLandmarkEditorStatus("Synchronisation vers les 3 plateformes…", "pending");

    await commitWebMutation({
      table: "personal_landmarks",
      rowKey: code,
      operation: "UPSERT",
      row: next,
      materializedCollection: "landmarks",
      materializedData: next
    });

    landmarks.set(code, next);

    if (generation === landmarkAutosaveGeneration) {
      landmarkEditorDirty = false;
      ui.landmarkEditorTitle.textContent = next.name;
      setLandmarkEditorStatus("Synchronisé automatiquement", "ok");
    }

    rebuildLandmarkFilter();
    renderLandmarkManager();
    const current = currentDetailActivity();
    if (current) renderPersonal(current);

    setMessage("WEB018 · repère synchronisé automatiquement sur les trois plateformes.", "success");
  } catch (error) {
    console.error(error);
    if (generation === landmarkAutosaveGeneration) {
      landmarkEditorDirty = true;
      setLandmarkEditorStatus("Synchronisation impossible", "error");
      const fresh = landmarks.get(code);
      if (fresh && landmarkReferences.has(code)) {
        ui.landmarkTypeInput.value =
          String(fresh.landmark_type ?? "Trajet").toLowerCase() === "ascension" ? "Ascension" : "Trajet";
      }
    }
    handleError(error, "Modification du repère impossible");
  }
}

async function createLandmarkFromWeb() {
  if (landmarkEditorMode !== "new") return;

  const row = landmarkRowFromEditor();

  try {
    validateLandmarkRow(row, true);

    ui.createLandmarkButton.disabled = true;
    setLandmarkEditorStatus("Création et synchronisation…", "pending");

    await commitWebMutation({
      table: "personal_landmarks",
      rowKey: row.code,
      operation: "UPSERT",
      row,
      materializedCollection: "landmarks",
      materializedData: row,
      metaIncrements: {
        landmarkCount: 1,
        expectedDocuments: 1
      }
    });

    landmarks.set(row.code, row);
    adjustMetric(ui.landmarkCount, 1);
    adjustMetric(ui.expectedDocuments, 1);

    landmarkEditorMode = "edit";
    landmarkEditorCode = row.code;
    landmarkEditorDirty = false;
    ui.landmarkCodeInput.disabled = true;
    ui.createLandmarkButton.classList.add("hidden");
    ui.landmarkEditorEyebrow.textContent = "WEB018 · REPÈRE CRÉÉ";
    ui.landmarkEditorTitle.textContent = row.name;
    populateLandmarkEditor(row.code, row);

    rebuildLandmarkFilter();
    renderLandmarkManager();

    setMessage("WEB018 · nouveau repère créé sur Web, téléphone et tablette.", "success");
  } catch (error) {
    console.error(error);
    setLandmarkEditorStatus("Création impossible", "error");
    handleError(error, "Création du repère impossible");
  } finally {
    ui.createLandmarkButton.disabled = false;
  }
}

async function deleteCurrentLandmarkIfUnused() {
  if (landmarkEditorMode !== "edit" || !landmarkEditorCode) return;

  const code = landmarkEditorCode;
  const row = landmarks.get(code);
  if (!row) return;

  const usage = landmarkUsage(code);

  if (SEEDED_LANDMARK_CODES.has(code)) {
    handleError(new Error("Les 10 repères SPORT d’origine ne sont pas supprimables."), "Suppression refusée");
    return;
  }
  if (usage.activityLinks > 0 || usage.hasReference) {
    handleError(
      new Error("Ce repère est encore lié à une activité ou possède une référence GPS."),
      "Suppression refusée"
    );
    return;
  }

  try {
    ui.deleteLandmarkButton.disabled = true;
    if (landmarkAutosaveTimer) {
      clearTimeout(landmarkAutosaveTimer);
      landmarkAutosaveTimer = null;
    }
    // La suppression doit gagner sur un éventuel brouillon non encore envoyé.
    landmarkEditorDirty = false;
    landmarkAutosaveGeneration += 1;
    setLandmarkEditorStatus("Suppression synchronisée…", "pending");

    await commitWebMutation({
      table: "personal_landmarks",
      rowKey: code,
      operation: "DELETE",
      row: null,
      materializedCollection: "landmarks",
      materializedData: null,
      deleteMaterialized: true,
      metaIncrements: {
        landmarkCount: -1,
        expectedDocuments: -1
      }
    });

    landmarks.delete(code);
    adjustMetric(ui.landmarkCount, -1);
    adjustMetric(ui.expectedDocuments, -1);

    await closeLandmarkEditor();
    rebuildLandmarkFilter();
    renderLandmarkManager();

    setMessage("WEB018 · repère inutilisé supprimé sur les trois plateformes.", "success");
  } catch (error) {
    console.error(error);
    setLandmarkEditorStatus("Suppression impossible", "error");
    handleError(error, "Suppression du repère impossible");
  } finally {
    ui.deleteLandmarkButton.disabled = false;
  }
}

function equipmentKey(item) {
  return String(item?.id ?? item?.__docId ?? "").trim();
}

function equipmentCategoryLabel(value) {
  const labels = {
    SHOES: "Chaussures",
    BIKE: "Vélo",
    HOME_TRAINER: "Home trainer",
    HEADLAMP: "Lampe frontale",
    BACKPACK: "Sac à dos",
    POLES: "Bâtons",
    WATCH: "Montre",
    HEART_RATE_SENSOR: "Capteur cardiaque",
    OTHER: "Autre"
  };
  const key = String(value ?? "OTHER").toUpperCase();
  return labels[key] || key;
}

function equipmentStatusLabel(value) {
  const labels = {
    ACTIVE: "Actif",
    STORED: "En réserve",
    RETIRED: "Archivé"
  };
  const key = String(value ?? "ACTIVE").toUpperCase();
  return labels[key] || key;
}

function renderEquipmentManager() {
  if (!ui.equipmentManagerList) return;

  const needle = String(ui.equipmentManagerSearch?.value ?? "").trim().toLowerCase();
  const status = String(ui.equipmentManagerStatusFilter?.value ?? "").trim().toUpperCase();

  const rows = equipmentRows
    .slice()
    .filter((item) => {
      const itemStatus = String(item.status ?? "ACTIVE").toUpperCase();
      if (status === "USED" && numberOrZero(item.activity_count) <= 0) return false;
      if (status && status !== "USED" && itemStatus !== status) return false;

      if (!needle) return true;
      const haystack = [
        equipmentDisplayName(item),
        item.brand,
        item.model,
        item.custom_name,
        item.category,
        item.status,
        item.notes
      ].map((value) => String(value ?? "").toLowerCase()).join(" ");
      return haystack.includes(needle);
    })
    .sort((a, b) => {
      const rank = (value) => {
        const statusValue = String(value.status ?? "ACTIVE").toUpperCase();
        if (statusValue === "ACTIVE") return 0;
        if (statusValue === "STORED") return 1;
        return 2;
      };
      const delta = rank(a) - rank(b);
      if (delta !== 0) return delta;
      return equipmentDisplayName(a).localeCompare(equipmentDisplayName(b), "fr", { sensitivity: "base" });
    });

  const activeCount = equipmentRows.filter((item) => String(item.status ?? "ACTIVE").toUpperCase() === "ACTIVE").length;
  const storedCount = equipmentRows.filter((item) => String(item.status ?? "").toUpperCase() === "STORED").length;
  const retiredCount = equipmentRows.filter((item) => String(item.status ?? "").toUpperCase() === "RETIRED").length;

  const usedCount = equipmentRows.filter((item) => numberOrZero(item.activity_count) > 0).length;
  ui.equipmentManagerMeta.textContent = status === "USED"
    ? `${usedCount} matériel(s) utilisé(s) · vue par défaut`
    : `${formatNumber(equipmentRows.length)} matériels · ${activeCount} actifs · ${storedCount} en réserve · ${retiredCount} archivés`;

  ui.equipmentManagerList.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucun matériel correspondant.";
    ui.equipmentManagerList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const item of rows) {
    const card = document.createElement("article");
    card.className = "equipment-manager-card";

    const main = document.createElement("div");
    main.className = "equipment-manager-main";

    const title = document.createElement("strong");
    title.textContent = equipmentDisplayName(item);

    const meta = document.createElement("span");
    meta.textContent =
      `${equipmentCategoryLabel(item.category)} · ${equipmentStatusLabel(item.status)} · ` +
      `${formatNumber(item.activity_count ?? 0)} activité(s)`;

    main.append(title, meta);

    const usage = document.createElement("div");
    usage.className = "equipment-manager-usage";
    usage.append(
      equipmentUsageDatum("Distance", formatDistance(item.total_distance_m)),
      equipmentUsageDatum("Temps", formatDuration(item.total_duration_ms)),
      equipmentUsageDatum("D+", formatMeters(item.total_ascent_m))
    );

    const actions = document.createElement("div");
    actions.className = "equipment-manager-card-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary";
    edit.textContent = "Modifier";
    edit.addEventListener("click", () => openEquipmentEditor(item));
    actions.appendChild(edit);

    const itemStatus = String(item.status ?? "ACTIVE").toUpperCase();

    if (itemStatus !== "STORED") {
      const store = document.createElement("button");
      store.type = "button";
      store.className = "secondary";
      store.textContent = "Réserve";
      store.addEventListener("click", () => { void updateEquipmentStatus(item, "STORED"); });
      actions.appendChild(store);
    }

    if (itemStatus !== "ACTIVE") {
      const activate = document.createElement("button");
      activate.type = "button";
      activate.className = "secondary";
      activate.textContent = "Réactiver";
      activate.addEventListener("click", () => { void updateEquipmentStatus(item, "ACTIVE"); });
      actions.appendChild(activate);
    }

    if (itemStatus !== "RETIRED") {
      const retire = document.createElement("button");
      retire.type = "button";
      retire.className = "secondary equipment-retire-button";
      retire.textContent = "Archiver";
      retire.addEventListener("click", () => { void updateEquipmentStatus(item, "RETIRED"); });
      actions.appendChild(retire);
    }

    card.append(main, usage, actions);
    fragment.appendChild(card);
  }

  ui.equipmentManagerList.appendChild(fragment);
}

function equipmentUsageDatum(label, value) {
  const box = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = value;
  const span = document.createElement("span");
  span.textContent = label;
  box.append(strong, span);
  return box;
}

function openNewEquipmentEditor() {
  equipmentEditorMode = "new";
  equipmentEditorRowId = null;
  equipmentEditorDirty = false;
  if (equipmentAutosaveTimer) {
    clearTimeout(equipmentAutosaveTimer);
    equipmentAutosaveTimer = null;
  }

  ui.equipmentEditor.classList.remove("hidden");
  ui.equipmentEditorEyebrow.textContent = "NOUVEAU MATÉRIEL";
  ui.equipmentEditorTitle.textContent = "Créer un matériel";
  ui.equipmentEditorHint.textContent =
    "Renseigne la fiche puis crée-la. Elle apparaîtra ensuite sur téléphone et tablette.";
  ui.createEquipmentButton.classList.remove("hidden");
  ui.equipmentEditorId.textContent = "";

  ui.equipmentCategoryInput.value = "SHOES";
  ui.equipmentCustomNameInput.value = "";
  ui.equipmentBrandInput.value = "";
  ui.equipmentModelInput.value = "";
  ui.equipmentSpecimenInput.value = "1";
  ui.equipmentStatusInput.value = "ACTIVE";
  ui.equipmentPurchaseDateInput.value = "";
  ui.equipmentPriceInput.value = "";
  ui.equipmentWarningDistanceInput.value = "";
  ui.equipmentCriticalDistanceInput.value = "";
  ui.equipmentWarningDurationInput.value = "";
  ui.equipmentCriticalDurationInput.value = "";
  ui.equipmentNotesInput.value = "";
  setEquipmentEditorStatus("Prêt à créer", "ok");

  ui.equipmentEditor.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function openEquipmentEditor(item) {
  const key = equipmentKey(item);
  if (!key) return;

  equipmentEditorMode = "edit";
  equipmentEditorRowId = key;
  equipmentEditorDirty = false;
  if (equipmentAutosaveTimer) {
    clearTimeout(equipmentAutosaveTimer);
    equipmentAutosaveTimer = null;
  }

  ui.equipmentEditor.classList.remove("hidden");
  ui.equipmentEditorEyebrow.textContent = "WEB018 · MODIFICATION AUTOMATIQUE";
  ui.equipmentEditorTitle.textContent = equipmentDisplayName(item);
  ui.equipmentEditorHint.textContent =
    "Aucun bouton Enregistrer : les changements sont envoyés automatiquement vers téléphone et tablette.";
  ui.createEquipmentButton.classList.add("hidden");

  populateEquipmentEditor(item);
  ui.equipmentEditor.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeEquipmentEditor() {
  void flushEquipmentAutosave();
  equipmentEditorMode = "closed";
  equipmentEditorRowId = null;
  equipmentEditorDirty = false;
  ui.equipmentEditor.classList.add("hidden");
}

function populateEquipmentEditor(item) {
  ui.equipmentCategoryInput.value = String(item.category ?? "OTHER");
  ui.equipmentCustomNameInput.value = String(item.custom_name ?? "");
  ui.equipmentBrandInput.value = String(item.brand ?? "");
  ui.equipmentModelInput.value = String(item.model ?? "");
  ui.equipmentSpecimenInput.value = String(Math.max(1, Number(item.specimen_number) || 1));
  ui.equipmentStatusInput.value = String(item.status ?? "ACTIVE");
  ui.equipmentPurchaseDateInput.value = dateInputValue(item.purchase_date_ms);
  ui.equipmentPriceInput.value =
    item.purchase_price == null ? "" : String(Number(item.purchase_price));
  ui.equipmentWarningDistanceInput.value = metersToKmInput(item.warning_distance_m);
  ui.equipmentCriticalDistanceInput.value = metersToKmInput(item.critical_distance_m);
  ui.equipmentWarningDurationInput.value = msToHoursInput(item.warning_duration_ms);
  ui.equipmentCriticalDurationInput.value = msToHoursInput(item.critical_duration_ms);
  ui.equipmentNotesInput.value = String(item.notes ?? "");
  ui.equipmentEditorId.textContent = `ID : ${equipmentKey(item)}`;
  setEquipmentEditorStatus("Synchronisation automatique active", "ok");
}

function setEquipmentEditorStatus(text, type = "ok") {
  ui.equipmentEditorStatus.textContent = text;
  ui.equipmentEditorStatus.className = `pill ${type}`;
}

function equipmentEditorBaseRow() {
  if (equipmentEditorMode !== "edit" || !equipmentEditorRowId) return null;
  return equipmentRows.find((item) => equipmentKey(item) === equipmentEditorRowId) || null;
}

function equipmentRowFromEditor(base, idOverride = null) {
  const now = Date.now();
  const id = String(idOverride ?? base?.id ?? base?.__docId ?? "").trim();

  return {
    id,
    category: String(ui.equipmentCategoryInput.value || "OTHER"),
    brand: nullableText(ui.equipmentBrandInput.value),
    model: nullableText(ui.equipmentModelInput.value),
    custom_name: nullableText(ui.equipmentCustomNameInput.value),
    specimen_number: clampInteger(ui.equipmentSpecimenInput.value, 1, 99, 1),
    status: normalizeEquipmentStatus(ui.equipmentStatusInput.value),
    purchase_date_ms: dateInputMs(ui.equipmentPurchaseDateInput.value),
    first_use_date_ms: nullableFiniteNumber(base?.first_use_date_ms),
    last_use_date_ms: nullableFiniteNumber(base?.last_use_date_ms),
    purchase_price: nullableNonNegativeNumber(ui.equipmentPriceInput.value),
    notes: String(ui.equipmentNotesInput.value ?? "").trim(),
    warning_distance_m: kmInputToMeters(ui.equipmentWarningDistanceInput.value),
    critical_distance_m: kmInputToMeters(ui.equipmentCriticalDistanceInput.value),
    warning_duration_ms: hoursInputToMs(ui.equipmentWarningDurationInput.value),
    critical_duration_ms: hoursInputToMs(ui.equipmentCriticalDurationInput.value),
    total_distance_m: Math.max(0, Number(base?.total_distance_m) || 0),
    total_duration_ms: Math.max(0, Number(base?.total_duration_ms) || 0),
    total_ascent_m: Math.max(0, Number(base?.total_ascent_m) || 0),
    activity_count: Math.max(0, Math.round(Number(base?.activity_count) || 0)),
    created_at_ms: Math.max(1, Number(base?.created_at_ms) || now),
    updated_at_ms: now
  };
}

function validateEquipmentRow(row, ignoreId = null) {
  if (!row.id) throw new Error("Identifiant matériel absent.");
  if (!row.category) throw new Error("Catégorie absente.");

  const display = equipmentDisplayName(row).trim();
  if (!display || display === row.category) {
    throw new Error("Ajoute un nom personnalisé ou une marque / un modèle pour identifier clairement ce matériel.");
  }

  const duplicate = equipmentRows.find((item) => {
    if (ignoreId && equipmentKey(item) === ignoreId) return false;
    return equipmentDisplayName(item).trim().toLowerCase() === display.toLowerCase();
  });
  if (duplicate) {
    throw new Error(`Un autre matériel porte déjà le nom « ${display} ».`);
  }

  if (row.critical_distance_m > 0 && row.warning_distance_m > row.critical_distance_m) {
    throw new Error("La distance d’alerte ne peut pas dépasser la distance critique.");
  }
  if (row.critical_duration_ms > 0 && row.warning_duration_ms > row.critical_duration_ms) {
    throw new Error("La durée d’alerte ne peut pas dépasser la durée critique.");
  }
}

function scheduleEquipmentAutosave() {
  if (equipmentEditorMode !== "edit") return;

  equipmentEditorDirty = true;
  equipmentAutosaveGeneration += 1;
  const generation = equipmentAutosaveGeneration;

  if (equipmentAutosaveTimer) clearTimeout(equipmentAutosaveTimer);
  setEquipmentEditorStatus("Modification détectée…", "pending");

  equipmentAutosaveTimer = window.setTimeout(() => {
    equipmentAutosaveTimer = null;
    void queueEquipmentAutosave(generation);
  }, AUTOSAVE_DELAY_MS);
}

function flushEquipmentAutosave() {
  if (equipmentEditorMode !== "edit" || !equipmentEditorDirty) return equipmentAutosaveQueue;

  if (equipmentAutosaveTimer) {
    clearTimeout(equipmentAutosaveTimer);
    equipmentAutosaveTimer = null;
  }

  equipmentAutosaveGeneration += 1;
  return queueEquipmentAutosave(equipmentAutosaveGeneration);
}

function queueEquipmentAutosave(generation) {
  const run = () => persistEquipmentEditor(generation);
  equipmentAutosaveQueue = equipmentAutosaveQueue.then(run, run);
  return equipmentAutosaveQueue;
}

function saveEquipmentEditorImmediate() {
  if (equipmentEditorMode !== "edit") return Promise.resolve();

  equipmentEditorDirty = true;
  if (equipmentAutosaveTimer) {
    clearTimeout(equipmentAutosaveTimer);
    equipmentAutosaveTimer = null;
  }
  equipmentAutosaveGeneration += 1;
  return queueEquipmentAutosave(equipmentAutosaveGeneration);
}

async function persistEquipmentEditor(generation) {
  const base = equipmentEditorBaseRow();
  if (!base) return;

  const id = equipmentKey(base);
  const next = equipmentRowFromEditor(base, id);

  try {
    validateEquipmentRow(next, id);

    const oldDisplay = equipmentDisplayName(base);
    const newDisplay = equipmentDisplayName(next);

    if (equipmentRowsEqualForEditor(base, next)) {
      if (generation === equipmentAutosaveGeneration) {
        equipmentEditorDirty = false;
        setEquipmentEditorStatus("Synchronisation automatique active", "ok");
      }
      return;
    }

    setEquipmentEditorStatus("Synchronisation vers les 3 plateformes…", "pending");

    if (oldDisplay !== newDisplay) {
      await commitEquipmentRenameAtomic(base, next, oldDisplay, newDisplay);
    } else {
      await commitWebMutation({
        table: "equipment",
        rowKey: id,
        operation: "UPSERT",
        row: next,
        materializedCollection: "equipment",
        materializedData: next
      });
    }

    equipmentRows = equipmentRows.filter((item) => equipmentKey(item) !== id);
    equipmentRows.push({ __docId: id, ...next });

    if (generation === equipmentAutosaveGeneration) {
      equipmentEditorDirty = false;
      ui.equipmentEditorTitle.textContent = equipmentDisplayName(next);
      setEquipmentEditorStatus("Synchronisé automatiquement", "ok");
    }

    renderEquipmentManager();
    const current = currentDetailActivity();
    if (current) renderPersonal(current);
    setMessage("WEB018 · matériel synchronisé automatiquement sur les trois plateformes.", "success");
  } catch (error) {
    console.error(error);
    if (generation === equipmentAutosaveGeneration) {
      equipmentEditorDirty = true;
      setEquipmentEditorStatus("Synchronisation impossible", "error");
    }
    handleError(error, "Modification du matériel impossible");
  }
}

async function createEquipmentFromWeb() {
  if (equipmentEditorMode !== "new") return;

  const id = makeWebEquipmentId();
  const row = equipmentRowFromEditor(null, id);

  try {
    validateEquipmentRow(row, null);

    ui.createEquipmentButton.disabled = true;
    setEquipmentEditorStatus("Création et synchronisation…", "pending");

    await commitWebMutation({
      table: "equipment",
      rowKey: id,
      operation: "UPSERT",
      row,
      materializedCollection: "equipment",
      materializedData: row,
      metaIncrements: {
        equipmentCount: 1,
        expectedDocuments: 1
      }
    });

    equipmentRows.push({ __docId: id, ...row });
    adjustMetric(ui.equipmentCount, 1);
    adjustMetric(ui.expectedDocuments, 1);

    renderEquipmentManager();
    equipmentEditorMode = "edit";
    equipmentEditorRowId = id;
    equipmentEditorDirty = false;
    ui.createEquipmentButton.classList.add("hidden");
    ui.equipmentEditorEyebrow.textContent = "WEB018 · MATÉRIEL CRÉÉ";
    ui.equipmentEditorTitle.textContent = equipmentDisplayName(row);
    ui.equipmentEditorHint.textContent =
      "Le matériel est créé. Toute modification ultérieure est maintenant automatique.";
    ui.equipmentEditorId.textContent = `ID : ${id}`;
    setEquipmentEditorStatus("Créé sur les trois plateformes", "ok");

    const current = currentDetailActivity();
    if (current) renderPersonal(current);

    setMessage("WEB018 · nouveau matériel créé sur Web, téléphone et tablette.", "success");
  } catch (error) {
    console.error(error);
    setEquipmentEditorStatus("Création impossible", "error");
    handleError(error, "Création du matériel impossible");
  } finally {
    ui.createEquipmentButton.disabled = false;
  }
}

async function updateEquipmentStatus(item, status) {
  const id = equipmentKey(item);
  if (!id) return;

  const normalized = normalizeEquipmentStatus(status);
  if (String(item.status ?? "ACTIVE").toUpperCase() === normalized) return;

  const next = {
    ...equipmentBusinessRow(item),
    status: normalized,
    updated_at_ms: Date.now()
  };

  try {
    await commitWebMutation({
      table: "equipment",
      rowKey: id,
      operation: "UPSERT",
      row: next,
      materializedCollection: "equipment",
      materializedData: next
    });

    equipmentRows = equipmentRows.filter((row) => equipmentKey(row) !== id);
    equipmentRows.push({ __docId: id, ...next });
    renderEquipmentManager();

    if (equipmentEditorMode === "edit" && equipmentEditorRowId === id && !equipmentEditorDirty) {
      populateEquipmentEditor(next);
    }

    const current = currentDetailActivity();
    if (current) renderPersonal(current);

    setMessage(`WEB018 · ${equipmentStatusLabel(normalized).toLowerCase()} sur les trois plateformes.`, "success");
  } catch (error) {
    handleError(error, "Changement de statut du matériel impossible");
  }
}

async function commitEquipmentRenameAtomic(previous, next, oldDisplay, newDisplay) {
  const id = equipmentKey(next);
  const activityQuery = query(userCollection("activities"), where("equipment_name", "==", oldDisplay));
  const snapshot = await getDocs(activityQuery);

  if (snapshot.size > MAX_EQUIPMENT_RENAME_CASCADE) {
    throw new Error(
      `Ce matériel est associé à ${snapshot.size} activités. ` +
      `Par sécurité, WEB018 bloque un renommage Web au-delà de ${MAX_EQUIPMENT_RENAME_CASCADE} activités.`
    );
  }

  const now = Date.now();
  const batch = writeBatch(db);
  const rootBase = [ROOT, currentUser.uid];

  // 1) Fiche matériel complète.
  const equipmentSeq = nextWebFirebaseSeq();
  const equipmentEventId = makeWebEventId(equipmentSeq);
  batch.set(
    doc(db, ...rootBase, "equipment", id),
    { ...next, __sportKey: id, __updatedAtMs: now },
    { merge: true }
  );
  batch.set(
    doc(db, ...rootBase, "changes", equipmentEventId),
    {
      eventId: equipmentEventId,
      deviceId: webDeviceId,
      firebaseSeq: equipmentSeq,
      sourceChangeSeq: 0,
      table: "equipment",
      rowKey: id,
      operation: "UPSERT",
      changedAtMs: now,
      publishedAt: serverTimestamp(),
      androidVersion: 0,
      webVersion: "WEB041",
      row: next
    }
  );

  // 2) Associations par nom : Android stocke equipment_name dans activities.
  const changedLoadedIds = new Set();

  for (const activityDoc of snapshot.docs) {
    const data = activityDoc.data();
    const activityId = Number(data.id ?? activityDoc.id);
    if (!Number.isFinite(activityId) || activityId <= 0) continue;

    const rowKey = String(activityId);
    const patch = { id: activityId, equipment_name: newDisplay };
    const seq = nextWebFirebaseSeq();
    const eventId = makeWebEventId(seq);

    batch.set(
      doc(db, ...rootBase, "activities", rowKey),
      { ...patch, __sportKey: rowKey, __updatedAtMs: now },
      { merge: true }
    );
    batch.set(
      doc(db, ...rootBase, "changes", eventId),
      {
        eventId,
        deviceId: webDeviceId,
        firebaseSeq: seq,
        sourceChangeSeq: 0,
        table: "activities",
        rowKey,
        operation: "UPSERT",
        changedAtMs: now,
        publishedAt: serverTimestamp(),
        androidVersion: 0,
        webVersion: "WEB041",
        row: patch
      }
    );
    changedLoadedIds.add(rowKey);
  }

  batch.set(
    doc(db, ...rootBase, "meta", "state"),
    {
      updatedAtMs: now,
      sourceDeviceId: webDeviceId,
      webVersion: "WEB041"
    },
    { merge: true }
  );

  await batch.commit();

  for (const activity of activities) {
    if (changedLoadedIds.has(activityKey(activity))) activity.equipment_name = newDisplay;
  }
  rebuildDynamicFilters();
  applyFiltersAndRender();

  setMessage(
    snapshot.size > 0
      ? `WEB018 · matériel renommé et ${snapshot.size} activité(s) associée(s) mises à jour sur les trois plateformes.`
      : "WEB018 · matériel renommé sur les trois plateformes.",
    "success"
  );
}

function equipmentBusinessRow(item) {
  const id = equipmentKey(item);
  return {
    id,
    category: String(item.category ?? "OTHER"),
    brand: nullableText(item.brand),
    model: nullableText(item.model),
    custom_name: nullableText(item.custom_name),
    specimen_number: clampInteger(item.specimen_number, 1, 99, 1),
    status: normalizeEquipmentStatus(item.status),
    purchase_date_ms: nullableFiniteNumber(item.purchase_date_ms),
    first_use_date_ms: nullableFiniteNumber(item.first_use_date_ms),
    last_use_date_ms: nullableFiniteNumber(item.last_use_date_ms),
    purchase_price: nullableFiniteNumber(item.purchase_price),
    notes: String(item.notes ?? ""),
    warning_distance_m: Math.max(0, Number(item.warning_distance_m) || 0),
    critical_distance_m: Math.max(0, Number(item.critical_distance_m) || 0),
    warning_duration_ms: Math.max(0, Number(item.warning_duration_ms) || 0),
    critical_duration_ms: Math.max(0, Number(item.critical_duration_ms) || 0),
    total_distance_m: Math.max(0, Number(item.total_distance_m) || 0),
    total_duration_ms: Math.max(0, Number(item.total_duration_ms) || 0),
    total_ascent_m: Math.max(0, Number(item.total_ascent_m) || 0),
    activity_count: Math.max(0, Math.round(Number(item.activity_count) || 0)),
    created_at_ms: Math.max(1, Number(item.created_at_ms) || Date.now()),
    updated_at_ms: Math.max(1, Number(item.updated_at_ms) || Date.now())
  };
}

function equipmentRowsEqualForEditor(a, b) {
  const left = equipmentBusinessRow(a);
  const right = equipmentBusinessRow(b);
  // updated_at_ms est volontairement ignoré.
  delete left.updated_at_ms;
  delete right.updated_at_ms;
  return JSON.stringify(left) === JSON.stringify(right);
}

function makeWebEquipmentId() {
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `WEBEQ-${Date.now().toString(36).toUpperCase()}-${random}`;
}

function normalizeEquipmentStatus(value) {
  const normalized = String(value ?? "ACTIVE").trim().toUpperCase();
  if (normalized === "STORED" || normalized === "RETIRED") return normalized;
  return "ACTIVE";
}

function nullableText(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function nullableFiniteNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableNonNegativeNumber(value) {
  const number = nullableFiniteNumber(value);
  return number == null ? null : Math.max(0, number);
}

function clampInteger(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function dateInputValue(ms) {
  const number = Number(ms);
  if (!Number.isFinite(number) || number <= 0) return "";
  const date = new Date(number);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateInputMs(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(`${text}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function metersToKmInput(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return String(Math.round((number / 1000) * 100) / 100);
}

function kmInputToMeters(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 1000) : 0;
}

function msToHoursInput(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return String(Math.round((number / 3600000) * 100) / 100);
}

function hoursInputToMs(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 3600000) : 0;
}

function adjustMetric(node, delta) {
  if (!node) return;
  const current = Number(String(node.textContent ?? "").replace(/\s/g, "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(current)) return;
  node.textContent = formatNumber(Math.max(0, current + delta));
}

function handleError(error, prefix) {
  console.error(error);

  const code = error?.code || "";
  let detail = error?.message || String(error);

  if (code === "auth/unauthorized-domain") {
    detail =
      "Le domaine GitHub Pages n'est pas autorisé dans Firebase Authentication.";
  } else if (code === "permission-denied") {
    detail =
      "Firestore a refusé l’opération. Vérifie le compte Google et les règles Firestore.";
  }

  setMessage(`${prefix} : ${detail}`, "error");
}

function setMessage(text, type) {
  const interopBadge = document.getElementById("interopCompactStatus");
  const message = String(text || "");
  const isInteropMessage = /WEB018.*(?:Interop|interopérabilité)/i.test(message);
  const isInteropSuccess = type === "success" && /interopérabilité.*active/i.test(message);

  if (isInteropSuccess) {
    if (interopBadge) {
      interopBadge.textContent = "Intéropérabilité OK";
      interopBadge.className = "pill ok";
    }
    ui.messageBox.textContent = "";
    ui.messageBox.className = "message success hidden";
    return;
  }

  if (isInteropMessage && type !== "error") {
    if (interopBadge && !currentUser) interopBadge.classList.add("hidden");
    ui.messageBox.textContent = "";
    ui.messageBox.className = `message ${type} hidden`;
    return;
  }

  ui.messageBox.textContent = text;
  ui.messageBox.className = `message ${type}`;
}

function setMetric(node, value) {
  node.textContent = value == null ? "—" : formatNumber(value);
}

function positiveNumber(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("fr-FR").format(number)
    : String(value ?? "—");
}

function formatInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? formatNumber(Math.round(number)) : "—";
}

function dateFromMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;

  const date = new Date(number);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = dateFromMs(value);
  return date
    ? new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }).format(date)
    : "Date inconnue";
}

function formatDateLong(value) {
  const date = dateFromMs(value);
  return date
    ? new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date)
    : "—";
}

function formatDistance(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? `${(number / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km`
    : "—";
}

function formatMeters(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? `${Math.round(number).toLocaleString("fr-FR")} m`
    : "—";
}

function formatDuration(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "—";

  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  }

  return `${minutes} min ${String(seconds).padStart(2, "0")} s`;
}

function formatHeartRate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${Math.round(number)} bpm` : "—";
}

function formatCadence(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${Math.round(number)} /min` : "—";
}

function averageSpeedKmh(activity) {
  const distance = Number(activity.distance_m);
  const duration = Number(activity.timer_time_ms || activity.elapsed_time_ms);
  if (!Number.isFinite(distance) || !Number.isFinite(duration) || distance <= 0 || duration <= 0) {
    return null;
  }
  return (distance / 1000) / (duration / 3600000);
}

function formatAverageSpeed(activity) {
  const speed = averageSpeedKmh(activity);
  return speed == null
    ? "—"
    : `${speed.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} km/h`;
}

function formatPace(activity) {
  const speed = averageSpeedKmh(activity);
  if (speed == null || speed <= 0) return "—";

  const secondsPerKm = Math.round(3600 / speed);
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = secondsPerKm % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}

function primarySpeedMetric(activity) {
  return Number(activity.sport) === 1 ? formatPace(activity) : formatAverageSpeed(activity);
}

function formatBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return "—";
  if (number < 1024) return `${Math.round(number)} o`;
  if (number < 1024 * 1024) return `${(number / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Ko`;
  return `${(number / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Mo`;
}

function scoreText(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "—";
  return `${Math.round(number)} / 10`;
}

function segmentText(activity) {
  const index = Number(activity.segment_index);
  const count = Number(activity.segment_count);

  if (!Number.isFinite(index) && !Number.isFinite(count)) return "—";
  if (Number.isFinite(count) && count > 1) {
    return `${Number.isFinite(index) ? index + 1 : "?"} / ${count}`;
  }
  return "Activité unique";
}

function protocolText(activity) {
  const major = Number(activity.protocol_major);
  const minor = Number(activity.protocol_minor);
  if (!Number.isFinite(major) && !Number.isFinite(minor)) return "—";
  return `${Number.isFinite(major) ? major : 0}.${Number.isFinite(minor) ? minor : 0}`;
}

function valueOrDash(value) {
  return value == null || value === "" ? "—" : String(value);
}

function rawValue(value) {
  if (value == null) return "null";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function sportName(value) {
  const code = Number(value);
  const names = new Map([
    [0, "Générique"],
    [1, "Course à pied"],
    [2, "Vélo"],
    [3, "Transition"],
    [4, "Fitness"],
    [5, "Natation"],
    [6, "Basket"],
    [7, "Football"],
    [8, "Tennis"],
    [9, "Sports américains"],
    [10, "Entraînement"],
    [11, "Marche"],
    [13, "Alpinisme"],
    [15, "Aviron"],
    [17, "Randonnée"],
    [18, "Multisport"],
    [19, "Pagaie"]
  ]);
  return names.get(code) || (Number.isFinite(code) ? `Sport ${code}` : "Sport");
}

function subSportName(value) {
  const code = Number(value);
  if (!Number.isFinite(code)) return "—";
  if (code === 0) return "Générique";
  if (code === 21) return "Tapis";
  return `Sous-sport ${code}`;
}

function recordLabel(type) {
  const value = String(type ?? "Record");
  const normalized = value.toLowerCase();
  const labels = {
    distance: "Plus longue distance",
    ascent: "Plus grand D+",
    duration: "Plus longue durée",
    LONGEST_DISTANCE: "Plus longue distance",
    MAX_ASCENT: "Plus grand D+",
    LONGEST_DURATION: "Plus longue durée"
  };
  return labels[value] || labels[normalized] || value.replaceAll("_", " ");
}

function formatRecordValue(record) {
  const value = Number(record.record_value ?? record.value);
  if (!Number.isFinite(value)) return "présent";

  const type = String(record.record_type ?? "").toUpperCase();
  if (type.includes("DISTANCE")) return formatDistance(value);
  if (type.includes("ASCENT") || type.includes("ELEVATION")) return formatMeters(value);
  if (type.includes("DURATION") || type.includes("TIME")) return formatDuration(value);

  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function localeSort(a, b) {
  return String(a).localeCompare(String(b), "fr", { sensitivity: "base" });
}
