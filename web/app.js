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

// WEB013 · EDITION002 : parité d’édition activité Web / téléphone / tablette.
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
    "catalogView", "identityLine", "activityCount", "equipmentCount",
    "landmarkCount", "activityLandmarkCount", "recordCount", "expectedDocuments",
    "webDashboardSection", "webDashboardMeta", "dashboardRunningButton", "dashboardCyclingButton",
    "personalSyncSection", "personalSyncMeta", "personalSyncStatus", "goalSportSelect",
    "goalDistanceInput", "goalAscentInput", "goalDurationInput", "goalTargetNameInput",
    "goalTargetDateInput", "goalPrepDistanceInput", "goalPrepAscentInput", "goalSaveStatus", "goalProgress",
    "weightDateInput", "weightKgInput", "weightSaveStatus", "weightSummary", "weightHistory",
    "dashboardWeekButton", "dashboardMonthButton", "dashboardYearButton", "dashboardTotalButton",
    "dashboardActivityValue", "dashboardDistanceValue", "dashboardDurationValue", "dashboardAscentValue",
    "dashboardEquipmentMeta", "dashboardEquipmentList", "dashboardRecentList",
    "equipmentManagerSection", "equipmentManagerMeta", "equipmentManagerSearch",
    "equipmentManagerStatusFilter", "newEquipmentButton", "equipmentEditor",
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

