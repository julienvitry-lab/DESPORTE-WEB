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
const STRAVA_API_BASE = "https://api-v3.strava.com";
const STRAVA_API_FALLBACK_BASE = "https://www.strava.com/api/v3";
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
    const response = await fetch(urls[index], {
      headers:{Authorization:`Bearer ${token}`}
    });
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

  const startMs = stravaStartMs(a);
  const count = Math.max(latlng.length, time.length, distance.length, altitude.length, hr.length, speed.length, cadence.length);
  const route = {
    lat:[], lon:[], alt_m:[], distance_m:[], time_ms:[], hr_bpm:[], speed_mps:[], cadence:[],
    source_point_count:count,
    web_preview_point_count:count,
    route_format:WEBSTRAVA_VERSION
  };

  for (let index = 0; index < count; index++) {
    const ll = latlng[index];
    route.lat.push(Array.isArray(ll) && Number.isFinite(Number(ll[0])) ? Number(ll[0]) : null);
    route.lon.push(Array.isArray(ll) && Number.isFinite(Number(ll[1])) ? Number(ll[1]) : null);
    route.alt_m.push(Number.isFinite(Number(altitude[index])) ? Number(altitude[index]) : null);
    route.distance_m.push(Number.isFinite(Number(distance[index])) ? Number(distance[index]) : null);
    route.time_ms.push(Number.isFinite(Number(time[index])) && Number.isFinite(startMs) ? startMs + Number(time[index]) * 1000 : null);
    route.hr_bpm.push(Number.isFinite(Number(hr[index])) ? Number(hr[index]) : null);
    route.speed_mps.push(Number.isFinite(Number(speed[index])) ? Number(speed[index]) : null);
    route.cadence.push(Number.isFinite(Number(cadence[index])) ? Number(cadence[index]) : null);
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

function serverEventId(stravaId, aspect, eventTime) {
  return `strava_${String(aspect || "create")}_${String(stravaId)}_${String(eventTime || Math.floor(Date.now()/1000))}`;
}

async function writeServerActivity(uid, activity, route, webhookEvent) {
  const root = firestore().doc(`${ROOT}/${uid}`);
  const activityKey = String(activity.id);
  const now = Date.now();
  const eventId = serverEventId(activity.strava_activity_id, webhookEvent?.aspect_type, webhookEvent?.event_time);
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

  const eventId = serverEventId(activity.strava_activity_id, webhookEvent?.aspect_type || "update", webhookEvent?.event_time);
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
      `/activities/${id}/streams?keys=time,distance,latlng,altitude,heartrate,velocity_smooth,cadence&key_by_type=true`
    );
  } catch (error) {
    console.warn("WEBSTRAVA003 streams unavailable", id, error?.message || error);
  }
  return {activity, streams};
}

async function importStravaActivityServer(uid, stravaId, webhookEvent) {
  const payload = await fetchStravaActivityDetail(uid, stravaId);
  const normalized = normalizeStravaDetailServer(payload);
  const activity = normalized.activity;
  const route = normalized.route;

  if (!Number.isFinite(Number(activity.start_time_ms))) {
    throw new Error(`Activité Strava ${stravaId} sans date valide.`);
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
          scope:stateData.scope,
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
        const scope = "read,activity:read_all";
        await firestore().doc(`strava_oauth_states/${state}`).set({
          uid,
          scope,
          created_at_ms:Date.now()
        });

        const authorize = new URL("https://www.strava.com/oauth/authorize");
        authorize.searchParams.set("client_id", clientId);
        authorize.searchParams.set("response_type", "code");
        authorize.searchParams.set("redirect_uri", redirectUri);
        authorize.searchParams.set("approval_prompt", "auto");
        authorize.searchParams.set("scope", scope);
        authorize.searchParams.set("state", state);
        return res.json({authorize_url:authorize.toString()});
      }

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
