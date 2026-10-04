import { getApps, getApp, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
  increment,
  writeBatch,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ==========================================================================
   CGWEB124
   GPS_MARKER_CATALOG001 / MULTIPASS_DETECTOR001 / HYSTERESIS_REARM001
   SEGMENT_PROXIMITY001 / HISTORICAL_MARKER_INDEX001
   INCREMENTAL_MARKER_REFRESH001
   ========================================================================== */

const CGWEB124_BUILD = "CGWEB124";
const CGWEB124_DETECTOR_VERSION = "MULTIPASS_DETECTOR001";
const CGWEB124_INDEX_VERSION = 1;
const CGWEB124_ROOT = "sport_users";
const CGWEB124_INDEX_COLLECTION = "gps_marker_activity_index";
const CGWEB124_DEFAULT_RADIUS_M = 50;
const CGWEB124_DEFAULT_REARM_M = 75;
const CGWEB124_HISTORY_CHUNK = 4;
const CGWEB124_INCREMENTAL_LIMIT = 40;
const CGWEB124_EARTH_RADIUS_M = 6371008.8;

const firebaseConfig = {
  apiKey: "AIzaSyDALtXWRoNHiD9oc4SqxH4tn7HY_08NI1A",
  authDomain: "sport-505813.firebaseapp.com",
  projectId: "sport-505813",
  storageBucket: "sport-505813.firebasestorage.app",
  messagingSenderId: "161388578171"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let cg124User = null;
let cg124Landmarks = new Map();
let cg124References = new Map();
let cg124Markers = new Map();
let cg124UnsubscribeActivities = null;
let cg124HistoryRunning = false;
let cg124HistoryStop = false;
let cg124IncrementalChain = Promise.resolve();
let cg124IncrementalPending = new Set();
let cg124ActivityCache = new Map();
let cg124UiTimer = null;

function cg124UserCollection(name) {
  if (!cg124User) throw new Error("Connexion SPORT requise.");
  return collection(db, CGWEB124_ROOT, cg124User.uid, name);
}

function cg124UserDoc(collectionName, id) {
  if (!cg124User) throw new Error("Connexion SPORT requise.");
  return doc(db, CGWEB124_ROOT, cg124User.uid, collectionName, String(id));
}

function cg124DeviceId() {
  const key = "sport_cgweb124_device_id";
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = "web-cg124-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
      localStorage.setItem(key, id);
    }
    return id;
  } catch (_) {
    return "web-cg124-session";
  }
}

