const {onRequest} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {defineSecret, defineString} = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

const STRAVA_CLIENT_ID = defineString("STRAVA_CLIENT_ID");
const STRAVA_CLIENT_SECRET = defineSecret("STRAVA_CLIENT_SECRET");
const STRAVA_REDIRECT_URI = defineString("STRAVA_REDIRECT_URI");
const REGION = "europe-west1";
const ROOT = "sport_users";
const WEBSTRAVA_VERSION = "WEBSTRAVA003";
const WEBSTRAVA_TREADMILL_SLOPE_PERCENT = 12;
const WEBSTRAVA_DUPLICATE_TIME_WINDOW_MS = 2 * 60 * 1000;
// CI héritage WEB043 : const WEBSPLIT_VERSION = "WEBSPLIT002"
const WEBSPLIT_VERSION = "WEBSPLIT003";
const WEBSPLIT_AUTO_GAP_MS = 15 * 60 * 1000;
const WEBSPLIT_GAP_SPLIT_ENABLED = false; // CGWEB121 FIX3 · GAP_SPLIT_PAUSE001
const WEBSPLIT_INACTIVE_SPEED_MPS = 0.30;
const WEBSPLIT_INACTIVE_MERGE_MS = 2 * 60 * 1000;
const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const STRAVA_API_FALLBACK_BASE = "https://api-v3.strava.com";
const STRAVA_PUSH_SUBSCRIPTIONS_URL = "https://www.strava.com/api/v3/push_subscriptions";

function firestore() {
  return admin.firestore();
}

function cors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

async function requireUser(req) {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) {
    throw Object.assign(new Error("Firebase bearer token manquant."), {status:401});
  }
  return admin.auth().verifyIdToken(auth.slice(7));
}

function integrationRef(uid) {
  return firestore().doc(`${ROOT}/${uid}/integrations/strava`);
}

function athleteMapRef(athleteId) {
  return firestore().doc(`strava_athletes/${String(athleteId)}`);
}

function webhookConfigRef() {
  return firestore().doc("strava_webhook_config/current");
}

async function tokenDocument(uid) {
  const snap = await integrationRef(uid).get();
  return snap.exists ? snap.data() : null;
}

async function exchangeCode(code) {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      client_id:STRAVA_CLIENT_ID.value(),
      client_secret:STRAVA_CLIENT_SECRET.value(),
      code,
      grant_type:"authorization_code"
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message || `Strava token ${response.status}`);
  return payload;
}

async function refreshTokenIfNeeded(uid, data) {
  if (!data?.refresh_token) throw Object.assign(new Error("Strava non connecté."), {status:409});
  const now = Math.floor(Date.now() / 1000);
  if (Number(data.expires_at) > now + 120 && data.access_token) return data;

  const response = await fetch("https://www.strava.com/oauth/token", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      client_id:STRAVA_CLIENT_ID.value(),
      client_secret:STRAVA_CLIENT_SECRET.value(),
      grant_type:"refresh_token",
      refresh_token:data.refresh_token
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message || `Strava refresh ${response.status}`);

  const updated = {
    ...data,
    access_token:payload.access_token,
    refresh_token:payload.refresh_token,
    expires_at:payload.expires_at,
    updated_at_ms:Date.now()
  };
  await integrationRef(uid).set(updated, {merge:true});
  return updated;
}

