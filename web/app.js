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

// WEB001 : configuration client Firebase. Une clé API Firebase Web n'est pas un secret.
// La sécurité des données reste assurée par Firebase Authentication + les règles Firestore.
const firebaseConfig = {
  apiKey: "AIzaSyDALtXWRoNHiD9oc4SqxH4tn7HY_08NI1A",
  authDomain: "sport-505813.firebaseapp.com",
  projectId: "sport-505813",
  storageBucket: "sport-505813.firebasestorage.app",
  messagingSenderId: "161388578171"
};

const PAGE_SIZE = 100;
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
  activityList: document.querySelector("#activityList"),
  loadMoreButton: document.querySelector("#loadMoreButton"),
  refreshButton: document.querySelector("#refreshButton"),
  detailPanel: document.querySelector("#detailPanel"),
  detailTitle: document.querySelector("#detailTitle"),
  detailContent: document.querySelector("#detailContent"),
  closeDetailButton: document.querySelector("#closeDetailButton"),
  recordsList: document.querySelector("#recordsList")
};

let currentUser = null;
let activities = [];
let lastActivityDoc = null;
let moreActivities = true;
let loading = false;
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
ui.loadMoreButton.addEventListener("click", () => loadNextPage());
ui.refreshButton.addEventListener("click", () => reloadAll());
ui.searchInput.addEventListener("input", renderActivities);
ui.sportFilter.addEventListener("change", renderActivities);
ui.yearFilter.addEventListener("change", renderActivities);
ui.closeDetailButton.addEventListener("click", () => ui.detailPanel.classList.add("hidden"));

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  if (!user) {
    ui.authState.textContent = "Non connecté";
    ui.authState.className = "pill neutral";
    ui.loginButton.classList.remove("hidden");
    ui.logoutButton.classList.add("hidden");
    ui.dashboard.classList.add("hidden");
    setMessage("WEB001 n'écrit rien dans Firestore. Connecte-toi avec le même compte Google que SPORT Android.", "info");
    return;
  }

  ui.authState.textContent = "Firebase connecté";
  ui.authState.className = "pill ok";
  ui.loginButton.classList.add("hidden");
  ui.logoutButton.classList.remove("hidden");
  ui.dashboard.classList.remove("hidden");
  ui.identityLine.textContent = `${user.email || "Compte Google"} · projet sport-505813`;
  await reloadAll();
});