function cg124NextSeq() {
  const key = "sport_cgweb124_seq";
  try {
    const next = (Number(localStorage.getItem(key)) || 0) + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch (_) {
    return Date.now();
  }
}

async function cg124CommitInterop({ table, rowKey, materializedCollection, row }) {
  if (!cg124User) throw new Error("Connexion SPORT requise.");
  if (!navigator.onLine) throw new Error("Connexion réseau requise pour modifier un repère GPS.");

  const now = Date.now();
  const seq = cg124NextSeq();
  const eventId = `cgweb124_${now}_${seq}_${Math.random().toString(36).slice(2, 7)}`;
  const deviceId = cg124DeviceId();
  const batch = writeBatch(db);

  batch.set(
    cg124UserDoc(materializedCollection, rowKey),
    {
      ...(row || {}),
      __sportKey: String(rowKey),
      __updatedAtMs: now
    },
    { merge: true }
  );

  batch.set(
    cg124UserDoc("changes", eventId),
    {
      eventId,
      deviceId,
      firebaseSeq: seq,
      sourceChangeSeq: 0,
      table: String(table),
      rowKey: String(rowKey),
      operation: "UPSERT",
      row: row || {},
      changedAtMs: now,
      publishedAt: serverTimestamp(),
      androidVersion: 0,
      webVersion: CGWEB124_BUILD
    }
  );

  batch.set(
    cg124UserDoc("meta", "state"),
    {
      updatedAtMs: now,
      sourceDeviceId: deviceId,
      webVersion: CGWEB124_BUILD
    },
    { merge: true }
  );

  await batch.commit();
}

function cg124ValidCoord(lat, lon) {
  return Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180;
}

function cg124ReferenceCoord(row) {
  const lat = Number(
    row?.latitude ??
    row?.lat ??
    row?.reference_latitude ??
    row?.reference_lat ??
    row?.center_lat ??
    row?.gps_latitude
  );
  const lon = Number(
    row?.longitude ??
    row?.lon ??
    row?.lng ??
    row?.reference_longitude ??
    row?.reference_lon ??
    row?.center_lon ??
    row?.gps_longitude
  );
  return cg124ValidCoord(lat, lon) ? { lat, lon } : null;
}

function cg124MarkerFromRef(code, ref) {
  const coord = cg124ReferenceCoord(ref);
  if (!coord || ref?.gps_enabled === false) return null;

  const radius = Math.max(
    5,
    Math.min(
      1000,
      Number(ref?.radius_m ?? ref?.tolerance_m ?? CGWEB124_DEFAULT_RADIUS_M) || CGWEB124_DEFAULT_RADIUS_M
    )
  );
  const requestedRearm = Number(
    ref?.rearm_radius_m ??
    ref?.rearm_m ??
    Math.max(CGWEB124_DEFAULT_REARM_M, radius + 25)
  );
  const rearm = Math.max(radius + 5, Math.min(2000, requestedRearm || radius + 25));

  return {
    code: String(code),
    name: String(cg124Landmarks.get(String(code))?.name || `Repère ${code}`),
    latitude: coord.lat,
    longitude: coord.lon,
    radius_m: radius,
    rearm_radius_m: rearm,
    config_updated_at_ms: Number(ref?.gps_config_updated_at_ms || ref?.__updatedAtMs || 0),
    raw: ref
  };
}

function cg124RebuildMarkers() {
  cg124Markers = new Map();
  for (const [code, ref] of cg124References.entries()) {
    const marker = cg124MarkerFromRef(code, ref);
    if (marker) cg124Markers.set(code, marker);
  }
}

function cg124StableHash(text) {
  let h = 2166136261;
  const value = String(text ?? "");
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function cg124MarkerSignature() {
  const rows = [...cg124Markers.values()]
    .sort((a, b) => a.code.localeCompare(b.code, "fr"))
    .map((m) => [
      m.code,
      m.latitude.toFixed(7),
      m.longitude.toFixed(7),
      Number(m.radius_m).toFixed(1),
      Number(m.rearm_radius_m).toFixed(1),
      Number(m.config_updated_at_ms || 0)
    ].join("|"));
  return cg124StableHash(rows.join("||"));
}

function cg124ActivityFingerprint(activity) {
  return cg124StableHash([
    activity?.fit_active_sha256 || "",
    activity?.fit_updated_at_ms || "",
    activity?.join_completed_at_ms || "",
    activity?.start_time_ms || "",
    activity?.end_time_ms || "",
    activity?.gps_point_count || "",
    activity?.record_count || "",
    activity?.distance_m || "",
    activity?.ascent_m || ""
  ].join("|"));
}

function cg124ActivityId(activity, fallback = "") {
  return String(
    activity?.id ??
    activity?.activity_id ??
    activity?.__docId ??
    fallback ??
    ""
  ).trim();
}

function cg124IndexDocId(activityDocId) {
  return encodeURIComponent(String(activityDocId || "")).replace(/\./g, "%2E");
}

function cg124Haversine(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const p1 = Number(lat1) * toRad;
  const p2 = Number(lat2) * toRad;
  const dp = (Number(lat2) - Number(lat1)) * toRad;
  const dl = (Number(lon2) - Number(lon1)) * toRad;
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * CGWEB124_EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function cg124NormalizeRoute(raw) {
  const out = [];
  const data = raw || {};

  if (Array.isArray(data.points)) {
    for (let i = 0; i < data.points.length; i++) {
      const p = data.points[i] || {};
      const lat = Number(p.latitude ?? p.lat ?? p.position_lat ?? p.positionLat);
      const lon = Number(p.longitude ?? p.lon ?? p.lng ?? p.position_long ?? p.positionLong);
      if (!cg124ValidCoord(lat, lon)) continue;
      out.push({
        latitude: lat,
        longitude: lon,
        timeMs: Number(p.timeMs ?? p.time_ms ?? p.timestamp_ms ?? p.timestampMs ?? p.timestamp),
        distanceMeters: Number(p.distanceMeters ?? p.distance_m ?? p.distance),
        sourceIndex: i
      });
    }
    return out;
  }

  const lat = Array.isArray(data.lat) ? data.lat
    : Array.isArray(data.latitude) ? data.latitude
    : Array.isArray(data.latitudes) ? data.latitudes
    : [];
  const lon = Array.isArray(data.lon) ? data.lon
    : Array.isArray(data.lng) ? data.lng
    : Array.isArray(data.longitude) ? data.longitude
    : Array.isArray(data.longitudes) ? data.longitudes
    : [];
  const time = Array.isArray(data.time_ms) ? data.time_ms
    : Array.isArray(data.timestamp_ms) ? data.timestamp_ms
    : Array.isArray(data.timestamps_ms) ? data.timestamps_ms
    : [];
  const distance = Array.isArray(data.distance_m) ? data.distance_m
    : Array.isArray(data.distanceMeters) ? data.distanceMeters
    : [];

  const n = Math.min(lat.length, lon.length);
  for (let i = 0; i < n; i++) {
    const la = Number(lat[i]);
    const lo = Number(lon[i]);
    if (!cg124ValidCoord(la, lo)) continue;
    out.push({
      latitude: la,
      longitude: lo,
      timeMs: Number(time[i]),
      distanceMeters: Number(distance[i]),
      sourceIndex: i
    });
  }
  return out;
}

function cg124SegmentProximity(marker, a, b) {
  const lat0 = marker.latitude * Math.PI / 180;
  const meterPerRad = CGWEB124_EARTH_RADIUS_M;
  const ax = (a.longitude - marker.longitude) * Math.PI / 180 * Math.cos(lat0) * meterPerRad;
  const ay = (a.latitude - marker.latitude) * Math.PI / 180 * meterPerRad;
  const bx = (b.longitude - marker.longitude) * Math.PI / 180 * Math.cos(lat0) * meterPerRad;
  const by = (b.latitude - marker.latitude) * Math.PI / 180 * meterPerRad;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0
    ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
    : 0;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return {
    distance_m: Math.hypot(x, y),
    t
  };
}

function cg124InterpolateFinite(a, b, t) {
  const x = Number(a);
  const y = Number(b);
  if (Number.isFinite(x) && Number.isFinite(y)) return x + (y - x) * t;
  if (Number.isFinite(x)) return x;
  if (Number.isFinite(y)) return y;
  return null;
}

function cg124Passage(marker, a, b, segmentIndex, proximity) {
  const t = Number(proximity?.t ?? 0);
  return {
    at_ms: cg124InterpolateFinite(a?.timeMs, b?.timeMs, t),
    route_distance_m: cg124InterpolateFinite(a?.distanceMeters, b?.distanceMeters, t),
    proximity_m: Math.round(Number(proximity?.distance_m || 0) * 10) / 10,
    segment_index: Math.max(0, Number(segmentIndex) || 0)
  };
}

function cg124DetectPassages(points, marker) {
  const route = Array.isArray(points) ? points : [];
  if (!route.length) {
    return {
      passage_count: 0,
      passages: [],
      first_passage_ms: null,
      last_passage_ms: null,
      min_distance_m: null
    };
  }

  const entry = Number(marker.radius_m);
  const rearm = Number(marker.rearm_radius_m);
  let armed = true;
  let minDistance = Number.POSITIVE_INFINITY;
  const passages = [];

  const firstDistance = cg124Haversine(
    route[0].latitude,
    route[0].longitude,
    marker.latitude,
    marker.longitude
  );
  minDistance = Math.min(minDistance, firstDistance);

  if (firstDistance <= entry) {
    passages.push({
      at_ms: Number.isFinite(Number(route[0].timeMs)) ? Number(route[0].timeMs) : null,
      route_distance_m: Number.isFinite(Number(route[0].distanceMeters)) ? Number(route[0].distanceMeters) : null,
      proximity_m: Math.round(firstDistance * 10) / 10,
      segment_index: 0
    });
    armed = false;
  }

  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const da = cg124Haversine(a.latitude, a.longitude, marker.latitude, marker.longitude);
    const db = cg124Haversine(b.latitude, b.longitude, marker.latitude, marker.longitude);
    minDistance = Math.min(minDistance, da, db);

    if (!armed && da >= rearm) armed = true;

    const proximity = cg124SegmentProximity(marker, a, b);
    minDistance = Math.min(minDistance, proximity.distance_m);

    if (armed && proximity.distance_m <= entry) {
      passages.push(cg124Passage(marker, a, b, i - 1, proximity));
      armed = false;
    }

    if (!armed && db >= rearm) armed = true;
  }

  const times = passages
    .map((p) => Number(p.at_ms))
    .filter((v) => Number.isFinite(v) && v > 0);

  return {
    passage_count: passages.length,
    passages,
    first_passage_ms: times.length ? Math.min(...times) : null,
    last_passage_ms: times.length ? Math.max(...times) : null,
    min_distance_m: Number.isFinite(minDistance) ? Math.round(minDistance * 10) / 10 : null
  };
}

async function cg124LoadRoute(activityDocId, activity) {
  const keys = [...new Set([
    String(activityDocId || ""),
    cg124ActivityId(activity),
    String(activity?.__docId || "")
  ].filter(Boolean))];

  for (const key of keys) {
    const snap = await getDoc(cg124UserDoc("activity_routes", key));
    if (!snap.exists()) continue;
    const points = cg124NormalizeRoute(snap.data());
    if (points.length >= 2) return { key, points };
  }
  return null;
}

function cg124DetectAllMarkers(points) {
  const hits = {};
  for (const marker of cg124Markers.values()) {
    const result = cg124DetectPassages(points, marker);
    if (result.passage_count <= 0) continue;
    hits[marker.code] = {
      ...result,
      radius_m: marker.radius_m,
      rearm_radius_m: marker.rearm_radius_m,
      marker_config_updated_at_ms: marker.config_updated_at_ms,
      detector_version: CGWEB124_DETECTOR_VERSION
    };
  }
  return hits;
}

function cg124EmptyAggregate() {
  const aggregate = {};
  for (const code of cg124Markers.keys()) {
    aggregate[code] = {
      total_passages: 0,
      activity_count: 0,
      first_passage_ms: null,
      last_passage_ms: null
    };
  }
  return aggregate;
}

function cg124MergeAggregate(aggregate, hits) {
  for (const [code, hit] of Object.entries(hits || {})) {
    if (!aggregate[code]) {
      aggregate[code] = {
        total_passages: 0,
        activity_count: 0,
        first_passage_ms: null,
        last_passage_ms: null
      };
    }
    const target = aggregate[code];
    const count = Math.max(0, Number(hit?.passage_count) || 0);
    if (count <= 0) continue;
    target.total_passages += count;
    target.activity_count += 1;

    const first = Number(hit?.first_passage_ms);
    const last = Number(hit?.last_passage_ms);
    if (Number.isFinite(first) && first > 0) {
      target.first_passage_ms = target.first_passage_ms == null
        ? first
        : Math.min(target.first_passage_ms, first);
    }
    if (Number.isFinite(last) && last > 0) {
      target.last_passage_ms = target.last_passage_ms == null
        ? last
        : Math.max(target.last_passage_ms, last);
    }
  }
}

function cg124HistoryKey() {
  return `SPORT_CGWEB124_${cg124User?.uid || "anonymous"}_HISTORY`;
}

function cg124ReadHistory() {
  try {
    const raw = localStorage.getItem(cg124HistoryKey());
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function cg124WriteHistory(state) {
  try {
    localStorage.setItem(cg124HistoryKey(), JSON.stringify(state));
  } catch (error) {
    throw new Error("HISTORICAL_MARKER_INDEX001 · impossible de persister l’état de reprise : " + (error?.message || error));
  }
}

function cg124ClearHistory() {
  try {
    localStorage.removeItem(cg124HistoryKey());
  } catch (_) {}
}

function cg124JoinStatus() {
  try {
    return window.CGWEB123_FIX3_STATUS?.() || null;
  } catch (_) {
    return null;
  }
}

function cg124JoinBusy() {
  if (window.CGWEB123_FIX3_MASS_RUNNING === true) return true;
  const status = String(cg124JoinStatus()?.batch_status || "").toUpperCase();
  return ["RUNNING", "READY", "PAUSED", "REBUILD_REQUIRED"].includes(status);
}

function cg124IndexLockedReason() {
  const status = String(cg124JoinStatus()?.batch_status || "").toUpperCase();
  if (cg124JoinBusy()) {
    return `Indexation historique verrouillée pendant les jonctions${status ? ` (${status})` : ""}.`;
  }
  return "";
}

function cg124FormatDate(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(n));
}

function cg124FormatNumber(value) {
  return (Number(value) || 0).toLocaleString("fr-FR");
}

function cg124EnsureStyle() {
  if (document.getElementById("cgweb124GpsMarkerStyle")) return;
  const style = document.createElement("style");
  style.id = "cgweb124GpsMarkerStyle";
  style.textContent = `
    #cgweb124GpsMarkerSection{display:grid;gap:14px}
    .cg124-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
    .cg124-head h2{margin:0}
    .cg124-badges{display:flex;gap:8px;flex-wrap:wrap}
    .cg124-editor{display:grid;gap:10px;padding:12px;border:1px solid rgba(167,255,42,.20);border-radius:14px;background:rgba(255,255,255,.018)}
    .cg124-grid{display:grid;grid-template-columns:repeat(5,minmax(130px,1fr));gap:10px}
    .cg124-grid label{display:grid;gap:5px}
    .cg124-grid input,.cg124-grid select{width:100%;box-sizing:border-box}
    .cg124-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .cg124-list{display:grid;gap:8px}
    .cg124-card{display:grid;grid-template-columns:minmax(70px,.35fr) minmax(220px,1.5fr) repeat(3,minmax(110px,.6fr)) auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid rgba(255,255,255,.09);border-radius:12px}
    .cg124-code{font-weight:700;color:#c9ff62}
    .cg124-card-main{display:grid;gap:3px}
    .cg124-card-main span,.cg124-stat span{opacity:.72;font-size:.9em}
    .cg124-stat{display:grid;gap:2px}
    .cg124-index{display:grid;gap:10px;padding:12px;border:1px solid rgba(255,255,255,.09);border-radius:14px}
    .cg124-progress{height:8px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}
    .cg124-progress>i{display:block;height:100%;width:0;background:currentColor}
    .cg124-warning{padding:9px 10px;border-radius:10px;background:rgba(255,190,80,.08);border:1px solid rgba(255,190,80,.22)}
    .cg124-error{color:#ff8d8d}
    @media(max-width:900px){
      .cg124-grid{grid-template-columns:1fr 1fr}
      .cg124-card{grid-template-columns:72px 1fr auto}
      .cg124-card .cg124-stat{display:none}
    }
    @media(max-width:560px){
      .cg124-grid{grid-template-columns:1fr}
      .cg124-card{grid-template-columns:64px 1fr}
      .cg124-card button{grid-column:1/-1}
    }
  `;
  document.head.appendChild(style);
}

function cg124EnsurePanel() {
  cg124EnsureStyle();
  let panel = document.getElementById("cgweb124GpsMarkerSection");
  if (panel) return panel;

  const anchor = document.getElementById("landmarkManagerSection");
  if (!anchor) return null;

  panel = document.createElement("section");
  panel.id = "cgweb124GpsMarkerSection";
  panel.className = "panel";
  panel.innerHTML = `
    <div class="cg124-head">
      <div>
        <p class="eyebrow">CGWEB124 · REPÈRES GPS</p>
        <h2>Repères GPS et passages multiples</h2>
        <p class="muted">Détection automatique par coordonnées · rayon d’entrée · rayon de réarmement · proximité des segments GPS.</p>
      </div>
      <div class="cg124-badges">
        <span id="cg124MarkerCount" class="pill neutral">0 repère GPS</span>
        <span id="cg124PassageCount" class="pill neutral">0 passage</span>
      </div>
    </div>

    <div class="cg124-editor">
      <strong>Définir / modifier un repère GPS</strong>
      <div class="cg124-grid">
        <label>Repère
          <select id="cg124MarkerSelect"><option value="">Choisir…</option></select>
        </label>
        <label>Latitude
          <input id="cg124Lat" type="number" step="0.0000001" min="-90" max="90" placeholder="46.0000000">
        </label>
        <label>Longitude
          <input id="cg124Lon" type="number" step="0.0000001" min="-180" max="180" placeholder="6.0000000">
        </label>
        <label>Rayon d’entrée (m)
          <input id="cg124Radius" type="number" min="5" max="1000" step="1" value="${CGWEB124_DEFAULT_RADIUS_M}">
        </label>
        <label>Réarmement (m)
          <input id="cg124Rearm" type="number" min="10" max="2000" step="1" value="${CGWEB124_DEFAULT_REARM_M}">
        </label>
      </div>
      <div class="cg124-actions">
        <button id="cg124SaveMarker" class="primary" type="button">Enregistrer le GPS</button>
        <button id="cg124DisableMarker" class="secondary" type="button">Désactiver ce GPS</button>
        <span id="cg124EditorStatus" class="muted">50 m d’entrée · 75 m de réarmement par défaut.</span>
      </div>
    </div>

    <div id="cg124MarkerList" class="cg124-list"></div>

    <div class="cg124-index">
      <div class="cg124-head">
        <div>
          <strong>Index historique</strong>
          <div id="cg124IndexMeta" class="muted">Aucune indexation lancée.</div>
        </div>
        <div class="cg124-actions">
          <button id="cg124StartHistory" class="primary" type="button">Indexer tout l’historique</button>
          <button id="cg124ResumeHistory" class="secondary" type="button">Reprendre</button>
          <button id="cg124PauseHistory" class="secondary" type="button">Pause après le lot en cours</button>
        </div>
      </div>
      <div class="cg124-progress"><i id="cg124ProgressBar"></i></div>
      <div id="cg124IndexStatus" class="muted">Le premier balayage historique sera disponible lorsque les jonctions de masse seront terminées.</div>
    </div>
  `;

  anchor.insertAdjacentElement("afterend", panel);

  panel.querySelector("#cg124MarkerSelect")?.addEventListener("change", cg124PopulateEditor);
  panel.querySelector("#cg124SaveMarker")?.addEventListener("click", () => void cg124SaveMarker());
  panel.querySelector("#cg124DisableMarker")?.addEventListener("click", () => void cg124DisableMarker());
  panel.querySelector("#cg124StartHistory")?.addEventListener("click", () => void cg124StartHistory());
  panel.querySelector("#cg124ResumeHistory")?.addEventListener("click", () => void cg124ResumeHistory());
  panel.querySelector("#cg124PauseHistory")?.addEventListener("click", () => {
    cg124HistoryStop = true;
    cg124SetIndexStatus("Pause demandée · le lot d’activités en cours sera terminé.");
    cg124Render();
  });

  return panel;
}

function cg124SetEditorStatus(text, error = false) {
  const node = document.getElementById("cg124EditorStatus");
  if (!node) return;
  node.textContent = String(text || "");
  node.classList.toggle("cg124-error", Boolean(error));
}

function cg124SetIndexStatus(text, error = false) {
  const node = document.getElementById("cg124IndexStatus");
  if (!node) return;
  node.textContent = String(text || "");
  node.classList.toggle("cg124-error", Boolean(error));
}

function cg124PopulateSelect() {
  const select = document.getElementById("cg124MarkerSelect");
  if (!select) return;
  const selected = select.value;
  select.innerHTML = '<option value="">Choisir…</option>';

  [...cg124Landmarks.entries()]
    .sort((a, b) =>
      (Number(a[1]?.sort_order) || 9999) - (Number(b[1]?.sort_order) || 9999) ||
      a[0].localeCompare(b[0], "fr")
    )
    .forEach(([code, row]) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = `${code} · ${row?.name || "Repère"}`;
      select.appendChild(option);
    });

  if ([...select.options].some((o) => o.value === selected)) select.value = selected;
}

function cg124PopulateEditor() {
  const code = String(document.getElementById("cg124MarkerSelect")?.value || "");
  const ref = cg124References.get(code) || {};
  const coord = cg124ReferenceCoord(ref);

  const lat = document.getElementById("cg124Lat");
  const lon = document.getElementById("cg124Lon");
  const radius = document.getElementById("cg124Radius");
  const rearm = document.getElementById("cg124Rearm");

  if (lat) lat.value = coord ? String(coord.lat) : "";
  if (lon) lon.value = coord ? String(coord.lon) : "";

  const r = Number(ref?.radius_m ?? ref?.tolerance_m ?? CGWEB124_DEFAULT_RADIUS_M) || CGWEB124_DEFAULT_RADIUS_M;
  const rr = Number(ref?.rearm_radius_m ?? Math.max(CGWEB124_DEFAULT_REARM_M, r + 25)) || Math.max(CGWEB124_DEFAULT_REARM_M, r + 25);
  if (radius) radius.value = String(r);
  if (rearm) rearm.value = String(Math.max(r + 5, rr));

  if (!code) cg124SetEditorStatus("Choisis d’abord un repère personnel.");
  else if (coord && ref?.gps_enabled !== false) cg124SetEditorStatus("Configuration GPS chargée.");
  else cg124SetEditorStatus("Aucune configuration GPS active pour ce repère.");
}

function cg124ValidateEditor() {
  const code = String(document.getElementById("cg124MarkerSelect")?.value || "").trim();
  const latitude = Number(document.getElementById("cg124Lat")?.value);
  const longitude = Number(document.getElementById("cg124Lon")?.value);
  const radius = Number(document.getElementById("cg124Radius")?.value);
  const rearm = Number(document.getElementById("cg124Rearm")?.value);

  if (!code || !cg124Landmarks.has(code)) throw new Error("Choisis un repère existant.");
  if (!cg124ValidCoord(latitude, longitude)) throw new Error("Latitude / longitude invalides.");
  if (!Number.isFinite(radius) || radius < 5 || radius > 1000) throw new Error("Le rayon d’entrée doit être compris entre 5 et 1 000 m.");
  if (!Number.isFinite(rearm) || rearm < radius + 5 || rearm > 2000) {
    throw new Error("Le rayon de réarmement doit dépasser le rayon d’entrée d’au moins 5 m.");
  }

  return {
    code,
    latitude,
    longitude,
    radius_m: Math.round(radius * 10) / 10,
    rearm_radius_m: Math.round(rearm * 10) / 10
  };
}

function cg124InvalidateHistory(reason) {
  const state = cg124ReadHistory();
  if (!state || state.status === "RUNNING") return;
  state.status = "STALE";
  state.stale_reason = String(reason || "MARKER_CONFIG_CHANGED");
  state.updated_at_ms = Date.now();
  cg124WriteHistory(state);
}

async function cg124SaveMarker() {
  try {
    if (cg124HistoryRunning) {
      throw new Error("Mets d’abord l’indexation historique en pause avant de modifier un repère GPS.");
    }
    const values = cg124ValidateEditor();
    const now = Date.now();
    const old = cg124References.get(values.code) || {};
    const row = {
      ...old,
      landmark_code: values.code,
      latitude: values.latitude,
      longitude: values.longitude,
      lat: values.latitude,
      lon: values.longitude,
      radius_m: values.radius_m,
      rearm_radius_m: values.rearm_radius_m,
      gps_enabled: true,
      gps_config_updated_at_ms: now,
      gps_summary_dirty: true,
      cgweb124_catalog_version: "GPS_MARKER_CATALOG001",
      detector_version: CGWEB124_DETECTOR_VERSION
    };

    cg124SetEditorStatus("Enregistrement Firestore…");
    await cg124CommitInterop({
      table: "personal_landmark_references",
      rowKey: values.code,
      materializedCollection: "landmark_references",
      row
    });

    cg124References.set(values.code, row);
    cg124RebuildMarkers();
    cg124InvalidateHistory("MARKER_CONFIG_CHANGED");
    cg124Render();
    cg124SetEditorStatus("Repère GPS enregistré · index historique à recalculer.");
  } catch (error) {
    console.error("CGWEB124 save marker", error);
    cg124SetEditorStatus(error?.message || String(error), true);
  }
}

async function cg124DisableMarker() {
  if (cg124HistoryRunning) {
    cg124SetEditorStatus("Mets d’abord l’indexation historique en pause avant de désactiver un repère GPS.", true);
    return;
  }
  const code = String(document.getElementById("cg124MarkerSelect")?.value || "").trim();
  if (!code) {
    cg124SetEditorStatus("Choisis un repère à désactiver.", true);
    return;
  }

  const old = cg124References.get(code);
  if (!old) {
    cg124SetEditorStatus("Ce repère n’a pas de configuration GPS.", true);
    return;
  }

  if (!window.confirm(`Désactiver la détection GPS automatique pour ${code} ?\n\nLes repères manuels restent inchangés.`)) return;

  try {
    const row = {
      ...old,
      landmark_code: code,
      gps_enabled: false,
      gps_config_updated_at_ms: Date.now(),
      gps_summary_dirty: true,
      cgweb124_catalog_version: "GPS_MARKER_CATALOG001"
    };

    await cg124CommitInterop({
      table: "personal_landmark_references",
      rowKey: code,
      materializedCollection: "landmark_references",
      row
    });

    cg124References.set(code, row);
    cg124RebuildMarkers();
    cg124InvalidateHistory("MARKER_DISABLED");
    cg124Render();
    cg124SetEditorStatus("Détection GPS désactivée. Les repères manuels n’ont pas été modifiés.");
  } catch (error) {
    console.error("CGWEB124 disable marker", error);
    cg124SetEditorStatus(error?.message || String(error), true);
  }
}

function cg124RenderMarkerList() {
  const host = document.getElementById("cg124MarkerList");
  if (!host) return;
  host.innerHTML = "";

  const rows = [...cg124Markers.values()]
    .sort((a, b) =>
      (Number(cg124Landmarks.get(a.code)?.sort_order) || 9999) -
      (Number(cg124Landmarks.get(b.code)?.sort_order) || 9999) ||
      a.code.localeCompare(b.code, "fr")
    );

  if (!rows.length) {
    host.innerHTML = '<div class="empty">Aucun repère GPS actif. Sélectionne un repère personnel puis renseigne ses coordonnées.</div>';
    return;
  }

  for (const marker of rows) {
    const ref = cg124References.get(marker.code) || {};
    const card = document.createElement("article");
    card.className = "cg124-card";

    const code = document.createElement("div");
    code.className = "cg124-code";
    code.textContent = marker.code;

    const main = document.createElement("div");
    main.className = "cg124-card-main";
    const title = document.createElement("strong");
    title.textContent = marker.name;
    const meta = document.createElement("span");
    meta.textContent =
      `${marker.latitude.toFixed(6)}, ${marker.longitude.toFixed(6)} · entrée ${marker.radius_m} m · réarmement ${marker.rearm_radius_m} m` +
      (ref?.gps_summary_dirty ? " · index à actualiser" : "");
    main.append(title, meta);

    const passages = document.createElement("div");
    passages.className = "cg124-stat";
    passages.innerHTML = `<strong>${cg124FormatNumber(ref?.gps_total_passages)}</strong><span>Passages</span>`;

    const activityCount = document.createElement("div");
    activityCount.className = "cg124-stat";
    activityCount.innerHTML = `<strong>${cg124FormatNumber(ref?.gps_activity_count)}</strong><span>Activités</span>`;

    const last = document.createElement("div");
    last.className = "cg124-stat";
    last.innerHTML = `<strong>${cg124FormatDate(ref?.gps_last_passage_ms)}</strong><span>Dernier passage</span>`;

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary";
    edit.textContent = "Modifier";
    edit.addEventListener("click", () => {
      const select = document.getElementById("cg124MarkerSelect");
      if (select) {
        select.value = marker.code;
        cg124PopulateEditor();
        select.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    card.append(code, main, passages, activityCount, last, edit);
    host.appendChild(card);
  }
}

function cg124Render() {
  const panel = cg124EnsurePanel();
  if (!panel) return;

  cg124PopulateSelect();
  cg124RenderMarkerList();

  const markerCount = document.getElementById("cg124MarkerCount");
  const passageCount = document.getElementById("cg124PassageCount");
  const totalPassages = [...cg124References.values()]
    .filter((ref) => ref?.gps_enabled !== false && cg124ReferenceCoord(ref))
    .reduce((sum, ref) => sum + Math.max(0, Number(ref?.gps_total_passages) || 0), 0);

  if (markerCount) markerCount.textContent = `${cg124Markers.size} repère${cg124Markers.size > 1 ? "s" : ""} GPS`;
  if (passageCount) passageCount.textContent = `${cg124FormatNumber(totalPassages)} passage${totalPassages > 1 ? "s" : ""}`;

  const state = cg124ReadHistory();
  const locked = cg124JoinBusy();
  const start = document.getElementById("cg124StartHistory");
  const resume = document.getElementById("cg124ResumeHistory");
  const pause = document.getElementById("cg124PauseHistory");

  if (start) start.disabled = cg124HistoryRunning || locked || !cg124Markers.size;
  if (resume) resume.disabled = cg124HistoryRunning || locked || !state || !["PAUSED", "STALE"].includes(String(state.status));
  if (pause) pause.disabled = !cg124HistoryRunning;

  const meta = document.getElementById("cg124IndexMeta");
  const bar = document.getElementById("cg124ProgressBar");

  if (locked) {
    if (meta) meta.textContent = cg124IndexLockedReason();
    cg124SetIndexStatus("Les repères GPS peuvent être configurés maintenant ; le balayage historique attend la fin des fusions.");
  } else if (state) {
    const total = Number(state.total || state.queue?.length || 0);
    const cursor = Math.min(Number(state.cursor || 0), total);
    if (meta) {
      meta.textContent =
        `${state.status} · ${cg124FormatNumber(cursor)} / ${cg124FormatNumber(total)} · ` +
        `${cg124FormatNumber(state.indexed_count)} tracé(s) indexé(s) · ` +
        `${cg124FormatNumber(state.route_missing_count)} sans tracé · ` +
        `${cg124FormatNumber(state.error_count)} erreur(s)`;
    }
    if (!cg124HistoryRunning) {
      if (state.status === "COMPLETE") cg124SetIndexStatus("Index historique complet. Les nouvelles activités sont traitées incrémentalement.");
      else if (state.status === "PAUSED") cg124SetIndexStatus("Indexation en pause · Reprendre pour continuer.");
      else if (state.status === "STALE") cg124SetIndexStatus("Configuration des repères modifiée · relance complète recommandée.");
    }
  } else {
    if (meta) meta.textContent = "Aucune indexation historique lancée.";
    if (!cg124HistoryRunning) cg124SetIndexStatus("Prêt pour un premier balayage historique.");
  }

  if (bar) {
    const total = Number(state?.total || state?.queue?.length || 0);
    const cursor = Number(state?.cursor || 0);
    bar.style.width = total > 0 ? `${Math.max(0, Math.min(100, (cursor / total) * 100))}%` : "0%";
  }
}

async function cg124LoadCatalog() {
  if (!cg124User) return;

  const [landmarkSnap, refSnap] = await Promise.all([
    getDocs(cg124UserCollection("landmarks")),
    getDocs(cg124UserCollection("landmark_references"))
  ]);

  cg124Landmarks = new Map();
  landmarkSnap.forEach((item) => {
    const row = item.data() || {};
    const code = String(row.code ?? row.__sportKey ?? item.id).trim();
    if (code) cg124Landmarks.set(code, { __docId: item.id, ...row });
  });

  cg124References = new Map();
  refSnap.forEach((item) => {
    const row = item.data() || {};
    const code = String(row.landmark_code ?? row.__sportKey ?? item.id).trim();
    if (code) cg124References.set(code, { __docId: item.id, ...row });
  });

  cg124RebuildMarkers();
  cg124Render();
}

async function cg124IndexOne(activityDocId, cachedActivity = null) {
  const activityRef = cg124UserDoc("activities", activityDocId);
  let activity = cachedActivity;

  if (!activity) {
    const activitySnap = await getDoc(activityRef);
    if (!activitySnap.exists()) {
      const prior = await getDoc(cg124UserDoc(CGWEB124_INDEX_COLLECTION, cg124IndexDocId(activityDocId)));
      if (prior.exists()) await deleteDoc(prior.ref);
      return { skipped: true, reason: "ACTIVITY_MISSING", hits: {} };
    }
    activity = { __docId: activitySnap.id, ...activitySnap.data() };
  }

  if (activity?.deleted_at_ms != null) {
    const indexRef = cg124UserDoc(CGWEB124_INDEX_COLLECTION, cg124IndexDocId(activityDocId));
    const prior = await getDoc(indexRef);
    if (prior.exists()) await deleteDoc(indexRef);
    return { skipped: true, reason: "ACTIVITY_DELETED", hits: {}, prior: prior.exists() ? prior.data() : null };
  }

  const route = await cg124LoadRoute(activityDocId, activity);
  const markerSignature = cg124MarkerSignature();
  const fingerprint = cg124ActivityFingerprint(activity);

  if (!route?.points?.length) {
    const row = {
      version: CGWEB124_INDEX_VERSION,
      detector_version: CGWEB124_DETECTOR_VERSION,
      activity_doc_id: String(activityDocId),
      activity_id: cg124ActivityId(activity, activityDocId),
      activity_start_time_ms: Number(activity?.start_time_ms || 0),
      activity_title: String(activity?.custom_title || activity?.title || activity?.name || ""),
      sport: Number(activity?.sport || 0),
      sub_sport: Number(activity?.sub_sport ?? activity?.subSport ?? 0),
      route_available: false,
      route_point_count: 0,
      route_fingerprint: fingerprint,
      marker_signature: markerSignature,
      indexed_at_ms: Date.now(),
      hits: {}
    };
    await setDoc(
      cg124UserDoc(CGWEB124_INDEX_COLLECTION, cg124IndexDocId(activityDocId)),
      row,
      { merge: false }
    );
    return { missingRoute: true, hits: {}, row };
  }

  const hits = cg124DetectAllMarkers(route.points);
  const row = {
    version: CGWEB124_INDEX_VERSION,
    detector_version: CGWEB124_DETECTOR_VERSION,
    activity_doc_id: String(activityDocId),
    activity_id: cg124ActivityId(activity, activityDocId),
    activity_start_time_ms: Number(activity?.start_time_ms || 0),
    activity_title: String(activity?.custom_title || activity?.title || activity?.name || ""),
    sport: Number(activity?.sport || 0),
    sub_sport: Number(activity?.sub_sport ?? activity?.subSport ?? 0),
    route_available: true,
    route_key: route.key,
    route_point_count: route.points.length,
    route_fingerprint: fingerprint,
    marker_signature: markerSignature,
    indexed_at_ms: Date.now(),
    hits
  };

  await setDoc(
    cg124UserDoc(CGWEB124_INDEX_COLLECTION, cg124IndexDocId(activityDocId)),
    row,
    { merge: false }
  );

  return { hits, row };
}

async function cg124HistoricalActivities() {
  const snap = await getDocs(cg124UserCollection("activities"));
  const rows = [];
  cg124ActivityCache = new Map();

  snap.forEach((item) => {
    const row = { __docId: item.id, ...item.data() };
    if (row.deleted_at_ms != null) return;

    const gpsCount = Number(row.gps_point_count);
    const routeCount = Number(row.route_point_count);
    const recordCount = Number(row.record_count);

    if (
      Number.isFinite(gpsCount) && gpsCount <= 1 &&
      (!Number.isFinite(routeCount) || routeCount <= 1) &&
      (!Number.isFinite(recordCount) || recordCount <= 1)
    ) {
      return;
    }

    rows.push(row);
    cg124ActivityCache.set(String(item.id), row);
  });

  rows.sort(
    (a, b) =>
      Number(a.start_time_ms || 0) -
      Number(b.start_time_ms || 0)
  );

  return rows;
}

async function cg124FinalizeHistorical(state) {
  const signature = state.marker_signature;
  const now = Date.now();
  const batchSize = 300;
  const markerRows = [...cg124Markers.values()];

  for (let offset = 0; offset < markerRows.length; offset += batchSize) {
    const batch = writeBatch(db);
    for (const marker of markerRows.slice(offset, offset + batchSize)) {
      const sum = state.aggregate?.[marker.code] || {
        total_passages: 0,
        activity_count: 0,
        first_passage_ms: null,
        last_passage_ms: null
      };
      batch.set(
        cg124UserDoc("landmark_references", marker.code),
        {
          gps_total_passages: Math.max(0, Number(sum.total_passages) || 0),
          gps_activity_count: Math.max(0, Number(sum.activity_count) || 0),
          gps_first_passage_ms: Number.isFinite(Number(sum.first_passage_ms)) ? Number(sum.first_passage_ms) : null,
          gps_last_passage_ms: Number.isFinite(Number(sum.last_passage_ms)) ? Number(sum.last_passage_ms) : null,
          gps_indexed_at_ms: now,
          gps_index_marker_signature: signature,
          gps_index_complete: true,
          gps_summary_dirty: false,
          gps_detector_version: CGWEB124_DETECTOR_VERSION,
          gps_history_route_missing_count: Math.max(0, Number(state.route_missing_count) || 0)
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  await cg124LoadCatalog();
}

async function cg124RunHistory(state) {
  if (cg124HistoryRunning) return;
  if (cg124JoinBusy()) {
    cg124SetIndexStatus(cg124IndexLockedReason(), true);
    return;
  }
  if (!cg124Markers.size) {
    cg124SetIndexStatus("Aucun repère GPS actif.", true);
    return;
  }

  const signature = cg124MarkerSignature();
  if (state.marker_signature !== signature) {
    state.status = "STALE";
    state.updated_at_ms = Date.now();
    cg124WriteHistory(state);
    cg124SetIndexStatus("La configuration des repères a changé. Relance une indexation complète.", true);
    cg124Render();
    return;
  }

  cg124HistoryRunning = true;
  cg124HistoryStop = false;
  state.status = "RUNNING";
  state.updated_at_ms = Date.now();
  cg124WriteHistory(state);
  cg124Render();

  try {
    while (state.cursor < state.queue.length) {
      if (state.marker_signature !== cg124MarkerSignature()) {
        state.status = "STALE";
        state.updated_at_ms = Date.now();
        state.stale_reason = "MARKER_CONFIG_CHANGED_DURING_SCAN";
        cg124WriteHistory(state);
        cg124SetIndexStatus("Configuration des repères modifiée pendant le balayage · indexation arrêtée.", true);
        return;
      }

      if (cg124HistoryStop || cg124JoinBusy()) {
        state.status = "PAUSED";
        state.updated_at_ms = Date.now();
        state.pause_reason = cg124JoinBusy() ? "JOIN_BATCH_ACTIVE" : "USER";
        cg124WriteHistory(state);
        cg124SetIndexStatus(
          cg124JoinBusy()
            ? "Pause automatique : des jonctions sont actives."
            : "Indexation en pause."
        );
        return;
      }

      const ids = state.queue.slice(state.cursor, state.cursor + CGWEB124_HISTORY_CHUNK);
      cg124SetIndexStatus(
        `HISTORICAL_MARKER_INDEX001 · ${cg124FormatNumber(state.cursor + 1)} à ${cg124FormatNumber(Math.min(state.cursor + ids.length, state.total))} / ${cg124FormatNumber(state.total)}`
      );

      const results = await Promise.all(
        ids.map(async (activityDocId) => {
          try {
            const cached = cg124ActivityCache.get(String(activityDocId)) || null;
            const result = await cg124IndexOne(activityDocId, cached);
            return { activityDocId, result, error: null };
          } catch (error) {
            return { activityDocId, result: null, error };
          }
        })
      );

      for (const item of results) {
        if (item.error) {
          state.error_count += 1;
          state.last_error = `${item.activityDocId}: ${item.error?.message || item.error}`;
          continue;
        }
        if (item.result?.missingRoute) state.route_missing_count += 1;
        else if (!item.result?.skipped) state.indexed_count += 1;

        cg124MergeAggregate(state.aggregate, item.result?.hits || {});
      }

      state.cursor += ids.length;
      state.updated_at_ms = Date.now();
      cg124WriteHistory(state);
      cg124Render();

      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    await cg124FinalizeHistorical(state);
    state.status = "COMPLETE";
    state.completed_at_ms = Date.now();
    state.updated_at_ms = Date.now();
    cg124WriteHistory(state);
    cg124SetIndexStatus("Index historique terminé · INCREMENTAL_MARKER_REFRESH001 reste actif pour les nouvelles activités.");
  } catch (error) {
    console.error("CGWEB124 historical", error);
    state.status = "PAUSED";
    state.error_count = Math.max(0, Number(state.error_count) || 0) + 1;
    state.last_error = error?.message || String(error);
    state.updated_at_ms = Date.now();
    cg124WriteHistory(state);
    cg124SetIndexStatus("Indexation interrompue : " + state.last_error, true);
  } finally {
    cg124HistoryRunning = false;
    cg124HistoryStop = false;
    cg124Render();
  }
}

async function cg124StartHistory() {
  if (cg124HistoryRunning) return;
  if (cg124JoinBusy()) {
    cg124SetIndexStatus(cg124IndexLockedReason(), true);
    return;
  }
  if (!cg124Markers.size) {
    cg124SetIndexStatus("Crée au moins un repère GPS avant l’indexation.", true);
    return;
  }

  try {
    cg124SetIndexStatus("Lecture des activités Firestore…");
    const rows = await cg124HistoricalActivities();
    if (!rows.length) {
      cg124SetIndexStatus("Aucune activité exploitable à indexer.", true);
      return;
    }

    if (!window.confirm(
      `Indexer ${rows.length.toLocaleString("fr-FR")} activité(s) pour ${cg124Markers.size} repère(s) GPS ?\n\n` +
      "Le traitement est reprenable. Les repères manuels ne seront jamais écrasés."
    )) return;

    const state = {
      version: 1,
      build: CGWEB124_BUILD,
      status: "READY",
      marker_signature: cg124MarkerSignature(),
      queue: rows.map((row) => String(row.__docId)),
      cursor: 0,
      total: rows.length,
      indexed_count: 0,
      route_missing_count: 0,
      error_count: 0,
      aggregate: cg124EmptyAggregate(),
      started_at_ms: Date.now(),
      completed_at_ms: null,
      updated_at_ms: Date.now(),
      detector_version: CGWEB124_DETECTOR_VERSION
    };
    cg124WriteHistory(state);
    void cg124RunHistory(state);
  } catch (error) {
    console.error("CGWEB124 start history", error);
    cg124SetIndexStatus(error?.message || String(error), true);
  }
}

async function cg124ResumeHistory() {
  if (cg124HistoryRunning) return;
  const state = cg124ReadHistory();
  if (!state) {
    cg124SetIndexStatus("Aucune indexation à reprendre.", true);
    return;
  }
  if (state.status === "STALE") {
    cg124SetIndexStatus("La configuration a changé : utilise « Indexer tout l’historique » pour repartir d’un snapshot cohérent.", true);
    return;
  }
  void cg124RunHistory(state);
}

function cg124HitCount(hits, code) {
  return Math.max(0, Number(hits?.[code]?.passage_count) || 0);
}

async function cg124UpdateIncrementalSummaries(prior, next, activity) {
  const signature = cg124MarkerSignature();
  const startMs = Number(activity?.start_time_ms || 0);
  const codes = new Set([
    ...Object.keys(prior?.hits || {}),
    ...Object.keys(next?.hits || {})
  ]);

  for (const code of codes) {
    const marker = cg124Markers.get(code);
    if (!marker) continue;

    const oldCount = cg124HitCount(prior?.hits, code);
    const newCount = cg124HitCount(next?.hits, code);
    const oldHit = prior?.hits?.[code] || null;
    const newHit = next?.hits?.[code] || null;
    const sameHit =
      oldCount === newCount &&
      Number(oldHit?.first_passage_ms || 0) === Number(newHit?.first_passage_ms || 0) &&
      Number(oldHit?.last_passage_ms || 0) === Number(newHit?.last_passage_ms || 0);
    if (sameHit) continue;

    const refSnap = await getDoc(cg124UserDoc("landmark_references", code));
    if (!refSnap.exists()) continue;
    const ref = refSnap.data() || {};

    if (
      ref?.gps_index_complete !== true ||
      String(ref?.gps_index_marker_signature || "") !== signature
    ) {
      await setDoc(
        refSnap.ref,
        { gps_summary_dirty: true },
        { merge: true }
      );
      continue;
    }

    const oldActive = oldCount > 0 ? 1 : 0;
    const newActive = newCount > 0 ? 1 : 0;
    const total = Math.max(0, Number(ref?.gps_total_passages || 0) + (newCount - oldCount));
    const activityCount = Math.max(0, Number(ref?.gps_activity_count || 0) + (newActive - oldActive));

    let first = Number(ref?.gps_first_passage_ms);
    let last = Number(ref?.gps_last_passage_ms);
    const nextHit = next?.hits?.[code];
    const nextFirst = Number(nextHit?.first_passage_ms || startMs);
    const nextLast = Number(nextHit?.last_passage_ms || startMs);

    if (newCount > 0) {
      if (Number.isFinite(nextFirst) && nextFirst > 0) first = Number.isFinite(first) && first > 0 ? Math.min(first, nextFirst) : nextFirst;
      if (Number.isFinite(nextLast) && nextLast > 0) last = Number.isFinite(last) && last > 0 ? Math.max(last, nextLast) : nextLast;
    }

    await setDoc(
      refSnap.ref,
      {
        gps_total_passages: total,
        gps_activity_count: activityCount,
        gps_first_passage_ms: Number.isFinite(first) && first > 0 ? first : null,
        gps_last_passage_ms: Number.isFinite(last) && last > 0 ? last : null,
        gps_summary_dirty:
          oldCount > newCount ||
          (
            oldCount > 0 &&
            newCount > 0 &&
            (
              Number(oldHit?.first_passage_ms || 0) !== Number(newHit?.first_passage_ms || 0) ||
              Number(oldHit?.last_passage_ms || 0) !== Number(newHit?.last_passage_ms || 0)
            )
          ) ||
          Boolean(ref?.gps_summary_dirty),
        gps_incremental_updated_at_ms: Date.now(),
        gps_detector_version: CGWEB124_DETECTOR_VERSION
      },
      { merge: true }
    );
  }
}

async function cg124IncrementalIndex(activityDocId, activity) {
  if (!cg124User || !cg124Markers.size) return;
  if (cg124JoinBusy() || cg124HistoryRunning) {
    cg124IncrementalPending.add(String(activityDocId));
    return;
  }

  const indexRef = cg124UserDoc(CGWEB124_INDEX_COLLECTION, cg124IndexDocId(activityDocId));
  const priorSnap = await getDoc(indexRef);
  const prior = priorSnap.exists() ? priorSnap.data() : null;

  if (activity?.deleted_at_ms != null) {
    if (priorSnap.exists()) {
      await deleteDoc(indexRef);
      await cg124UpdateIncrementalSummaries(prior, { hits: {} }, activity);
    }
    return;
  }

  const signature = cg124MarkerSignature();
  const fingerprint = cg124ActivityFingerprint(activity);
  if (
    prior &&
    String(prior.marker_signature || "") === signature &&
    String(prior.route_fingerprint || "") === fingerprint
  ) {
    return;
  }

  const result = await cg124IndexOne(activityDocId, { __docId: activityDocId, ...activity });
  if (result?.row) {
    await cg124UpdateIncrementalSummaries(prior, result.row, activity);
  }
}

function cg124ScheduleIncremental(activityDocId, activity) {
  const key = String(activityDocId || "");
  if (!key) return;

  cg124IncrementalChain = cg124IncrementalChain
    .then(() => cg124IncrementalIndex(key, activity))
    .catch((error) => {
      console.warn("CGWEB124 incremental", key, error);
      cg124IncrementalPending.add(key);
    });
}

async function cg124FlushIncrementalPending() {
  if (!cg124User || cg124JoinBusy() || cg124HistoryRunning || !cg124IncrementalPending.size) return;

  const ids = [...cg124IncrementalPending];
  cg124IncrementalPending.clear();

  for (const id of ids) {
    try {
      const snap = await getDoc(cg124UserDoc("activities", id));
      if (!snap.exists()) continue;
      cg124ScheduleIncremental(id, snap.data());
    } catch (error) {
      console.warn("CGWEB124 incremental retry", id, error);
      cg124IncrementalPending.add(id);
    }
  }
}

function cg124StartIncrementalWatch() {
  if (cg124UnsubscribeActivities) {
    try { cg124UnsubscribeActivities(); } catch (_) {}
    cg124UnsubscribeActivities = null;
  }
  if (!cg124User) return;

  const q = query(
    cg124UserCollection("activities"),
    orderBy("start_time_ms", "desc"),
    limit(CGWEB124_INCREMENTAL_LIMIT)
  );

  cg124UnsubscribeActivities = onSnapshot(
    q,
    (snap) => {
      for (const change of snap.docChanges()) {
        if (!["added", "modified"].includes(change.type)) continue;
        cg124ScheduleIncremental(change.doc.id, change.doc.data());
      }
    },
    (error) => {
      console.warn("CGWEB124 incremental watch", error);
      cg124SetIndexStatus("INCREMENTAL_MARKER_REFRESH001 indisponible : " + (error?.message || error), true);
    }
  );
}

async function cg124Boot(user) {
  cg124User = user || null;
  cg124Landmarks = new Map();
  cg124References = new Map();
  cg124Markers = new Map();
  cg124ActivityCache = new Map();

  if (!cg124User) {
    if (cg124UnsubscribeActivities) {
      try { cg124UnsubscribeActivities(); } catch (_) {}
      cg124UnsubscribeActivities = null;
    }
    cg124Render();
    cg124SetEditorStatus("Connexion SPORT requise.");
    cg124SetIndexStatus("Connexion SPORT requise.");
    return;
  }

  try {
    await cg124LoadCatalog();
    cg124StartIncrementalWatch();
    cg124Render();
  } catch (error) {
    console.error("CGWEB124 boot", error);
    cg124SetIndexStatus("Initialisation CGWEB124 impossible : " + (error?.message || error), true);
  }
}

onAuthStateChanged(auth, (user) => {
  void cg124Boot(user);
});

cg124EnsurePanel();
cg124Render();

cg124UiTimer = window.setInterval(() => {
  cg124Render();
  void cg124FlushIncrementalPending();
}, 15000);

window.addEventListener("beforeunload", () => {
  if (cg124UiTimer) clearInterval(cg124UiTimer);
  if (cg124UnsubscribeActivities) {
    try { cg124UnsubscribeActivities(); } catch (_) {}
  }
});

window.CGWEB124_STATUS = () => {
  const state = cg124ReadHistory();
  return {
    build: CGWEB124_BUILD,
    gps_marker_catalog: "GPS_MARKER_CATALOG001",
    multipass_detector: "MULTIPASS_DETECTOR001",
    hysteresis_rearm: "HYSTERESIS_REARM001",
    segment_proximity: "SEGMENT_PROXIMITY001",
    historical_marker_index: "HISTORICAL_MARKER_INDEX001",
    incremental_marker_refresh: "INCREMENTAL_MARKER_REFRESH001",
    marker_count: cg124Markers.size,
    marker_signature: cg124MarkerSignature(),
    join_batch_locked: cg124JoinBusy(),
    history_status: state?.status || null,
    history_cursor: state?.cursor || 0,
    history_total: state?.total || 0,
    history_indexed: state?.indexed_count || 0,
    history_route_missing: state?.route_missing_count || 0,
    history_errors: state?.error_count || 0,
    incremental_pending: cg124IncrementalPending.size
  };
};

console.info(
  "CGWEB124 actif · GPS_MARKER_CATALOG001 / MULTIPASS_DETECTOR001 / HYSTERESIS_REARM001 / SEGMENT_PROXIMITY001 / HISTORICAL_MARKER_INDEX001 / INCREMENTAL_MARKER_REFRESH001"
);
/* CGWEB125_FIX1_GPS_INDEX_UNLOCK_START
   GPS_INDEX_UNLOCK001
*/

const cgweb125Fix1BaseGpsJoinBusy = cg124JoinBusy;
const cgweb125Fix1BaseGpsLockedReason = cg124IndexLockedReason;
const cgweb125Fix1BaseGpsRender = cg124Render;

function cgweb125Fix1ServerJoinStatus() {
  try {
    return window.CGWEB123_FIX4_STATUS?.() || null;
  } catch (_) {
    return null;
  }
}

function cgweb125Fix1ServerStatusName() {
  return String(
    cgweb125Fix1ServerJoinStatus()?.batch_status || ""
  ).toUpperCase();
}

cg124JoinBusy = function() {
  const server = cgweb125Fix1ServerJoinStatus();
  const status = String(server?.batch_status || "").toUpperCase();

  if (server?.completed === true || status === "COMPLETE") {
    return false;
  }

  if (
    ["IMPORTING", "RUNNING", "RETRYING", "PAUSING", "PAUSED", "READY"]
      .includes(status)
  ) {
    return true;
  }

  const local = cg124JoinStatus();
  const localStatus = String(local?.batch_status || "").toUpperCase();

  if (
    localStatus === "SERVER_HANDOFF" &&
    server?.server_batch_id &&
    !status
  ) {
    return true;
  }

  return cgweb125Fix1BaseGpsJoinBusy();
};

cg124IndexLockedReason = function() {
  const server = cgweb125Fix1ServerJoinStatus();
  const status = String(server?.batch_status || "").toUpperCase();

  if (server?.completed === true || status === "COMPLETE") {
    return "";
  }

  if (cg124JoinBusy()) {
    if (status) {
      return (
        "Indexation historique verrouillée pendant le lot serveur de jonctions" +
        ` (${status}).`
      );
    }

    if (server?.server_batch_id) {
      return "Vérification du lot serveur de jonctions avant déverrouillage GPS…";
    }
  }

  return cgweb125Fix1BaseGpsLockedReason();
};

cg124Render = function() {
  cgweb125Fix1BaseGpsRender();

  const server = cgweb125Fix1ServerJoinStatus();
  const complete =
    server?.completed === true ||
    String(server?.batch_status || "").toUpperCase() === "COMPLETE";

  if (!complete) return;

  const state = cg124ReadHistory();
  const meta = document.getElementById("cg124IndexMeta");

  if (meta && !state) {
    meta.textContent =
      "Jonctions serveur terminées · indexation GPS historique disponible.";
  }

  if (!state && !cg124HistoryRunning) {
    cg124SetIndexStatus(
      cg124Markers.size
        ? "GPS_INDEX_UNLOCK001 · prêt à indexer l’historique."
        : "GPS_INDEX_UNLOCK001 · ajoute au moins un repère GPS pour lancer l’indexation."
    );
  }
};

window.addEventListener(
  "sport-server-join-batch-status",
  () => queueMicrotask(() => cg124Render())
);

window.CGWEB124_GPS_INDEX_UNLOCK_STATUS = () => ({
  build: "CGWEB125_FIX1",
  marker: "GPS_INDEX_UNLOCK001",
  server_status: cgweb125Fix1ServerStatusName() || null,
  join_busy: cg124JoinBusy(),
  index_unlocked: !cg124JoinBusy(),
  marker_count: cg124Markers.size
});

queueMicrotask(() => cg124Render());

console.info(
  "CGWEB125 FIX1 · GPS_INDEX_UNLOCK001 actif"
);

/* CGWEB125_FIX1_GPS_INDEX_UNLOCK_END */