async function fetchJsonWithFallback(path, token) {
  const urls = [
    `${STRAVA_API_BASE}${path}`,
    `${STRAVA_API_FALLBACK_BASE}${path}`
  ];
  let lastError = null;

  for (let index = 0; index < urls.length; index++) {
    let response = null;
    try {
      response = await fetch(urls[index], {
        headers:{Authorization:`Bearer ${token}`}
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (index < urls.length - 1) continue;
      break;
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (response.ok) return payload;

    lastError = Object.assign(
      new Error(payload?.message || `Strava API ${response.status}`),
      {status:response.status}
    );

    // Le second endpoint est uniquement un filet de compatibilité pendant
    // la migration du domaine API Strava 2026.
    if (index === 0 && (response.status === 404 || response.status >= 500)) continue;
    break;
  }

  throw lastError || new Error("Strava API indisponible.");
}

async function stravaGet(uid, path) {
  const current = await tokenDocument(uid);
  const token = await refreshTokenIfNeeded(uid, current);
  return fetchJsonWithFallback(path, token.access_token);
}

function callbackHtml(ok, message) {
  const safe = String(message || "").replace(/[<>&"]/g, (c) => ({"<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;"}[c]));
  return `<!doctype html><meta charset="utf-8"><title>SPORT · Strava</title>
  <body style="font-family:system-ui;background:#0a0d0b;color:#eee;padding:40px">
  <h1>${ok ? "Strava connecté" : "Connexion impossible"}</h1><p>${safe}</p>
  <script>setTimeout(()=>window.close(),1200)</script></body>`;
}

function projectId() {
  return String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "sport-505813");
}

function webhookCallbackUrl() {
  return `https://${REGION}-${projectId()}.cloudfunctions.net/stravaWebhook`;
}

function webhookVerifyToken() {
  return crypto
    .createHash("sha256")
    .update(`${WEBSTRAVA_VERSION}|${projectId()}|${STRAVA_CLIENT_SECRET.value()}`)
    .digest("hex")
    .slice(0, 40);
}

async function mapAthleteToUid(uid, athlete) {
  const athleteId = Number(athlete?.id);
  if (!Number.isFinite(athleteId) || athleteId <= 0) return;
  await athleteMapRef(athleteId).set({
    uid,
    athlete_id:athleteId,
    updated_at_ms:Date.now(),
    source:WEBSTRAVA_VERSION
  }, {merge:true});
}

async function resolveUidForAthlete(ownerId) {
  const athleteId = Number(ownerId);
  if (!Number.isFinite(athleteId) || athleteId <= 0) return null;

  const direct = await athleteMapRef(athleteId).get();
  if (direct.exists && direct.data()?.uid) return String(direct.data().uid);

  // Compatibilité avec les connexions Strava créées avant WEBSTRAVA003.
  // Une seule requête collectionGroup permet de reconstruire le mapping.
  try {
    const snap = await firestore()
      .collectionGroup("integrations")
      .where("athlete.id", "==", athleteId)
      .limit(2)
      .get();
    for (const doc of snap.docs) {
      if (doc.id !== "strava") continue;
      const parts = doc.ref.path.split("/");
      if (parts.length >= 4 && parts[0] === ROOT) {
        const uid = parts[1];
        await athleteMapRef(athleteId).set({
          uid,
          athlete_id:athleteId,
          updated_at_ms:Date.now(),
          source:`${WEBSTRAVA_VERSION}_RECOVERED`
        }, {merge:true});
        return uid;
      }
    }
  } catch (error) {
    console.warn("WEBSTRAVA003 athlete mapping fallback", athleteId, error?.message || error);
  }

  return null;
}

async function listWebhookSubscriptions() {
  const url = new URL(STRAVA_PUSH_SUBSCRIPTIONS_URL);
  url.searchParams.set("client_id", String(STRAVA_CLIENT_ID.value()));
  url.searchParams.set("client_secret", STRAVA_CLIENT_SECRET.value());
  const response = await fetch(url, {method:"GET"});
  const payload = await response.json().catch(() => []);
  if (!response.ok) throw new Error(payload?.message || `Strava subscriptions ${response.status}`);
  return Array.isArray(payload) ? payload : [];
}

async function createWebhookSubscription() {
  const body = new URLSearchParams();
  body.set("client_id", String(STRAVA_CLIENT_ID.value()));
  body.set("client_secret", STRAVA_CLIENT_SECRET.value());
  body.set("callback_url", webhookCallbackUrl());
  body.set("verify_token", webhookVerifyToken());

  const response = await fetch(STRAVA_PUSH_SUBSCRIPTIONS_URL, {
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:body.toString()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || `Création webhook Strava ${response.status}`);
  return payload;
}

async function deleteWebhookSubscription(id) {
  const url = new URL(`${STRAVA_PUSH_SUBSCRIPTIONS_URL}/${encodeURIComponent(String(id))}`);
  url.searchParams.set("client_id", String(STRAVA_CLIENT_ID.value()));
  url.searchParams.set("client_secret", STRAVA_CLIENT_SECRET.value());
  const response = await fetch(url, {method:"DELETE"});
  if (!response.ok && response.status !== 404) {
    throw new Error(`Suppression webhook Strava ${response.status}`);
  }
}

async function ensureWebhookSubscription(options = {}) {
  const now = Date.now();
  const callback = webhookCallbackUrl();
  const configSnap = await webhookConfigRef().get();
  const config = configSnap.exists ? configSnap.data() : null;

  if (!options.force && config?.active === true && config?.callback_url === callback &&
      now - Number(config?.checked_at_ms || 0) < 24 * 60 * 60 * 1000) {
    return config;
  }

  const subscriptions = await listWebhookSubscriptions();
  let current = subscriptions.find((item) => String(item?.callback_url || "") === callback) || null;

  if (!current && subscriptions.length) {
    // Strava n'autorise qu'une seule subscription par application. Si une ancienne
    // callback existe, elle est remplacée par celle de WEBSTRAVA003.
    for (const item of subscriptions) {
      if (item?.id != null) await deleteWebhookSubscription(item.id);
    }
  }

  if (!current) current = await createWebhookSubscription();

  const state = {
    active:true,
    subscription_id:Number(current?.id || 0) || null,
    callback_url:callback,
    checked_at_ms:now,
    version:WEBSTRAVA_VERSION
  };
  await webhookConfigRef().set(state, {merge:true});
  return state;
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function stravaSportToFitSport(type, sportType) {
  const value = String(sportType || type || "").toLowerCase();
  if (value.includes("run")) return 1;
  if (value.includes("ride") || value.includes("cycle")) return 2;
  if (value.includes("walk")) return 11;
  if (value.includes("hike")) return 17;
  if (value.includes("swim")) return 5;
  return 0;
}

function stravaStartMs(activity) {
  const value = Date.parse(activity?.start_date || activity?.start_date_local || "");
  return Number.isFinite(value) ? value : null;
}

function isKinomapActivity(activity) {
  const text = [activity?.name, activity?.device_name]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return text.includes("kinomap");
}

function isTreadmillActivity(activity) {
  if (stravaSportToFitSport(activity?.type, activity?.sport_type) !== 1) return false;
  const text = [activity?.sport_type, activity?.type, activity?.name, activity?.device_name]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return Boolean(activity?.trainer) ||
    text.includes("virtualrun") ||
    text.includes("virtual run") ||
    text.includes("treadmill") ||
    text.includes("tapis") ||
    text.includes("kinomap");
}

function treadmillAscentMeters(distanceMeters, slopePercent = WEBSTRAVA_TREADMILL_SLOPE_PERCENT) {
  return Math.max(0, Math.round(numberOrZero(distanceMeters) * Math.max(0, numberOrZero(slopePercent)) / 100));
}

function applyTreadmillSlope(route, totalDistanceMeters, slopePercent = WEBSTRAVA_TREADMILL_SLOPE_PERCENT) {
  const count = Math.max(
    route?.lat?.length || 0,
    route?.lon?.length || 0,
    route?.alt_m?.length || 0,
    route?.distance_m?.length || 0,
    route?.time_ms?.length || 0
  );
  if (!route || count <= 0) return route;

  const total = Math.max(0, numberOrZero(totalDistanceMeters));
  const slope = Math.max(0, numberOrZero(slopePercent));
  const firstAltitude = (route.alt_m || []).find((value) => Number.isFinite(Number(value)));
  const baseAltitude = Number.isFinite(Number(firstAltitude)) ? Number(firstAltitude) : 0;
  let previousDistance = 0;

  while (route.distance_m.length < count) route.distance_m.push(null);
  while (route.alt_m.length < count) route.alt_m.push(null);

  for (let index = 0; index < count; index++) {
    const stored = Number(route.distance_m[index]);
    let distance = Number.isFinite(stored) && stored >= 0
      ? stored
      : (count <= 1 ? 0 : total * index / (count - 1));
    distance = Math.max(previousDistance, Math.min(total, distance));
    previousDistance = distance;
    route.distance_m[index] = distance;
    route.alt_m[index] = baseAltitude + distance * slope / 100;
  }

  route.route_format = "WEBSTRAVA003-TREADMILL12";
  return route;
}

function makeActivityId(startMs, stravaId) {
  const base = Math.max(1, Math.floor(Number(startMs) || Date.now()));
  const text = String(stravaId || "");
  let suffix = 0;
  for (let index = 0; index < text.length; index++) {
    suffix = (suffix * 31 + text.charCodeAt(index)) % 1000;
  }
  return base * 1000 + suffix;
}

function normalizeStravaDetailServer(payload) {
  const a = payload.activity || {};
  const streams = payload.streams || {};
  const latlng = Array.isArray(streams.latlng?.data) ? streams.latlng.data : [];
  const time = Array.isArray(streams.time?.data) ? streams.time.data : [];
  const distance = Array.isArray(streams.distance?.data) ? streams.distance.data : [];
  const altitude = Array.isArray(streams.altitude?.data) ? streams.altitude.data : [];
  const hr = Array.isArray(streams.heartrate?.data) ? streams.heartrate.data : [];
  const speed = Array.isArray(streams.velocity_smooth?.data) ? streams.velocity_smooth.data : [];
  const cadence = Array.isArray(streams.cadence?.data) ? streams.cadence.data : [];
  const moving = Array.isArray(streams.moving?.data) ? streams.moving.data : [];

  const startMs = stravaStartMs(a);
  const count = Math.max(latlng.length, time.length, distance.length, altitude.length, hr.length, speed.length, cadence.length, moving.length);
  const route = {
    lat:[], lon:[], alt_m:[], distance_m:[], time_ms:[], hr_bpm:[], speed_mps:[], cadence:[], moving:[],
    source_point_count:count,
    web_preview_point_count:count,
    route_format:WEBSTRAVA_VERSION
  };

  for (let index = 0; index < count; index++) {
    const ll = latlng[index];
    route.lat.push(Array.isArray(ll) && Number.isFinite(Number(ll[0])) ? Number(ll[0]) : null);
    route.lon.push(Array.isArray(ll) && Number.isFinite(Number(ll[1])) ? Number(ll[1]) : null);
    route.alt_m.push(serverFiniteNumber(altitude[index]));
    route.distance_m.push(serverFiniteNumber(distance[index]));
    const relativeTime = serverFiniteNumber(time[index]);
    route.time_ms.push(relativeTime != null && Number.isFinite(startMs) ? startMs + relativeTime * 1000 : null);
    route.hr_bpm.push(serverFiniteNumber(hr[index]));
    route.speed_mps.push(serverFiniteNumber(speed[index]));
    route.cadence.push(serverFiniteNumber(cadence[index]));
    route.moving.push(typeof moving[index] === "boolean" ? moving[index] : null);
  }

  const treadmill = isTreadmillActivity(a);
  const kinomap = isKinomapActivity(a);
  const distanceMeters = numberOrZero(a.distance);
  if (treadmill) applyTreadmillSlope(route, distanceMeters, WEBSTRAVA_TREADMILL_SLOPE_PERCENT);

  const activity = {
    id:makeActivityId(startMs, a.id),
    sport:stravaSportToFitSport(a.type, a.sport_type),
    sub_sport:treadmill ? 21 : 0,
    start_time_ms:startMs,
    elapsed_time_ms:numberOrZero(a.elapsed_time) * 1000,
    timer_time_ms:numberOrZero(a.moving_time) * 1000 || numberOrZero(a.elapsed_time) * 1000,
    distance_m:distanceMeters,
    ascent_m:treadmill ? treadmillAscentMeters(distanceMeters) : numberOrZero(a.total_elevation_gain),
    descent_m:0,
    calories:Number.isFinite(Number(a.calories)) && Number(a.calories) > 0 ? Math.round(Number(a.calories)) : null,
    avg_hr:Number.isFinite(Number(a.average_heartrate)) ? Math.round(Number(a.average_heartrate)) : null,
    max_hr:Number.isFinite(Number(a.max_heartrate)) ? Math.round(Number(a.max_heartrate)) : null,
    avg_speed_mps:Number.isFinite(Number(a.average_speed)) ? Number(a.average_speed) : null,
    max_speed_mps:Number.isFinite(Number(a.max_speed)) ? Number(a.max_speed) : null,
    custom_title:String(a.name || "").trim(),
    equipment_name:"",
    equipment_manual:0,
    strava_activity_id:String(a.id),
    strava_type:a.type || null,
    strava_sport_type:a.sport_type || null,
    strava_device_name:a.device_name || null,
    import_source:kinomap ? "KINOMAP_STRAVA_WEB" : "STRAVA_WEB",
    import_profile:treadmill ? "WEBSTRAVA003_TREADMILL12" : WEBSTRAVA_VERSION,
    imported_at_ms:Date.now(),
    gps_point_count:route.lat.filter((value, index) => Number.isFinite(value) && Number.isFinite(route.lon[index])).length,
    record_count:count,
    deleted_at_ms:null
  };

  return {activity, route};
}


function serverRouteCount(route) {
  return Math.max(
    route?.lat?.length || 0,
    route?.lon?.length || 0,
    route?.alt_m?.length || 0,
    route?.distance_m?.length || 0,
    route?.time_ms?.length || 0,
    route?.hr_bpm?.length || 0,
    route?.speed_mps?.length || 0,
    route?.cadence?.length || 0,
    route?.moving?.length || 0
  );
}

function serverSliceRoute(route, startIndex, endIndex) {
  const start = Math.max(0, Number(startIndex) || 0);
  const end = Math.max(start, Number(endIndex) || start);
  const fields = ["lat", "lon", "alt_m", "distance_m", "time_ms", "hr_bpm", "speed_mps", "cadence", "moving"];
  const sliced = {};
  for (const field of fields) {
    const source = Array.isArray(route?.[field]) ? route[field] : [];
    sliced[field] = source.slice(start, end + 1);
  }

  const firstDistance = sliced.distance_m.find((value) => Number.isFinite(Number(value)));
  const baseDistance = Number.isFinite(Number(firstDistance)) ? Number(firstDistance) : 0;
  sliced.distance_m = sliced.distance_m.map((value) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, n - baseDistance) : null;
  });

  const count = Math.max(...fields.map((field) => sliced[field].length), 0);
  sliced.source_point_count = count;
  sliced.web_preview_point_count = count;
  sliced.route_format = `${WEBSTRAVA_VERSION}-${WEBSPLIT_VERSION}`;
  return sliced;
}

function serverRouteStats(route) {
  const count = serverRouteCount(route);
  if (count < 2) return null;

  const times = Array.isArray(route.time_ms) ? route.time_ms.map(Number) : [];
  const validTimes = times.filter(Number.isFinite);
  const startTime = validTimes.length ? validTimes[0] : null;
  const endTime = validTimes.length ? validTimes[validTimes.length - 1] : null;
  const elapsed = Number.isFinite(startTime) && Number.isFinite(endTime) && endTime >= startTime
    ? endTime - startTime : null;

  const distances = Array.isArray(route.distance_m) ? route.distance_m.map(Number) : [];
  const validDistances = distances.filter(Number.isFinite);
  const distance = validDistances.length >= 2
    ? Math.max(0, validDistances[validDistances.length - 1] - validDistances[0])
    : 0;

  let ascent = 0;
  let descent = 0;
  const alts = Array.isArray(route.alt_m) ? route.alt_m.map(Number) : [];
  for (let index = 1; index < alts.length; index++) {
    const previous = alts[index - 1];
    const current = alts[index];
    if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
    const delta = current - previous;
    if (delta > 0) ascent += delta;
    else descent -= delta;
  }

  const hrs = (Array.isArray(route.hr_bpm) ? route.hr_bpm : [])
    .map(Number).filter((value) => Number.isFinite(value) && value >= 20 && value <= 260);
  const speeds = (Array.isArray(route.speed_mps) ? route.speed_mps : [])
    .map(Number).filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  const gpsCount = Math.min(route?.lat?.length || 0, route?.lon?.length || 0) > 0
    ? route.lat.reduce((total, value, index) => total + (
        Number.isFinite(Number(value)) && Number.isFinite(Number(route.lon[index])) ? 1 : 0
      ), 0)
    : 0;

  return {
    start_time_ms:startTime,
    elapsed_time_ms:elapsed,
    timer_time_ms:elapsed,
    distance_m:distance,
    ascent_m:Math.round(ascent),
    descent_m:Math.round(descent),
    avg_hr:hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
    max_hr:hrs.length ? Math.max(...hrs) : null,
    avg_speed_mps:Number.isFinite(elapsed) && elapsed > 0 ? distance / (elapsed / 1000) : null,
    max_speed_mps:speeds.length ? Math.max(...speeds) : null,
    gps_point_count:gpsCount,
    record_count:count
  };
}

function serverFiniteNumber(value) {
  if (value==null || value==="") return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function detectServerPauseBoundaries(route) {
  /*
   * CGWEB121 FIX3 · GAP_SPLIT_PAUSE001
   *
   * Toutes les découpes automatiques serveur basées sur
   * les pauses / inactivités sont temporairement suspendues :
   *
   * - GAP temporel > 15 minutes
   * - moving=false
   * - vitesse faible ou nulle
   * - plateau de distance
   *
   * Le moteur historique reste en place pour une éventuelle
   * réactivation future.
   */
  if (!WEBSPLIT_GAP_SPLIT_ENABLED) {
    return [];
  }

  const count=serverRouteCount(route);
  const times=Array.isArray(route?.time_ms)?route.time_ms:[];
  const speeds=Array.isArray(route?.speed_mps)?route.speed_mps:[];
  const moving=Array.isArray(route?.moving)?route.moving:[];
  const boundaries=[];

  for (let index=1;index<count;index++) {
    const previous=serverFiniteNumber(times[index-1]);
    const current=serverFiniteNumber(times[index]);
    if (previous!=null && current!=null && current-previous>WEBSPLIT_AUTO_GAP_MS) {
      boundaries.push({index,before_index:index-1,after_index:index,reason:"PAUSE_OVER_THRESHOLD",gap_ms:current-previous,gap_kind:"TIMESTAMP_JUMP"});
    }
  }

  const signal=(index)=>{
    if (typeof moving[index]==="boolean") return moving[index];
    const speed=serverFiniteNumber(speeds[index]);
    return speed==null?null:speed>WEBSPLIT_INACTIVE_SPEED_MPS;
  };
  const coverage=count?Array.from({length:count},(_,index)=>signal(index)).filter((value)=>value!=null).length/count:0;
  if (coverage>=0.30) {
    let start=-1,end=-1,before=-1;
    const closeRun=()=>{
      if (start>=0 && end>=start) {
        const after=end+1;
        const t0=serverFiniteNumber(times[before]);
        const t1=serverFiniteNumber(times[after]);
        if (before>=1 && after<=count-2 && t0!=null && t1!=null && t1-t0>WEBSPLIT_AUTO_GAP_MS) {
          boundaries.push({index:after,before_index:before,after_index:after,reason:"PAUSE_OVER_THRESHOLD",gap_ms:t1-t0,gap_kind:"INACTIVE_SIGNAL"});
        }
      }
      start=end=before=-1;
    };
    for (let index=1;index<count-1;index++) {
      const state=signal(index);
      if (state===false) {
        if (start<0) { start=index; before=index-1; }
        end=index;
        continue;
      }
      if (state===true && start>=0) {
        const lastIdle=serverFiniteNumber(times[end]);
        const current=serverFiniteNumber(times[index]);
        if (lastIdle!=null && current!=null && current-lastIdle<=WEBSPLIT_INACTIVE_MERGE_MS) continue;
        closeRun();
      }
    }
    closeRun();
  }

  boundaries.sort((a,b)=>a.after_index-b.after_index);
  const dedup=[];
  for (const boundary of boundaries) {
    const previous=dedup.at(-1);
    if (previous && boundary.before_index<=previous.after_index+2) {
      previous.before_index=Math.min(previous.before_index,boundary.before_index);
      previous.after_index=Math.max(previous.after_index,boundary.after_index);
      previous.index=previous.after_index;
      previous.gap_ms=Math.max(Number(previous.gap_ms)||0,Number(boundary.gap_ms)||0)||null;
    } else dedup.push({...boundary,index:boundary.after_index});
  }
  return dedup;
}

function serverAutoSplitNormalized(normalized) {
  const route = normalized?.route;
  const activity = normalized?.activity;
  if (!route || !activity) return [];

  const count = serverRouteCount(route);
  if (count < 4) return [{activity, route}];

  const boundaries = detectServerPauseBoundaries(route)
    .filter((boundary) => boundary.index >= 2 && boundary.index <= count - 2);
  if (!boundaries.length) return [{activity, route}];

  const ranges = [];
  let start = 0;
  for (const boundary of boundaries) {
    const end = Math.max(start, Number(boundary.before_index));
    if (end - start + 1 >= 2) ranges.push({start, end, reason:boundary.reason, gap_ms:boundary.gap_ms});
    start = Math.max(end + 1, Number(boundary.after_index));
  }
  if (count - start >= 2) ranges.push({start, end:count - 1, reason:boundaries.at(-1)?.reason || "PAUSE_OVER_THRESHOLD"});
  if (ranges.length < 2) return [{activity, route}];

  const prepared = ranges.map((range) => {
    const childRoute = serverSliceRoute(route, range.start, range.end);
    return {range, childRoute, stats:serverRouteStats(childRoute)};
  });
  const totalElapsed = Math.max(1, prepared.reduce((sum, item) => sum + Math.max(0, numberOrZero(item.stats?.elapsed_time_ms)), 0));
  const parts = [];
  for (let index = 0; index < prepared.length; index++) {
    const {range, childRoute, stats} = prepared[index];
    if (!stats || !Number.isFinite(Number(stats.start_time_ms))) continue;

    const child = {
      ...activity,
      id:makeActivityId(stats.start_time_ms, `${activity.strava_activity_id}_split_${index + 1}`),
      start_time_ms:stats.start_time_ms,
      elapsed_time_ms:stats.elapsed_time_ms,
      timer_time_ms:stats.timer_time_ms,
      distance_m:stats.distance_m,
      ascent_m:stats.ascent_m,
      descent_m:stats.descent_m,
      avg_hr:stats.avg_hr,
      max_hr:stats.max_hr,
      avg_speed_mps:stats.avg_speed_mps,
      max_speed_mps:stats.max_speed_mps,
      gps_point_count:stats.gps_point_count,
      record_count:stats.record_count,
      calories:Number.isFinite(Number(activity.calories)) && totalElapsed > 0 && Number.isFinite(stats.elapsed_time_ms)
        ? Math.max(0, Math.round(Number(activity.calories) * stats.elapsed_time_ms / totalElapsed))
        : activity.calories,
      custom_title:String(activity.custom_title || "").trim() + ` · ${index + 1}/${ranges.length}`,
      import_profile:`${WEBSTRAVA_VERSION}_${WEBSPLIT_VERSION}`,
      split_parent_strava_activity_id:String(activity.strava_activity_id),
      split_part:index + 1,
      split_total:ranges.length,
      split_reason:range.reason,
      split_gap_ms:Number(range.gap_ms || 0) || null,
      split_created_at_ms:Date.now()
    };
    parts.push({activity:child, route:childRoute});
  }
  return parts.length >= 2 ? parts : [{activity, route}];
}

async function exactStravaRows(uid, stravaId) {
  const snap = await firestore().collection(`${ROOT}/${uid}/activities`)
    .where("strava_activity_id", "==", String(stravaId))
    .limit(25)
    .get();
  return snap.docs.map((doc) => ({__docId:doc.id, ...doc.data()}));
}

async function importServerSplitParts(uid, parts, webhookEvent) {
  const stravaId = String(parts[0]?.activity?.strava_activity_id || "");
  const existingRows = await exactStravaRows(uid, stravaId);
  if (existingRows.length === 1 && existingRows[0].deleted_at_ms != null && !existingRows[0].split_part) {
    return {status:"ignored_deleted", activity_id:existingRows[0].id};
  }

  const byPart = new Map();
  let unsplit = null;
  for (const row of existingRows) {
    const part = Number(row.split_part);
    if (Number.isFinite(part) && part > 0) byPart.set(part, row);
    else if (row.deleted_at_ms == null && !unsplit) unsplit = row;
  }

  let created = 0;
  let updated = 0;
  let ignored = 0;
  const ids = [];

  for (let index = 0; index < parts.length; index++) {
    const item = parts[index];
    await applyEquipmentMapping(uid, item.activity);
    const existing = byPart.get(index + 1) || (index === 0 ? unsplit : null);
    if (existing?.deleted_at_ms != null) {
      ignored++;
      continue;
    }
    if (existing) {
      const result = await updateServerActivity(uid, existing, item.activity, item.route, webhookEvent);
      ids.push(result.activity_id || existing.id);
      updated++;
    } else {
      const result = await writeServerActivity(uid, item.activity, item.route, webhookEvent);
      ids.push(result.activity_id);
      created++;
    }
  }

  return {
    status:created > 0 ? "split_created" : "split_updated",
    split_version:WEBSPLIT_VERSION,
    split_total:parts.length,
    created,
    updated,
    ignored,
    activity_ids:ids
  };
}

async function applyEquipmentMapping(uid, activity) {
  if (!activity || Number(activity.equipment_manual) === 1) return activity;
  const snap = await firestore().collection(`${ROOT}/${uid}/equipment_mappings`).get();
  const source = String(activity.import_source || "").trim().toUpperCase();
  const sport = Number(activity.sport) || 0;
  const subSport = Number(activity.sub_sport) || 0;
  const matches = snap.docs
    .map((doc) => ({id:doc.id, ...doc.data()}))
    .filter((rule) => rule.enabled !== false &&
      String(rule.import_source || "").trim().toUpperCase() === source &&
      (Number(rule.sport) || 0) === sport &&
      (Number(rule.sub_sport) || 0) === subSport)
    .sort((a, b) => numberOrZero(b.updated_at_ms) - numberOrZero(a.updated_at_ms));

  const rule = matches[0];
  if (!rule) return activity;
  activity.equipment_name = String(rule.equipment_name || "").trim();
  activity.equipment_manual = 0;
  activity.equipment_mapping_id = rule.id;
  activity.equipment_mapping_applied_at_ms = Date.now();
  return activity;
}

function isProbableDuplicate(row, activity) {
  if (!row || row.deleted_at_ms != null) return false;
  const timeDelta = Math.abs(numberOrZero(row.start_time_ms) - numberOrZero(activity.start_time_ms));
  if (timeDelta > WEBSTRAVA_DUPLICATE_TIME_WINDOW_MS) return false;

  const remoteSport = Number(activity.sport) || 0;
  const localSport = Number(row.sport) || 0;
  if (remoteSport > 0 && localSport > 0 && remoteSport !== localSport) return false;

  const remoteDistance = numberOrZero(activity.distance_m);
  const localDistance = numberOrZero(row.distance_m);
  if (remoteDistance > 0 && localDistance > 0 &&
      Math.abs(localDistance - remoteDistance) > Math.max(100, remoteDistance * 0.02)) return false;

  const remoteDuration = numberOrZero(activity.elapsed_time_ms) || numberOrZero(activity.timer_time_ms);
  const localDuration = numberOrZero(row.elapsed_time_ms) || numberOrZero(row.timer_time_ms);
  if (remoteDuration > 0 && localDuration > 0 &&
      Math.abs(localDuration - remoteDuration) > Math.max(180000, remoteDuration * 0.10)) return false;

  return true;
}

async function findExistingActivity(uid, activity) {
  const activitiesRef = firestore().collection(`${ROOT}/${uid}/activities`);
  const exact = await activitiesRef
    .where("strava_activity_id", "==", String(activity.strava_activity_id))
    .limit(5)
    .get();

  for (const doc of exact.docs) {
    const row = {__docId:doc.id, ...doc.data()};
    return {kind:row.deleted_at_ms == null ? "exact" : "deleted", row};
  }

  const startMs = numberOrZero(activity.start_time_ms);
  if (startMs > 0) {
    const probable = await activitiesRef
      .where("start_time_ms", ">=", startMs - WEBSTRAVA_DUPLICATE_TIME_WINDOW_MS)
      .where("start_time_ms", "<=", startMs + WEBSTRAVA_DUPLICATE_TIME_WINDOW_MS)
      .limit(25)
      .get();
    for (const doc of probable.docs) {
      const row = {__docId:doc.id, ...doc.data()};
      if (isProbableDuplicate(row, activity)) return {kind:"probable", row};
    }
  }

  return null;
}

function serverEventId(stravaId, aspect, eventTime, splitPart = null) {
  const suffix = Number(splitPart) > 0 ? `_part${Number(splitPart)}` : "";
  return `strava_${String(aspect || "create")}_${String(stravaId)}_${String(eventTime || Math.floor(Date.now()/1000))}${suffix}`;
}

async function writeServerActivity(uid, activity, route, webhookEvent) {
  const root = firestore().doc(`${ROOT}/${uid}`);
  const activityKey = String(activity.id);
  const now = Date.now();
  const eventId = serverEventId(activity.strava_activity_id, webhookEvent?.aspect_type, webhookEvent?.event_time, activity.split_part);
  const batch = firestore().batch();

  const activityRef = root.collection("activities").doc(activityKey);
  const changeRef = root.collection("changes").doc(eventId);
  const metaRef = root.collection("meta").doc("state");

  batch.set(activityRef, {
    ...activity,
    __sportKey:activityKey,
    __updatedAtMs:now
  }, {merge:true});

  batch.set(changeRef, {
    eventId,
    deviceId:"WEBSTRAVA003_SERVER",
    firebaseSeq:now,
    sourceChangeSeq:0,
    table:"activities",
    rowKey:activityKey,
    operation:"UPSERT",
    changedAtMs:now,
    publishedAt:admin.firestore.FieldValue.serverTimestamp(),
    androidVersion:0,
    webVersion:WEBSTRAVA_VERSION,
    row:activity
  }, {merge:true});

  batch.set(metaRef, {
    updatedAtMs:now,
    sourceDeviceId:"WEBSTRAVA003_SERVER",
    webVersion:WEBSTRAVA_VERSION,
    activityCount:admin.firestore.FieldValue.increment(1),
    expectedDocuments:admin.firestore.FieldValue.increment(1)
  }, {merge:true});

  // Les séries Web sont matérialisées sans événement Android dédié : elles sont
  // destinées à la carte / profil / courbes Web, tandis qu'Android reçoit le résumé.
  if (Number(route?.source_point_count || 0) >= 2) {
    const routeRef = root.collection("activity_routes").doc(activityKey);
    batch.set(routeRef, {
      ...route,
      strava_activity_id:String(activity.strava_activity_id),
      __sportKey:activityKey,
      __updatedAtMs:now,
      __cartowebVersion:WEBSTRAVA_VERSION
    }, {merge:true});
  }

  await batch.commit();
  return {activity_id:activity.id, event_id:eventId};
}

async function updateServerActivity(uid, existing, activity, route, webhookEvent) {
  const root = firestore().doc(`${ROOT}/${uid}`);
  const key = String(existing.__docId || existing.id || activity.id);
  const now = Date.now();

  // Les choix manuels et la corbeille SPORT restent prioritaires sur Strava.
  if (existing.deleted_at_ms != null) return {status:"ignored_deleted"};
  if (Number(existing.equipment_manual) === 1) {
    activity.equipment_manual = 1;
    activity.equipment_name = existing.equipment_name || "";
  } else if (!activity.equipment_name && existing.equipment_name) {
    activity.equipment_name = existing.equipment_name;
  }
  activity.id = Number(existing.id || key) || activity.id;
  activity.imported_at_ms = existing.imported_at_ms || activity.imported_at_ms;

  const eventId = serverEventId(activity.strava_activity_id, webhookEvent?.aspect_type || "update", webhookEvent?.event_time, activity.split_part);
  const batch = firestore().batch();
  batch.set(root.collection("activities").doc(key), {
    ...activity,
    __sportKey:key,
    __updatedAtMs:now
  }, {merge:true});
  batch.set(root.collection("changes").doc(eventId), {
    eventId,
    deviceId:"WEBSTRAVA003_SERVER",
    firebaseSeq:now,
    sourceChangeSeq:0,
    table:"activities",
    rowKey:key,
    operation:"UPSERT",
    changedAtMs:now,
    publishedAt:admin.firestore.FieldValue.serverTimestamp(),
    androidVersion:0,
    webVersion:WEBSTRAVA_VERSION,
    row:activity
  }, {merge:true});
  batch.set(root.collection("meta").doc("state"), {
    updatedAtMs:now,
    sourceDeviceId:"WEBSTRAVA003_SERVER",
    webVersion:WEBSTRAVA_VERSION
  }, {merge:true});
  if (Number(route?.source_point_count || 0) >= 2) {
    batch.set(root.collection("activity_routes").doc(key), {
      ...route,
      strava_activity_id:String(activity.strava_activity_id),
      __sportKey:key,
      __updatedAtMs:now,
      __cartowebVersion:WEBSTRAVA_VERSION
    }, {merge:true});
  }
  await batch.commit();
  return {status:"updated", activity_id:activity.id, event_id:eventId};
}

async function fetchStravaActivityDetail(uid, id) {
  const activity = await stravaGet(uid, `/activities/${id}?include_all_efforts=false`);
  let streams = {};
  try {
    streams = await stravaGet(
      uid,
      `/activities/${id}/streams?keys=time,distance,latlng,altitude,heartrate,velocity_smooth,cadence,moving&key_by_type=true`
    );
  } catch (error) {
    console.warn("WEBSTRAVA003 streams unavailable", id, error?.message || error);
  }
  return {activity, streams};
}

async function importStravaActivityServer(uid, stravaId, webhookEvent) {
  const payload = await fetchStravaActivityDetail(uid, stravaId);

  /*
   * CGWEB136 · OUTBOUND_WEBHOOK_GUARD001
   *
   * Une activité créée volontairement par le pipeline CGWEB → Strava
   * ne doit jamais revenir comme une nouvelle activité SPORT.
   *
   * Si le webhook concerne un external_id CGWEB136, le même document
   * SPORT est réconcilié avec Strava.
   */
  const outboundManaged =
    await cgweb136HandleOutboundWebhook(
      uid,
      payload?.activity,
      webhookEvent
    );

  if (outboundManaged) {
    return outboundManaged;
  }

  const normalized = normalizeStravaDetailServer(payload);
  const activity = normalized.activity;
  const route = normalized.route;

  if (!Number.isFinite(Number(activity.start_time_ms))) {
    throw new Error(`Activité Strava ${stravaId} sans date valide.`);
  }

  const automaticParts = serverAutoSplitNormalized(normalized);
  if (automaticParts.length > 1) {
    return importServerSplitParts(uid, automaticParts, webhookEvent);
  }

  const existing = await findExistingActivity(uid, activity);
  if (existing?.kind === "deleted") return {status:"ignored_deleted", activity_id:existing.row.id};
  if (existing?.kind === "probable") return {status:"duplicate_probable", activity_id:existing.row.id};

  await applyEquipmentMapping(uid, activity);

  if (existing?.kind === "exact") {
    return updateServerActivity(uid, existing.row, activity, route, webhookEvent);
  }

  const created = await writeServerActivity(uid, activity, route, webhookEvent);
  return {status:"created", ...created};
}

async function recordWebhookResult(eventRef, result, error = null) {
  const patch = {
    processed_at_ms:Date.now(),
    processing_status:error ? "ERROR" : "DONE",
    result:result || null,
    version:WEBSTRAVA_VERSION
  };
  if (error) patch.error = String(error?.message || error).slice(0, 1000);
  await eventRef.set(patch, {merge:true});
}

exports.stravaWebhook = onRequest(
  {region:REGION, secrets:[STRAVA_CLIENT_SECRET], timeoutSeconds:30, cors:false},
  async (req, res) => {
    try {
      if (req.method === "GET") {
        const mode = String(req.query["hub.mode"] || "");
        const challenge = String(req.query["hub.challenge"] || "");
        const token = String(req.query["hub.verify_token"] || "");
        if (mode === "subscribe" && challenge && token === webhookVerifyToken()) {
          return res.status(200).json({"hub.challenge":challenge});
        }
        return res.status(403).json({error:"Webhook Strava non vérifié."});
      }

      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

      const body = req.body && typeof req.body === "object" ? req.body : {};
      const eventTime = Number(body.event_time || 0);
      const eventId = [
        "strava",
        body.subscription_id || "sub",
        body.owner_id || "owner",
        body.object_type || "object",
        body.object_id || "id",
        body.aspect_type || "aspect",
        eventTime || Math.floor(Date.now() / 1000)
      ].map((value) => String(value).replace(/[^a-zA-Z0-9_-]/g, "_")).join("_");

      // Écriture courte et idempotente avant accusé 200. Un retry Strava réécrit
      // le même document et ne redéclenche pas onDocumentCreated.
      await firestore().doc(`strava_webhook_events/${eventId}`).set({
        ...body,
        received_at_ms:Date.now(),
        processing_status:"QUEUED",
        version:WEBSTRAVA_VERSION
      }, {merge:true});

      return res.status(200).json({ok:true});
    } catch (error) {
      console.error("WEBSTRAVA003 webhook", error);
      // Strava retentera automatiquement en cas d'erreur serveur.
      return res.status(500).json({error:error?.message || String(error)});
    }
  }
);

exports.stravaWebhookProcessor = onDocumentCreated(
  {
    document:"strava_webhook_events/{eventId}",
    region:REGION,
    secrets:[STRAVA_CLIENT_SECRET],
    timeoutSeconds:120,
    memory:"256MiB"
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() || {};

    try {
      const ownerId = Number(data.owner_id || 0);

      if (data.object_type === "athlete" && data.updates?.authorized === "false") {
        const uid = await resolveUidForAthlete(ownerId);
        if (uid) {
          await Promise.allSettled([
            integrationRef(uid).delete(),
            athleteMapRef(ownerId).delete()
          ]);
        }
        await recordWebhookResult(snap.ref, {status:"deauthorized", uid:uid || null});
        return;
      }

      if (data.object_type !== "activity") {
        await recordWebhookResult(snap.ref, {status:"ignored_object_type"});
        return;
      }

      if (data.aspect_type === "delete") {
        // SPORT reste une archive personnelle : une suppression Strava ne détruit
        // pas automatiquement l'activité SPORT.
        await recordWebhookResult(snap.ref, {status:"ignored_strava_delete"});
        return;
      }

      if (!['create', 'update'].includes(String(data.aspect_type || ''))) {
        await recordWebhookResult(snap.ref, {status:"ignored_aspect"});
        return;
      }

      const uid = await resolveUidForAthlete(ownerId);
      if (!uid) {
        await recordWebhookResult(snap.ref, {status:"owner_not_mapped", owner_id:ownerId});
        return;
      }

      const result = await importStravaActivityServer(uid, String(data.object_id), data);
      await recordWebhookResult(snap.ref, {uid, ...result});
    } catch (error) {
      console.error("WEBSTRAVA003 processor", event.params?.eventId, error);
      await recordWebhookResult(snap.ref, null, error);
      throw error;
    }
  }
);


/* CGWEB134_SERVER_START
   STRAVA_EXPORT_FOUNDATION001
   ACTIVITY_WRITE_SCOPE001
   OUTBOUND_EXPORT_LOCK001
   STRAVA_DUPLICATE_GUARD001
*/

const CGWEB134_EXPORT_VERSION =
  "CGWEB134";

const CGWEB134_LOCK_TTL_MS =
  30 * 60 * 1000;

const CGWEB134_DUPLICATE_QUERY_WINDOW_MS =
  18 * 60 * 60 * 1000;


function cgweb134ScopeSet(scope) {
  return new Set(
    String(scope || "")
      .split(/[,\s]+/)
      .map((value) =>
        String(value || "")
          .trim()
      )
      .filter(Boolean)
  );
}


function cgweb134ScopeHas(
  scope,
  expected
) {
  return cgweb134ScopeSet(
    scope
  ).has(expected);
}


function cgweb134ParisParts(ms) {
  const n =
    Number(ms);

  if (!Number.isFinite(n)) {
    return null;
  }

  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Europe/Paris",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit"
      }
    );

  const values = {};

  for (
    const part of
    formatter.formatToParts(
      new Date(n)
    )
  ) {
    if (
      part.type !==
      "literal"
    ) {
      values[part.type] =
        part.value;
    }
  }

  return {
    year:
      Number(values.year),

    dayKey:
      [
        values.year,
        values.month,
        values.day
      ].join("-")
  };
}


function cgweb134ActivitySnapshot(
  activity
) {
  return {
    start_time_ms:
      Number(
        activity
          ?.start_time_ms
      ) || 0,

    sport:
      Number(
        activity
          ?.sport
      ) || 0,

    sub_sport:
      Number(
        activity
          ?.sub_sport
      ) || 0,

    distance_m:
      numberOrZero(
        activity
          ?.distance_m
      ),

    timer_time_ms:
      numberOrZero(
        activity
          ?.timer_time_ms
      ),

    elapsed_time_ms:
      numberOrZero(
        activity
          ?.elapsed_time_ms
      ),

    ascent_m:
      numberOrZero(
        activity
          ?.ascent_m
      ),

    calories:
      Number.isFinite(
        Number(
          activity
            ?.calories
        )
      )
        ? Math.round(
            Number(
              activity.calories
            )
          )
        : null,

    title:
      String(
        activity
          ?.custom_title ||
        activity
          ?.title ||
        ""
      ).trim()
  };
}


function cgweb134SnapshotHash(
  snapshot
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      JSON.stringify(
        snapshot
      ),
      "utf8"
    )
    .digest(
      "hex"
    );
}


function cgweb134RemoteDay(
  row
) {
  const local =
    String(
      row
        ?.start_date_local ||
      ""
    ).trim();

  if (
    /^\d{4}-\d{2}-\d{2}/
      .test(local)
  ) {
    return local.slice(
      0,
      10
    );
  }

  const parsed =
    Date.parse(
      row?.start_date ||
      ""
    );

  return (
    cgweb134ParisParts(
      parsed
    )?.dayKey ||
    ""
  );
}


function cgweb134RemoteStartMs(
  row
) {
  const value =
    Date.parse(
      row?.start_date ||
      row?.start_date_local ||
      ""
    );

  return Number.isFinite(
    value
  )
    ? value
    : null;
}


function cgweb134DuplicateCandidate(
  activity,
  row
) {
  const localStart =
    Number(
      activity
        ?.start_time_ms
    );

  const remoteStart =
    cgweb134RemoteStartMs(
      row
    );

  if (
    !Number.isFinite(
      localStart
    )
  ) {
    return null;
  }

  const localParts =
    cgweb134ParisParts(
      localStart
    );

  const sameDay =
    Boolean(
      localParts
        ?.dayKey &&
      cgweb134RemoteDay(
        row
      ) ===
        localParts.dayKey
    );

  const localSport =
    Number(
      activity
        ?.sport
    ) || 0;

  const remoteSport =
    stravaSportToFitSport(
      row?.type,
      row?.sport_type
    );

  const sportCompatible =
    localSport <= 0 ||
    remoteSport <= 0 ||
    localSport ===
      remoteSport;

  if (!sportCompatible) {
    return null;
  }

  const localDistance =
    numberOrZero(
      activity
        ?.distance_m
    );

  const remoteDistance =
    numberOrZero(
      row
        ?.distance
    );

  const distanceDelta =
    Math.abs(
      localDistance -
      remoteDistance
    );

  const distanceTolerance =
    Math.max(
      150,
      localDistance * 0.025
    );

  const distanceOk =
    localDistance <= 0 ||
    remoteDistance <= 0 ||
    distanceDelta <=
      distanceTolerance;

  if (!distanceOk) {
    return null;
  }

  const localDuration =
    numberOrZero(
      activity
        ?.timer_time_ms
    ) ||
    numberOrZero(
      activity
        ?.elapsed_time_ms
    );

  const remoteDuration =
    (
      numberOrZero(
        row
          ?.moving_time
      ) ||
      numberOrZero(
        row
          ?.elapsed_time
      )
    ) * 1000;

  const durationDelta =
    Math.abs(
      localDuration -
      remoteDuration
    );

  const durationTolerance =
    Math.max(
      180000,
      localDuration * 0.10
    );

  const durationOk =
    localDuration <= 0 ||
    remoteDuration <= 0 ||
    durationDelta <=
      durationTolerance;

  if (!durationOk) {
    return null;
  }

  const timeDelta =
    Number.isFinite(
      remoteStart
    )
      ? Math.abs(
          remoteStart -
          localStart
        )
      : Infinity;

  const timeClose =
    timeDelta <=
      2 * 60 * 1000;

  /*
   * Filet pour les activités dont Strava masque l'heure
   * de départ : même jour + statistiques quasiment identiques.
   */
  const strictDistance =
    localDistance > 0 &&
    remoteDistance > 0 &&
    distanceDelta <=
      Math.max(
        50,
        localDistance * 0.01
      );

  const strictDuration =
    localDuration > 0 &&
    remoteDuration > 0 &&
    durationDelta <=
      Math.max(
        60000,
        localDuration * 0.03
      );

  const hiddenTimeFallback =
    sameDay &&
    strictDistance &&
    strictDuration;

  if (
    !timeClose &&
    !hiddenTimeFallback
  ) {
    return null;
  }

  return {
    strava_activity_id:
      String(
        row?.id ||
        ""
      ),

    name:
      String(
        row?.name ||
        ""
      ),

    start_date:
      row?.start_date ||
      null,

    start_date_local:
      row?.start_date_local ||
      null,

    sport_type:
      row?.sport_type ||
      row?.type ||
      null,

    distance_m:
      remoteDistance,

    moving_time_s:
      numberOrZero(
        row?.moving_time
      ),

    elapsed_time_s:
      numberOrZero(
        row?.elapsed_time
      ),

    ascent_m:
      numberOrZero(
        row
          ?.total_elevation_gain
      ),

    time_delta_ms:
      Number.isFinite(
        timeDelta
      )
        ? Math.round(
            timeDelta
          )
        : null,

    distance_delta_m:
      Math.round(
        distanceDelta
      ),

    duration_delta_ms:
      Math.round(
        durationDelta
      ),

    match:
      timeClose
        ? "TIME_STATS"
        : "SAME_DAY_STRICT_STATS"
  };
}


async function cgweb134DuplicateGuard(
  uid,
  activity
) {
  const startMs =
    Number(
      activity
        ?.start_time_ms
    );

  if (
    !Number.isFinite(
      startMs
    )
  ) {
    throw Object.assign(
      new Error(
        "Activité sans date de départ exploitable."
      ),
      {
        status:
          400
      }
    );
  }

  const after =
    Math.max(
      0,
      Math.floor(
        (
          startMs -
          CGWEB134_DUPLICATE_QUERY_WINDOW_MS
        ) /
        1000
      )
    );

  const before =
    Math.max(
      after + 1,
      Math.ceil(
        (
          startMs +
          CGWEB134_DUPLICATE_QUERY_WINDOW_MS
        ) /
        1000
      )
    );

  const path =
    "/athlete/activities" +
    "?after=" +
    after +
    "&before=" +
    before +
    "&page=1" +
    "&per_page=100";

  const rows =
    await stravaGet(
      uid,
      path
    );

  const candidates =
    (
      Array.isArray(rows)
        ? rows
        : []
    )
      .map(
        row =>
          cgweb134DuplicateCandidate(
            activity,
            row
          )
      )
      .filter(Boolean)
      .sort(
        (a, b) => {
          const ad =
            a.time_delta_ms ??
            Number.MAX_SAFE_INTEGER;

          const bd =
            b.time_delta_ms ??
            Number.MAX_SAFE_INTEGER;

          if (ad !== bd) {
            return ad - bd;
          }

          return (
            a.distance_delta_m -
            b.distance_delta_m
          );
        }
      )
      .slice(
        0,
        10
      );

  return {
    checked_at_ms:
      Date.now(),

    candidate_count:
      candidates.length,

    candidates
  };
}


function cgweb134OutboundRef(
  uid,
  activityKey
) {
  return firestore()
    .doc(
      `${ROOT}/${uid}/strava_outbound_exports/${activityKey}`
    );
}


async function cgweb134AcquireOutboundLock(
  uid,
  activityKey,
  activity,
  duplicateGuard
) {
  const ref =
    cgweb134OutboundRef(
      uid,
      activityKey
    );

  const now =
    Date.now();

  const snapshot =
    cgweb134ActivitySnapshot(
      activity
    );

  const snapshotHash =
    cgweb134SnapshotHash(
      snapshot
    );

  const result =
    await firestore()
      .runTransaction(
        async transaction => {
          const existingSnap =
            await transaction.get(
              ref
            );

          const existing =
            existingSnap.exists
              ? existingSnap.data()
              : null;

          if (
            existing &&
            existing.state ===
              "PREPARED" &&
            Number(
              existing.expires_at_ms
            ) > now &&
            String(
              existing
                .activity_snapshot_hash ||
              ""
            ) ===
              snapshotHash
          ) {
            return {
              ...existing,
              reused:
                true
            };
          }

          const lockToken =
            crypto
              .randomBytes(
                18
              )
              .toString(
                "hex"
              );

          const externalId =
            (
              "CGWEB_" +
              String(
                activityKey
              )
            )
              .replace(
                /[^A-Za-z0-9_.-]/g,
                "_"
              )
              .slice(
                0,
                180
              );

          const row = {
            version:
              CGWEB134_EXPORT_VERSION,

            state:
              "PREPARED",

            activity_key:
              String(
                activityKey
              ),

            lock_token:
              lockToken,

            external_id:
              externalId,

            created_at_ms:
              now,

            updated_at_ms:
              now,

            expires_at_ms:
              now +
              CGWEB134_LOCK_TTL_MS,

            activity_snapshot:
              snapshot,

            activity_snapshot_hash:
              snapshotHash,

            duplicate_guard:
              {
                status:
                  "PASS",

                checked_at_ms:
                  duplicateGuard
                    ?.checked_at_ms ||
                  now,

                candidate_count:
                  0
              },

            upload_started:
              false,

            strava_upload_id:
              null,

            strava_activity_id:
              null
          };

          transaction.set(
            ref,
            row
          );

          return {
            ...row,
            reused:
              false
          };
        }
      );

  return result;
}


/* CGWEB134_SERVER_END */


/* CGWEB136_SERVER_START
   STRAVA_SINGLE_EXPORT001
   EXACT_BINARY_UPLOAD001
   UPLOAD_STATUS_POLL001
   STRAVA_POSTCHECK001
   STRAVA_WINS_RECONCILE001
   EXPORT_AUDIT_TRAIL001
*/

const CGWEB136_VERSION =
  "CGWEB136";

const CGWEB136_FIT_BUCKET =
  "sport-505813.firebasestorage.app";


function cgweb136ExportRef(
  uid,
  activityKey
) {
  return firestore()
    .doc(
      `${ROOT}/${uid}/strava_outbound_exports/${activityKey}`
    );
}


function cgweb136AuditCollection(
  uid
) {
  return firestore()
    .collection(
      `${ROOT}/${uid}/strava_export_audit`
    );
}


async function cgweb136Audit(
  uid,
  activityKey,
  stage,
  data = {}
) {
  const now =
    Date.now();

  await cgweb136AuditCollection(
    uid
  )
    .doc()
    .set({
      version:
        CGWEB136_VERSION,

      activity_key:
        String(
          activityKey ||
          ""
        ),

      stage:
        String(
          stage ||
          ""
        ),

      created_at_ms:
        now,

      ...data
    });

  return now;
}


function cgweb136Finite(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}


function cgweb136ExternalIdBase(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .replace(
      /\.(?:fit|fit\.gz)$/i,
      ""
    );
}


function cgweb136Metric(
  metric,
  before,
  stravaValue,
  finalValue,
  unit
) {
  const b =
    cgweb136Finite(
      before
    );

  const s =
    cgweb136Finite(
      stravaValue
    );

  const f =
    cgweb136Finite(
      finalValue
    );

  return {
    metric,

    before:
      b,

    strava:
      s,

    final:
      f,

    delta_strava_minus_before:
      b != null &&
      s != null
        ? s - b
        : null,

    reconciled:
      s != null &&
      f != null
        ? Math.abs(
            s - f
          ) < 0.000001
        : false,

    unit
  };
}


async function cgweb136FindOutboundByDetail(
  uid,
  detail
) {
  const externalRaw =
    String(
      detail?.external_id ||
      ""
    ).trim();

  const externalBase =
    cgweb136ExternalIdBase(
      externalRaw
    );

  if (externalBase) {
    const snap =
      await firestore()
        .collection(
          `${ROOT}/${uid}/strava_outbound_exports`
        )
        .where(
          "external_id",
          "==",
          externalBase
        )
        .limit(2)
        .get();

    if (!snap.empty) {
      const doc =
        snap.docs[0];

      return {
        activityKey:
          doc.id,

        ref:
          doc.ref,

        lock:
          doc.data() ||
          {}
      };
    }
  }

  const stravaId =
    String(
      detail?.id ||
      ""
    ).trim();

  if (stravaId) {
    const snap =
      await firestore()
        .collection(
          `${ROOT}/${uid}/strava_outbound_exports`
        )
        .where(
          "strava_activity_id",
          "==",
          stravaId
        )
        .limit(2)
        .get();

    if (!snap.empty) {
      const doc =
        snap.docs[0];

      return {
        activityKey:
          doc.id,

        ref:
          doc.ref,

        lock:
          doc.data() ||
          {}
      };
    }
  }

  return null;
}


async function cgweb136ReconcileFromDetail(
  uid,
  activityKey,
  lock,
  detail,
  source
) {
  const key =
    String(
      activityKey ||
      ""
    ).trim();

  const stravaId =
    String(
      detail?.id ||
      lock?.strava_activity_id ||
      ""
    ).trim();

  if (
    !key ||
    !stravaId
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : activité SPORT ou Strava absente du postcheck."
      ),
      {
        status:
          409
      }
    );
  }

  const activityRef =
    firestore()
      .doc(
        `${ROOT}/${uid}/activities/${key}`
      );

  const lockRef =
    cgweb136ExportRef(
      uid,
      key
    );

  const activitySnap =
    await activityRef.get();

  if (!activitySnap.exists) {
    throw Object.assign(
      new Error(
        "CGWEB136 : activité SPORT introuvable pendant la réconciliation."
      ),
      {
        status:
          404
      }
    );
  }

  const current =
    activitySnap.data() ||
    {};

  const before =
    lock?.activity_snapshot ||
    {
      distance_m:
        current.distance_m,

      timer_time_ms:
        current.timer_time_ms,

      elapsed_time_ms:
        current.elapsed_time_ms,

      ascent_m:
        current.ascent_m,

      calories:
        current.calories
    };

  const strava = {
    distance_m:
      cgweb136Finite(
        detail?.distance
      ),

    timer_time_ms:
      cgweb136Finite(
        detail?.moving_time
      ) != null
        ? cgweb136Finite(
            detail.moving_time
          ) * 1000
        : null,

    elapsed_time_ms:
      cgweb136Finite(
        detail?.elapsed_time
      ) != null
        ? cgweb136Finite(
            detail.elapsed_time
          ) * 1000
        : null,

    ascent_m:
      cgweb136Finite(
        detail
          ?.total_elevation_gain
      ),

    calories:
      cgweb136Finite(
        detail?.calories
      )
  };

  const missing = [];

  for (
    const [
      metric,
      value
    ] of Object.entries(
      strava
    )
  ) {
    if (
      value === null
    ) {
      missing.push(
        metric
      );
    }
  }

  if (missing.length) {
    const now =
      Date.now();

    await lockRef.set(
      {
        state:
          "POSTCHECK_INCOMPLETE",

        strava_activity_id:
          stravaId,

        postcheck_missing:
          missing,

        last_postcheck_at_ms:
          now,

        updated_at_ms:
          now
      },
      {
        merge:
          true
      }
    );

    await cgweb136Audit(
      uid,
      key,
      "POSTCHECK_INCOMPLETE",
      {
        strava_activity_id:
          stravaId,

        missing,

        source:
          String(
            source ||
            "UNKNOWN"
          )
      }
    );

    return {
      ok:
        false,

      status:
        "POSTCHECK_INCOMPLETE",

      activity_key:
        key,

      strava_activity_id:
        stravaId,

      missing
    };
  }

  /*
   * STRAVA_WINS_RECONCILE001
   *
   * Après création effective de l'activité Strava,
   * ces cinq statistiques deviennent l'autorité.
   *
   * Les valeurs CGWEB pré-export sont conservées séparément.
   */
  const patch = {
    pre_strava_export_distance_m:
      before.distance_m ??
      null,

    pre_strava_export_timer_time_ms:
      before.timer_time_ms ??
      null,

    pre_strava_export_elapsed_time_ms:
      before.elapsed_time_ms ??
      null,

    pre_strava_export_ascent_m:
      before.ascent_m ??
      null,

    pre_strava_export_calories:
      before.calories ??
      null,

    distance_m:
      strava.distance_m,

    timer_time_ms:
      strava.timer_time_ms,

    elapsed_time_ms:
      strava.elapsed_time_ms,

    ascent_m:
      strava.ascent_m,

    calories:
      strava.calories,

    strava_activity_id:
      stravaId,

    strava_upload_id:
      String(
        lock
          ?.strava_upload_id ||
        ""
      ) ||
      null,

    strava_export_external_id:
      lock
        ?.external_id ||
      null,

    strava_export_fit_sha256:
      lock
        ?.fit_preview
        ?.sha256 ||
      null,

    strava_export_version:
      CGWEB136_VERSION,

    /* CGWEB136 FIX1 · POST_EXPORT_STATE001 */
    strava_export_state:
      "RECONCILED",

    strava_reconciled_at_ms:
      Date.now()
  };

  /*
   * CGWEB136 FIX1 · LOAD_IMMUTABILITY_AUDIT001
   *
   * La Charge n'est PAS une statistique réconciliée avec Strava.
   * Si aucune charge native n'est stockée, SPORT l'affiche à partir de :
   *
   * (minutes + 2 × km + D+/100) × facteur FC
   *
   * Une modification Strava de distance/temps/D+ peut donc légitimement
   * modifier la charge DÉRIVÉE sans toucher à un champ de charge persistant.
   */
  const cgweb136Fix1LoadAudit =
    cgweb136Fix1BuildLoadAudit(
      current,
      before,
      {
        ...current,
        ...patch
      }
    );

  patch.pre_strava_export_charge_score =
    cgweb136Fix1LoadAudit
      .before_score;

  patch.post_strava_export_charge_score =
    cgweb136Fix1LoadAudit
      .after_score;

  patch.strava_load_fields_immutable =
    cgweb136Fix1LoadAudit
      .persisted_load_fields_unchanged;

  const comparisons = [
    cgweb136Metric(
      "distance_m",
      before.distance_m,
      strava.distance_m,
      patch.distance_m,
      "m"
    ),

    cgweb136Metric(
      "timer_time_ms",
      before.timer_time_ms,
      strava.timer_time_ms,
      patch.timer_time_ms,
      "ms"
    ),

    cgweb136Metric(
      "elapsed_time_ms",
      before.elapsed_time_ms,
      strava.elapsed_time_ms,
      patch.elapsed_time_ms,
      "ms"
    ),

    cgweb136Metric(
      "ascent_m",
      before.ascent_m,
      strava.ascent_m,
      patch.ascent_m,
      "m"
    ),

    cgweb136Metric(
      "calories",
      before.calories,
      strava.calories,
      patch.calories,
      "kcal"
    )
  ];

  const changedMetrics =
    comparisons
      .filter(
        row =>
          row
            .delta_strava_minus_before !=
          null &&
          Math.abs(
            row
              .delta_strava_minus_before
          ) >
          0.000001
      )
      .map(
        row =>
          row.metric
      );

  const now =
    Date.now();

  const eventId =
    [
      "cgweb136",
      "reconcile",
      key,
      now
    ].join("_");

  const root =
    firestore()
      .doc(
        `${ROOT}/${uid}`
      );

  const finalResult = {
    ok:
      true,

    status:
      "RECONCILED",

    version:
      CGWEB136_VERSION,

    activity_key:
      key,

    strava_activity_id:
      stravaId,

    strava_upload_id:
      String(
        lock
          ?.strava_upload_id ||
        ""
      ) ||
      null,

    external_id:
      lock
        ?.external_id ||
      null,

    reconciled_at_ms:
      now,

    reconciliation_source:
      String(
        source ||
        "POSTCHECK"
      ),

    pre_export:
      {
        distance_m:
          before.distance_m ??
          null,

        timer_time_ms:
          before.timer_time_ms ??
          null,

        elapsed_time_ms:
          before.elapsed_time_ms ??
          null,

        ascent_m:
          before.ascent_m ??
          null,

        calories:
          before.calories ??
          null
      },

    strava_final:
      strava,

    cgweb_patch:
      patch,

    comparisons,

    changed_metrics:
      changedMetrics,

    load_immutability_audit:
      cgweb136Fix1LoadAudit
  };

  const batch =
    firestore()
      .batch();

  batch.set(
    activityRef,
    {
      ...patch,

      __sportKey:
        key,

      __updatedAtMs:
        now
    },
    {
      merge:
        true
    }
  );

  batch.set(
    root
      .collection(
        "changes"
      )
      .doc(
        eventId
      ),
    {
      eventId,

      deviceId:
        "CGWEB136_STRAVA_EXPORT",

      firebaseSeq:
        now,

      sourceChangeSeq:
        0,

      table:
        "activities",

      rowKey:
        key,

      operation:
        "UPSERT",

      changedAtMs:
        now,

      publishedAt:
        admin.firestore
          .FieldValue
          .serverTimestamp(),

      androidVersion:
        0,

      webVersion:
        CGWEB136_VERSION,

      row:
        patch
    },
    {
      merge:
        true
    }
  );

  batch.set(
    root
      .collection(
        "meta"
      )
      .doc(
        "state"
      ),
    {
      updatedAtMs:
        now,

      sourceDeviceId:
        "CGWEB136_STRAVA_EXPORT",

      webVersion:
        CGWEB136_VERSION
    },
    {
      merge:
        true
    }
  );

  batch.set(
    lockRef,
    {
      state:
        "RECONCILED",

      strava_activity_id:
        stravaId,

      reconciled_at_ms:
        now,

      updated_at_ms:
        now,

      final_result:
        finalResult
    },
    {
      merge:
        true
    }
  );

  await batch.commit();

  await cgweb136Audit(
    uid,
    key,
    "RECONCILED",
    {
      strava_activity_id:
        stravaId,

      strava_upload_id:
        finalResult
          .strava_upload_id,

      external_id:
        finalResult
          .external_id,

      fit_sha256:
        lock
          ?.fit_preview
          ?.sha256 ||
        null,

      changed_metrics:
        changedMetrics,

      comparisons,

      source:
        finalResult
          .reconciliation_source
    }
  );

  return finalResult;
}