let dashboardSport = 1;
let dashboardPeriod = "WEEK";
let dashboardLoadGeneration = 0;

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

  ui.dashboardRunningButton.addEventListener("click", () => selectDashboardSport(1));
  ui.dashboardCyclingButton.addEventListener("click", () => selectDashboardSport(2));
  ui.dashboardWeekButton.addEventListener("click", () => selectDashboardPeriod("WEEK"));
  ui.dashboardMonthButton.addEventListener("click", () => selectDashboardPeriod("MONTH"));
  ui.dashboardYearButton.addEventListener("click", () => selectDashboardPeriod("YEAR"));
  ui.dashboardTotalButton.addEventListener("click", () => selectDashboardPeriod("TOTAL"));

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
      "WEB013 · Interop : connecte-toi avec le même compte Google que SPORT Android.",
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
  landmarkReferences = new Map();
  activityLandmarks = new Map();
  records = [];
  sportGoals = new Map();
  journalEntries = new Map();
  currentDetailId = null;

  ui.activityList.innerHTML = "";
  ui.recordsList.innerHTML = "";
  resetFilterOptions();
  showCatalog(false);
  setMessage("Lecture Firestore en cours…", "info");

  try {
    await Promise.all([loadMeta(), loadReferenceCollections(), loadPersonalSyncData()]);
    await loadNextPage();
    await loadWebDashboard();
    setMessage("WEB013 connecté · interopérabilité Web ↔ téléphone ↔ tablette active.", "success");
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

function renderDashboardChoices() {
  ui.dashboardRunningButton.classList.toggle("active", dashboardSport === 1);
  ui.dashboardCyclingButton.classList.toggle("active", dashboardSport === 2);
  ui.dashboardWeekButton.classList.toggle("active", dashboardPeriod === "WEEK");
  ui.dashboardMonthButton.classList.toggle("active", dashboardPeriod === "MONTH");
  ui.dashboardYearButton.classList.toggle("active", dashboardPeriod === "YEAR");
  ui.dashboardTotalButton.classList.toggle("active", dashboardPeriod === "TOTAL");
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

function dashboardPeriodLabel() {
  if (dashboardPeriod === "WEEK") return "cette semaine";
  if (dashboardPeriod === "MONTH") return "ce mois";
  if (dashboardPeriod === "YEAR") return "cette année";
  return "depuis le début";
}

async function loadWebDashboard() {
  if (!currentUser) return;
  const generation = ++dashboardLoadGeneration;
  renderDashboardChoices();
  ui.webDashboardMeta.textContent = "Calcul des indicateurs Firestore…";

  try {
    let metrics;
    const startMs = dashboardPeriodStart(dashboardPeriod);

    if (dashboardPeriod === "TOTAL") {
      const totalQuery = query(userCollection("activities"), where("sport", "==", dashboardSport));
      const aggregate = await getAggregateFromServer(totalQuery, {
        activityCount: count(),
        distance: sum("distance_m"),
        duration: sum("elapsed_time_ms"),
        ascent: sum("ascent_m")
      });
      const data = aggregate.data();
      metrics = {
        activityCount: Number(data.activityCount) || 0,
        distance: Number(data.distance) || 0,
        duration: Number(data.duration) || 0,
        ascent: Number(data.ascent) || 0
      };
    } else {
      // Une seule contrainte de plage évite d'imposer un index composite sport + date.
      const snapshot = await getDocs(query(userCollection("activities"), where("start_time_ms", ">=", startMs)));
      metrics = { activityCount: 0, distance: 0, duration: 0, ascent: 0 };
      snapshot.forEach((item) => {
        const row = item.data();
        if (Number(row.sport) !== dashboardSport || row.deleted_at_ms != null) return;
        metrics.activityCount += 1;
        metrics.distance += Number(row.distance_m) || 0;
        metrics.duration += Number(row.elapsed_time_ms) || 0;
        metrics.ascent += Number(row.ascent_m) || 0;
      });
    }

    const recentSnapshot = await getDocs(query(userCollection("activities"), orderBy("start_time_ms", "desc"), limit(40)));
    const recent = [];
    recentSnapshot.forEach((item) => {
      const row = { __docId: item.id, ...item.data() };
      if (Number(row.sport) === dashboardSport && row.deleted_at_ms == null && recent.length < 5) recent.push(row);
    });

    if (generation !== dashboardLoadGeneration) return;

    ui.dashboardActivityValue.textContent = formatNumber(metrics.activityCount);
    ui.dashboardDistanceValue.textContent = formatDistance(metrics.distance);
    ui.dashboardDurationValue.textContent = formatDuration(metrics.duration);
    ui.dashboardAscentValue.textContent = formatMeters(metrics.ascent);
    ui.webDashboardMeta.textContent = `${sportName(dashboardSport)} · ${dashboardPeriodLabel()} · calcul serveur`;

    renderDashboardEquipment();
    renderDashboardRecent(recent);
  } catch (error) {
    console.error(error);
    if (generation !== dashboardLoadGeneration) return;
    ui.webDashboardMeta.textContent = "Tableau de bord indisponible";
    ui.dashboardActivityValue.textContent = "—";
    ui.dashboardDistanceValue.textContent = "—";
    ui.dashboardDurationValue.textContent = "—";
    ui.dashboardAscentValue.textContent = "—";
  }
}

function renderDashboardEquipment() {
  const category = dashboardSport === 2 ? "BIKE" : "SHOES";
  const rows = equipmentRows
    .filter((item) => String(item.category ?? "").toUpperCase() === category)
    .filter((item) => String(item.status ?? "ACTIVE").toUpperCase() === "ACTIVE")
    .sort((a, b) => (Number(b.last_use_date_ms) || 0) - (Number(a.last_use_date_ms) || 0));

  ui.dashboardEquipmentMeta.textContent = `${rows.length} actif${rows.length > 1 ? "s" : ""}`;
  ui.dashboardEquipmentList.innerHTML = "";
  if (!rows.length) {
    ui.dashboardEquipmentList.innerHTML = '<div class="empty compact-empty">Aucun matériel actif.</div>';
    return;
  }
  rows.slice(0, 4).forEach((item) => {
    const card = document.createElement("div");
    card.className = "dashboard-list-row";
    const main = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = equipmentDisplayName(item);
    const meta = document.createElement("span");
    meta.textContent = `${formatDistance(item.total_distance_m)} · ${formatDuration(item.total_duration_ms)} · ${formatMeters(item.total_ascent_m)}`;
    main.append(title, meta);
    const countNode = document.createElement("span");
    countNode.className = "dashboard-list-value";
    countNode.textContent = `${formatNumber(item.activity_count ?? 0)} act.`;
    card.append(main, countNode);
    ui.dashboardEquipmentList.appendChild(card);
  });
}

function renderDashboardRecent(rows) {
  ui.dashboardRecentList.innerHTML = "";
  if (!rows.length) {
    ui.dashboardRecentList.innerHTML = '<div class="empty compact-empty">Aucune activité récente.</div>';
    return;
  }
  rows.forEach((activity) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dashboard-list-row dashboard-activity-row";
    button.addEventListener("click", () => showActivity(activity));
    const main = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = activity.custom_title || sportName(activity.sport);
    const meta = document.createElement("span");
    meta.textContent = `${formatDate(activity.start_time_ms)} · ${formatDistance(activity.distance_m)} · ${formatMeters(activity.ascent_m)}`;
    main.append(title, meta);
    const duration = document.createElement("span");
    duration.className = "dashboard-list-value";
    duration.textContent = formatDuration(activity.elapsed_time_ms);
    button.append(main, duration);
    ui.dashboardRecentList.appendChild(button);
  });
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
    landmarkSnap,
    landmarkReferenceSnap,
    activityLandmarkSnap,
    recordSnap
  ] = await Promise.all([
    getDocs(userCollection("equipment")),
    getDocs(userCollection("landmarks")),
    getDocs(userCollection("landmark_references")),
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
  renderLandmarkManager();
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
  document.title = "SPORT Web · WEB013";
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
      const q = query(
        userCollection("activities"),
        where(spec.field, ">", 0),
        orderBy(spec.field, "desc"),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) continue;

      const activityDoc = snapshot.docs[0];
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
            webVersion: "WEB013",
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
            webVersion: "WEB013"
          }
        );
        countDelta -= 1;
      }
    }

    const metaPatch = {
      updatedAtMs: now,
      sourceDeviceId: webDeviceId,
      webVersion: "WEB013"
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
    setMessage(
      "WEB013 · les records distance, durée et D+ ont été recalculés depuis les activités puis propagés vers téléphone et tablette.",
      "success"
    );
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
    webVersion: "WEB013"
  };
  if (row != null) event.row = row;

  batch.set(changeRef, event);
  const metaPatch = {
    updatedAtMs: now,
    sourceDeviceId: webDeviceId,
    webVersion: "WEB013"
  };
  if (metaIncrements && typeof metaIncrements === "object") {
    for (const [field, delta] of Object.entries(metaIncrements)) {
      const amount = Number(delta);
      if (Number.isFinite(amount) && amount !== 0) metaPatch[field] = increment(amount);
    }
  }

  batch.set(metaRef, metaPatch, { merge: true });

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
        "WEB013 · modification propagée automatiquement vers téléphone et tablette.",
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
    setMessage("WEB013 · modification propagée automatiquement sur les trois plateformes.", "success");
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
    setMessage("WEB013 · repère synchronisé automatiquement sur les trois plateformes.", "success");
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
      setMessage("WEB013 · écoute temps réel indisponible : " + (error?.message || error), "error");
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
    setMessage("WEB013 · changement reçu automatiquement depuis un appareil Android.", "success");
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
  ui.landmarkEditorEyebrow.textContent = "WEB013 · MODIFICATION AUTOMATIQUE";
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

    setMessage("WEB013 · repère synchronisé automatiquement sur les trois plateformes.", "success");
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
    ui.landmarkEditorEyebrow.textContent = "WEB013 · REPÈRE CRÉÉ";
    ui.landmarkEditorTitle.textContent = row.name;
    populateLandmarkEditor(row.code, row);

    rebuildLandmarkFilter();
    renderLandmarkManager();

    setMessage("WEB013 · nouveau repère créé sur Web, téléphone et tablette.", "success");
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

    setMessage("WEB013 · repère inutilisé supprimé sur les trois plateformes.", "success");
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
      if (status && itemStatus !== status) return false;

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

  ui.equipmentManagerMeta.textContent =
    `${formatNumber(equipmentRows.length)} matériels · ${activeCount} actifs · ${storedCount} en réserve · ${retiredCount} archivés`;

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
  ui.equipmentEditorEyebrow.textContent = "WEB013 · MODIFICATION AUTOMATIQUE";
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
    setMessage("WEB013 · matériel synchronisé automatiquement sur les trois plateformes.", "success");
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
    ui.equipmentEditorEyebrow.textContent = "WEB013 · MATÉRIEL CRÉÉ";
    ui.equipmentEditorTitle.textContent = equipmentDisplayName(row);
    ui.equipmentEditorHint.textContent =
      "Le matériel est créé. Toute modification ultérieure est maintenant automatique.";
    ui.equipmentEditorId.textContent = `ID : ${id}`;
    setEquipmentEditorStatus("Créé sur les trois plateformes", "ok");

    const current = currentDetailActivity();
    if (current) renderPersonal(current);

    setMessage("WEB013 · nouveau matériel créé sur Web, téléphone et tablette.", "success");
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

    setMessage(`WEB013 · ${equipmentStatusLabel(normalized).toLowerCase()} sur les trois plateformes.`, "success");
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
      `Par sécurité, WEB013 bloque un renommage Web au-delà de ${MAX_EQUIPMENT_RENAME_CASCADE} activités.`
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
      webVersion: "WEB013",
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
        webVersion: "WEB013",
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
      webVersion: "WEB013"
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
      ? `WEB013 · matériel renommé et ${snapshot.size} activité(s) associée(s) mises à jour sur les trois plateformes.`
      : "WEB013 · matériel renommé sur les trois plateformes.",
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
