"use strict";

/* CGWEB075_FITWRITER001_IMPORT_START */
const {
  encodeCanonicalFit,
  inspectFitBuffer,
  fitWriterSelfTest,
  canonicalFitFileName,
  decodeCanonicalFitSummary
} = require("./fitwriter");
/* CGWEB075_FITWRITER001_IMPORT_END */


/* WEB074_FIX6_SELFCONTAINED_DEPS_START */
const {onRequest} = require("firebase-functions/v2/https");
const {getApps, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
const crypto = require("crypto");

if (!getApps().length) initializeApp();

const db = getFirestore();
const ROOT = "sport_users";
const REGION = "europe-west1";

async function requireUser(req) {
  const auth = String(req.headers.authorization || "");

  if (!auth.startsWith("Bearer ")) {
    throw Object.assign(
      new Error("Firebase bearer token manquant."),
      {status: 401}
    );
  }

  return getAuth().verifyIdToken(auth.slice(7));
}
/* WEB074_FIX6_SELFCONTAINED_DEPS_END */


const SPORT_FIT_BUCKET = "sport-505813.firebasestorage.app";
const SPORT_FIT_MAX_BYTES = 25 * 1024 * 1024;

function createFitVault() {
  function cors(res) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set(
      "Access-Control-Allow-Headers",
      [
        "Authorization",
        "Content-Type",
        "X-Sport-Filename",
        "X-Sport-Source",
        "X-Sport-Mode",
        "X-Sport-Activity-Id",
        "X-Sport-Start-Ms",
        "X-Sport-Sport",
        "X-Sport-Sub-Sport"
      ].join(", ")
    );
    res.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  }

  function safeName(value) {
    const raw = String(value || "activity.fit").trim() || "activity.fit";
    const cleaned = raw
      .replace(/[\\/]+/g, "_")
      .replace(/[\u0000-\u001f\u007f]+/g, "_")
      .slice(0, 180);
    return cleaned.toLowerCase().endsWith(".fit") ? cleaned : `${cleaned}.fit`;
  }

  function sha256(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  function files(uid) {
    return db.collection(`${ROOT}/${uid}/activity_files`);
  }

  function fileDoc(uid, hash) {
    return files(uid).doc(String(hash));
  }

  function bucket() {
    return getStorage().bucket(SPORT_FIT_BUCKET);
  }

  function objectPath(uid, hash, startMs) {
    let year = "unknown";
    const n = Number(startMs);
    if (Number.isFinite(n) && n > 0) {
      const y = new Date(n).getUTCFullYear();
      if (Number.isInteger(y) && y >= 1980 && y <= 2200) year = String(y);
    }
    return `sport_users/${uid}/fit_vault/${year}/${hash}.fit`;
  }

  async function resolveActivity(uid, explicitActivityId, startMs, sport) {
    const explicit = String(explicitActivityId || "").trim();
    if (explicit) {
      const snap = await db.doc(`${ROOT}/${uid}/activities/${explicit}`).get();
      if (snap.exists) return {activity_id: explicit, link_status: "LINKED_EXPLICIT"};
    }

    const start = Number(startMs);
    if (!Number.isFinite(start) || start <= 0) {
      return {activity_id: null, link_status: "UNLINKED_NO_TIME"};
    }

    const snap = await db.collection(`${ROOT}/${uid}/activities`)
      .where("start_time_ms", ">=", start - 180000)
      .where("start_time_ms", "<=", start + 180000)
      .limit(30)
      .get();

    const wantedSport = Number(sport);
    const candidates = [];

    for (const docSnap of snap.docs) {
      const row = docSnap.data() || {};
      if (row.deleted_at_ms != null) continue;
      if (Number.isFinite(wantedSport) && wantedSport > 0 && Number(row.sport) !== wantedSport) continue;
      candidates.push({
        id: docSnap.id,
        delta: Math.abs(Number(row.start_time_ms || 0) - start)
      });
    }

    candidates.sort((a, b) => a.delta - b.delta);

    if (candidates.length === 1) {
      return {activity_id: candidates[0].id, link_status: "LINKED_AUTO"};
    }
    if (candidates.length > 1 && candidates[0].delta + 1000 < candidates[1].delta) {
      return {activity_id: candidates[0].id, link_status: "LINKED_AUTO_NEAREST"};
    }
    return {
      activity_id: null,
      link_status: candidates.length ? "UNLINKED_AMBIGUOUS" : "UNLINKED_NO_MATCH"
    };
  }

  /* CGWEB076_FITROUNDTRIP001_HELPERS_START */
  function rtFinite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function rtFirstFinite(...values) {
    for (const value of values) {
      const n = rtFinite(value);
      if (n != null) return n;
    }
    return null;
  }

  function rtArray(route, ...keys) {
    for (const key of keys) {
      const value = route?.[key];
      if (Array.isArray(value)) return value;
    }
    return [];
  }

  function rtMetric(name, source, fit, tolerance = 0) {
    const s = rtFinite(source);
    const f = rtFinite(fit);

    if (s == null) {
      return {
        metric: name,
        source: null,
        fit: f,
        delta: null,
        tolerance,
        tested: false,
        ok: true
      };
    }

    if (f == null) {
      return {
        metric: name,
        source: s,
        fit: null,
        delta: null,
        tolerance,
        tested: true,
        ok: false
      };
    }

    const delta = f - s;
    return {
      metric: name,
      source: s,
      fit: f,
      delta,
      tolerance,
      tested: true,
      ok: Math.abs(delta) <= tolerance
    };
  }

  function rtDurationMs(activity) {
    const direct = rtFirstFinite(
      activity?.elapsed_time_ms,
      activity?.timer_time_ms,
      activity?.moving_time_ms,
      activity?.duration_ms
    );
    if (direct != null && direct >= 0) return direct;

    const start = rtFinite(activity?.start_time_ms);
    const end = rtFinite(activity?.end_time_ms);
    if (start != null && end != null && end >= start) return end - start;
    return null;
  }

  function rtBuildPayload(activity, route) {
    const startMs = rtFinite(activity?.start_time_ms);
    if (startMs == null || startMs <= 0) {
      throw Object.assign(new Error("FITROUNDTRIP001 : start_time_ms absent."), {status: 422});
    }

    const sport = rtFinite(activity?.sport);
    if (sport == null) {
      throw Object.assign(new Error("FITROUNDTRIP001 : sport absent."), {status: 422});
    }

    const subSport = rtFirstFinite(activity?.sub_sport, activity?.subSport, 0) ?? 0;
    const durationMs = rtDurationMs(activity);
    if (durationMs == null || durationMs <= 0) {
      throw Object.assign(new Error("FITROUNDTRIP001 : durée absente ou nulle."), {status: 422});
    }

    const lat = rtArray(route, "lat", "latitude", "latitudes");
    const lon = rtArray(route, "lon", "lng", "longitude", "longitudes");
    const alt = rtArray(route, "alt_m", "altitude_m", "altitude", "altitudes");
    const dist = rtArray(route, "distance_m", "distance", "distances");
    const times = rtArray(route, "time_ms", "timestamp_ms", "timestamps_ms");
    const hrs = rtArray(route, "hr_bpm", "heart_rate_bpm", "heart_rate", "hr");
    const cadence = rtArray(route, "cadence", "cadence_rpm");
    const power = rtArray(route, "power", "watts", "power_w");
    const speed = rtArray(route, "speed_mps", "enhanced_speed_mps", "speed");

    const count = Math.min(lat.length, lon.length);
    const valid = [];

    for (let i = 0; i < count; i += 1) {
      const latitude = rtFinite(lat[i]);
      const longitude = rtFinite(lon[i]);
      if (
        latitude == null || longitude == null ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180
      ) continue;
      valid.push({i, latitude, longitude});
    }

    if (valid.length < 2) {
      throw Object.assign(
        new Error("FITROUNDTRIP001 : activity_routes ne contient pas au moins 2 points GPS."),
        {status: 422}
      );
    }

    const sourceDistance = rtFinite(activity?.distance_m);
    const lastRouteDistance = [...valid]
      .reverse()
      .map(({i}) => rtFinite(dist[i]))
      .find((value) => value != null && value > 0) ?? null;

    const validTimes = valid
      .map(({i}) => rtFinite(times[i]))
      .filter((value) => value != null);
    const useRouteTiming =
      validTimes.length === valid.length &&
      validTimes[validTimes.length - 1] > validTimes[0];
    const routeTimeStart = useRouteTiming ? validTimes[0] : null;
    const routeTimeSpan = useRouteTiming
      ? validTimes[validTimes.length - 1] - validTimes[0]
      : null;

    const points = valid.map((row, position) => {
      const progress = valid.length > 1 ? position / (valid.length - 1) : 0;

      let pointTime = startMs + Math.round(durationMs * progress);
      if (useRouteTiming && routeTimeSpan > 0) {
        const raw = rtFinite(times[row.i]);
        const relative = Math.max(0, Math.min(1, (raw - routeTimeStart) / routeTimeSpan));
        pointTime = startMs + Math.round(durationMs * relative);
      }

      let pointDistance = rtFinite(dist[row.i]);
      if (sourceDistance != null && sourceDistance >= 0) {
        if (pointDistance != null && lastRouteDistance != null && lastRouteDistance > 0) {
          pointDistance = Math.max(0, pointDistance * (sourceDistance / lastRouteDistance));
        } else {
          pointDistance = sourceDistance * progress;
        }
      }

      const point = {
        timestamp_ms: pointTime,
        lat: row.latitude,
        lon: row.longitude,
        altitude_m: rtFinite(alt[row.i]),
        distance_m: pointDistance,
        heart_rate: rtFinite(hrs[row.i]),
        cadence: rtFinite(cadence[row.i]),
        power: rtFinite(power[row.i]),
        speed_mps: rtFinite(speed[row.i])
      };

      for (const key of Object.keys(point)) {
        if (point[key] == null) delete point[key];
      }
      return point;
    });

    return {
      payload: {
        start_time_ms: startMs,
        sport,
        sub_sport: subSport,
        duration_s: durationMs / 1000,
        total_timer_time_s: durationMs / 1000,
        distance_m: sourceDistance,
        total_ascent_m: rtFinite(activity?.ascent_m),
        avg_hr: rtFinite(activity?.avg_hr),
        max_hr: rtFinite(activity?.max_hr),
        points
      },
      source: {
        startMs,
        durationMs,
        distance: sourceDistance,
        ascent: rtFinite(activity?.ascent_m),
        avgHr: rtFinite(activity?.avg_hr),
        maxHr: rtFinite(activity?.max_hr),
        sport,
        subSport,
        sourcePointCount: rtFirstFinite(
          route?.source_point_count,
          activity?.gps_point_count,
          activity?.record_count
        ),
        previewPointCount: points.length,
        routeHasTime: useRouteTiming,
        routeHasHeartRate: hrs.some((value) => {
          const n = rtFinite(value);
          return n != null && n > 0;
        })
      }
    };
  }
  /* CGWEB076_FITROUNDTRIP001_HELPERS_END */

  return onRequest(
    {region: REGION, timeoutSeconds: 300, memory: "512MiB", cors: false},
    async (req, res) => {
      cors(res);
      if (req.method === "OPTIONS") return res.status(204).send("");

      try {
        const decoded = await requireUser(req);
        const uid = decoded.uid;
        const action = String(req.query.action || "health").trim();

        if (action === "health") {
          return res.json({
            ok: true,
            service: "FITCLOUD001",
            bucket: SPORT_FIT_BUCKET,
            max_bytes: SPORT_FIT_MAX_BYTES,
            historical_mode_creates_activities: false
          });
        }


        /* CGWEB075_FITWRITER001_ACTION_START */

        if (action === "writer_health") {
          if (req.method !== "GET" && req.method !== "POST") {
            return res.status(405).json({error: "GET/POST requis."});
          }

          const test = await fitWriterSelfTest();

          return res.json({
            ok: true,
            service: "FITWRITER001",
            sdk: "@garmin/fitsdk",
            bytes: test.bytes,
            file_name: test.fileName,
            point_count: test.stats.pointCount,
            integrity: test.check.integrity,
            activity_messages: test.check.activityCount,
            session_messages: test.check.sessionCount,
            lap_messages: test.check.lapCount,
            record_messages: test.check.recordCount,
            stored: false
          });
        }

        if (action === "generate") {
          if (req.method !== "POST") {
            return res.status(405).json({error: "POST requis."});
          }

          let payload = req.body;

          if (Buffer.isBuffer(payload)) {
            try {
              payload = JSON.parse(payload.toString("utf8"));
            } catch {
              payload = null;
            }
          }

          if (
            !payload ||
            typeof payload !== "object" ||
            Array.isArray(payload)
          ) {
            return res.status(400).json({
              error: "Corps JSON FITWRITER001 requis."
            });
          }

          const generated =
            await encodeCanonicalFit(payload);

          const check =
            await inspectFitBuffer(generated.buffer);

          if (!check.ok) {
            return res.status(500).json({
              error: "FIT généré invalide.",
              validation: check
            });
          }

          const requestedName =
            String(payload.file_name || "").trim();

          const fileName =
            safeName(
              requestedName ||
              generated.fileName ||
              canonicalFitFileName(
                generated.stats.startMs,
                "C"
              )
            );

          const hash =
            sha256(generated.buffer);

          const ref =
            fileDoc(uid, hash);

          const existing =
            await ref.get();

          const previous =
            existing.exists
              ? existing.data() || {}
              : {};

          const explicitActivityId =
            String(
              payload.activity_id || ""
            ).trim();

          const link =
            await resolveActivity(
              uid,
              explicitActivityId ||
                previous.activity_id,
              generated.stats.startMs,
              generated.stats.sport
            );

          const path =
            previous.object_path ||
            objectPath(
              uid,
              hash,
              generated.stats.startMs
            );

          const object =
            bucket().file(path);

          const [exists] =
            await object.exists();

          if (!exists) {
            await object.save(
              generated.buffer,
              {
                resumable: false,
                validation: "crc32c",
                contentType:
                  "application/vnd.ant.fit",
                metadata: {
                  cacheControl:
                    "private, no-store",
                  metadata: {
                    sha256: hash,
                    owner_uid: uid,
                    source:
                      "WEB_FITWRITER",
                    mode:
                      "GENERATED_CANONICAL",
                    writer:
                      "FITWRITER001"
                  }
                }
              }
            );
          }

          const now =
            Date.now();

          const metadata = {
            file_id: hash,
            sha256: hash,
            object_path: path,
            file_name: fileName,
            original_name:
              previous.original_name ||
              fileName,

            size_bytes:
              generated.buffer.length,

            mime_type:
              "application/vnd.ant.fit",

            source:
              "WEB_FITWRITER",

            upload_mode:
              "GENERATED_CANONICAL",

            start_time_ms:
              generated.stats.startMs,

            sport:
              generated.stats.sport,

            sub_sport:
              generated.stats.subSport,

            activity_id:
              link.activity_id ||
              previous.activity_id ||
              null,

            link_status:
              link.activity_id
                ? link.link_status
                : (
                    previous.link_status ||
                    link.link_status
                  ),

            point_count:
              generated.stats.pointCount,

            fit_integrity:
              true,

            fitwriter_version:
              "FITWRITER001",

            first_uploaded_at_ms:
              Number(
                previous.first_uploaded_at_ms ||
                now
              ),

            uploaded_at_ms: now,
            last_seen_at_ms: now,
            deleted_at_ms: null,

            storage_version:
              "FITCLOUD001"
          };

          await ref.set(
            metadata,
            {merge: true}
          );

          return res.json({
            ok: true,
            generated: true,
            deduplicated:
              Boolean(
                existing.exists ||
                exists
              ),
            file: metadata,
            validation: check,
            activities_created: 0
          });
        }

        /* CGWEB075_FITWRITER001_ACTION_END */

        /* CGWEB076_FITROUNDTRIP001_ACTION_START */
        if (action === "roundtrip") {
          if (req.method !== "POST") {
            return res.status(405).json({error: "POST requis."});
          }

          let body = req.body;
          if (Buffer.isBuffer(body)) {
            try { body = JSON.parse(body.toString("utf8")); }
            catch { body = null; }
          }
          if (!body || typeof body !== "object" || Array.isArray(body)) body = {};

          const activityId = String(body.activity_id || "").trim();
          if (!activityId || activityId.includes("/")) {
            return res.status(400).json({error: "activity_id réel requis."});
          }

          const activityRef = db.doc(`${ROOT}/${uid}/activities/${activityId}`);
          const routeRef = db.doc(`${ROOT}/${uid}/activity_routes/${activityId}`);

          const [activitySnap, routeSnap] = await Promise.all([
            activityRef.get(),
            routeRef.get()
          ]);

          if (!activitySnap.exists) {
            return res.status(404).json({error: `Activité ${activityId} absente de Firestore.`});
          }
          if (!routeSnap.exists) {
            return res.status(422).json({
              error: `Activité ${activityId} : activity_routes absent ; essai de l'activité suivante.`
            });
          }

          const activity = activitySnap.data() || {};
          if (activity.deleted_at_ms != null) {
            return res.status(422).json({error: "Activité source supprimée."});
          }

          const route = routeSnap.data() || {};
          const prepared = rtBuildPayload(activity, route);
          const generated = await encodeCanonicalFit(prepared.payload);
          const validation = await inspectFitBuffer(generated.buffer);

          if (!validation.ok) {
            return res.status(500).json({
              error: "FITROUNDTRIP001 : FIT généré invalide.",
              validation
            });
          }

          const decodedFit = await decodeCanonicalFitSummary(generated.buffer);
          const comparisons = [
            rtMetric("start_time_ms", prepared.source.startMs, decodedFit.startMs, 1000),
            rtMetric("sport", prepared.source.sport, decodedFit.sport, 0),
            rtMetric("sub_sport", prepared.source.subSport, decodedFit.subSport, 0),
            rtMetric("duration_s", prepared.source.durationMs / 1000, decodedFit.timerSeconds, 0.05),
            rtMetric("distance_m", prepared.source.distance, decodedFit.totalDistance, 0.5),
            rtMetric("ascent_m", prepared.source.ascent, decodedFit.totalAscent, 1),
            rtMetric("avg_hr", prepared.source.avgHr, decodedFit.avgHeartRate, 1),
            rtMetric("max_hr", prepared.source.maxHr, decodedFit.maxHeartRate, 1),
            rtMetric("preview_records", prepared.source.previewPointCount, decodedFit.recordCount, 0)
          ];

          const comparisonOk = comparisons.every((item) => item.ok);
          const structureOk =
            decodedFit.integrity &&
            !decodedFit.errors.length &&
            decodedFit.sessionCount === 1 &&
            decodedFit.lapCount >= 1 &&
            decodedFit.activityCount === 1;

          const roundtripOk = Boolean(validation.ok && structureOk && comparisonOk);

          const hash = sha256(generated.buffer);
          const ref = fileDoc(uid, hash);
          const existing = await ref.get();
          const previous = existing.exists ? existing.data() || {} : {};
          const path = previous.object_path || objectPath(uid, hash, prepared.source.startMs);
          const object = bucket().file(path);
          const [exists] = await object.exists();

          if (!exists) {
            await object.save(generated.buffer, {
              resumable: false,
              validation: "crc32c",
              contentType: "application/vnd.ant.fit",
              metadata: {
                cacheControl: "private, no-store",
                metadata: {
                  sha256: hash,
                  owner_uid: uid,
                  source: "WEB_FITROUNDTRIP_TEST",
                  mode: "ROUNDTRIP_PREVIEW_TEST",
                  writer: "FITWRITER001",
                  roundtrip: "FITROUNDTRIP001"
                }
              }
            });
          }

          const now = Date.now();
          const fileName = safeName(previous.file_name || generated.fileName);
          const metadata = {
            file_id: hash,
            sha256: hash,
            object_path: path,
            file_name: fileName,
            original_name: previous.original_name || fileName,
            size_bytes: generated.buffer.length,
            mime_type: "application/vnd.ant.fit",
            source: previous.source || "WEB_FITROUNDTRIP_TEST",
            upload_mode: previous.upload_mode || "ROUNDTRIP_PREVIEW_TEST",
            start_time_ms: prepared.source.startMs,
            sport: prepared.source.sport,
            sub_sport: prepared.source.subSport,
            activity_id: previous.activity_id || activityId,
            link_status: previous.link_status || "LINKED_ROUNDTRIP",
            point_count: generated.stats.pointCount,
            fit_integrity: Boolean(decodedFit.integrity),
            fitwriter_version: "FITWRITER001",
            fitroundtrip_version: "FITROUNDTRIP001",
            fitroundtrip_ok: roundtripOk,
            roundtrip_is_preview_test: true,
            lossless_source_reconstruction: false,
            roundtrip_source_activity_id: activityId,
            roundtrip_source_point_count: prepared.source.sourcePointCount,
            roundtrip_preview_point_count: prepared.source.previewPointCount,
            roundtrip_tested_at_ms: now,
            first_uploaded_at_ms: Number(previous.first_uploaded_at_ms || now),
            uploaded_at_ms: now,
            last_seen_at_ms: now,
            deleted_at_ms: null,
            storage_version: "FITCLOUD001"
          };

          await ref.set(metadata, {merge: true});

          return res.status(roundtripOk ? 200 : 409).json({
            ok: roundtripOk,
            service: "FITROUNDTRIP001",
            activity_id: activityId,
            activity_title: String(activity.custom_title || activity.file_name || "").trim(),
            source: prepared.source,
            fit: decodedFit,
            validation,
            comparisons,
            file: metadata,
            stored: true,
            deduplicated: Boolean(existing.exists || exists),
            activity_modified: false,
            activities_created: 0,
            activities_modified: 0
          });
        }
        /* CGWEB076_FITROUNDTRIP001_ACTION_END */

        if (action === "upload") {
          if (req.method !== "POST") return res.status(405).json({error: "POST requis."});

          const body = Buffer.isBuffer(req.rawBody)
            ? req.rawBody
            : Buffer.from(req.rawBody || []);

          if (!body.length) return res.status(400).json({error: "FIT vide."});
          if (body.length > SPORT_FIT_MAX_BYTES) {
            return res.status(413).json({error: "FIT supérieur à 25 Mo."});
          }
          if (body.length < 12 || body.subarray(8, 12).toString("ascii") !== ".FIT") {
            return res.status(400).json({error: "Signature FIT absente."});
          }

          const fileName = safeName(req.headers["x-sport-filename"]);
          const source = String(req.headers["x-sport-source"] || "WEB_UPLOAD").slice(0, 80);
          const mode = String(req.headers["x-sport-mode"] || "STANDARD").slice(0, 80);
          const explicitActivityId = String(req.headers["x-sport-activity-id"] || "").trim();
          const startMs = Number(req.headers["x-sport-start-ms"] || 0) || null;
          const sport = Number(req.headers["x-sport-sport"] || 0) || null;
          const subSport = Number(req.headers["x-sport-sub-sport"] || 0) || 0;
          const hash = sha256(body);
          const ref = fileDoc(uid, hash);
          const existing = await ref.get();
          const previous = existing.exists ? existing.data() || {} : {};

          const link = await resolveActivity(
            uid,
            explicitActivityId || previous.activity_id,
            startMs,
            sport
          );

          const path = previous.object_path || objectPath(uid, hash, startMs);
          const object = bucket().file(path);
          const [exists] = await object.exists();

          if (!exists) {
            await object.save(body, {
              resumable: false,
              validation: "crc32c",
              contentType: "application/vnd.ant.fit",
              metadata: {
                cacheControl: "private, no-store",
                metadata: {sha256: hash, owner_uid: uid, source, mode}
              }
            });
          }

          const now = Date.now();
          const metadata = {
            file_id: hash,
            sha256: hash,
            object_path: path,
            file_name: fileName,
            original_name: previous.original_name || fileName,
            size_bytes: body.length,
            mime_type: "application/vnd.ant.fit",
            source,
            upload_mode: mode,
            start_time_ms: startMs,
            sport,
            sub_sport: subSport,
            activity_id: link.activity_id || previous.activity_id || null,
            link_status: link.activity_id ? link.link_status : (previous.link_status || link.link_status),
            first_uploaded_at_ms: Number(previous.first_uploaded_at_ms || now),
            uploaded_at_ms: now,
            last_seen_at_ms: now,
            deleted_at_ms: null,
            storage_version: "FITCLOUD001"
          };

          await ref.set(metadata, {merge: true});

          return res.json({
            ok: true,
            deduplicated: Boolean(existing.exists || exists),
            file: metadata,
            activities_created: 0
          });
        }

        if (action === "list") {
          const requested = Math.max(1, Math.min(1000, Number(req.query.limit || 250)));
          const snap = await files(uid).orderBy("uploaded_at_ms", "desc").limit(requested).get();
          const rows = snap.docs
            .map((docSnap) => ({id: docSnap.id, ...(docSnap.data() || {})}))
            .filter((row) => row.deleted_at_ms == null);
          return res.json({ok: true, files: rows});
        }

        if (action === "delete") {
          if (req.method !== "POST" && req.method !== "DELETE") {
            return res.status(405).json({error: "POST/DELETE requis."});
          }
          const hash = String(req.query.sha256 || "").trim().toLowerCase();
          if (!/^[a-f0-9]{64}$/.test(hash)) {
            return res.status(400).json({error: "SHA-256 invalide."});
          }
          const ref = fileDoc(uid, hash);
          const snap = await ref.get();
          if (!snap.exists) return res.status(404).json({error: "FIT inconnu."});
          const row = snap.data() || {};
          if (row.object_path) {
            try {
              await bucket().file(String(row.object_path)).delete({ignoreNotFound: true});
            } catch (error) {
              console.warn("FITCLOUD001 delete", error.message);
            }
          }
          await ref.set({
            deleted_at_ms: Date.now(),
            updated_at_ms: Date.now(),
            link_status: "DELETED"
          }, {merge: true});
          return res.json({ok: true, sha256: hash, activities_deleted: 0});
        }

        if (action === "download") {
          const hash = String(req.query.sha256 || "").trim().toLowerCase();
          if (!/^[a-f0-9]{64}$/.test(hash)) {
            return res.status(400).json({error: "SHA-256 invalide."});
          }
          const snap = await fileDoc(uid, hash).get();
          if (!snap.exists) return res.status(404).json({error: "FIT inconnu."});
          const row = snap.data() || {};
          if (row.deleted_at_ms != null) return res.status(404).json({error: "FIT supprimé."});
          if (!row.object_path) return res.status(404).json({error: "Objet Storage absent."});
          const [buffer] = await bucket().file(String(row.object_path)).download();
          const fileName = safeName(row.file_name || `${hash}.fit`);
          res.set("Content-Type", "application/vnd.ant.fit");
          res.set("Content-Disposition", `attachment; filename="${fileName.replace(/"/g, "")}"`);
          res.set("Cache-Control", "private, no-store");
          return res.status(200).send(buffer);
        }

        return res.status(404).json({error: "Action FITCLOUD001 inconnue."});
      } catch (error) {
        console.error("FITCLOUD001", error);
        return res.status(Number(error.status) || 500).json({error: error.message || String(error)});
      }
    }
  );
}

module.exports = {createFitVault};