async function cgweb136HandleOutboundWebhook(
  uid,
  detail,
  webhookEvent
) {
  if (!detail) {
    return null;
  }

  const managed =
    await cgweb136FindOutboundByDetail(
      uid,
      detail
    );

  if (!managed) {
    return null;
  }

  const stravaId =
    String(
      detail?.id ||
      ""
    );

  const now =
    Date.now();

  await managed.ref.set(
    {
      strava_activity_id:
        stravaId ||
        managed
          .lock
          ?.strava_activity_id ||
        null,

      webhook_seen_at_ms:
        now,

      webhook_aspect:
        String(
          webhookEvent
            ?.aspect_type ||
          ""
        ),

      updated_at_ms:
        now
    },
    {
      merge:
        true
    }
  );

  const refreshed =
    await managed.ref.get();

  const lock =
    refreshed.exists
      ? refreshed.data() ||
        managed.lock
      : managed.lock;

  try {
    const result =
      await cgweb136ReconcileFromDetail(
        uid,
        managed.activityKey,
        lock,
        detail,
        "WEBHOOK_" +
          String(
            webhookEvent
              ?.aspect_type ||
            "UNKNOWN"
          )
            .toUpperCase()
      );

    return {
      status:
        "outbound_export_managed",

      activity_id:
        managed.activityKey,

      strava_activity_id:
        stravaId,

      reconciliation_status:
        result?.status ||
        null
    };
  } catch (error) {
    console.warn(
      "CGWEB136 outbound webhook reconciliation",
      managed.activityKey,
      error?.message ||
      error
    );

    return {
      status:
        "outbound_export_managed_pending",

      activity_id:
        managed.activityKey,

      strava_activity_id:
        stravaId,

      error:
        error?.message ||
        String(error)
    };
  }
}


