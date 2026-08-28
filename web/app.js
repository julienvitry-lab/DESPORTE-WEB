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

// WEB002 : configuration client Firebase. Une clé API Firebase Web n'est pas un secret.
// La sécurité des données repose sur Firebase Authentication + les règles Firestore.
// WEB002 reste strictement en lecture seule.
const firebaseConfig = {
  apiKey: "AIzaSyDALtXWRoNHiD9oc4SqxH4tn7HY_08NI1A",
  authDomain: "sport-505813.firebaseapp.com",
  projectId: "sport-505813",
  storageBucket: "sport-505813.firebasestorage.app",
  messagingSenderId: "161388578171"
};

const FETCH_BATCH = 250;
const ROOT = "sport_users";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const ui = {
  authState: document.querySelector("#authState"),
  loginButton: document.querySelector("#loginButton"),
  logoutButton: document.querySelector("#logoutButton"),
  messageBox: document.querySelector("#messageBox"),
  dashboard: document.querySelector("#dashboard"),
  identityLine: document.querySelector("#identityLine"),
  activityCount: document.querySelector("#activityCount"),
  equipmentCount: document.querySelector("#equipmentCount"),
  landmarkCount: document.querySelector("#landmarkCount"),
  activityLandmarkCount: document.querySelector("#activityLandmarkCount"),
  recordCount: document.querySelector("#recordCount"),
  expectedDocuments: document.querySelector("#expectedDocuments"),
  loadedLabel: document.querySelector("#loadedLabel"),
  searchInput: document.querySelector("#searchInput"),
  sportFilter: document.querySelector("#sportFilter"),
  yearFilter: document.querySelector("#yearFilter"),
  equipmentFilter: document.querySelector("#equipmentFilter"),
  landmarkFilter: document.querySelector("#landmarkFilter"),
  sourceFilter: document.querySelector("#sourceFilter"),
  distanceFilter: document.querySelector("#distanceFilter"),
  ascentFilter: document.querySelector("#ascentFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  pageSizeSelect: document.querySelector("#pageSizeSelect"),
  filterCount: document.querySelector("#filterCount"),
  resetFiltersButton: document.querySelector("#resetFiltersButton"),
  activityList: document.querySelector("#activityList"),
  previousPageButton: document.querySelector("#previousPageButton"),
  nextPageButton: document.querySelector("#nextPageButton"),
  pageLabel: document.querySelector("#pageLabel"),
  rangeLabel: document.querySelector("#rangeLabel"),
  loadMoreButton: document.querySelector("#loadMoreButton"),
  loadAllButton: document.querySelector("#loadAllButton"),
  refreshButton: document.querySelector("#refreshButton"),
  detailPanel: document.querySelector("#detailPanel"),
  detailTitle: document.querySelector("#detailTitle"),
  detailSubtitle: document.querySelector("#detailSubtitle"),
  detailHighlights: document.querySelector("#detailHighlights"),
  detailStats: document.querySelector("#detailStats"),
  detailContext: document.querySelector("#detailContext"),
  previousActivityButton: document.querySelector("#previousActivityButton"),
  nextActivityButton: document.querySelector("#nextActivityButton"),
  copyLinkButton: document.querySelector("#copyLinkButton"),
  closeDetailButton: document.querySelector("#closeDetailButton"),
  recordsList: document.querySelector("#recordsList")
};

let currentUser = null;
let activities = [];
let visibleActivities = [];
let lastActivityDoc = null;
let moreRemoteActivities = true;
let loading = false;
let loadingAll = false;
let totalActivityCount = null;
let currentPage = 1;
let currentDetailKey = null;
let landmarks = new Map();
let activityLandmarks = new Map();
let records = [];

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
ui.loadMoreButton.addEventListener("click", async () => {
  await loadNextBatch();
  renderCatalogue();
});
ui.loadAllButton.addEventListener("click", () => loadEverything());
ui.previousPageButton.addEventListener("click", () => changePage(-1));
ui.nextPageButton.addEventListener("click", () => changePage(1));
ui.resetFiltersButton.addEventListener("click", resetFilters);
ui.closeDetailButton.addEventListener("click", closeDetail);
ui.previousActivityButton.addEventListener("click", () => moveDetail(-1));
ui.nextActivityButton.addEventListener("click", () => moveDetail(1));
ui.copyLinkButton.addEventListener("click", copyCurrentLink);

[
  ui.searchInput,
  ui.sportFilter,
  ui.yearFilter,
  ui.equipmentFilter,
  ui.landmarkFilter,
  ui.sourceFilter,
  ui.distanceFilter,
  ui.ascentFilter,
  ui.sortSelect,
  ui.pageSizeSelect
].forEach((control) => {
  const eventName = control === ui.searchInput ? "input" : "change";
  control.addEventListener(eventName, () => {
    currentPage = 1;
    renderCatalogue();
  });
});

window.addEventListener("hashchange", () => {
  if (!currentUser) return;
  openActivityFromHash();
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  if (!user) {
    ui.authState.textContent = "Non connecté";
    ui.authState.className = "pill neutral auth-pill";
    ui.loginButton.classList.remove("hidden");
    ui.logoutButton.classList.add("hidden");
    ui.dashboard.classList.add("hidden");
    setMessage("WEB002 reste strictement en lecture seule. Connecte-toi avec le même compte Google que SPORT Android.", "info");
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

async function reloadAll() {
  if (!currentUser || loading) return;

  activities = [];
  visibleActivities = [];
  lastActivityDoc = null;
  moreRemoteActivities = true;
  loadingAll = false;
  totalActivityCount = null;
  currentPage = 1;
  currentDetailKey = null;
  landmarks = new Map();
  activityLandmarks = new Map();
  records = [];
  ui.activityList.innerHTML = "";
  ui.recordsList.innerHTML = "";
  ui.detailPanel.classList.add("hidden");
  resetDynamicFilterOptions();
  setMessage("Lecture Firestore en cours…", "info");

  try {
    await Promise.all([loadMeta(), loadAuxiliaryCollections()]);
    await loadNextBatch();
    renderCatalogue();
    openActivityFromHash();
    setMessage("WEB002 connecté à Firestore en lecture seule.", "success");
  } catch (error) {
    handleError(error, "Lecture Firestore impossible");
  }
}

function userCollection(name) {
  return collection(db, ROOT, currentUser.uid, name);
}

async function loadMeta() {
  const ref = doc(db, ROOT, currentUser.uid, "meta", "state");
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    throw new Error("Le document meta/state est absent. Le bootstrap SPORT Web n'est peut-être pas initialisé.");
  }

  const data = snapshot.data();
  totalActivityCount = numericOrNull(data.activityCount);
  setMetric(ui.activityCount, data.activityCount);
  setMetric(ui.equipmentCount, data.equipmentCount);
  setMetric(ui.landmarkCount, data.landmarkCount);
  setMetric(ui.activityLandmarkCount, data.activityLandmarkCount);
  setMetric(ui.recordCount, data.recordCount);
  setMetric(ui.expectedDocuments, data.expectedDocuments);
}

async function loadAuxiliaryCollections() {
  const [landmarkSnap, activityLandmarkSnap, recordSnap] = await Promise.all([
    getDocs(userCollection("landmarks")),
    getDocs(userCollection("activity_landmarks")),
    getDocs(userCollection("records"))
  ]);

  landmarks.clear();
  landmarkSnap.forEach((item) => {
    const row = item.data();
    const code = String(row.code ?? row.__sportKey ?? item.id).trim();
    landmarks.set(code, row);
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
  recordSnap.forEach((item) => records.push(item.data()));
  renderRecords();
  rebuildLandmarkFilter();
}

async function loadNextBatch() {
  if (!currentUser || loading || !moreRemoteActivities) return 0;

  loading = true;
  updateLoadingButtons();

  try {
    const ref = userCollection("activities");
    let q = query(ref, orderBy("start_time_ms", "desc"), limit(FETCH_BATCH));
    if (lastActivityDoc) {
      q = query(ref, orderBy("start_time_ms", "desc"), startAfter(lastActivityDoc), limit(FETCH_BATCH));
    }

    const snapshot = await getDocs(q);
    snapshot.forEach((item) => {
      activities.push({ __docId: item.id, ...item.data() });
    });

    if (!snapshot.empty) {
      lastActivityDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    moreRemoteActivities = snapshot.size === FETCH_BATCH;
    rebuildDynamicFilterOptions();
    return snapshot.size;
  } finally {
    loading = false;
    updateLoadingButtons();
  }
}

async function loadEverything() {
  if (!currentUser || loadingAll || !moreRemoteActivities) return;

  loadingAll = true;
  updateLoadingButtons();

  try {
    while (moreRemoteActivities) {
      const count = await loadNextBatch();
      renderCatalogue();
      setMessage(
        `Chargement du catalogue : ${formatNumber(activities.length)} / ${formatNumber(totalActivityCount ?? "?")} activités…`,
        "info"
      );
      if (count === 0) break;
    }
    setMessage(`Catalogue complet chargé : ${formatNumber(activities.length)} activités.`, "success");
  } catch (error) {
    handleError(error, "Chargement complet impossible");
  } finally {
    loadingAll = false;
    updateLoadingButtons();
    renderCatalogue();
  }
}

function renderCatalogue() {
  visibleActivities = getFilteredSortedActivities();
  const pageSize = Number(ui.pageSizeSelect.value) || 50;
  const totalPages = Math.max(1, Math.ceil(visibleActivities.length / pageSize));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);

  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, visibleActivities.length);
  const pageRows = visibleActivities.slice(start, end);

  ui.loadedLabel.textContent =
    `${formatNumber(activities.length)} chargée(s)` +
    `${totalActivityCount != null ? ` sur ${formatNumber(totalActivityCount)}` : ""}` +
    ` · ${formatNumber(visibleActivities.length)} correspondent aux filtres`;

  ui.filterCount.textContent = `${activeFilterCount()} filtre${activeFilterCount() > 1 ? "s" : ""} actif${activeFilterCount() > 1 ? "s" : ""}`;
  ui.activityList.innerHTML = "";

  if (!pageRows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = activities.length
      ? "Aucune activité parmi les données chargées ne correspond à ces filtres."
      : "Aucune activité chargée.";
    ui.activityList.appendChild(empty);
  } else {
    const fragment = document.createDocumentFragment();
    pageRows.forEach((activity) => fragment.appendChild(buildActivityCard(activity)));
    ui.activityList.appendChild(fragment);
  }

  ui.pageLabel.textContent = `Page ${currentPage} / ${totalPages}`;
  ui.rangeLabel.textContent = visibleActivities.length
    ? `${formatNumber(start + 1)}–${formatNumber(end)} sur ${formatNumber(visibleActivities.length)}`
    : "0 résultat";

  ui.previousPageButton.disabled = currentPage <= 1;
  const hasLocalNext = currentPage < totalPages;
  ui.nextPageButton.disabled = !hasLocalNext && !moreRemoteActivities;
  ui.nextPageButton.textContent = hasLocalNext ? "Suivant →" : moreRemoteActivities ? "Charger puis suivant →" : "Suivant →";

  updateLoadingButtons();
  refreshDetailNavigationState();
}

function getFilteredSortedActivities() {
  const needle = normalized(ui.searchInput.value);
  const sport = ui.sportFilter.value;
  const year = ui.yearFilter.value;
  const equipment = ui.equipmentFilter.value;
  const landmark = ui.landmarkFilter.value;
  const source = ui.sourceFilter.value;
  const minDistanceKm = numericOrNull(ui.distanceFilter.value);
  const minAscent = numericOrNull(ui.ascentFilter.value);

  const result = activities.filter((activity) => {
    if (sport && String(activity.sport ?? "") !== sport) return false;

    const d = dateFromMs(activity.start_time_ms);
    if (year && (!d || String(d.getFullYear()) !== year)) return false;

    const equipmentName = String(activity.equipment_name ?? "").trim();
    if (equipment && equipmentName !== equipment) return false;

    const sourceName = String(activity.import_source ?? "").trim();
    if (source && sourceName !== source) return false;

    if (minDistanceKm != null && Number(activity.distance_m ?? 0) < minDistanceKm * 1000) return false;
    if (minAscent != null && Number(activity.ascent_m ?? 0) < minAscent) return false;

    const activityId = activityKey(activity);
    const links = activityLandmarks.get(activityId) || [];
    if (landmark && !links.some((row) => String(row.landmark_code ?? "") === landmark)) return false;

    if (needle) {
      const landmarkText = links.map((row) => {
        const code = String(row.landmark_code ?? "");
        const meta = landmarks.get(code);
        return `${code} ${meta?.name ?? ""} ${meta?.label ?? ""}`;
      }).join(" ");

      const haystack = normalized([
        activity.custom_title,
        activity.file_name,
        activity.equipment_name,
        activity.import_source,
        sportName(activity.sport),
        landmarkText
      ].join(" "));

      if (!haystack.includes(needle)) return false;
    }

    return true;
  });

  const sort = ui.sortSelect.value;
  result.sort((a, b) => {
    if (sort === "date_asc") return number(a.start_time_ms) - number(b.start_time_ms);
    if (sort === "distance_desc") return number(b.distance_m) - number(a.distance_m);
    if (sort === "ascent_desc") return number(b.ascent_m) - number(a.ascent_m);
    if (sort === "duration_desc") return number(b.elapsed_time_ms) - number(a.elapsed_time_ms);
    return number(b.start_time_ms) - number(a.start_time_ms);
  });

  return result;
}

function buildActivityCard(activity) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "activity-card";
  button.addEventListener("click", () => showActivity(activity, true));

  button.appendChild(activityMain(activity));
  button.appendChild(datum("Distance", formatDistance(activity.distance_m)));
  button.appendChild(datum("D+", formatMeters(activity.ascent_m), "mobile-hide"));
  button.appendChild(datum("Durée", formatDuration(activity.elapsed_time_ms), "optional"));
  button.appendChild(datum("Matériel", activity.equipment_name || "—", "optional"));

  return button;
}

async function changePage(delta) {
  const pageSize = Number(ui.pageSizeSelect.value) || 50;
  const totalPages = Math.max(1, Math.ceil(visibleActivities.length / pageSize));

  if (delta > 0 && currentPage >= totalPages && moreRemoteActivities) {
    const before = activities.length;
    await loadNextBatch();
    renderCatalogue();
    const newTotalPages = Math.max(1, Math.ceil(visibleActivities.length / pageSize));
    if (activities.length > before && currentPage < newTotalPages) {
      currentPage += 1;
      renderCatalogue();
    }
    return;
  }

  currentPage = Math.max(1, Math.min(totalPages, currentPage + delta));
  renderCatalogue();
  document.querySelector(".catalogue-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetFilters() {
  ui.searchInput.value = "";
  ui.sportFilter.value = "";
  ui.yearFilter.value = "";
  ui.equipmentFilter.value = "";
  ui.landmarkFilter.value = "";
  ui.sourceFilter.value = "";
  ui.distanceFilter.value = "";
  ui.ascentFilter.value = "";
  ui.sortSelect.value = "date_desc";
  currentPage = 1;
  renderCatalogue();
}

function activeFilterCount() {
  return [
    ui.searchInput.value.trim(),
    ui.sportFilter.value,
    ui.yearFilter.value,
    ui.equipmentFilter.value,
    ui.landmarkFilter.value,
    ui.sourceFilter.value,
    ui.distanceFilter.value,
    ui.ascentFilter.value
  ].filter(Boolean).length;
}

function resetDynamicFilterOptions() {
  resetSelect(ui.sportFilter, "Tous");
  resetSelect(ui.yearFilter, "Toutes");
  resetSelect(ui.equipmentFilter, "Tous");
  resetSelect(ui.landmarkFilter, "Tous");
  resetSelect(ui.sourceFilter, "Toutes");
}

function rebuildDynamicFilterOptions() {
  preserveSelect(ui.sportFilter, uniqueSorted(
    activities.map((a) => String(a.sport ?? "")).filter(Boolean),
    (a, b) => Number(a) - Number(b),
    (value) => sportName(value)
  ), "Tous");

  preserveSelect(ui.yearFilter, uniqueSorted(
    activities.map((a) => dateFromMs(a.start_time_ms)?.getFullYear()).filter(Boolean),
    (a, b) => b - a
  ), "Toutes");

  preserveSelect(ui.equipmentFilter, uniqueSorted(
    activities.map((a) => String(a.equipment_name ?? "").trim()).filter(Boolean)
  ), "Tous");

  preserveSelect(ui.sourceFilter, uniqueSorted(
    activities.map((a) => String(a.import_source ?? "").trim()).filter(Boolean)
  ), "Toutes");
}

function rebuildLandmarkFilter() {
  const values = [...landmarks.entries()]
    .map(([code, row]) => ({
      value: code,
      label: `${code} · ${row.name || row.label || "Repère"}`
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  const selected = ui.landmarkFilter.value;
  resetSelect(ui.landmarkFilter, "Tous");
  values.forEach(({ value, label }) => appendOption(ui.landmarkFilter, value, label));
  if (values.some((item) => item.value === selected)) ui.landmarkFilter.value = selected;
}

function showActivity(activity, updateHash) {
  currentDetailKey = activityKey(activity);
  ui.detailTitle.textContent = activity.custom_title || sportName(activity.sport);
  ui.detailSubtitle.textContent = `${formatDateLong(activity.start_time_ms)} · ${sportName(activity.sport)}`;
  ui.detailHighlights.innerHTML = "";
  ui.detailStats.innerHTML = "";
  ui.detailContext.innerHTML = "";

  const highlights = [
    ["Distance", formatDistance(activity.distance_m)],
    ["Durée", formatDuration(activity.elapsed_time_ms)],
    ["D+", formatMeters(activity.ascent_m)],
    [Number(activity.sport) === 2 ? "Vitesse moy." : "Allure moy.", Number(activity.sport) === 2 ? formatSpeed(activity) : formatPace(activity)],
    ["FC moy.", formatHeartRate(activity.avg_hr)]
  ];
  highlights.forEach(([label, value]) => ui.detailHighlights.appendChild(highlight(label, value)));

  const stats = [
    ["Dénivelé +", formatMeters(activity.ascent_m)],
    ["Dénivelé −", formatMeters(activity.descent_m)],
    ["FC moyenne", formatHeartRate(activity.avg_hr)],
    ["FC max", formatHeartRate(activity.max_hr)],
    ["Calories", valueOrDash(activity.calories)],
    ["Cadence moyenne", valueOrDash(activity.avg_cadence)],
    ["Distance", formatDistance(activity.distance_m)],
    ["Durée", formatDuration(activity.elapsed_time_ms)]
  ];
  stats.forEach(([label, value]) => ui.detailStats.appendChild(detailItem(label, value)));

  const links = activityLandmarks.get(currentDetailKey) || [];
  const landmarkText = links.length
    ? links.map((link) => {
        const code = String(link.landmark_code ?? "?");
        const meta = landmarks.get(code);
        const label = meta?.name || meta?.label || code;
        const occurrences = Number(link.occurrences ?? 1);
        return `${code} · ${label}${occurrences > 1 ? ` ×${occurrences}` : ""}`;
      }).join(" · ")
    : "Aucun";

  const context = [
    ["Matériel", activity.equipment_name || "—"],
    ["Source", activity.import_source || "—"],
    ["Repères", landmarkText, true],
    ["Fichier", activity.file_name || "—", true],
    ["Note personnelle", activity.personal_note || "—", true],
    ["Description", activity.description || "—", true]
  ];
  context.forEach(([label, value, wide]) => ui.detailContext.appendChild(detailItem(label, value, wide)));

  ui.detailPanel.classList.remove("hidden");
  refreshDetailNavigationState();

  if (updateHash) {
    const hash = `activity=${encodeURIComponent(currentDetailKey)}`;
    if (location.hash.slice(1) !== hash) history.pushState(null, "", `#${hash}`);
  }

  ui.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openActivityFromHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const key = params.get("activity");
  if (!key) return;

  const activity = activities.find((row) => activityKey(row) === key);
  if (activity) {
    showActivity(activity, false);
    return;
  }

  if (moreRemoteActivities) {
    setMessage("L'activité du lien n'est pas encore dans les données chargées. Utilise « Charger tout » pour la rechercher dans le catalogue complet.", "info");
  }
}

function closeDetail() {
  currentDetailKey = null;
  ui.detailPanel.classList.add("hidden");
  if (location.hash) history.pushState(null, "", location.pathname + location.search);
}

function moveDetail(delta) {
  const index = visibleActivities.findIndex((row) => activityKey(row) === currentDetailKey);
  if (index < 0) return;
  const next = visibleActivities[index + delta];
  if (next) showActivity(next, true);
}

function refreshDetailNavigationState() {
  const index = visibleActivities.findIndex((row) => activityKey(row) === currentDetailKey);
  ui.previousActivityButton.disabled = index <= 0;
  ui.nextActivityButton.disabled = index < 0 || index >= visibleActivities.length - 1;
}

async function copyCurrentLink() {
  if (!currentDetailKey) return;
  const url = `${location.origin}${location.pathname}#activity=${encodeURIComponent(currentDetailKey)}`;
  try {
    await navigator.clipboard.writeText(url);
    const previous = ui.copyLinkButton.textContent;
    ui.copyLinkButton.textContent = "Lien copié ✓";
    setTimeout(() => { ui.copyLinkButton.textContent = previous; }, 1400);
  } catch {
    setMessage(`Lien de l'activité : ${url}`, "info");
  }
}

function updateLoadingButtons() {
  ui.loadMoreButton.disabled = loading || loadingAll || !moreRemoteActivities;
  ui.loadAllButton.disabled = loading || loadingAll || !moreRemoteActivities;

  if (loadingAll) {
    ui.loadAllButton.textContent = `Chargement… ${formatNumber(activities.length)}`;
  } else {
    ui.loadAllButton.textContent = moreRemoteActivities ? "Charger tout" : "Catalogue complet ✓";
  }

  ui.loadMoreButton.textContent = moreRemoteActivities ? "Charger 250 de plus" : "Tout est chargé";
}

function renderRecords() {
  ui.recordsList.innerHTML = "";
  if (!records.length) {
    ui.recordsList.innerHTML = '<div class="empty">Aucun record Firestore.</div>';
    return;
  }

  records
    .slice()
    .sort((a, b) => String(a.record_type ?? "").localeCompare(String(b.record_type ?? "")))
    .forEach((record) => {
      const row = document.createElement("div");
      row.className = "record-row";
      const left = document.createElement("strong");
      left.textContent = String(record.record_type ?? "Record");
      const right = document.createElement("span");
      right.className = "muted";
      right.textContent = record.value != null
        ? String(record.value)
        : record.record_value != null
          ? String(record.record_value)
          : "présent";
      row.append(left, right);
      ui.recordsList.appendChild(row);
    });
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

function highlight(label, value) {
  const box = document.createElement("div");
  box.className = "highlight";
  const span = document.createElement("span");
  span.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  box.append(span, strong);
  return box;
}

function detailItem(label, value, wide = false) {
  const box = document.createElement("div");
  box.className = `detail-item${wide ? " wide" : ""}`;
  const span = document.createElement("span");
  span.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  box.append(span, strong);
  return box;
}

function preserveSelect(select, values, firstLabel) {
  const selected = select.value;
  resetSelect(select, firstLabel);
  values.forEach((value) => {
    if (typeof value === "object" && value !== null) {
      appendOption(select, value.value, value.label);
    } else {
      appendOption(select, value, String(value));
    }
  });
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

function uniqueSorted(values, sorter, labeler) {
  const unique = [...new Set(values)];
  unique.sort(sorter || ((a, b) => String(a).localeCompare(String(b), "fr", { numeric: true })));
  return labeler ? unique.map((value) => ({ value: String(value), label: labeler(value) })) : unique;
}

function resetSelect(select, firstLabel) {
  select.innerHTML = "";
  appendOption(select, "", firstLabel);
}

function appendOption(select, value, label) {
  const option = document.createElement("option");
  option.value = String(value);
  option.textContent = String(label);
  select.appendChild(option);
}

function activityKey(activity) {
  return String(activity.id ?? activity.__sportKey ?? activity.__docId ?? "").trim();
}

function handleError(error, prefix) {
  console.error(error);
  const code = error?.code || "";
  let detail = error?.message || String(error);

  if (code === "auth/unauthorized-domain") {
    detail =
      "Le domaine GitHub Pages n'est pas autorisé dans Firebase Authentication. " +
      "Ajoute julienvitry-lab.github.io dans Firebase Authentication → Settings → Authorized domains.";
  } else if (code === "permission-denied") {
    detail =
      "Firestore a refusé la lecture. Vérifie que tu es connecté avec le même compte Google que SPORT Android et que les règles Firestore autorisent ton UID.";
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

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function numericOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && String(value ?? "").trim() !== "" ? n : null;
}

function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat("fr-FR").format(n) : String(value ?? "—");
}

function dateFromMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const d = dateFromMs(value);
  return d ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d) : "Date inconnue";
}

function formatDateLong(value) {
  const d = dateFromMs(value);
  return d ? new Intl.DateTimeFormat("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  }).format(d) : "—";
}

function formatDistance(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km` : "—";
}

function formatMeters(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n).toLocaleString("fr-FR")} m` : "—";
}

function formatDuration(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min ${String(s).padStart(2, "0")}`;
}

function formatHeartRate(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n)} bpm` : "—";
}

function formatPace(activity) {
  const distanceKm = Number(activity.distance_m) / 1000;
  const elapsedMinutes = Number(activity.elapsed_time_ms) / 60000;
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || !Number.isFinite(elapsedMinutes) || elapsedMinutes <= 0) return "—";
  const pace = elapsedMinutes / distanceKm;
  const minutes = Math.floor(pace);
  const seconds = Math.round((pace - minutes) * 60);
  return `${minutes}:${String(seconds === 60 ? 0 : seconds).padStart(2, "0")} /km`;
}

function formatSpeed(activity) {
  const distanceKm = Number(activity.distance_m) / 1000;
  const hours = Number(activity.elapsed_time_ms) / 3600000;
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || !Number.isFinite(hours) || hours <= 0) return "—";
  return `${(distanceKm / hours).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km/h`;
}

function valueOrDash(value) {
  return value == null || value === "" ? "—" : String(value);
}

function sportName(value) {
  const code = Number(value);
  if (code === 1) return "Course à pied";
  if (code === 2) return "Vélo";
  if (code === 4) return "Fitness";
  if (code === 5) return "Natation";
  return Number.isFinite(code) ? `Sport ${code}` : "Sport";
}
