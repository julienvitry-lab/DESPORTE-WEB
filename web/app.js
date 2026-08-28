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

// WEB008 · EDITION002 : parité d’édition activité Web / téléphone / tablette.
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const ui = Object.fromEntries(
  [
    "authState", "loginButton", "logoutButton", "messageBox", "dashboard",
    "catalogView", "identityLine", "activityCount", "equipmentCount",
    "landmarkCount", "activityLandmarkCount", "recordCount", "expectedDocuments",
    "loadedLabel", "loadMoreButton", "loadAllButton", "refreshButton",
    "searchInput", "sportFilter", "yearFilter", "equipmentFilter",
    "landmarkFilter", "sourceFilter", "distanceFilter", "ascentFilter", "sortFilter",
    "activityList", "recordsList",
    "detailView", "backToCatalogButton", "backToCatalogBottomButton",
    "previousActivityButton", "nextActivityButton",
    "previousActivityBottomButton", "nextActivityBottomButton", "detailPosition",
    "detailSportLine", "detailTitle", "detailDateLine", "detailHeroMetrics",
    "detailSummaryGrid", "detailPerformanceGrid", "detailPersonalGrid",
    "interopStatus", "interopEditor", "editTitleInput", "editDescriptionInput", "editNoteInput",
    "editEquipmentSelect", "editFeelingSelect", "editDifficultySelect", "editPrivacySelect",
    "addLandmarkSelect",
    "detailMapSection", "mapStatus", "mapStage", "activityMap", "mapLayerSelect", "mapFullscreenButton",
    "routeStats", "elevationProfile", "profileMeta", "profileLive",
    "detailLandmarks", "detailRecordsSection", "detailRecordsList",
    "detailImportGrid", "detailRawGrid"
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

let equipmentRows = [];
let landmarks = new Map();
let activityLandmarks = new Map();
let records = [];

let interopUnsubscribe = null;
let interopWatchStartedAtMs = 0;
const webDeviceId = loadWebDeviceId();

const AUTOSAVE_DELAY_MS = 800;
let activityAutosaveTimer = null;
let activityAutosaveGeneration = 0;
let activityAutosaveQueue = Promise.resolve();
let activityEditDirty = false;
let editorActivityKey = null;

let activityMapInstance = null;
let activityRouteLayer = null;
let activityHoverMarker = null;
let cartographyRequestToken = 0;
let activityBaseLayers = {};
let activityBaseLayer = null;
let activeRoute = null;
let profileHoverUpdater = null;
let profileHoverClearer = null;

wireEvents();

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
  ui.refreshButton.addEventListener("click", () => reloadAll());
  ui.loadMoreButton.addEventListener("click", () => loadNextPage());
  ui.loadAllButton.addEventListener("click", () => loadAllActivities());

  [
    ui.searchInput, ui.sportFilter, ui.yearFilter, ui.equipmentFilter,
    ui.landmarkFilter, ui.sourceFilter, ui.distanceFilter,
    ui.ascentFilter, ui.sortFilter
  ].forEach((element) => {
    element.addEventListener(element.tagName === "INPUT" ? "input" : "change", applyFiltersAndRender);
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

  ui.mapLayerSelect.addEventListener("change", () => switchBaseLayer(ui.mapLayerSelect.value));
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
    ui.authState.textContent = "Non connecté";
    ui.authState.className = "pill neutral auth-pill";
    ui.loginButton.classList.remove("hidden");
    ui.logoutButton.classList.add("hidden");
    ui.dashboard.classList.add("hidden");
    setMessage(
      "WEB008 · Interop : connecte-toi avec le même compte Google que SPORT Android.",
      "info"
    );
    return;
  }

  ui.authState.textContent = "Firebase connecté";
  ui.authState.className = "pill ok auth-pill";
  ui.loginButton.classList.add("hidden");
  ui.logoutButton.classList.remove("hidden");
  ui.dashboard.classList.remove("hidden");
  ui.identityLine.textContent = `${user.email || "Compte Google"} · projet sport-505813`;
  await reloadAll();
  startInteropWatch();
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
  landmarks = new Map();
  activityLandmarks = new Map();
  records = [];
  currentDetailId = null;

  ui.activityList.innerHTML = "";
  ui.recordsList.innerHTML = "";
  resetFilterOptions();
  showCatalog(false);
  setMessage("Lecture Firestore en cours…", "info");

  try {
    await Promise.all([loadMeta(), loadReferenceCollections()]);
    await loadNextPage();
    setMessage("WEB008 connecté · interopérabilité Web ↔ téléphone ↔ tablette active.", "success");
  } catch (error) {
    handleError(error, "Lecture Firestore impossible");
  }
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
  const [equipmentSnap, landmarkSnap, activityLandmarkSnap, recordSnap] = await Promise.all([
    getDocs(userCollection("equipment")),
    getDocs(userCollection("landmarks")),
    getDocs(userCollection("activity_landmarks")),
    getDocs(userCollection("records"))
  ]);

  equipmentRows = [];
  equipmentSnap.forEach((item) => equipmentRows.push({ __docId: item.id, ...item.data() }));

  landmarks.clear();
  landmarkSnap.forEach((item) => {
    const row = item.data();
    const code = String(row.code ?? row.__sportKey ?? item.id).trim();
    if (code) landmarks.set(code, row);
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
  rebuildLandmarkFilter();
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
  rebuildSimpleSelect(
    ui.sportFilter,
    [...new Set(activities.map((a) => String(a.sport ?? "")).filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b))
      .map((value) => [value, sportName(value)]),
    "Tous"
  );

  rebuildSimpleSelect(
    ui.yearFilter,
    [...new Set(
      activities
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
    [...new Set(activities.map((a) => String(a.equipment_name ?? "").trim()).filter(Boolean))]
      .sort(localeSort)
      .map((value) => [value, value]),
    "Tous"
  );

  rebuildSimpleSelect(
    ui.sourceFilter,
    [...new Set(activities.map((a) => String(a.import_source ?? "").trim()).filter(Boolean))]
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
    if (sport && String(activity.sport ?? "") !== sport) return false;

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
}

function renderActivities() {
  ui.loadedLabel.textContent =
    `${formatNumber(activities.length)} chargée(s) sur ${ui.activityCount.textContent} · ` +
    `${formatNumber(filteredActivities.length)} correspondant aux filtres`;

  ui.activityList.innerHTML = "";

  if (!filteredActivities.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucune activité parmi les données actuellement chargées.";
    ui.activityList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const activity of filteredActivities) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "activity-card";
    button.addEventListener("click", () => showActivity(activity));

    button.appendChild(activityMain(activity));
    button.appendChild(datum("Distance", formatDistance(activity.distance_m)));
    button.appendChild(datum("D+", formatMeters(activity.ascent_m), "hide-sm"));
    button.appendChild(datum("Durée", formatDuration(activity.elapsed_time_ms), "hide-sm"));
    button.appendChild(datum("Matériel", activity.equipment_name || "—", "hide-md hide-sm"));
    button.appendChild(datum("Repères", markerSummary(activity), "hide-md hide-sm"));

    fragment.appendChild(button);
  }

  ui.activityList.appendChild(fragment);
}

function activityMain(activity) {
  const cell = document.createElement("div");
  cell.className = "activity-main";

  const strong = document.createElement("strong");
  strong.textContent = activity.custom_title || sportName(activity.sport);

  const span = document.createElement("span");
  span.textContent = `${formatDate(activity.start_time_ms)} · ${sportName(activity.sport)}`;

  cell.append(strong, span);
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

function showActivity(activity) {
  catalogScrollY = window.scrollY;
  currentDetailId = activityKey(activity);

  ui.catalogView.classList.add("hidden");
  ui.detailView.classList.remove("hidden");

  renderDetail(activity);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function showCatalog(restoreScroll = true) {
  document.title = "SPORT Web · WEB008";
  cartographyRequestToken++;
  destroyActivityMap();
  ui.detailView.classList.add("hidden");
  ui.catalogView.classList.remove("hidden");

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
  ui.detailTitle.textContent = title;
  ui.detailSportLine.textContent =
    `${sportName(activity.sport).toUpperCase()} · ${subSportName(activity.sub_sport)}`;
  ui.detailDateLine.textContent = formatDateLong(activity.start_time_ms);

  renderHeroMetrics(activity);
  renderSummary(activity);
  renderCartography(activity);
  renderPerformance(activity);
  renderPersonal(activity);
  renderLinkedRecords(activity);
  renderImport(activity);
  renderRaw(activity);

  document.title = `${title} · SPORT Web`;
}

function renderHeroMetrics(activity) {
  ui.detailHeroMetrics.innerHTML = "";
  const metrics = [
    ["Distance", formatDistance(activity.distance_m)],
    ["Durée", formatDuration(activity.elapsed_time_ms)],
    ["D+", formatMeters(activity.ascent_m)],
    ["Allure / vitesse", primarySpeedMetric(activity)],
    ["FC moy.", formatHeartRate(activity.avg_hr)],
    ["Matériel", activity.equipment_name || "—"]
  ];

  for (const [label, value] of metrics) {
    const box = document.createElement("div");
    box.className = "hero-metric";
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
  addDetailItem(ui.detailSummaryGrid, "Calories", formatInteger(activity.calories));
  addDetailItem(ui.detailSummaryGrid, "Points GPS", formatInteger(activity.gps_point_count));
  addDetailItem(ui.detailSummaryGrid, "Enregistrements FIT", formatInteger(activity.record_count));
}


async function renderCartography(activity) {
  const token = ++cartographyRequestToken;
  destroyActivityMap();
  ui.elevationProfile.innerHTML = "";
  ui.profileMeta.textContent = "";
  ui.profileLive.textContent = "Survolez la carte ou le profil pour suivre votre position.";
  ui.routeStats.innerHTML = "";
  ui.mapStatus.textContent = "Chargement du tracé…";
  ui.mapStatus.className = "pill neutral";
  ui.activityMap.classList.remove("route-empty");
  ui.activityMap.textContent = "";

  const gpsCount = numberOrZero(activity.gps_point_count);
  if (gpsCount <= 1) {
    showRouteUnavailable("Cette activité ne contient pas de tracé GPS exploitable.");
    return;
  }

  try {
    const key = activityKey(activity);
    const routeRef = doc(db, ROOT, currentUser.uid, "activity_routes", key);
    const snapshot = await getDoc(routeRef);

    if (token !== cartographyRequestToken || activityKey(activity) !== currentDetailId) return;

    if (!snapshot.exists()) {
      showRouteUnavailable(
        "Tracé Web non publié pour cette activité. "
        + "Sur le téléphone principal : Firebase · SPORT Web → « Publier les tracés Web · CARTOWEB001 »."
      );
      return;
    }

    const route = normalizeRoute(snapshot.data());
    if (route.points.length < 2) {
      showRouteUnavailable("Le document activity_routes existe mais ne contient pas assez de points exploitables.");
      return;
    }

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

    // Leaflet calcule mal sa taille si le conteneur vient juste de sortir de display:none.
    window.setTimeout(() => {
      if (token === cartographyRequestToken && activityMapInstance) {
        activityMapInstance.invalidateSize(false);
      }
    }, 80);
  } catch (error) {
    console.error(error);
    if (token !== cartographyRequestToken) return;
    showRouteUnavailable(`Carte indisponible : ${error?.message || String(error)}`);
  }
}

function normalizeRoute(data) {
  const lat = Array.isArray(data?.lat) ? data.lat : [];
  const lon = Array.isArray(data?.lon) ? data.lon : [];
  const alt = Array.isArray(data?.alt_m) ? data.alt_m : [];
  const distance = Array.isArray(data?.distance_m) ? data.distance_m : [];

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

  return { points };
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
  return {
    distanceMeters: distance,
    ascentMeters: ascent,
    minAltitude: altitudes.length ? Math.min(...altitudes) : null,
    maxAltitude: altitudes.length ? Math.max(...altitudes) : null
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
    ["Points", `${formatNumber(route.points.length)} / ${formatNumber(sourceCount || route.points.length)}`]
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

  const preferredLayer = ui.mapLayerSelect.value || "osm";
  activityBaseLayer = activityBaseLayers[preferredLayer] || activityBaseLayers.osm;
  activityBaseLayer.addTo(activityMapInstance);

  activityRouteLayer = window.L.polyline(latLngs, {
    color: "#9cff22",
    weight: 4,
    opacity: 0.94,
    lineJoin: "round"
  }).addTo(activityMapInstance);

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

  const bounds = activityRouteLayer.getBounds();
  if (bounds.isValid()) {
    activityMapInstance.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
  }

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
  if (activityRouteLayer) activityRouteLayer.bringToFront();
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

  svg.appendChild(svgText(left, H - 11, "0 km", "profile-label"));
  const endLabel = svgText(
    W - right,
    H - 11,
    `${(maxDistance / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`,
    "profile-label"
  );
  endLabel.setAttribute("text-anchor", "end");
  svg.appendChild(endLabel);

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
    const compact = `${km.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km · ${Math.round(point.altitudeMeters)} m`;
    hoverText.textContent = compact;
    hoverText.setAttribute("x", Math.min(W - 260, Math.max(left + 10, x + 12)));
    hoverText.setAttribute("visibility", "visible");

    ui.profileLive.textContent =
      `${compact} · D+ cumulé ${Math.round(gain).toLocaleString("fr-FR")} m`;

    if (activityHoverMarker) {
      activityHoverMarker.setLatLng([point.latitude, point.longitude]);
      activityHoverMarker.setTooltipContent(
        `${km.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km · ${Math.round(point.altitudeMeters)} m · D+ ${Math.round(gain)} m`
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
  activityHoverMarker = null;
  activityBaseLayers = {};
  activityBaseLayer = null;
  activeRoute = null;
  profileHoverUpdater = null;
  profileHoverClearer = null;

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
    return;
  }

  records
    .slice()
    .sort((a, b) => String(a.record_type ?? "").localeCompare(String(b.record_type ?? ""), "fr"))
    .forEach((record) => {
      const row = document.createElement("div");
      row.className = "record-row";

      const left = document.createElement("strong");
      left.textContent = recordLabel(record.record_type);

      const right = document.createElement("span");
      right.className = "muted";
      right.textContent = formatRecordValue(record);

      row.append(left, right);
      ui.recordsList.appendChild(row);
    });
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

async function commitWebMutation({
  table,
  rowKey,
  operation,
  row,
  materializedCollection,
  materializedData,
  deleteMaterialized = false
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
    webVersion: "WEB008"
  };
  if (row != null) event.row = row;

  batch.set(changeRef, event);
  batch.set(
    metaRef,
    {
      updatedAtMs: now,
      sourceDeviceId: webDeviceId,
      webVersion: "WEB008"
    },
    { merge: true }
  );

  await batch.commit();
  return { eventId, now };
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
        "WEB008 · modification propagée automatiquement vers téléphone et tablette.",
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

  const rows = equipmentRows
    .slice()
    .sort((a, b) => {
      const activeA = String(a.status ?? "ACTIVE").toUpperCase() === "ACTIVE" ? 0 : 1;
      const activeB = String(b.status ?? "ACTIVE").toUpperCase() === "ACTIVE" ? 0 : 1;
      if (activeA !== activeB) return activeA - activeB;
      return equipmentDisplayName(a).localeCompare(equipmentDisplayName(b), "fr", { sensitivity: "base" });
    });

  const values = new Set();
  for (const item of rows) {
    const value = equipmentDisplayName(item);
    if (!value || values.has(value)) continue;
    values.add(value);

    const option = document.createElement("option");
    option.value = value;
    const category = String(item.category ?? "").trim();
    const reserve = String(item.status ?? "ACTIVE").toUpperCase() === "ACTIVE" ? "" : " · réserve";
    option.textContent = `${value}${category ? ` · ${category}` : ""}${reserve}`;
    ui.editEquipmentSelect.appendChild(option);
  }

  if (selected && !values.has(selected)) {
    const legacy = document.createElement("option");
    legacy.value = selected;
    legacy.textContent = `${selected} · affectation actuelle`;
    ui.editEquipmentSelect.appendChild(legacy);
  }
  ui.editEquipmentSelect.value = selected;
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
    setMessage("WEB008 · modification propagée automatiquement sur les trois plateformes.", "success");
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
    setMessage("WEB008 · repère synchronisé automatiquement sur les trois plateformes.", "success");
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
      setMessage("WEB008 · écoute temps réel indisponible : " + (error?.message || error), "error");
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

  if (table === "activities" && row) {
    const activity = activities.find((item) => activityKey(item) === rowKey);
    if (activity) {
      Object.assign(activity, row);
      applyFiltersAndRender();

      if (currentDetailId === rowKey) {
        ui.detailTitle.textContent = activity.custom_title || sportName(activity.sport);
        renderHeroMetrics(activity);
        renderSummary(activity);
        renderPerformance(activity);
        renderPersonal(activity);
        renderRaw(activity);
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
    const current = currentDetailActivity();
    if (current) renderPersonal(current);
  } else if (table === "equipment") {
    equipmentRows = equipmentRows.filter((item) => String(item.id ?? item.__docId) !== rowKey);
    if (operation !== "DELETE" && row) equipmentRows.push({ __docId: rowKey, ...row });
    const current = currentDetailActivity();
    if (current) renderPersonal(current);
  } else if (table === "records") {
    records = records.filter((item) => String(item.record_type ?? item.__docId) !== rowKey);
    if (operation !== "DELETE" && row) records.push({ __docId: rowKey, ...row });
    renderRecords();
    const current = currentDetailActivity();
    if (current) renderLinkedRecords(current);
  }

  if (!fromWeb) {
    setInteropStatus("Modification Android reçue", "ok");
    setMessage("WEB008 · changement reçu automatiquement depuis un appareil Android.", "success");
  }
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
  return `Sous-sport ${code}`;
}

function recordLabel(type) {
  const value = String(type ?? "Record");
  const labels = {
    LONGEST_DISTANCE: "Plus longue distance",
    MAX_ASCENT: "Plus grand D+",
    LONGEST_DURATION: "Plus longue durée"
  };
  return labels[value] || value.replaceAll("_", " ");
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