async function cgweb136ReadExactCandidate(
  uid,
  activityKey,
  lock,
  requestedSha
) {
  const preview =
    lock
      ?.fit_preview ||
    {};

  if (
    lock
      ?.fit_preview_ready !==
      true ||
    preview.parity_ok !==
      true
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : FIT CGWEB135 non validé."
      ),
      {
        status:
          409
      }
    );
  }

  const expectedSha =
    String(
      preview.sha256 ||
      ""
    )
      .trim()
      .toLowerCase();

  const clientSha =
    String(
      requestedSha ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    !/^[a-f0-9]{64}$/
      .test(
        expectedSha
      )
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : SHA-256 du candidat invalide."
      ),
      {
        status:
          409
      }
    );
  }

  if (
    clientSha &&
    clientSha !==
      expectedSha
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : le FIT présenté au navigateur n'est plus le candidat serveur."
      ),
      {
        status:
          409
      }
    );
  }

  const objectPath =
    String(
      preview.object_path ||
      ""
    ).trim();

  const requiredPrefix =
    `strava_exports/${uid}/previews/${activityKey}/`;

  if (
    !objectPath.startsWith(
      requiredPrefix
    )
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : chemin Storage du candidat refusé."
      ),
      {
        status:
          409
      }
    );
  }

  const object =
    admin
      .storage()
      .bucket(
        CGWEB136_FIT_BUCKET
      )
      .file(
        objectPath
      );

  const [exists] =
    await object.exists();

  if (!exists) {
    throw Object.assign(
      new Error(
        "CGWEB136 : binaire FIT candidat absent du Storage."
      ),
      {
        status:
          404
      }
    );
  }

  const [buffer] =
    await object.download();

  const actualSha =
    crypto
      .createHash(
        "sha256"
      )
      .update(
        buffer
      )
      .digest(
        "hex"
      );

  if (
    actualSha !==
      expectedSha
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : SHA-256 du binaire différent du candidat validé."
      ),
      {
        status:
          409
      }
    );
  }

  return {
    buffer,

    sha256:
      actualSha,

    objectPath,

    fileName:
      String(
        preview.file_name ||
        `${activityKey}.fit`
      )
        .replace(
          /[\\/]+/g,
          "_"
        )
        .slice(
          0,
          180
        )
  };
}