async function reloadAll() {
  if (!currentUser || loading) return;
  activities = [];
  lastActivityDoc = null;
  moreActivities = true;
  landmarks = new Map();
  activityLandmarks = new Map();
  records = [];
  ui.activityList.innerHTML = "";
  ui.recordsList.innerHTML = "";
  ui.yearFilter.innerHTML = '<option value="">Toutes</option>';
  setMessage("Lecture Firestore en cours…", "info");

  try {
    await Promise.all([loadMeta(), loadAuxiliaryCollections()]);
    await loadNextPage();
    setMessage("WEB001 connecté à Firestore en lecture seule.", "success");
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
    const code = String(row.code ?? row.__sportKey ?? item.id);
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
}

async function loadNextPage() {
  if (!currentUser || loading || !moreActivities) return;
  loading = true;
  ui.loadMoreButton.disabled = true;
  ui.loadMoreButton.textContent = "Chargement…";

  try {
    const ref = userCollection("activities");
    let q = query(ref, orderBy("start_time_ms", "desc"), limit(PAGE_SIZE));
    if (lastActivityDoc) {
      q = query(ref, orderBy("start_time_ms", "desc"), startAfter(lastActivityDoc), limit(PAGE_SIZE));
    }

    const snapshot = await getDocs(q);
    snapshot.forEach((item) => {
      activities.push({ __docId: item.id, ...item.data() });
    });

    if (!snapshot.empty) {
      lastActivityDoc = snapshot.docs[snapshot.docs.length - 1];
    }
    moreActivities = snapshot.size === PAGE_SIZE;
    rebuildYearFilter();
    renderActivities();
  } finally {
    loading = false;
    ui.loadMoreButton.disabled = false;
    ui.loadMoreButton.textContent = moreActivities ? "Charger 100 activités de plus" : "Toutes les activités chargées";
    ui.loadMoreButton.classList.toggle("hidden", !moreActivities);
  }
}

function renderActivities() {
  const needle = ui.searchInput.value.trim().toLowerCase();
  const sport = ui.sportFilter.value;
  const year = ui.yearFilter.value;

  const filtered = activities.filter((activity) => {
    if (sport && String(activity.sport ?? "") !== sport) return false;
    const d = dateFromMs(activity.start_time_ms);
    if (year && (!d || String(d.getFullYear()) !== year)) return false;
    if (needle) {
      const haystack = [
        activity.custom_title,
        activity.file_name,
        activity.equipment_name,
        activity.import_source,
        sportName(activity.sport)
      ].map((value) => String(value ?? "").toLowerCase()).join(" ");
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  ui.loadedLabel.textContent =
    `${formatNumber(activities.length)} activité(s) chargée(s) · ${formatNumber(filtered.length)} affichée(s)`;

  ui.activityList.innerHTML = "";
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucune activité parmi les pages actuellement chargées.";
    ui.activityList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const activity of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "activity-card";
    button.addEventListener("click", () => showActivity(activity));

    button.appendChild(activityMain(activity));
    button.appendChild(datum("Distance", formatDistance(activity.distance_m)));
    button.appendChild(datum("D+", formatMeters(activity.ascent_m), "mobile-hide"));
    button.appendChild(datum("Durée", formatDuration(activity.elapsed_time_ms), "optional"));
    button.appendChild(datum("Matériel", activity.equipment_name || "—", "optional"));

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
  ui.detailTitle.textContent = activity.custom_title || `${sportName(activity.sport)} · ${formatDate(activity.start_time_ms)}`;
  ui.detailContent.innerHTML = "";

  const links = activityLandmarks.get(String(activity.id ?? activity.__docId)) || [];
  const landmarkText = links.length
    ? links.map((link) => {
        const code = String(link.landmark_code ?? "?");
        const meta = landmarks.get(code);
        const label = meta?.name || meta?.label || code;
        const occurrences = Number(link.occurrences ?? 1);
        return `${code} · ${label}${occurrences > 1 ? ` ×${occurrences}` : ""}`;
      }).join(" · ")
    : "Aucun";

  const items = [
    ["Date", formatDateLong(activity.start_time_ms)],
    ["Sport", sportName(activity.sport)],
    ["Distance", formatDistance(activity.distance_m)],
    ["Durée", formatDuration(activity.elapsed_time_ms)],
    ["Dénivelé +", formatMeters(activity.ascent_m)],
    ["Dénivelé −", formatMeters(activity.descent_m)],
    ["FC moyenne", formatHeartRate(activity.avg_hr)],
    ["FC max", formatHeartRate(activity.max_hr)],
    ["Calories", valueOrDash(activity.calories)],
    ["Cadence moyenne", valueOrDash(activity.avg_cadence)],
    ["Matériel", activity.equipment_name || "—"],
    ["Source", activity.import_source || "—"],
    ["Repères", landmarkText, true],
    ["Fichier", activity.file_name || "—", true],
    ["Note", activity.personal_note || "—", true],
    ["Description", activity.description || "—", true]
  ];

  for (const [label, value, wide] of items) {
    const box = document.createElement("div");
    box.className = `detail-item${wide ? " wide" : ""}`;
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    box.append(span, strong);
    ui.detailContent.appendChild(box);
  }

  ui.detailPanel.classList.remove("hidden");
  ui.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
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

function rebuildYearFilter() {
  const selected = ui.yearFilter.value;
  const years = [...new Set(
    activities
      .map((a) => dateFromMs(a.start_time_ms))
      .filter(Boolean)
      .map((d) => d.getFullYear())
  )].sort((a, b) => b - a);

  ui.yearFilter.innerHTML = '<option value="">Toutes</option>';
  for (const year of years) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    ui.yearFilter.appendChild(option);
  }
  if (years.includes(Number(selected))) ui.yearFilter.value = selected;
}

function handleError(error, prefix) {
  console.error(error);
  const code = error?.code || "";
  let detail = error?.message || String(error);

  if (code === "auth/unauthorized-domain") {
    detail =
      "Le domaine GitHub Pages n'est pas encore autorisé dans Firebase Authentication. " +
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
