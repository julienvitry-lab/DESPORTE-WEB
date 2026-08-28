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
  orderBy,
  query,
  startAfter
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// WEB003 reste strictement en lecture seule.
// La clé API Firebase Web identifie le projet ; l'accès aux données dépend de Firebase Auth + règles Firestore.
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

  ui.backToCatalogButton.addEventListener("click", showCatalog);
  ui.backToCatalogBottomButton.addEventListener("click", showCatalog);
  ui.previousActivityButton.addEventListener("click", () => moveDetail(-1));
  ui.previousActivityBottomButton.addEventListener("click", () => moveDetail(-1));
  ui.nextActivityButton.addEventListener("click", () => moveDetail(1));
  ui.nextActivityBottomButton.addEventListener("click", () => moveDetail(1));

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
    ui.authState.textContent = "Non connecté";
    ui.authState.className = "pill neutral auth-pill";
    ui.loginButton.classList.remove("hidden");
    ui.logoutButton.classList.add("hidden");
    ui.dashboard.classList.add("hidden");
    setMessage(
      "WEB003 n'écrit rien dans Firestore. Connecte-toi avec le même compte Google que SPORT Android.",
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
    setMessage("WEB003 connecté à Firestore en lecture seule.", "success");
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
  document.title = "SPORT Web · WEB003";
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

      chip.append(codeNode, label);
      ui.detailLandmarks.appendChild(chip);
    });
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

function handleError(error, prefix) {
  console.error(error);

  const code = error?.code || "";
  let detail = error?.message || String(error);

  if (code === "auth/unauthorized-domain") {
    detail =
      "Le domaine GitHub Pages n'est pas autorisé dans Firebase Authentication.";
  } else if (code === "permission-denied") {
    detail =
      "Firestore a refusé la lecture. Vérifie le compte Google et les règles Firestore.";
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