async function cgweb136UploadToStrava(
  token,
  candidate,
  lock,
  activity
) {
  const form =
    new FormData();

  form.append(
    "data_type",
    "fit"
  );

  form.append(
    "external_id",
    String(
      lock.external_id
    )
  );

  const title =
    String(
      activity
        ?.custom_title ||
      activity
        ?.title ||
      lock
        ?.activity_snapshot
        ?.title ||
      ""
    ).trim();

  if (title) {
    form.append(
      "name",
      title.slice(
        0,
        180
      )
    );
  }

  form.append(
    "file",
    new Blob(
      [
        candidate.buffer
      ],
      {
        type:
          "application/vnd.ant.fit"
      }
    ),
    candidate.fileName
  );

  /*
   * IMPORTANT : aucun retry POST automatique.
   *
   * Après une coupure réseau, nous ne pouvons pas savoir avec certitude
   * si Strava a reçu le fichier. Rejouer le POST créerait un risque de
   * doublon. L'état deviendra UPLOAD_UNKNOWN.
   */
  const response =
    await fetch(
      `${STRAVA_API_BASE}/uploads`,
      {
        method:
          "POST",

        headers:
          {
            Authorization:
              `Bearer ${token}`
          },

        body:
          form
      }
    );

  const text =
    await response.text();

  let payload = {};

  try {
    payload =
      text
        ? JSON.parse(text)
        : {};
  } catch {
    payload = {
      raw:
        text
    };
  }

  return {
    response,
    payload
  };
}


async function cgweb136UploadSingle(
  uid,
  body
) {
  const activityKey =
    String(
      body
        ?.activity_key ||
      ""
    ).trim();

  const lockToken =
    String(
      body
        ?.lock_token ||
      ""
    ).trim();

  const requestedSha =
    String(
      body
        ?.fit_sha256 ||
      ""
    ).trim();

  if (
    !/^[A-Za-z0-9_.:-]{1,180}$/
      .test(
        activityKey
      )
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : activity_key invalide."
      ),
      {
        status:
          400
      }
    );
  }

  if (!lockToken) {
    throw Object.assign(
      new Error(
        "CGWEB136 : verrou absent."
      ),
      {
        status:
          409
      }
    );
  }

  const integration =
    await tokenDocument(
      uid
    );

  if (
    !integration
      ?.refresh_token ||
    !cgweb134ScopeHas(
      integration?.scope,
      "activity:write"
    )
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : autorisation Strava activity:write absente."
      ),
      {
        status:
          403
      }
    );
  }

  const token =
    await refreshTokenIfNeeded(
      uid,
      integration
    );

  const lockRef =
    cgweb136ExportRef(
      uid,
      activityKey
    );

  const lockSnap =
    await lockRef.get();

  if (!lockSnap.exists) {
    throw Object.assign(
      new Error(
        "CGWEB136 : verrou CGWEB134 absent."
      ),
      {
        status:
          409
      }
    );
  }

  let lock =
    lockSnap.data() ||
    {};

  if (
    String(
      lock.lock_token ||
      ""
    ) !==
    lockToken
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : token de verrou invalide."
      ),
      {
        status:
          403
      }
    );
  }

  const currentState =
    String(
      lock.state ||
      ""
    );

  if (
    currentState ===
      "RECONCILED"
  ) {
    return (
      lock.final_result ||
      {
        ok:
          true,

        status:
          "RECONCILED",

        activity_key:
          activityKey
      }
    );
  }

  if (
    currentState ===
      "UPLOADED_PROCESSING" ||
    currentState ===
      "POSTCHECK_INCOMPLETE"
  ) {
    return {
      ok:
        true,

      status:
        "UPLOAD_IN_PROGRESS",

      activity_key:
        activityKey,

      strava_upload_id:
        lock
          .strava_upload_id ||
        null,

      strava_activity_id:
        lock
          .strava_activity_id ||
        null
    };
  }

  if (
    currentState ===
      "UPLOAD_REQUESTING" ||
    currentState ===
      "UPLOAD_UNKNOWN"
  ) {
    return {
      ok:
        false,

      status:
        "UPLOAD_UNKNOWN",

      activity_key:
        activityKey,

      message:
        "Le précédent POST Strava a un état incertain. Aucun nouvel envoi automatique n'est autorisé."
    };
  }

  if (
    currentState !==
      "PREPARED"
  ) {
    throw Object.assign(
      new Error(
        `CGWEB136 : état d'export incompatible (${currentState || "vide"}).`
      ),
      {
        status:
          409
      }
    );
  }

  if (
    Number(
      lock.expires_at_ms ||
      0
    ) <= Date.now()
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : verrou expiré. Relancer Strava et préparer à nouveau le FIT."
      ),
      {
        status:
          409
      }
    );
  }

  const activityRef =
    firestore()
      .doc(
        `${ROOT}/${uid}/activities/${activityKey}`
      );

  const activitySnap =
    await activityRef.get();

  if (!activitySnap.exists) {
    throw Object.assign(
      new Error(
        "CGWEB136 : activité SPORT absente."
      ),
      {
        status:
          404
      }
    );
  }

  const activity =
    activitySnap.data() ||
    {};

  if (
    String(
      activity
        ?.strava_activity_id ||
      ""
    ).trim()
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : cette activité est déjà liée à Strava."
      ),
      {
        status:
          409
      }
    );
  }

  const parts =
    cgweb134ParisParts(
      activity
        ?.start_time_ms
    );

  if (
    !parts ||
    parts.year >= 2026
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : export historique réservé aux activités antérieures à 2026."
      ),
      {
        status:
          409
      }
    );
  }

  const currentSnapshot =
    cgweb134ActivitySnapshot(
      activity
    );

  const currentHash =
    cgweb134SnapshotHash(
      currentSnapshot
    );

  if (
    String(
      lock
        .activity_snapshot_hash ||
      ""
    ) !==
    currentHash
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : les statistiques CGWEB ont changé depuis le préflight."
      ),
      {
        status:
          409
      }
    );
  }

  const candidate =
    await cgweb136ReadExactCandidate(
      uid,
      activityKey,
      lock,
      requestedSha
    );

  /*
   * Dernier contrôle anti-doublon juste avant le vrai POST.
   */
  const duplicateGuard =
    await cgweb134DuplicateGuard(
      uid,
      activity
    );

  if (
    duplicateGuard
      .candidate_count > 0
  ) {
    await cgweb136Audit(
      uid,
      activityKey,
      "DUPLICATE_BLOCKED_BEFORE_UPLOAD",
      {
        candidates:
          duplicateGuard
            .candidates ||
          []
      }
    );

    return {
      ok:
        false,

      status:
        "DUPLICATE_BLOCKED_BEFORE_UPLOAD",

      duplicate_guard:
        duplicateGuard
    };
  }

  const attemptId =
    crypto
      .randomBytes(
        16
      )
      .toString(
        "hex"
      );

  /*
   * Réservation transactionnelle AVANT le POST.
   * Deux clics simultanés ne peuvent pas créer deux uploads.
   */
  await firestore()
    .runTransaction(
      async transaction => {
        const freshSnap =
          await transaction.get(
            lockRef
          );

        if (!freshSnap.exists) {
          throw Object.assign(
            new Error(
              "CGWEB136 : verrou disparu."
            ),
            {
              status:
                409
            }
          );
        }

        const fresh =
          freshSnap.data() ||
          {};

        if (
          String(
            fresh.lock_token ||
            ""
          ) !==
          lockToken
        ) {
          throw Object.assign(
            new Error(
              "CGWEB136 : verrou remplacé."
            ),
            {
              status:
                409
            }
          );
        }

        if (
          String(
            fresh.state ||
            ""
          ) !==
          "PREPARED"
        ) {
          throw Object.assign(
            new Error(
              "CGWEB136 : un export est déjà engagé."
            ),
            {
              status:
                409
            }
          );
        }

        transaction.set(
          lockRef,
          {
            state:
              "UPLOAD_REQUESTING",

            upload_attempt_id:
              attemptId,

            exact_binary_sha256:
              candidate.sha256,

            exact_binary_verified_at_ms:
              Date.now(),

            updated_at_ms:
              Date.now()
          },
          {
            merge:
              true
          }
        );
      }
    );

  await cgweb136Audit(
    uid,
    activityKey,
    "EXACT_BINARY_VERIFIED",
    {
      fit_sha256:
        candidate.sha256,

      fit_object_path:
        candidate.objectPath,

      file_name:
        candidate.fileName,

      bytes:
        candidate.buffer.length,

      external_id:
        lock.external_id,

      upload_attempt_id:
        attemptId
    }
  );

  let uploadResponse;

  try {
    uploadResponse =
      await cgweb136UploadToStrava(
        token.access_token,
        candidate,
        lock,
        activity
      );
  } catch (error) {
    const now =
      Date.now();

    await lockRef.set(
      {
        state:
          "UPLOAD_UNKNOWN",

        last_error:
          error?.message ||
          String(error),

        updated_at_ms:
          now
      },
      {
        merge:
          true
      }
    );

    await cgweb136Audit(
      uid,
      activityKey,
      "UPLOAD_UNKNOWN",
      {
        error:
          error?.message ||
          String(error),

        fit_sha256:
          candidate.sha256,

        upload_attempt_id:
          attemptId
      }
    );

    throw Object.assign(
      new Error(
        "CGWEB136 : réponse réseau Strava incertaine. Aucun retry automatique ne sera effectué."
      ),
      {
        status:
          502
      }
    );
  }

  const response =
    uploadResponse.response;

  const payload =
    uploadResponse.payload ||
    {};

  if (!response.ok) {
    const ambiguous =
      response.status >=
      500;

    const nextState =
      ambiguous
        ? "UPLOAD_UNKNOWN"
        : "PREPARED";

    const message =
      String(
        payload?.message ||
        payload?.error ||
        payload?.raw ||
        `Strava upload HTTP ${response.status}`
      );

    await lockRef.set(
      {
        state:
          nextState,

        last_error:
          message.slice(
            0,
            1000
          ),

        last_http_status:
          response.status,

        updated_at_ms:
          Date.now()
      },
      {
        merge:
          true
      }
    );

    await cgweb136Audit(
      uid,
      activityKey,
      ambiguous
        ? "UPLOAD_UNKNOWN"
        : "UPLOAD_REJECTED",
      {
        http_status:
          response.status,

        error:
          message.slice(
            0,
            1000
          ),

        upload_attempt_id:
          attemptId
      }
    );

    throw Object.assign(
      new Error(
        message
      ),
      {
        status:
          response.status >=
          500
            ? 502
            : 409
      }
    );
  }

  const uploadId =
    String(
      payload?.id_str ||
      payload?.id ||
      ""
    ).trim();

  if (!uploadId) {
    await lockRef.set(
      {
        state:
          "UPLOAD_UNKNOWN",

        last_error:
          "Strava a accepté le POST sans fournir d'identifiant d'upload.",

        updated_at_ms:
          Date.now()
      },
      {
        merge:
          true
      }
    );

    throw Object.assign(
      new Error(
        "CGWEB136 : Strava n'a pas fourni d'identifiant d'upload."
      ),
      {
        status:
          502
      }
    );
  }

  const responseActivityId =
    payload?.activity_id !=
      null
      ? String(
          payload.activity_id
        )
      : null;

  /*
   * Le webhook peut exceptionnellement avoir réconcilié l'activité
   * pendant que le POST attendait sa réponse.
   * Ne jamais rétrograder RECONCILED vers UPLOADED_PROCESSING.
   */
  await firestore()
    .runTransaction(
      async transaction => {
        const freshSnap =
          await transaction.get(
            lockRef
          );

        const fresh =
          freshSnap.exists
            ? freshSnap.data() ||
              {}
            : {};

        const patch = {
          strava_upload_id:
            uploadId,

          strava_upload_response:
            payload,

          strava_activity_id:
            responseActivityId ||
            fresh
              .strava_activity_id ||
            null,

          upload_accepted_at_ms:
            Date.now(),

          updated_at_ms:
            Date.now()
        };

        if (
          String(
            fresh.state ||
            ""
          ) !==
          "RECONCILED"
        ) {
          patch.state =
            "UPLOADED_PROCESSING";
        }

        transaction.set(
          lockRef,
          patch,
          {
            merge:
              true
          }
        );
      }
    );

  await cgweb136Audit(
    uid,
    activityKey,
    "STRAVA_UPLOAD_ACCEPTED",
    {
      strava_upload_id:
        uploadId,

      strava_activity_id:
        responseActivityId,

      external_id:
        lock.external_id,

      fit_sha256:
        candidate.sha256,

      strava_status:
        payload?.status ||
        null
    }
  );

  const finalSnap =
    await lockRef.get();

  const finalLock =
    finalSnap.exists
      ? finalSnap.data() ||
        {}
      : {};

  if (
    String(
      finalLock.state ||
      ""
    ) ===
      "RECONCILED" &&
    finalLock.final_result
  ) {
    return finalLock.final_result;
  }

  return {
    ok:
      true,

    status:
      "UPLOAD_ACCEPTED",

    activity_key:
      activityKey,

    strava_upload_id:
      uploadId,

    strava_activity_id:
      responseActivityId,

    external_id:
      lock.external_id,

    fit_sha256:
      candidate.sha256,

    strava_status:
      payload?.status ||
      null
  };
}


async function cgweb136PollSingle(
  uid,
  body
) {
  const activityKey =
    String(
      body
        ?.activity_key ||
      ""
    ).trim();

  const lockToken =
    String(
      body
        ?.lock_token ||
      ""
    ).trim();

  if (
    !activityKey ||
    !lockToken
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : activité/verrou absent pour le polling."
      ),
      {
        status:
          400
      }
    );
  }

  const lockRef =
    cgweb136ExportRef(
      uid,
      activityKey
    );

  const lockSnap =
    await lockRef.get();

  if (!lockSnap.exists) {
    throw Object.assign(
      new Error(
        "CGWEB136 : verrou d'export absent."
      ),
      {
        status:
          404
      }
    );
  }

  let lock =
    lockSnap.data() ||
    {};

  if (
    String(
      lock.lock_token ||
      ""
    ) !==
    lockToken
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 : token de verrou invalide."
      ),
      {
        status:
          403
      }
    );
  }

  if (
    String(
      lock.state ||
      ""
    ) ===
      "RECONCILED"
  ) {
    return (
      lock.final_result ||
      {
        ok:
          true,

        status:
          "RECONCILED",

        activity_key:
          activityKey
      }
    );
  }

  if (
    String(
      lock.state ||
      ""
    ) ===
      "STRAVA_ERROR"
  ) {
    return {
      ok:
        false,

      status:
        "STRAVA_ERROR",

      activity_key:
        activityKey,

      error:
        lock.last_error ||
        "Erreur Strava."
    };
  }

  if (
    [
      "UPLOAD_REQUESTING",
      "UPLOAD_UNKNOWN"
    ].includes(
      String(
        lock.state ||
        ""
      )
    ) &&
    !lock.strava_upload_id
  ) {
    return {
      ok:
        false,

      status:
        "UPLOAD_UNKNOWN",

      activity_key:
        activityKey,

      error:
        lock.last_error ||
        "État du POST Strava incertain."
    };
  }

  /*
   * POSTCHECK_INCOMPLETE :
   * l'activité existe déjà, on retente seulement la lecture détaillée.
   */
  if (
    String(
      lock.state ||
      ""
    ) ===
      "POSTCHECK_INCOMPLETE" &&
    lock.strava_activity_id
  ) {
    const detail =
      await stravaGet(
        uid,
        `/activities/${encodeURIComponent(
          String(
            lock.strava_activity_id
          )
        )}?include_all_efforts=false`
      );

    return cgweb136ReconcileFromDetail(
      uid,
      activityKey,
      lock,
      detail,
      "POLL_POSTCHECK"
    );
  }

  const uploadId =
    String(
      lock.strava_upload_id ||
      ""
    ).trim();

  if (!uploadId) {
    return {
      ok:
        false,

      status:
        "NOT_UPLOADED",

      activity_key:
        activityKey
    };
  }

  const upload =
    await stravaGet(
      uid,
      `/uploads/${encodeURIComponent(
        uploadId
      )}`
    );

  const now =
    Date.now();

  const uploadError =
    String(
      upload?.error ||
      ""
    ).trim();

  const uploadStatus =
    String(
      upload?.status ||
      ""
    ).trim();

  const activityId =
    upload?.activity_id !=
      null
      ? String(
          upload.activity_id
        )
      : String(
          lock
            .strava_activity_id ||
          ""
        ).trim();

  if (uploadError) {
    await lockRef.set(
      {
        state:
          "STRAVA_ERROR",

        last_error:
          uploadError.slice(
            0,
            1000
          ),

        last_strava_status:
          uploadStatus,

        last_poll_at_ms:
          now,

        updated_at_ms:
          now
      },
      {
        merge:
          true
      }
    );

    await cgweb136Audit(
      uid,
      activityKey,
      "STRAVA_PROCESSING_ERROR",
      {
        strava_upload_id:
          uploadId,

        error:
          uploadError.slice(
            0,
            1000
          ),

        status:
          uploadStatus
      }
    );

    return {
      ok:
        false,

      status:
        "STRAVA_ERROR",

      activity_key:
        activityKey,

      strava_upload_id:
        uploadId,

      error:
        uploadError,

      strava_status:
        uploadStatus
    };
  }

  await lockRef.set(
    {
      strava_activity_id:
        activityId ||
        lock
          .strava_activity_id ||
        null,

      last_strava_status:
        uploadStatus,

      last_poll_at_ms:
        now,

      updated_at_ms:
        now
    },
    {
      merge:
        true
    }
  );

  if (!activityId) {
    return {
      ok:
        true,

      status:
        "PROCESSING",

      activity_key:
        activityKey,

      strava_upload_id:
        uploadId,

      strava_status:
        uploadStatus
    };
  }

  const refreshedSnap =
    await lockRef.get();

  lock =
    refreshedSnap.exists
      ? refreshedSnap.data() ||
        lock
      : lock;

  const detail =
    await stravaGet(
      uid,
      `/activities/${encodeURIComponent(
        activityId
      )}?include_all_efforts=false`
    );

  return cgweb136ReconcileFromDetail(
    uid,
    activityKey,
    lock,
    detail,
    "UPLOAD_STATUS_POLL"
  );
}



/* CGWEB136_FIX1_SERVER_START
   POST_EXPORT_STATE001
   CALORIES_RECONCILE_AUDIT001
   LOAD_IMMUTABILITY_AUDIT001
   SYNCHRONIZED_BUTTON001
*/

const CGWEB136_FIX1_VERSION =
  "CGWEB136_FIX1";


const CGWEB136_FIX1_LOAD_FIELDS = [
  "training_load",
  "trainingLoad",
  "load",
  "activity_load",
  "activityLoad",
  "trimp",
  "charge_score",
  "chargeScore",
  "sport_load",
  "sportLoad"
];


function cgweb136Fix1Finite(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}


function cgweb136Fix1LoadFields(
  activity
) {
  const result = {};

  for (
    const field of
    CGWEB136_FIX1_LOAD_FIELDS
  ) {
    const raw =
      activity?.[field];

    if (
      raw === null ||
      raw === undefined ||
      raw === ""
    ) {
      continue;
    }

    const numeric =
      Number(raw);

    result[field] =
      Number.isFinite(numeric)
        ? numeric
        : String(raw);
  }

  return result;
}


function cgweb136Fix1StoredLoad(
  activity
) {
  for (
    const field of
    CGWEB136_FIX1_LOAD_FIELDS
  ) {
    const value =
      cgweb136Fix1Finite(
        activity?.[field]
      );

    if (
      value !== null &&
      value >= 0
    ) {
      return {
        field,
        value
      };
    }
  }

  return null;
}


function cgweb136Fix1MovingTimeMs(
  activity
) {
  const candidates = [
    cgweb136Fix1Finite(
      activity
        ?.timer_time_ms
    ),

    cgweb136Fix1Finite(
      activity
        ?.moving_time_ms
    ),

    cgweb136Fix1Finite(
      activity
        ?.moving_time
    ) != null
      ? cgweb136Fix1Finite(
          activity
            ?.moving_time
        ) * 1000
      : null,

    cgweb136Fix1Finite(
      activity
        ?.elapsed_time_ms
    )
  ];

  for (
    const candidate of candidates
  ) {
    if (
      candidate !== null &&
      candidate > 0
    ) {
      return candidate;
    }
  }

  return 0;
}


function cgweb136Fix1ChargeScore(
  activity
) {
  const stored =
    cgweb136Fix1StoredLoad(
      activity
    );

  if (stored) {
    return {
      score:
        stored.value,

      rounded:
        Math.round(
          stored.value
        ),

      source:
        "PERSISTED",

      persisted_field:
        stored.field,

      persisted_value:
        stored.value,

      formula:
        null
    };
  }

  const durationMs =
    cgweb136Fix1MovingTimeMs(
      activity
    );

  const minutes =
    Math.max(
      0,
      Number(durationMs) || 0
    ) /
    60000;

  const km =
    Math.max(
      0,
      Number(
        activity
          ?.distance_m
      ) || 0
    ) /
    1000;

  const ascent =
    Math.max(
      0,
      Number(
        activity
          ?.ascent_m
      ) || 0
    );

  let hrFactor = 1;

  const avgHr =
    Number(
      activity
        ?.avg_hr
    );

  if (
    Number.isFinite(avgHr) &&
    avgHr > 0
  ) {
    hrFactor =
      Math.max(
        0.75,
        Math.min(
          1.50,
          avgHr / 130
        )
      );
  }

  const score =
    (
      minutes +
      km * 2 +
      ascent / 100
    ) *
    hrFactor;

  const finite =
    Number.isFinite(score) &&
    score > 0
      ? score
      : null;

  return {
    score:
      finite,

    rounded:
      finite != null
        ? Math.round(
            finite
          )
        : null,

    source:
      "DERIVED",

    persisted_field:
      null,

    persisted_value:
      null,

    formula:
      {
        minutes,
        km,
        ascent_m:
          ascent,

        avg_hr:
          Number.isFinite(
            avgHr
          )
            ? avgHr
            : null,

        hr_factor:
          hrFactor
      }
  };
}


function cgweb136Fix1BuildLoadAudit(
  current,
  beforeStats,
  afterActivity
) {
  const beforeActivity = {
    ...current,

    distance_m:
      beforeStats
        ?.distance_m ??
      current
        ?.distance_m,

    timer_time_ms:
      beforeStats
        ?.timer_time_ms ??
      current
        ?.timer_time_ms,

    elapsed_time_ms:
      beforeStats
        ?.elapsed_time_ms ??
      current
        ?.elapsed_time_ms,

    ascent_m:
      beforeStats
        ?.ascent_m ??
      current
        ?.ascent_m
  };

  const beforeLoadFields =
    cgweb136Fix1LoadFields(
      beforeActivity
    );

  const afterLoadFields =
    cgweb136Fix1LoadFields(
      afterActivity
    );

  const beforeCharge =
    cgweb136Fix1ChargeScore(
      beforeActivity
    );

  const afterCharge =
    cgweb136Fix1ChargeScore(
      afterActivity
    );

  const fieldsUnchanged =
    JSON.stringify(
      beforeLoadFields
    ) ===
    JSON.stringify(
      afterLoadFields
    );

  const roundedChanged =
    beforeCharge.rounded !==
    afterCharge.rounded;

  return {
    persisted_load_fields_unchanged:
      fieldsUnchanged,

    persisted_load_fields_before:
      beforeLoadFields,

    persisted_load_fields_after:
      afterLoadFields,

    charge_source_before:
      beforeCharge.source,

    charge_source_after:
      afterCharge.source,

    before_score:
      beforeCharge.score,

    after_score:
      afterCharge.score,

    before_rounded:
      beforeCharge.rounded,

    after_rounded:
      afterCharge.rounded,

    rounded_changed:
      roundedChanged,

    before_formula:
      beforeCharge.formula,

    after_formula:
      afterCharge.formula,

    explanation:
      (
        beforeCharge.source ===
          "DERIVED" &&
        afterCharge.source ===
          "DERIVED" &&
        roundedChanged
      )
        ? "DERIVED_CHARGE_CHANGED_AFTER_STRAVA_TARGET_STATS"
        : (
            fieldsUnchanged
              ? "PERSISTED_LOAD_UNCHANGED"
              : "PERSISTED_LOAD_FIELDS_CHANGED"
          )
  };
}


async function cgweb136Fix1PostExportAudit(
  uid,
  activityKey
) {
  const key =
    String(
      activityKey ||
      ""
    ).trim();

  if (
    !/^[A-Za-z0-9_.:-]{1,180}$/
      .test(key)
  ) {
    throw Object.assign(
      new Error(
        "CGWEB136 FIX1 : activity_key invalide."
      ),
      {
        status:
          400
      }
    );
  }

  const activityRef =
    firestore()
      .doc(
        `${ROOT}/${uid}/activities/${key}`
      );

  const lockRef =
    cgweb136ExportRef(
      uid,
      key
    );

  const [
    activitySnap,
    lockSnap
  ] =
    await Promise.all([
      activityRef.get(),
      lockRef.get()
    ]);

  if (!activitySnap.exists) {
    throw Object.assign(
      new Error(
        "CGWEB136 FIX1 : activité SPORT absente."
      ),
      {
        status:
          404
      }
    );
  }

  const activity =
    activitySnap.data() ||
    {};

  const lock =
    lockSnap.exists
      ? lockSnap.data() ||
        {}
      : {};

  const stravaId =
    String(
      activity
        ?.strava_activity_id ||
      lock
        ?.strava_activity_id ||
      ""
    ).trim();

  if (!stravaId) {
    throw Object.assign(
      new Error(
        "CGWEB136 FIX1 : activité non liée à Strava."
      ),
      {
        status:
          409
      }
    );
  }

  const detail =
    await stravaGet(
      uid,
      `/activities/${encodeURIComponent(
        stravaId
      )}?include_all_efforts=false`
    );

  const preExport = {
    distance_m:
      activity
        ?.pre_strava_export_distance_m ??
      lock
        ?.activity_snapshot
        ?.distance_m ??
      null,

    timer_time_ms:
      activity
        ?.pre_strava_export_timer_time_ms ??
      lock
        ?.activity_snapshot
        ?.timer_time_ms ??
      null,

    elapsed_time_ms:
      activity
        ?.pre_strava_export_elapsed_time_ms ??
      lock
        ?.activity_snapshot
        ?.elapsed_time_ms ??
      null,

    ascent_m:
      activity
        ?.pre_strava_export_ascent_m ??
      lock
        ?.activity_snapshot
        ?.ascent_m ??
      null,

    calories:
      activity
        ?.pre_strava_export_calories ??
      lock
        ?.activity_snapshot
        ?.calories ??
      null
  };

  const currentStrava = {
    distance_m:
      cgweb136Fix1Finite(
        detail?.distance
      ),

    timer_time_ms:
      cgweb136Fix1Finite(
        detail?.moving_time
      ) != null
        ? cgweb136Fix1Finite(
            detail.moving_time
          ) * 1000
        : null,

    elapsed_time_ms:
      cgweb136Fix1Finite(
        detail?.elapsed_time
      ) != null
        ? cgweb136Fix1Finite(
            detail.elapsed_time
          ) * 1000
        : null,

    ascent_m:
      cgweb136Fix1Finite(
        detail
          ?.total_elevation_gain
      ),

    calories:
      cgweb136Fix1Finite(
        detail?.calories
      )
  };

  const currentCgweb = {
    distance_m:
      cgweb136Fix1Finite(
        activity
          ?.distance_m
      ),

    timer_time_ms:
      cgweb136Fix1Finite(
        activity
          ?.timer_time_ms
      ),

    elapsed_time_ms:
      cgweb136Fix1Finite(
        activity
          ?.elapsed_time_ms
      ),

    ascent_m:
      cgweb136Fix1Finite(
        activity
          ?.ascent_m
      ),

    calories:
      cgweb136Fix1Finite(
        activity
          ?.calories
      )
  };

  const calorieAudit = {
    pre_export:
      cgweb136Fix1Finite(
        preExport.calories
      ),

    strava:
      currentStrava.calories,

    cgweb:
      currentCgweb.calories,

    strava_equals_cgweb:
      (
        currentStrava.calories !==
          null &&
        currentCgweb.calories !==
          null &&
        Math.abs(
          currentStrava.calories -
          currentCgweb.calories
        ) <
          0.000001
      )
  };

  const afterActivity = {
    ...activity,

    distance_m:
      currentCgweb.distance_m,

    timer_time_ms:
      currentCgweb.timer_time_ms,

    elapsed_time_ms:
      currentCgweb.elapsed_time_ms,

    ascent_m:
      currentCgweb.ascent_m
  };

  const loadAudit =
    cgweb136Fix1BuildLoadAudit(
      activity,
      preExport,
      afterActivity
    );

  /*
   * Vérification supplémentaire :
   * le patch réellement journalisé par CGWEB136 ne devait contenir
   * aucun des champs de charge persistés.
   */
  const reconciliationPatch =
    lock
      ?.final_result
      ?.cgweb_patch ||
    {};

  const touchedLoadFields =
    CGWEB136_FIX1_LOAD_FIELDS
      .filter(
        field =>
          Object.prototype
            .hasOwnProperty
            .call(
              reconciliationPatch,
              field
            )
      );

  loadAudit.reconciliation_patch_touched_load_fields =
    touchedLoadFields;

  loadAudit.reconciliation_patch_preserved_load_fields =
    touchedLoadFields.length ===
    0;

  const targetChecks = {};

  for (
    const metric of [
      "distance_m",
      "timer_time_ms",
      "elapsed_time_ms",
      "ascent_m",
      "calories"
    ]
  ) {
    const cgweb =
      currentCgweb[metric];

    const strava =
      currentStrava[metric];

    targetChecks[metric] = {
      cgweb,
      strava,

      equal:
        (
          cgweb !== null &&
          strava !== null &&
          Math.abs(
            cgweb -
            strava
          ) <
            0.000001
        )
    };
  }

  const allTargetStatsSynced =
    Object
      .values(
        targetChecks
      )
      .every(
        row =>
          row.equal
      );

  const lockState =
    String(
      lock?.state ||
      ""
    );

  /*
   * Backfill de l'état explicite pour les activités déjà exportées
   * avant CGWEB136 FIX1.
   *
   * Aucun chiffre sportif n'est modifié ici.
   */
  if (
    lockState ===
      "RECONCILED" &&
    allTargetStatsSynced
  ) {
    await activityRef.set(
      {
        strava_export_state:
          "RECONCILED",

        strava_export_synced_at_ms:
          Number(
            lock
              ?.reconciled_at_ms ||
            activity
              ?.strava_reconciled_at_ms ||
            Date.now()
          ),

        strava_export_post_audit_version:
          CGWEB136_FIX1_VERSION,

        strava_export_post_audit_at_ms:
          Date.now(),

        pre_strava_export_charge_score:
          loadAudit
            .before_score,

        post_strava_export_charge_score:
          loadAudit
            .after_score,

        strava_load_fields_immutable:
          (
            loadAudit
              .persisted_load_fields_unchanged &&
            loadAudit
              .reconciliation_patch_preserved_load_fields
          )
      },
      {
        merge:
          true
      }
    );
  }

  const result = {
    ok:
      (
        allTargetStatsSynced &&
        calorieAudit
          .strava_equals_cgweb &&
        loadAudit
          .persisted_load_fields_unchanged &&
        loadAudit
          .reconciliation_patch_preserved_load_fields
      ),

    status:
      allTargetStatsSynced
        ? "POST_EXPORT_SYNC_OK"
        : "POST_EXPORT_SYNC_MISMATCH",

    version:
      CGWEB136_FIX1_VERSION,

    activity_key:
      key,

    strava_activity_id:
      stravaId,

    lock_state:
      lockState ||
      null,

    activity_state:
      (
        lockState ===
          "RECONCILED" &&
        allTargetStatsSynced
      )
        ? "RECONCILED"
        : (
            activity
              ?.strava_export_state ||
            null
          ),

    pre_export:
      preExport,

    strava:
      currentStrava,

    cgweb:
      currentCgweb,

    target_checks:
      targetChecks,

    all_target_stats_synced:
      allTargetStatsSynced,

    calories_audit:
      calorieAudit,

    load_immutability_audit:
      loadAudit
  };

  await cgweb136Audit(
    uid,
    key,
    "POST_EXPORT_AUDIT",
    {
      fix_version:
        CGWEB136_FIX1_VERSION,

      strava_activity_id:
        stravaId,

      all_target_stats_synced:
        allTargetStatsSynced,

      calories_audit:
        calorieAudit,

      load_immutability_audit:
        loadAudit
    }
  );

  return result;
}


/* CGWEB136_FIX1_SERVER_END */


/* CGWEB136_SERVER_END */


exports.stravaBridge = onRequest(
  {region:REGION, secrets:[STRAVA_CLIENT_SECRET], timeoutSeconds:120, cors:false},
  async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") return res.status(204).send("");

    try {
      const action = String(req.query.action || "");

      if (action === "oauth_callback") {
        const state = String(req.query.state || "");
        const code = String(req.query.code || "");
        if (!state || !code) return res.status(400).send(callbackHtml(false, "Code/state absent."));

        const stateRef = firestore().doc(`strava_oauth_states/${state}`);
        const stateSnap = await stateRef.get();
        if (!stateSnap.exists) return res.status(400).send(callbackHtml(false, "État OAuth invalide ou expiré."));
        const stateData = stateSnap.data();
        await stateRef.delete();
        if (Date.now() - Number(stateData.created_at_ms || 0) > 10 * 60 * 1000) {
          return res.status(400).send(callbackHtml(false, "État OAuth expiré."));
        }

        const token = await exchangeCode(code);
        await integrationRef(stateData.uid).set({
          athlete:token.athlete || null,
          access_token:token.access_token,
          refresh_token:token.refresh_token,
          expires_at:token.expires_at,
          scope:String(token.scope || stateData.scope || ""),
          requested_scope:String(stateData.scope || ""),
          connected_at_ms:Date.now(),
          updated_at_ms:Date.now(),
          server_sync_version:WEBSTRAVA_VERSION
        }, {merge:true});
        await mapAthleteToUid(stateData.uid, token.athlete);
        try {
          await ensureWebhookSubscription({force:true});
        } catch (error) {
          console.error("WEBSTRAVA003 subscription after OAuth", error);
        }
        res.set("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(callbackHtml(true, "Vous pouvez revenir dans SPORT Web."));
      }

      const decoded = await requireUser(req);
      const uid = decoded.uid;

      if (action === "health") {
        return res.json({
          ok:true,
          region:REGION,
          configured:Boolean(STRAVA_CLIENT_ID.value() && STRAVA_REDIRECT_URI.value()),
          server_sync_version:WEBSTRAVA_VERSION
        });
      }

      if (action === "status") {
        const data = await tokenDocument(uid);
        if (data?.athlete) await mapAthleteToUid(uid, data.athlete);
        let webhook = {active:false};
        let webhookError = null;
        if (data?.refresh_token) {
          try {
            webhook = await ensureWebhookSubscription();
          } catch (error) {
            webhookError = error?.message || String(error);
            console.error("WEBSTRAVA003 ensure subscription", error);
          }
        }
        return res.json({
          connected:Boolean(data?.refresh_token),
          configured:Boolean(STRAVA_CLIENT_ID.value() && STRAVA_REDIRECT_URI.value()),
          athlete:data?.athlete || null,
          scope:data?.scope || null,
          write_authorized:
            cgweb134ScopeHas(
              data?.scope,
              "activity:write"
            ),
          webhook:{
            active:Boolean(webhook?.active),
            subscription_id:webhook?.subscription_id || null,
            callback_url:webhook?.callback_url || webhookCallbackUrl(),
            error:webhookError
          },
          server_sync_version:WEBSTRAVA_VERSION
        });
      }

      if (action === "webhook_ensure" && req.method === "POST") {
        const data = await tokenDocument(uid);
        if (data?.athlete) await mapAthleteToUid(uid, data.athlete);
        const webhook = await ensureWebhookSubscription({force:true});
        return res.json({ok:true, webhook});
      }

      if (action === "oauth_start") {
        const clientId = STRAVA_CLIENT_ID.value();
        const redirectUri = STRAVA_REDIRECT_URI.value();
        if (!clientId || !redirectUri) {
          throw Object.assign(new Error("Configuration Strava serveur incomplète."), {status:503});
        }

        const state = crypto.randomBytes(24).toString("hex");
        const scope = "read,activity:read_all,activity:write";
        await firestore().doc(`strava_oauth_states/${state}`).set({
          uid,
          scope,
          created_at_ms:Date.now()
        });

        const authorize = new URL("https://www.strava.com/oauth/authorize");
        authorize.searchParams.set("client_id", clientId);
        authorize.searchParams.set("response_type", "code");
        authorize.searchParams.set("redirect_uri", redirectUri);
        authorize.searchParams.set("approval_prompt", "force");
        authorize.searchParams.set("scope", scope);
        authorize.searchParams.set("state", state);
        return res.json({authorize_url:authorize.toString()});
      }


      if (
        action ===
          "export_preflight" &&
        req.method ===
          "POST"
      ) {
        const integration =
          await tokenDocument(
            uid
          );

        if (
          !integration
            ?.refresh_token
        ) {
          return res.json({
            ok:
              false,

            status:
              "STRAVA_NOT_CONNECTED"
          });
        }

        if (
          !cgweb134ScopeHas(
            integration?.scope,
            "activity:write"
          )
        ) {
          return res.json({
            ok:
              false,

            status:
              "ACTIVITY_WRITE_REQUIRED",

            scope:
              integration?.scope ||
              ""
          });
        }

        const activityKey =
          String(
            req.body
              ?.activity_key ||
            ""
          ).trim();

        if (
          !/^[A-Za-z0-9_.:-]{1,180}$/
            .test(
              activityKey
            )
        ) {
          throw Object.assign(
            new Error(
              "Identifiant d'activité invalide."
            ),
            {
              status:
                400
            }
          );
        }

        const activityRef =
          firestore()
            .doc(
              `${ROOT}/${uid}/activities/${activityKey}`
            );

        const activitySnap =
          await activityRef.get();

        if (
          !activitySnap.exists
        ) {
          throw Object.assign(
            new Error(
              "Activité SPORT introuvable."
            ),
            {
              status:
                404
            }
          );
        }

        const activity = {
          __docId:
            activityKey,

          ...activitySnap.data()
        };

        if (
          activity
            ?.deleted_at_ms != null
        ) {
          return res.json({
            ok:
              false,

            status:
              "INELIGIBLE_DELETED"
          });
        }

        const parts =
          cgweb134ParisParts(
            activity
              ?.start_time_ms
          );

        if (
          !parts ||
          !Number.isFinite(
            parts.year
          )
        ) {
          return res.json({
            ok:
              false,

            status:
              "INELIGIBLE_DATE"
          });
        }

        /*
         * Le chantier historique CGWEB134 est strictement
         * réservé aux activités avant 2026.
         */
        if (
          parts.year >= 2026
        ) {
          return res.json({
            ok:
              false,

            status:
              "INELIGIBLE_NOT_HISTORICAL",

            activity_year:
              parts.year
          });
        }

        const linkedStravaId =
          String(
            activity
              ?.strava_activity_id ||
            ""
          ).trim();

        if (linkedStravaId) {
          return res.json({
            ok:
              false,

            status:
              "ALREADY_LINKED",

            strava_activity_id:
              linkedStravaId
          });
        }

        /*
         * CGWEB136 · RESUMABLE_EXPORT_GUARD001
         *
         * Une fois le POST Strava engagé, le verrou ne doit JAMAIS être
         * remplacé par un nouveau préflight, même après rechargement
         * du navigateur.
         */
        const existingOutboundSnap =
          await cgweb134OutboundRef(
            uid,
            activityKey
          ).get();

        if (existingOutboundSnap.exists) {
          const existingOutbound =
            existingOutboundSnap.data() ||
            {};

          const existingState =
            String(
              existingOutbound.state ||
              ""
            );

          if (
            [
              "UPLOAD_REQUESTING",
              "UPLOADED_PROCESSING",
              "POSTCHECK_INCOMPLETE",
              "UPLOAD_UNKNOWN",
              "STRAVA_ERROR"
            ].includes(
              existingState
            )
          ) {
            return res.json({
              ok:
                existingState ===
                  "UPLOADED_PROCESSING" ||
                existingState ===
                  "POSTCHECK_INCOMPLETE",

              status:
                existingState ===
                  "UPLOADED_PROCESSING"
                  ? "UPLOAD_IN_PROGRESS"
                  : existingState,

              activity_key:
                activityKey,

              lock_token:
                existingOutbound
                  .lock_token ||
                null,

              external_id:
                existingOutbound
                  .external_id ||
                null,

              strava_upload_id:
                existingOutbound
                  .strava_upload_id ||
                null,

              strava_activity_id:
                existingOutbound
                  .strava_activity_id ||
                null,

              fit_preview:
                existingOutbound
                  .fit_preview ||
                null,

              error:
                existingOutbound
                  .last_error ||
                null
            });
          }
        }

        const duplicateGuard =
          await cgweb134DuplicateGuard(
            uid,
            activity
          );

        if (
          duplicateGuard
            .candidate_count > 0
        ) {
          return res.json({
            ok:
              false,

            status:
              "DUPLICATE_BLOCKED",

            duplicate_guard:
              duplicateGuard,

            activity_snapshot:
              cgweb134ActivitySnapshot(
                activity
              )
          });
        }

        const lock =
          await cgweb134AcquireOutboundLock(
            uid,
            activityKey,
            activity,
            duplicateGuard
          );

        return res.json({
          ok:
            true,

          status:
            "READY_LOCKED",

          export_version:
            CGWEB134_EXPORT_VERSION,

          activity_key:
            activityKey,

          activity_snapshot:
            lock
              .activity_snapshot,

          external_id:
            lock
              .external_id,

          lock_token:
            lock
              .lock_token,

          lock_reused:
            Boolean(
              lock.reused
            ),

          lock_expires_at_ms:
            lock
              .expires_at_ms,

          duplicate_guard:
            lock
              .duplicate_guard,

          upload_performed:
            false
        });
      }




      /* CGWEB136_FIX1_ACTION_START */

      if (
        action ===
          "export_post_audit" &&
        req.method ===
          "POST"
      ) {
        const body =
          req.body &&
          typeof req.body ===
            "object" &&
          !Buffer.isBuffer(
            req.body
          )
            ? req.body
            : {};

        return res.json(
          await cgweb136Fix1PostExportAudit(
            uid,
            String(
              body
                ?.activity_key ||
              ""
            ).trim()
          )
        );
      }

      /* CGWEB136_FIX1_ACTION_END */


      /* CGWEB136_ACTIONS_START */

      if (
        action ===
          "export_upload" &&
        req.method ===
          "POST"
      ) {
        const body =
          req.body &&
          typeof req.body ===
            "object" &&
          !Buffer.isBuffer(
            req.body
          )
            ? req.body
            : {};

        return res.json(
          await cgweb136UploadSingle(
            uid,
            body
          )
        );
      }


      if (
        action ===
          "export_status" &&
        req.method ===
          "POST"
      ) {
        const body =
          req.body &&
          typeof req.body ===
            "object" &&
          !Buffer.isBuffer(
            req.body
          )
            ? req.body
            : {};

        return res.json(
          await cgweb136PollSingle(
            uid,
            body
          )
        );
      }

      /* CGWEB136_ACTIONS_END */


      if (action === "activities") {
        const after = Math.max(0, Number(req.query.after || 0));
        const activities = [];
        for (let page = 1; page <= 5; page++) {
          const query = `/athlete/activities?after=${Math.floor(after)}&page=${page}&per_page=100`;
          const rows = await stravaGet(uid, query);
          if (!Array.isArray(rows) || !rows.length) break;
          activities.push(...rows);
          if (rows.length < 100) break;
        }
        return res.json({activities});
      }

      if (action === "activity") {
        const id = String(req.query.id || "");
        if (!/^\d+$/.test(id)) throw Object.assign(new Error("ID Strava invalide."), {status:400});
        const payload = await fetchStravaActivityDetail(uid, id);
        return res.json(payload);
      }

      if (action === "disconnect" && req.method === "POST") {
        const data = await tokenDocument(uid);
        if (data?.access_token) {
          try {
            await fetch("https://www.strava.com/oauth/deauthorize", {
              method:"POST",
              headers:{
                "Authorization":`Bearer ${data.access_token}`,
                "Content-Type":"application/x-www-form-urlencoded"
              }
            });
          } catch (error) {
            console.warn("Strava deauthorize", error);
          }
        }
        if (data?.athlete?.id) {
          await athleteMapRef(data.athlete.id).delete().catch(() => {});
        }
        await integrationRef(uid).delete();
        return res.json({ok:true});
      }

      return res.status(404).json({error:"Action Strava inconnue."});
    } catch (error) {
      console.error(error);
      return res.status(Number(error.status) || 500).json({error:error.message || String(error)});
    }
  }
);


/* WEB074_FITCLOUD001_INDEX_START */
const {
  createFitVault,
  createServerJoinBatchWorker
} = require("./fitvault");

exports.fitVault = createFitVault();

/* CGWEB123 FIX4 · SERVER_BATCH_ORCHESTRATOR001 */
exports.joinBatchWorker =
  createServerJoinBatchWorker();
/* WEB074_FITCLOUD001_INDEX_END */

/* CGWEB094B_AUTOEQUIP_WRITEWATCH001_INDEX_START */
const {
  createAutoEquipActivityWriteWatch
} = require("./autoequip");

exports.autoEquipActivity =
  createAutoEquipActivityWriteWatch();
/* CGWEB094B_AUTOEQUIP_WRITEWATCH001_INDEX_END */
