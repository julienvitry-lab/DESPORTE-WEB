"use strict";

/* CGWEB075_FITWRITER001_IMPORT_START */
const {
  encodeCanonicalFit,
  inspectFitBuffer,
  fitWriterSelfTest,
  canonicalFitFileName,
  decodeCanonicalFitSummary,
  fitStartTimeMsFromBuffer
} = require("./fitwriter");
/* CGWEB075_FITWRITER001_IMPORT_END */


/* WEB074_FIX6_SELFCONTAINED_DEPS_START */
const {onRequest} = require("firebase-functions/v2/https");
const {getApps, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, FieldPath} = require("firebase-admin/firestore");
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

/* CGWEB078_FITVERSION001_HELPERS_START */
  function v078Finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function v078FirstFinite(...values) {
    for (const value of values) {
      const n = v078Finite(value);
      if (n != null) return n;
    }
    return null;
  }

  function v078Array(route, ...keys) {
    for (const key of keys) {
      const value = route?.[key];
      if (Array.isArray(value)) return value;
    }
    return [];
  }

  function v078DurationMs(activity) {
    const direct = v078FirstFinite(
      activity?.elapsed_time_ms,
      activity?.duration_ms,
      activity?.timer_time_ms,
      activity?.moving_time_ms
    );
    if (direct != null && direct >= 0) return direct;
    const start = v078Finite(activity?.start_time_ms);
    const end = v078Finite(activity?.end_time_ms);
    if (start != null && end != null && end >= start) return end - start;
    return 0;
  }

  function v078BuildPayload(activity, route) {
    const startMs = v078Finite(activity?.start_time_ms);
    const sport = v078Finite(activity?.sport);
    const subSport = v078FirstFinite(activity?.sub_sport, activity?.subSport, 0) ?? 0;

    if (startMs == null || startMs <= 0) {
      throw Object.assign(new Error("FITVERSION001 : start_time_ms absent."), {status: 422});
    }
    if (sport == null) {
      throw Object.assign(new Error("FITVERSION001 : sport absent."), {status: 422});
    }

    const durationMs = Math.max(0, v078DurationMs(activity));
    const timerMs = Math.max(
      0,
      v078FirstFinite(activity?.timer_time_ms, activity?.moving_time_ms, durationMs) ?? durationMs
    );
    const totalDistance = Math.max(0, v078FirstFinite(activity?.distance_m, 0) ?? 0);

    const lat = v078Array(route, "lat", "latitude", "latitudes");
    const lon = v078Array(route, "lon", "lng", "longitude", "longitudes");
    const alt = v078Array(route, "alt_m", "altitude_m", "altitude", "altitudes");
    const dist = v078Array(route, "distance_m", "distance", "distances");
    const times = v078Array(route, "time_ms", "timestamp_ms", "timestamps_ms");
    const hrs = v078Array(route, "hr_bpm", "heart_rate_bpm", "heart_rate", "hr");
    const cadence = v078Array(route, "cadence", "cadence_rpm");
    const power = v078Array(route, "power", "watts", "power_w");
    const speed = v078Array(route, "speed_mps", "enhanced_speed_mps", "speed");

    const count = Math.max(
      lat.length,
      lon.length,
      alt.length,
      dist.length,
      times.length,
      hrs.length,
      cadence.length,
      power.length,
      speed.length,
      0
    );

    const finiteTimes = times
      .map(v078Finite)
      .filter((value) => value != null);

    const useRouteTiming =
      finiteTimes.length >= 2 &&
      finiteTimes[finiteTimes.length - 1] > finiteTimes[0];

    const routeStart = useRouteTiming ? finiteTimes[0] : null;
    const routeSpan = useRouteTiming
      ? finiteTimes[finiteTimes.length - 1] - finiteTimes[0]
      : null;

    const finiteDistances = dist
      .map(v078Finite)
      .filter((value) => value != null && value >= 0);

    const routeLastDistance = finiteDistances.length
      ? finiteDistances[finiteDistances.length - 1]
      : null;

    const points = [];

    for (let i = 0; i < count; i += 1) {
      const progress = count > 1 ? i / (count - 1) : 0;

      let relative = progress;
      const rawTime = v078Finite(times[i]);
      if (useRouteTiming && rawTime != null && routeSpan > 0) {
        relative = Math.max(0, Math.min(1, (rawTime - routeStart) / routeSpan));
      }

      let pointDistance = v078Finite(dist[i]);
      if (routeLastDistance != null && routeLastDistance > 0 && pointDistance != null) {
        pointDistance = Math.max(0, pointDistance * (totalDistance / routeLastDistance));
      } else {
        pointDistance = totalDistance * relative;
      }

      const latitude = v078Finite(lat[i]);
      const longitude = v078Finite(lon[i]);

      const point = {
        timestamp_ms: startMs + Math.round(durationMs * relative),
        distance_m: pointDistance,
        altitude_m: v078Finite(alt[i]),
        heart_rate: v078Finite(hrs[i]),
        cadence: v078Finite(cadence[i]),
        power: v078Finite(power[i]),
        speed_mps: v078Finite(speed[i])
      };

      if (
        latitude != null && longitude != null &&
        latitude >= -90 && latitude <= 90 &&
        longitude >= -180 && longitude <= 180
      ) {
        point.lat = latitude;
        point.lon = longitude;
      }

      for (const key of Object.keys(point)) {
        if (point[key] == null) delete point[key];
      }

      points.push(point);
    }

    if (!points.length) {
      points.push({
        timestamp_ms: startMs,
        distance_m: 0,
        heart_rate: v078Finite(activity?.avg_hr)
      });

      if (durationMs > 0) {
        points.push({
          timestamp_ms: startMs + durationMs,
          distance_m: totalDistance,
          heart_rate: v078FirstFinite(activity?.max_hr, activity?.avg_hr)
        });
      }
    } else {
      points[0].timestamp_ms = startMs;
      if (durationMs > 0) {
        if (points.length === 1) {
          points.push({
            ...points[0],
            timestamp_ms: startMs + durationMs,
            distance_m: totalDistance
          });
        } else {
          points[points.length - 1].timestamp_ms = startMs + durationMs;
          points[points.length - 1].distance_m = totalDistance;
        }
      }
    }

    return {
      payload: {
        start_time_ms: startMs,
        sport,
        sub_sport: subSport,
        duration_s: durationMs / 1000,
        total_timer_time_s: timerMs / 1000,
        distance_m: totalDistance,
        total_ascent_m: v078Finite(activity?.ascent_m),
        avg_hr: v078Finite(activity?.avg_hr),
        max_hr: v078Finite(activity?.max_hr),
        points
      },
      source: {
        startMs,
        durationMs,
        timerMs,
        distance: totalDistance,
        ascent: v078Finite(activity?.ascent_m),
        avgHr: v078Finite(activity?.avg_hr),
        maxHr: v078Finite(activity?.max_hr),
        sport,
        subSport,
        pointCount: points.length
      }
    };
  }

  function v078ApplyOverrides(prepared, body) {
    const payload = prepared.payload;
    const source = prepared.source;

    const offsetSeconds = Math.max(
      -86400,
      Math.min(86400, v078Finite(body?.start_offset_s) ?? 0)
    );
    const offsetMs = Math.round(offsetSeconds * 1000);

    if (offsetMs !== 0) {
      payload.start_time_ms += offsetMs;
      payload.points = payload.points.map((point) => ({
        ...point,
        timestamp_ms: Number(point.timestamp_ms) + offsetMs
      }));
    }

    const avgOverride = v078Finite(body?.avg_hr_override);
    const maxOverride = v078Finite(body?.max_hr_override);
    const hasHrOverride = avgOverride != null || maxOverride != null;

    let avgHr = avgOverride ?? source.avgHr;
    let maxHr = maxOverride ?? source.maxHr;

    if (hasHrOverride) {
      if (avgHr == null && maxHr != null) avgHr = Math.round(maxHr * 0.82);
      if (maxHr == null && avgHr != null) maxHr = Math.round(avgHr + 18);
      if (avgHr != null) avgHr = Math.max(20, Math.min(250, Math.round(avgHr)));
      if (maxHr != null) maxHr = Math.max(20, Math.min(260, Math.round(maxHr)));
      if (avgHr != null && maxHr != null && maxHr < avgHr) maxHr = avgHr;

      payload.avg_hr = avgHr;
      payload.max_hr = maxHr;

      if (avgHr != null && maxHr != null) {
        payload.points = v085aSyntheticHeartRate(payload, source, avgHr, maxHr);
      }
    }

    return {
      payload,
      edits: {
        start_offset_s: offsetSeconds,
        start_time_ms_source: source.startMs,
        start_time_ms_version: payload.start_time_ms,
        heart_rate_mode: hasHrOverride ? "SIMULATED" : "SOURCE",
        avg_hr_override: hasHrOverride ? avgHr : null,
        max_hr_override: hasHrOverride ? maxHr : null
      }
    };
  }

  async function v078NextVersionIndex(uid, activityId) {
    const snap = await files(uid)
      .where("activity_id", "==", String(activityId))
      .limit(500)
      .get();

    let max = 1;
    for (const docSnap of snap.docs) {
      const row = docSnap.data() || {};
      if (row.deleted_at_ms != null) continue;
      const n = Number(row.version_index || 1);
      if (Number.isFinite(n) && n > max) max = Math.floor(n);
    }
    return max + 1;
  }

  function v078VersionedName(baseName, versionIndex) {
    const safe = safeName(baseName || "activity.fit");
    const suffix = String(Math.max(2, Number(versionIndex) || 2)).padStart(2, "0");
    return safe.replace(/(?:_\d{2})?\.fit$/i, `_${suffix}.fit`);
  }

  /* CGWEB085A_FITEDITOR001_BACKEND_START */

  function v085aInterpolatePoint(a, b, ratio) {
    const out = {};
    for (const key of [
      "lat",
      "lon",
      "altitude_m",
      "distance_m",
      "cadence",
      "power",
      "speed_mps"
    ]) {
      const x = v078Finite(a?.[key]);
      const y = v078Finite(b?.[key]);
      if (x != null && y != null) out[key] = x + (y - x) * ratio;
      else if (x != null) out[key] = x;
      else if (y != null) out[key] = y;
    }
    return out;
  }

  function v085aDensifyPoints(payload, source) {
    const points = Array.isArray(payload?.points)
      ? payload.points.map((point) => ({...point}))
      : [];

    if (
      points.length >= 12 ||
      !Number.isFinite(Number(source?.durationMs)) ||
      Number(source.durationMs) <= 0
    ) {
      return points;
    }

    const durationMs = Number(source.durationMs);
    const count = Math.max(
      12,
      Math.min(900, Math.round(durationMs / 15000) + 1)
    );

    const first = points[0] || {
      timestamp_ms: payload.start_time_ms,
      distance_m: 0
    };

    const last = points[points.length - 1] || {
      timestamp_ms: payload.start_time_ms + durationMs,
      distance_m: Number(payload.distance_m || 0)
    };

    const out = [];

    for (let i = 0; i < count; i += 1) {
      const ratio = count > 1 ? i / (count - 1) : 0;
      const interpolated = v085aInterpolatePoint(first, last, ratio);

      out.push({
        ...interpolated,
        timestamp_ms: Math.round(payload.start_time_ms + durationMs * ratio),
        distance_m: Number.isFinite(Number(payload.distance_m))
          ? Number(payload.distance_m) * ratio
          : Number(interpolated.distance_m || 0)
      });
    }

    return out;
  }

  function v085aSyntheticHeartRate(payload, source, average, maximum) {
    const avg = Math.max(40, Math.min(240, Math.round(Number(average))));
    const max = Math.max(avg, Math.min(260, Math.round(Number(maximum))));
    let points = v085aDensifyPoints(payload, source);

    if (!points.length) return points;

    const spread = Math.max(8, max - avg);

    const speeds = points
      .map((point) => v078Finite(point.speed_mps))
      .filter((value) => value != null && value >= 0);

    const powers = points
      .map((point) => v078Finite(point.power))
      .filter((value) => value != null && value >= 0);

    const maxSpeed = speeds.length ? Math.max(...speeds) : 0;
    const maxPower = powers.length ? Math.max(...powers) : 0;

    const raw = [];
    const efforts = [];

    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const previous = points[Math.max(0, i - 1)];
      const progress = points.length > 1 ? i / (points.length - 1) : 0.5;

      const distanceDelta = Math.max(
        0,
        Number(point.distance_m || 0) - Number(previous.distance_m || 0)
      );

      const altitudeDelta =
        Number(point.altitude_m || 0) - Number(previous.altitude_m || 0);

      const grade = distanceDelta >= 10
        ? Math.max(-0.20, Math.min(0.30, altitudeDelta / distanceDelta))
        : 0;

      const speed = v078Finite(point.speed_mps);
      const power = v078Finite(point.power);

      const speedEffort =
        maxSpeed > 0 && speed != null ? speed / maxSpeed : 0.50;

      const powerEffort =
        maxPower > 0 && power != null ? power / maxPower : speedEffort;

      const warmup = Math.min(1, progress / 0.10);
      const drift = progress * 0.14;
      const climb = Math.max(0, grade) * 2.0;
      const wave =
        0.045 * Math.sin(progress * Math.PI * 8) +
        0.020 * Math.sin(progress * Math.PI * 17);

      const effort =
        (0.54 * speedEffort + 0.22 * powerEffort + climb + drift + wave) *
        (0.62 + 0.38 * warmup);

      efforts.push(effort);
      raw.push(avg + (effort - 0.50) * spread * 0.95);
    }

    const smooth = [];
    for (let i = 0; i < raw.length; i += 1) {
      smooth.push(i === 0 ? raw[i] : smooth[i - 1] * 0.80 + raw[i] * 0.20);
    }

    const mean = smooth.reduce((sum, value) => sum + value, 0) / smooth.length;
    const floor = Math.max(35, avg - Math.max(12, Math.round(spread * 0.70)));

    let values = smooth.map((value) =>
      Math.max(floor, Math.min(max, Math.round(value + (avg - mean))))
    );

    let peakIndex = 0;
    for (let i = 1; i < efforts.length; i += 1) {
      if (efforts[i] > efforts[peakIndex]) peakIndex = i;
    }

    values[peakIndex] = max;

    for (let pass = 0; pass < 3; pass += 1) {
      const currentAvg =
        values.reduce((sum, value) => sum + value, 0) / values.length;
      const delta = avg - currentAvg;

      values = values.map((value, index) => {
        if (index === peakIndex) return max;
        return Math.max(floor, Math.min(max - 1, Math.round(value + delta)));
      });

      values[peakIndex] = max;
    }

    return points.map((point, index) => ({
      ...point,
      heart_rate: values[index]
    }));
  }

  async function v085aActivateVersion(
    uid,
    activityId,
    targetRef,
    fileRow,
    activity,
    edited
  ) {
    const now = Date.now();

    const family = await files(uid)
      .where("activity_id", "==", String(activityId))
      .limit(500)
      .get();

    const batch = db.batch();

    for (const docSnap of family.docs) {
      batch.set(
        docSnap.ref,
        {
          is_active_version: docSnap.id === fileRow.sha256,
          active_changed_at_ms: now
        },
        {merge: true}
      );
    }

    batch.set(
      targetRef,
      {
        is_active_version: true,
        active_changed_at_ms: now
      },
      {merge: true}
    );

    const patch = {
      fit_active_sha256: fileRow.sha256,
      fit_active_version_index: Number(fileRow.version_index || 1),
      fit_active_file_name: fileRow.file_name || null,
      fit_editor_version: "FITEDITOR001",
      fit_updated_at_ms: now
    };

    const offsetMs =
      Math.round(Number(edited?.edits?.start_offset_s || 0) * 1000);

    if (offsetMs !== 0) {
      patch.start_time_ms = Number(edited.payload.start_time_ms);

      const oldEnd = v078Finite(activity?.end_time_ms);
      if (oldEnd != null) patch.end_time_ms = oldEnd + offsetMs;
    }

    if (String(edited?.edits?.heart_rate_mode || "") === "SIMULATED") {
      patch.avg_hr = edited.edits.avg_hr_override;
      patch.max_hr = edited.edits.max_hr_override;
      patch.heart_rate_source = "SYNTHETIC";
      patch.heart_rate_source_version = "FITEDITOR001";
      patch.heart_rate_profile = "SYNTHETIC_COHERENT_V1";
    }

    batch.set(
      db.doc(ROOT + "/" + uid + "/activities/" + activityId),
      patch,
      {merge: true}
    );

    await batch.commit();
    return patch;
  }

  /* CGWEB085A_FITEDITOR001_BACKEND_END */

  /* CGWEB078_FITVERSION001_HELPERS_END */



  /* CGWEB088_FITRECOVERY001_HELPERS_START */
  function v088Core(activity) {
    const startMs = rtFinite(activity?.start_time_ms);
    const sport = rtFinite(activity?.sport);
    const subSport = rtFirstFinite(activity?.sub_sport, activity?.subSport, 0) ?? 0;
    const durationMs = rtDurationMs(activity);
    const distance = Math.max(0, rtFirstFinite(activity?.distance_m, 0) ?? 0);
    const missing = [];
    if (startMs == null || startMs <= 0) missing.push("start_time_ms");
    if (sport == null) missing.push("sport");
    if (durationMs == null || durationMs <= 0) missing.push("duration");
    return {ok:!missing.length,missing,startMs,sport,subSport,durationMs,distance};
  }



  /* CGWEB088_FIX4_FITRECOVERY_NORMALIZE001_START */

  function v088MeaningfulHr(value) {
    if (value==null || value==="") return null;
    const n=Number(value);
    return Number.isFinite(n) && n>0 ? n : null;
  }

  function v088HrNormalizations(activity) {
    const out=[];
    for (const [field,value] of [
      ["avg_hr",activity?.avg_hr],
      ["max_hr",activity?.max_hr]
    ]) {
      if (value==null || value==="") continue;
      const n=Number(value);
      if (Number.isFinite(n) && n<=0) {
        out.push(field+":"+n+"->ABSENT");
      }
    }
    return out;
  }

  function v088NormalizePrepared(prepared,activity) {
    const out={
      ...prepared,
      payload:{...(prepared?.payload||{})},
      source:{...(prepared?.source||{})},
      normalizations:[
        ...(Array.isArray(prepared?.normalizations)
          ? prepared.normalizations
          : []),
        ...v088HrNormalizations(activity)
      ]
    };

    const avg=v088MeaningfulHr(activity?.avg_hr);
    const max=v088MeaningfulHr(activity?.max_hr);

    out.source.avgHr=avg;
    out.source.maxHr=max;

    if (avg==null) delete out.payload.avg_hr;
    else out.payload.avg_hr=avg;

    if (max==null) delete out.payload.max_hr;
    else out.payload.max_hr=max;

    out.normalizations=[...new Set(out.normalizations)];
    return out;
  }

  /* CGWEB088_FIX4_FITRECOVERY_NORMALIZE001_END */

  function v088SummaryPayload(activity) {
    const c=v088Core(activity);
    if (!c.ok) throw Object.assign(
      new Error("FITRECOVERY001 : données insuffisantes ("+c.missing.join(", ")+")."),
      {status:422}
    );
    const avgHr=v088MeaningfulHr(activity?.avg_hr);
    const maxHr=v088MeaningfulHr(activity?.max_hr);
    const endHr=rtFirstFinite(maxHr,avgHr);
    const points=[
      {timestamp_ms:c.startMs,distance_m:0,...(avgHr!=null?{heart_rate:avgHr}:{})},
      {timestamp_ms:c.startMs+c.durationMs,distance_m:c.distance,...(endHr!=null?{heart_rate:endHr}:{})}
    ];
    const payload={
      start_time_ms:c.startMs,sport:c.sport,sub_sport:c.subSport,
      duration_s:c.durationMs/1000,total_timer_time_s:c.durationMs/1000,
      distance_m:c.distance,total_ascent_m:rtFinite(activity?.ascent_m),
      points
    };
    if (avgHr!=null) payload.avg_hr=avgHr;
    if (maxHr!=null) payload.max_hr=maxHr;
    return {
      payload,
      source:{
        startMs:c.startMs,durationMs:c.durationMs,distance:c.distance,
        ascent:rtFinite(activity?.ascent_m),avgHr,maxHr,
        sport:c.sport,subSport:c.subSport,
        sourcePointCount:0,previewPointCount:2,
        routeHasTime:false,routeHasHeartRate:false
      },
      routeMode:"SUMMARY_ONLY",
      normalizations:v088HrNormalizations(activity)
    };
  }

  function v088BuildPayload(activity,route) {
    if (route && typeof route==="object") {
      try {
        const full=rtBuildPayload(activity,route);
        return v088NormalizePrepared(
          {...full,routeMode:"ROUTE_PREVIEW"},
          activity
        );
      } catch (error) {
        const m=String(error?.message||error||"");
        if (!m.includes("activity_routes") && !m.includes("2 points GPS")) throw error;
      }
    }
    return v088NormalizePrepared(
      v088SummaryPayload(activity),
      activity
    );
  }

  function v088Near(a,b,t) {
    if (a==null) return true;
    a=Number(a); b=Number(b);
    return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=t;
  }

  function v088Validate(prepared,decoded,validation) {
    const structure=Boolean(
      validation?.ok && decoded?.integrity &&
      Array.isArray(decoded?.errors) && decoded.errors.length===0 &&
      Number(decoded.sessionCount)===1 &&
      Number(decoded.activityCount)===1 &&
      Number(decoded.lapCount)>=1
    );

    const normalizations=Array.isArray(prepared?.normalizations)
      ? [...prepared.normalizations]
      : [];

    const sourceSub=rtFinite(prepared?.source?.subSport);
    const fitSub=rtFinite(decoded?.subSport);

    let subSportOk=v088Near(sourceSub,fitSub,0);

    /*
     * FIT SDK : si une ancienne valeur sub_sport n'est pas représentable
     * pour le sport concerné, l'encodage canonique retombe sur 0 = generic.
     * Le sport principal reste obligatoire et strictement contrôlé.
     *
     * On accepte UNIQUEMENT ce rabattement vers generic.
     * Toute autre divergence de sous-sport continue de bloquer le FIT.
     */
    if (
      !subSportOk &&
      fitSub===0 &&
      sourceSub!=null &&
      sourceSub!==0
    ) {
      subSportOk=true;
      normalizations.push(
        "sub_sport:"+sourceSub+"->0(FIT_GENERIC)"
      );
    }

    const metrics={
      start:v088Near(prepared.source.startMs,decoded.startMs,1000),
      sport:v088Near(prepared.source.sport,decoded.sport,0),
      sub_sport:subSportOk,
      duration:v088Near(prepared.source.durationMs/1000,decoded.timerSeconds,0.1),
      distance:v088Near(prepared.source.distance,decoded.totalDistance,1),
      ascent:v088Near(prepared.source.ascent,decoded.totalAscent,2),
      avg_hr:v088Near(prepared.source.avgHr,decoded.avgHeartRate,1),
      max_hr:v088Near(prepared.source.maxHr,decoded.maxHeartRate,1)
    };

    return {
      ok:structure&&Object.values(metrics).every(Boolean),
      structure_ok:structure,
      metrics,
      normalization_version:"FITRECOVERY_NORMALIZE001",
      normalized_fields:[...new Set(normalizations)]
    };
  }

  async function v088LinkedIds(uid) {
    const set=new Set();
    const stream=files(uid).select("activity_id","deleted_at_ms").stream();
    for await (const snap of stream) {
      const row=snap.data()||{};
      if (row.deleted_at_ms!=null) continue;
      const id=String(row.activity_id||"").trim();
      if (id) set.add(id);
    }
    return set;
  }

  async function v088Inventory(uid) {
    const linked=await v088LinkedIds(uid);
    const candidates=[], insufficient=[];
    let active=0, already=0;
    const stream=db.collection(`${ROOT}/${uid}/activities`).select(
      "start_time_ms","sport","sub_sport","elapsed_time_ms","timer_time_ms",
      "moving_time_ms","duration_ms","end_time_ms","distance_m","ascent_m",
      "avg_hr","max_hr","custom_title","name","title","deleted_at_ms"
    ).stream();

    for await (const snap of stream) {
      const a=snap.data()||{};
      if (a.deleted_at_ms!=null) continue;
      active++;
      const id=String(snap.id);
      if (linked.has(id)) { already++; continue; }
      const c=v088Core(a);
      if (!c.ok) {
        insufficient.push({activity_id:id,start_time_ms:c.startMs,missing:c.missing});
        continue;
      }
      candidates.push({
        activity_id:id,start_time_ms:c.startMs,sport:c.sport,
        sub_sport:c.subSport,duration_ms:c.durationMs,
        distance_m:c.distance,title:String(a.custom_title||a.name||a.title||"")
      });
    }
    candidates.sort((a,b)=>Number(b.start_time_ms||0)-Number(a.start_time_ms||0));
    insufficient.sort((a,b)=>Number(b.start_time_ms||0)-Number(a.start_time_ms||0));
    return {active,already,candidates,insufficient};
  }

  async function v088RecoverOne(uid,candidate) {
    const id=String(candidate.activity_id||"").trim();
    const activityRef=db.doc(`${ROOT}/${uid}/activities/${id}`);
    const routeRef=db.doc(`${ROOT}/${uid}/activity_routes/${id}`);
    const [activitySnap,routeSnap]=await Promise.all([activityRef.get(),routeRef.get()]);
    if (!activitySnap.exists) return {ok:false,activity_id:id,status:"ACTIVITY_MISSING"};
    const activity=activitySnap.data()||{};
    if (activity.deleted_at_ms!=null) return {ok:false,activity_id:id,status:"ACTIVITY_DELETED"};

    const existingLink=await files(uid).where("activity_id","==",id).limit(1).get();
    if (existingLink.docs.some(x=>(x.data()||{}).deleted_at_ms==null)) {
      return {ok:true,activity_id:id,status:"ALREADY_HAS_FIT",stored:false};
    }

    const route=routeSnap.exists ? (routeSnap.data()||{}) : null;
    const prepared=v088BuildPayload(activity,route);
    prepared.payload.activity_id=id;
    prepared.payload.fit_signature_seed=id;
    const generated=await encodeCanonicalFit(prepared.payload);
    const validation=await inspectFitBuffer(generated.buffer);
    const decoded=await decodeCanonicalFitSummary(generated.buffer);
    const checked=v088Validate(prepared,decoded,validation);
    if (!checked.ok) return {
      ok:false,activity_id:id,status:"VALIDATION_FAILED",
      route_mode:prepared.routeMode,validation:checked
    };

    const hash=sha256(generated.buffer);
    const ref=fileDoc(uid,hash);
    const priorSnap=await ref.get();
    const prior=priorSnap.exists?(priorSnap.data()||{}):{};
    if (
      priorSnap.exists && prior.deleted_at_ms==null &&
      String(prior.activity_id||"").trim() &&
      String(prior.activity_id)!==id
    ) return {ok:false,activity_id:id,status:"HASH_CONFLICT_OTHER_ACTIVITY",sha256:hash};

    const path=prior.object_path||objectPath(uid,hash,prepared.source.startMs);
    const object=bucket().file(path);
    const [objectExists]=await object.exists();
    if (!objectExists) await object.save(generated.buffer,{
      resumable:false,validation:"crc32c",contentType:"application/vnd.ant.fit",
      metadata:{cacheControl:"private, no-store",metadata:{
        sha256:hash,owner_uid:uid,source:"WEB_FITRECOVERY",
        mode:"BACKFILL_CANONICAL",writer:"FITWRITER001",
        recovery:"FITRECOVERY001",backfill:"FITBACKFILL001"
      }}
    });

    const now=Date.now();
    const fileName=safeName(prior.file_name||generated.fileName||"activity.fit");
    const metadata={
      file_id:hash,sha256:hash,object_path:path,file_name:fileName,
      original_name:prior.original_name||fileName,size_bytes:generated.buffer.length,
      mime_type:"application/vnd.ant.fit",source:prior.source||"WEB_FITRECOVERY",
      upload_mode:prior.upload_mode||"BACKFILL_CANONICAL",
      start_time_ms:prepared.source.startMs,sport:prepared.source.sport,
      sub_sport:prepared.source.subSport,activity_id:id,
      link_status:"LINKED_RECOVERY",point_count:generated.stats.pointCount,
      fit_integrity:true,fitwriter_version:"FITWRITER001",
      fit_signature:generated.stats.fitSignature||null,
      fit_signature_version:generated.stats.fitSignatureVersion||null,
      fit_signature_serial:Number(generated.stats.serialNumber||0)||null,
      fit_signature_seed_source:generated.stats.fitSignatureSeedSource||null,
      fitrecovery_version:"FITRECOVERY001",fitbackfill_version:"FITBACKFILL001",
      fitrecovery_normalize_version:"FITRECOVERY_NORMALIZE001",
      recovery_normalized_fields:Array.isArray(checked.normalized_fields)
        ? checked.normalized_fields
        : [],
      fitrecovery_normalize_version:"FITRECOVERY_NORMALIZE001",
      recovery_normalized_fields:Array.isArray(checked.normalized_fields)
        ? checked.normalized_fields
        : [],
      recovery_route_mode:prepared.routeMode,recovery_is_canonical:true,
      lossless_source_reconstruction:false,parent_sha256:prior.parent_sha256||null,
      version_index:Number(prior.version_index||1),
      is_active_version:Boolean(prior.is_active_version),
      first_uploaded_at_ms:Number(prior.first_uploaded_at_ms||now),
      uploaded_at_ms:now,last_seen_at_ms:now,deleted_at_ms:null,
      storage_version:"FITCLOUD001"
    };
    await ref.set(metadata,{merge:true});
    return {
      ok:true,activity_id:id,status:"STORED",stored:true,
      deduplicated:Boolean(priorSnap.exists||objectExists),
      route_mode:prepared.routeMode,sha256:hash,file_name:fileName,
      size_bytes:generated.buffer.length
    };
  }
  /* CGWEB088_FIX3_FITBACKFILL_ERROR_DIAGNOSTIC001_HELPER_START */

  function v088DiagDecoded(decoded) {
    return {
      integrity:Boolean(decoded?.integrity),
      errors:Array.isArray(decoded?.errors) ? decoded.errors : [],
      start_ms:rtFinite(decoded?.startMs),
      sport:rtFinite(decoded?.sport),
      sub_sport:rtFinite(decoded?.subSport),
      duration_s:rtFinite(decoded?.timerSeconds),
      distance_m:rtFinite(decoded?.totalDistance),
      ascent_m:rtFinite(decoded?.totalAscent),
      avg_hr:rtFinite(decoded?.avgHeartRate),
      max_hr:rtFinite(decoded?.maxHeartRate),
      records:rtFinite(decoded?.recordCount),
      laps:rtFinite(decoded?.lapCount),
      sessions:rtFinite(decoded?.sessionCount),
      activities:rtFinite(decoded?.activityCount)
    };
  }

  async function v088DiagnoseOne(uid,candidate) {
    const id=String(candidate?.activity_id||"").trim();
    if (!id) {
      return {ok:false,status:"INVALID_ACTIVITY_ID",activity_id:id};
    }

    const activityRef=db.doc(`${ROOT}/${uid}/activities/${id}`);
    const routeRef=db.doc(`${ROOT}/${uid}/activity_routes/${id}`);

    const [activitySnap,routeSnap]=await Promise.all([
      activityRef.get(),
      routeRef.get()
    ]);

    if (!activitySnap.exists) {
      return {ok:false,activity_id:id,status:"ACTIVITY_MISSING"};
    }

    const activity=activitySnap.data()||{};

    if (activity.deleted_at_ms!=null) {
      return {ok:false,activity_id:id,status:"ACTIVITY_DELETED"};
    }

    const existingLink=await files(uid)
      .where("activity_id","==",id)
      .limit(1)
      .get();

    if (existingLink.docs.some(x=>(x.data()||{}).deleted_at_ms==null)) {
      return {
        ok:true,
        activity_id:id,
        status:"ALREADY_HAS_FIT",
        diagnostic_only:true
      };
    }

    const route=routeSnap.exists ? (routeSnap.data()||{}) : null;
    const prepared=v088BuildPayload(activity,route);

    prepared.payload.activity_id=id;
    prepared.payload.fit_signature_seed=id;

    const generated=await encodeCanonicalFit(prepared.payload);
    const lowLevel=await inspectFitBuffer(generated.buffer);
    const decoded=await decodeCanonicalFitSummary(generated.buffer);
    const checked=v088Validate(prepared,decoded,lowLevel);
    const hash=sha256(generated.buffer);

    if (!checked.ok) {
      return {
        ok:false,
        activity_id:id,
        status:"VALIDATION_FAILED",
        diagnostic_only:true,
        route_mode:prepared.routeMode,
        sha256:hash,
        fit_signature:generated.stats?.fitSignature||null,
        fit_signature_serial:Number(generated.stats?.serialNumber||0)||null,
        validation:checked,
        decoded:v088DiagDecoded(decoded)
      };
    }

    const priorSnap=await fileDoc(uid,hash).get();
    const prior=priorSnap.exists ? (priorSnap.data()||{}) : {};

    if (
      priorSnap.exists &&
      prior.deleted_at_ms==null &&
      String(prior.activity_id||"").trim() &&
      String(prior.activity_id)!==id
    ) {
      return {
        ok:false,
        activity_id:id,
        status:"HASH_CONFLICT_OTHER_ACTIVITY",
        diagnostic_only:true,
        route_mode:prepared.routeMode,
        sha256:hash,
        conflict_activity_id:String(prior.activity_id),
        fit_signature:generated.stats?.fitSignature||null,
        fit_signature_serial:Number(generated.stats?.serialNumber||0)||null,
        validation:checked,
        decoded:v088DiagDecoded(decoded)
      };
    }

    return {
      ok:true,
      activity_id:id,
      status:"VALID",
      diagnostic_only:true,
      route_mode:prepared.routeMode,
      sha256:hash,
      fit_signature:generated.stats?.fitSignature||null,
      fit_signature_serial:Number(generated.stats?.serialNumber||0)||null,
      validation:checked,
      decoded:v088DiagDecoded(decoded)
    };
  }

  /* CGWEB088_FIX3_FITBACKFILL_ERROR_DIAGNOSTIC001_HELPER_END */

  /* CGWEB088_FITRECOVERY001_HELPERS_END */

  /* CGWEB088_FIX1_FITSIGNATURE001_BACKEND */

  /* CGWEB090_FIT_RECONCILE001_HELPERS_START */

  const C090_ROLE_ORIGINAL = "ORIGINAL_HISTORICAL";
  const C090_ROLE_BACKFILL = "CANONICAL_BACKFILL";
  const C090_ROLE_GENERATED = "CANONICAL_GENERATED";
  const C090_ROLE_EDITED = "EDITED_VERSION";
  const C090_ROLE_UNKNOWN = "UNKNOWN";

  function c090Strings(values) {
    const out = [];
    const seen = new Set();

    for (const value of values || []) {
      const text = String(value ?? "").trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }

    return out;
  }

  function c090IncomingRole(source, mode) {
    const src = String(source || "").toUpperCase();
    const md = String(mode || "").toUpperCase();

    if (
      md === "HISTORICAL_ORIGINAL" ||
      md === "HISTORICAL_FILE_ONLY" ||
      md === "FUTURE_IMPORT_ORIGINAL" ||
      src === "HISTORICAL_ARCHIVE_TRANSFER" ||
      src === "HISTORICAL_PHONE_MIGRATION" ||
      src === "WEB_MANUAL_FIT_FUTURE"
    ) {
      return C090_ROLE_ORIGINAL;
    }

    if (
      md === "BACKFILL_CANONICAL" ||
      src === "WEB_FITRECOVERY"
    ) {
      return C090_ROLE_BACKFILL;
    }

    if (
      md === "VERSIONED_CANONICAL" ||
      src === "WEB_FITEDITOR" ||
      src === "WEB_FITVERSION"
    ) {
      return C090_ROLE_EDITED;
    }

    if (
      md.includes("CANONICAL") ||
      src.includes("FITWRITER") ||
      src.includes("STRAVA")
    ) {
      return C090_ROLE_GENERATED;
    }

    return C090_ROLE_UNKNOWN;
  }

  function c090Roles(row) {
    const roles = new Set(
      Array.isArray(row?.archive_roles)
        ? row.archive_roles.map((x) => String(x || "").trim()).filter(Boolean)
        : []
    );

    const inferred = c090IncomingRole(
      String(row?.source || ""),
      String(row?.upload_mode || "")
    );

    if (inferred !== C090_ROLE_UNKNOWN) {
      roles.add(inferred);
    }

    if (
      row?.fitbackfill_version ||
      row?.fitrecovery_version ||
      row?.recovery_is_canonical === true
    ) {
      roles.add(C090_ROLE_BACKFILL);
    }

    if (
      Number(row?.version_index || 0) > 1 ||
      row?.fitversion_version ||
      row?.fit_editor_version ||
      String(row?.version_kind || "").includes("CANONICAL")
    ) {
      roles.add(C090_ROLE_EDITED);
    }

    if (
      row?.fitwriter_version &&
      !roles.has(C090_ROLE_BACKFILL) &&
      !roles.has(C090_ROLE_EDITED)
    ) {
      roles.add(C090_ROLE_GENERATED);
    }

    if (!roles.size) {
      roles.add(C090_ROLE_UNKNOWN);
    }

    return [...roles];
  }

  function c090MergeArchiveRoles(previous, incomingRole) {
    return c090Strings([
      ...(Array.isArray(previous?.archive_roles) ? previous.archive_roles : []),
      ...c090Roles(previous),
      incomingRole
    ]);
  }

  function c090IsOriginalRole(role) {
    return String(role) === C090_ROLE_ORIGINAL;
  }

  function c090IsCanonicalRole(role) {
    return [
      C090_ROLE_BACKFILL,
      C090_ROLE_GENERATED,
      C090_ROLE_EDITED
    ].includes(String(role));
  }

  async function c090Reconcile(uid) {
    const activityIds = new Set();
    const states = new Map();

    const activityQuery =
      db.collection(`${ROOT}/${uid}/activities`)
        .select("deleted_at_ms");

    for await (const snap of activityQuery.stream()) {
      const row = snap.data() || {};
      if (row.deleted_at_ms != null) continue;

      const id = String(snap.id);
      activityIds.add(id);
      states.set(id, {
        any: false,
        original: false,
        canonical: false,
        edited: false,
        fileCount: 0,
        originalCount: 0,
        canonicalCount: 0
      });
    }

    const fitQuery =
      files(uid).select(
        "activity_id",
        "sha256",
        "file_name",
        "source",
        "upload_mode",
        "archive_roles",
        "observed_sources",
        "observed_modes",
        "start_time_ms",
        "sport",
        "sub_sport",
        "link_status",
        "fitwriter_version",
        "fitrecovery_version",
        "fitbackfill_version",
        "recovery_is_canonical",
        "fitversion_version",
        "fit_editor_version",
        "version_index",
        "version_kind",
        "deleted_at_ms"
      );

    let fitFilesActive = 0;
    let originalFiles = 0;
    let canonicalBackfillFiles = 0;
    let canonicalGeneratedFiles = 0;
    let editedVersionFiles = 0;
    let unknownFiles = 0;
    let unlinkedOriginalFiles = 0;
    let ambiguousOriginalFiles = 0;
    let danglingLinkedFiles = 0;

    const unlinkedOriginalExamples = [];
    const ambiguousOriginalExamples = [];
    const canonicalOnlyExamples = [];

    for await (const snap of fitQuery.stream()) {
      const row = snap.data() || {};
      if (row.deleted_at_ms != null) continue;

      fitFilesActive += 1;

      const roles = c090Roles(row);
      const original = roles.some(c090IsOriginalRole);
      const canonical = roles.some(c090IsCanonicalRole);

      if (roles.includes(C090_ROLE_ORIGINAL)) originalFiles += 1;
      if (roles.includes(C090_ROLE_BACKFILL)) canonicalBackfillFiles += 1;
      if (roles.includes(C090_ROLE_GENERATED)) canonicalGeneratedFiles += 1;
      if (roles.includes(C090_ROLE_EDITED)) editedVersionFiles += 1;
      if (roles.includes(C090_ROLE_UNKNOWN)) unknownFiles += 1;

      const activityId = String(row.activity_id || "").trim();
      const linkedState = activityId ? states.get(activityId) : null;

      if (linkedState) {
        linkedState.any = true;
        linkedState.fileCount += 1;

        if (original) {
          linkedState.original = true;
          linkedState.originalCount += 1;
        }

        if (canonical) {
          linkedState.canonical = true;
          linkedState.canonicalCount += 1;
        }

        if (roles.includes(C090_ROLE_EDITED)) {
          linkedState.edited = true;
        }
      } else {
        if (activityId && !activityIds.has(activityId)) {
          danglingLinkedFiles += 1;
        }

        if (original) {
          unlinkedOriginalFiles += 1;

          const example = {
            sha256: String(row.sha256 || snap.id),
            file_name: String(row.file_name || ""),
            start_time_ms: Number(row.start_time_ms || 0) || null,
            sport: Number(row.sport || 0) || null,
            sub_sport: Number(row.sub_sport || 0) || 0,
            link_status: String(row.link_status || "UNLINKED"),
            source: String(row.source || ""),
            upload_mode: String(row.upload_mode || "")
          };

          if (unlinkedOriginalExamples.length < 100) {
            unlinkedOriginalExamples.push(example);
          }

          if (String(row.link_status || "") === "UNLINKED_AMBIGUOUS") {
            ambiguousOriginalFiles += 1;
            if (ambiguousOriginalExamples.length < 100) {
              ambiguousOriginalExamples.push(example);
            }
          }
        }
      }
    }

    let activitiesWithAnyFit = 0;
    let activitiesWithOriginal = 0;
    let activitiesCanonicalOnly = 0;
    let activitiesWithBoth = 0;
    let activitiesOriginalOnly = 0;
    let activitiesWithEditedVersion = 0;

    for (const [activityId, state] of states.entries()) {
      if (state.any) activitiesWithAnyFit += 1;
      if (state.original) activitiesWithOriginal += 1;
      if (state.edited) activitiesWithEditedVersion += 1;

      if (state.original && state.canonical) {
        activitiesWithBoth += 1;
      } else if (state.original) {
        activitiesOriginalOnly += 1;
      } else if (state.canonical) {
        activitiesCanonicalOnly += 1;

        if (canonicalOnlyExamples.length < 100) {
          canonicalOnlyExamples.push({
            activity_id: activityId,
            canonical_count: state.canonicalCount,
            file_count: state.fileCount
          });
        }
      }
    }

    return {
      activities_active: activityIds.size,
      activities_with_any_fit: activitiesWithAnyFit,
      activities_without_fit: Math.max(0, activityIds.size - activitiesWithAnyFit),
      activities_with_original: activitiesWithOriginal,
      activities_canonical_only: activitiesCanonicalOnly,
      activities_with_both: activitiesWithBoth,
      activities_original_only: activitiesOriginalOnly,
      activities_with_edited_version: activitiesWithEditedVersion,

      fit_files_active: fitFilesActive,
      original_files: originalFiles,
      canonical_backfill_files: canonicalBackfillFiles,
      canonical_generated_files: canonicalGeneratedFiles,
      edited_version_files: editedVersionFiles,
      unknown_files: unknownFiles,

      unlinked_original_files: unlinkedOriginalFiles,
      ambiguous_original_files: ambiguousOriginalFiles,
      dangling_linked_files: danglingLinkedFiles,

      unlinked_original_examples: unlinkedOriginalExamples,
      ambiguous_original_examples: ambiguousOriginalExamples,
      canonical_only_examples: canonicalOnlyExamples
    };
  }

  /* CGWEB090_FIT_RECONCILE001_HELPERS_END */


/* CGWEB091_FIT_RECONCILE_RESOLVE001_HELPERS_START */

const C091_STRICT_WINDOW_MS = 3 * 60 * 1000;
const C091_NEAR_WINDOW_MS = 15 * 60 * 1000;
const C091_WIDE_WINDOW_MS = 6 * 60 * 60 * 1000;
const C091_TZ_OFFSETS = [
  60 * 60 * 1000,
  -60 * 60 * 1000,
  2 * 60 * 60 * 1000,
  -2 * 60 * 60 * 1000
];

function c091Finite(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function c091Title(row, fallback = "") {
  return String(
    row?.custom_title ||
    row?.name ||
    row?.title ||
    fallback ||
    ""
  ).trim();
}

function c091ActivityCompact(docSnap) {
  const row = docSnap.data() || {};
  return {
    activity_id: String(docSnap.id),
    start_time_ms: c091Finite(row.start_time_ms),
    sport: c091Finite(row.sport),
    sub_sport: c091Finite(row.sub_sport) ?? 0,
    duration_s:
      c091Finite(row.duration_s) ??
      c091Finite(row.elapsed_time_s) ??
      c091Finite(row.moving_time_s),
    distance_m:
      c091Finite(row.distance_m) ??
      c091Finite(row.distance),
    title: c091Title(row, `Activité #${docSnap.id}`)
  };
}

async function c091LoadActivities(uid) {
  const map = new Map();

  const query =
    db.collection(`${ROOT}/${uid}/activities`)
      .select(
        "start_time_ms",
        "sport",
        "sub_sport",
        "duration_s",
        "elapsed_time_s",
        "moving_time_s",
        "distance_m",
        "distance",
        "custom_title",
        "name",
        "title",
        "deleted_at_ms"
      );

  for await (const snap of query.stream()) {
    const row = snap.data() || {};
    if (row.deleted_at_ms != null) continue;
    const compact = c091ActivityCompact(snap);
    map.set(compact.activity_id, compact);
  }

  return map;
}

function c091Candidate(file, activity) {
  const fileStart = c091Finite(file?.start_time_ms);
  const activityStart = c091Finite(activity?.start_time_ms);

  if (fileStart == null || activityStart == null) {
    return null;
  }

  const fileSport = c091Finite(file?.sport);
  const activitySport = c091Finite(activity?.sport);

  if (
    fileSport != null &&
    fileSport > 0 &&
    activitySport != null &&
    activitySport > 0 &&
    fileSport !== activitySport
  ) {
    return null;
  }

  const delta = activityStart - fileStart;
  const abs = Math.abs(delta);
  let strategy = null;
  let residual = abs;
  let priority = 99;

  if (abs <= C091_STRICT_WINDOW_MS) {
    strategy = "STRICT_3MIN";
    priority = 0;
  } else if (abs <= C091_NEAR_WINDOW_MS) {
    strategy = "NEAR_15MIN";
    priority = 1;
  } else {
    for (const offset of C091_TZ_OFFSETS) {
      const r = Math.abs(delta - offset);
      if (r <= C091_STRICT_WINDOW_MS) {
        strategy =
          "TZ_SHIFT_" +
          (offset > 0 ? "+" : "") +
          String(offset / 3600000) +
          "H";
        residual = r;
        priority = 2;
        break;
      }
    }
  }

  if (!strategy && abs <= C091_WIDE_WINDOW_MS) {
    strategy = "WIDE_6H";
    residual = abs;
    priority = 3;
  }

  if (!strategy) return null;

  const fileSub = c091Finite(file?.sub_sport);
  const activitySub = c091Finite(activity?.sub_sport);
  const subPenalty =
    fileSub != null &&
    activitySub != null &&
    fileSub !== activitySub
      ? 1
      : 0;

  return {
    activity_id: activity.activity_id,
    title: activity.title,
    start_time_ms: activity.start_time_ms,
    sport: activity.sport,
    sub_sport: activity.sub_sport,
    delta_ms: delta,
    residual_ms: residual,
    strategy,
    score:
      priority * 1e12 +
      residual * 100 +
      subPenalty
  };
}

function c091RankCandidates(file, activities) {
  const out = [];

  for (const activity of activities.values()) {
    const candidate = c091Candidate(file, activity);
    if (candidate) out.push(candidate);
  }

  out.sort((a, b) =>
    a.score - b.score ||
    Math.abs(a.delta_ms) - Math.abs(b.delta_ms) ||
    String(a.activity_id).localeCompare(String(b.activity_id))
  );

  return out.slice(0, 12);
}

async function c091Inventory(uid) {
  const activities = await c091LoadActivities(uid);

  const activityState = new Map(
    [...activities.keys()].map((id) => [
      id,
      {
        original: false,
        canonical: false,
        original_count: 0,
        canonical_count: 0
      }
    ])
  );

  const unresolved = [];
  const originalFiles = [];
  const fitQuery =
    files(uid).select(
      "activity_id",
      "sha256",
      "file_name",
      "source",
      "upload_mode",
      "archive_roles",
      "observed_sources",
      "observed_modes",
      "historical_original_names",
      "start_time_ms",
      "sport",
      "sub_sport",
      "link_status",
      "fitwriter_version",
      "fitrecovery_version",
      "fitbackfill_version",
      "recovery_is_canonical",
      "fitversion_version",
      "fit_editor_version",
      "version_index",
      "version_kind",
      "first_uploaded_at_ms",
      "uploaded_at_ms",
      "last_seen_at_ms",
      "deleted_at_ms"
    );

  for await (const snap of fitQuery.stream()) {
    const row = snap.data() || {};
    if (row.deleted_at_ms != null) continue;

    const roles = c090Roles(row);
    const isOriginal = roles.includes(C090_ROLE_ORIGINAL);
    const isCanonical = roles.some(c090IsCanonicalRole);
    const activityId = String(row.activity_id || "").trim();

    if (activityId && activityState.has(activityId)) {
      const state = activityState.get(activityId);

      if (isOriginal) {
        state.original = true;
        state.original_count += 1;
      }

      if (isCanonical) {
        state.canonical = true;
        state.canonical_count += 1;
      }
    }

    if (!isOriginal) continue;

    const file = {
      sha256: String(row.sha256 || snap.id),
      file_name: String(row.file_name || ""),
      start_time_ms: c091Finite(row.start_time_ms),
      sport: c091Finite(row.sport),
      sub_sport: c091Finite(row.sub_sport) ?? 0,
      activity_id: activityId || null,
      link_status: String(row.link_status || "UNLINKED"),
      archive_roles: roles,
      historical_original_names:
        Array.isArray(row.historical_original_names)
          ? row.historical_original_names
          : [],
      uploaded_at_ms: c091Finite(row.uploaded_at_ms)
    };

    originalFiles.push(file);

    if (!activityId || !activities.has(activityId)) {
      const candidates = c091RankCandidates(file, activities);
      const strict =
        candidates.filter(
          (candidate) =>
            candidate.strategy === "STRICT_3MIN"
        );

      unresolved.push({
        ...file,
        candidates,
        strict_candidate_count: strict.length,
        auto_repairable: strict.length === 1,
        resolution_class:
          strict.length === 1
            ? "UNIQUE_STRICT"
            : strict.length > 1
              ? "AMBIGUOUS_STRICT"
              : candidates.length
                ? "MANUAL_EXTENDED"
                : (
                    file.start_time_ms == null
                      ? "NO_TIME"
                      : "NO_CANDIDATE"
                  )
      });
    }
  }

  const reverse = new Map();

  for (const file of unresolved) {
    for (const candidate of file.candidates) {
      if (!reverse.has(candidate.activity_id)) {
        reverse.set(candidate.activity_id, []);
      }

      reverse.get(candidate.activity_id).push({
        sha256: file.sha256,
        file_name: file.file_name,
        strategy: candidate.strategy,
        delta_ms: candidate.delta_ms
      });
    }
  }

  const canonicalOnly = [];

  for (const [activityId, state] of activityState.entries()) {
    if (!state.canonical || state.original) continue;

    const activity = activities.get(activityId);
    const candidateOriginals =
      (reverse.get(activityId) || [])
        .sort((a, b) =>
          Math.abs(a.delta_ms) - Math.abs(b.delta_ms)
        )
        .slice(0, 8);

    canonicalOnly.push({
      ...activity,
      candidate_originals: candidateOriginals,
      candidate_original_count:
        (reverse.get(activityId) || []).length
    });
  }

  canonicalOnly.sort((a, b) =>
    (b.candidate_original_count || 0) -
      (a.candidate_original_count || 0) ||
    Number(b.start_time_ms || 0) -
      Number(a.start_time_ms || 0)
  );

  return {
    activities,
    activityState,
    originalFiles,
    unresolved,
    canonicalOnly
  };
}

async function c091RepairOne(
  uid,
  sha256Value,
  activityIdValue,
  requestedBy = "MANUAL"
) {
  const sha256 = String(sha256Value || "")
    .trim()
    .toLowerCase();

  const activityId = String(activityIdValue || "").trim();

  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw Object.assign(
      new Error("SHA-256 invalide."),
      {status: 400}
    );
  }

  if (!activityId) {
    throw Object.assign(
      new Error("Identifiant activité absent."),
      {status: 400}
    );
  }

  const [fileSnap, activitySnap] =
    await Promise.all([
      fileDoc(uid, sha256).get(),
      db.doc(
        `${ROOT}/${uid}/activities/${activityId}`
      ).get()
    ]);

  if (!fileSnap.exists) {
    throw Object.assign(
      new Error("FIT inconnu."),
      {status: 404}
    );
  }

  if (!activitySnap.exists) {
    throw Object.assign(
      new Error("Activité inconnue."),
      {status: 404}
    );
  }

  const file = fileSnap.data() || {};
  const activity = activitySnap.data() || {};

  if (file.deleted_at_ms != null) {
    throw Object.assign(
      new Error("FIT supprimé."),
      {status: 409}
    );
  }

  if (activity.deleted_at_ms != null) {
    throw Object.assign(
      new Error("Activité supprimée."),
      {status: 409}
    );
  }

  const roles = c090Roles(file);

  if (!roles.includes(C090_ROLE_ORIGINAL)) {
    throw Object.assign(
      new Error(
        "Ce FIT n'est pas classé comme original historique."
      ),
      {status: 409}
    );
  }

  const activityCompact = {
    activity_id: activityId,
    start_time_ms: c091Finite(activity.start_time_ms),
    sport: c091Finite(activity.sport),
    sub_sport: c091Finite(activity.sub_sport) ?? 0,
    title: c091Title(activity, `Activité #${activityId}`)
  };

  const candidate = c091Candidate(
    {
      start_time_ms: c091Finite(file.start_time_ms),
      sport: c091Finite(file.sport),
      sub_sport: c091Finite(file.sub_sport) ?? 0
    },
    activityCompact
  );

  if (!candidate) {
    throw Object.assign(
      new Error(
        "Correspondance refusée : date/sport hors des fenêtres de sécurité."
      ),
      {status: 409}
    );
  }

  const previousActivityId =
    String(file.activity_id || "").trim() || null;

  const previousLinkStatus =
    String(file.link_status || "").trim() || null;

  const now = Date.now();

  await fileDoc(uid, sha256).set(
    {
      activity_id: activityId,
      link_status: "LINKED_REPAIRED",
      original_match_repair_version:
        "ORIGINAL_MATCH_REPAIR001",
      reconcile_resolve_version:
        "FIT_RECONCILE_RESOLVE001",
      match_repair_strategy: candidate.strategy,
      match_repair_delta_ms: candidate.delta_ms,
      match_repair_residual_ms: candidate.residual_ms,
      match_repair_requested_by: requestedBy,
      previous_activity_id: previousActivityId,
      previous_link_status: previousLinkStatus,
      repaired_at_ms: now,
      updated_at_ms: now
    },
    {merge: true}
  );

  return {
    sha256,
    activity_id: activityId,
    strategy: candidate.strategy,
    delta_ms: candidate.delta_ms,
    activities_modified: 0,
    file_metadata_modified: true
  };
}

async function c091TransferAudit(uid) {
  const activities = await c091LoadActivities(uid);
  const activityIds = new Set(activities.keys());

  let fitFilesActive = 0;
  let originalUniqueSha = 0;
  let canonicalUniqueSha = 0;
  let dualRoleSha = 0;
  let originalLinkedFiles = 0;
  let originalUnlinkedFiles = 0;
  let originalDanglingFiles = 0;
  let unknownRoleFiles = 0;
  let originalDocsMultipleNames = 0;

  const activitiesWithOriginal = new Set();
  const originalPerActivity = new Map();
  const uploadMoments = [];
  const inconsistencies = [];

  const query =
    files(uid).select(
      "activity_id",
      "sha256",
      "file_name",
      "source",
      "upload_mode",
      "archive_roles",
      "historical_original_names",
      "has_original_archive",
      "has_canonical_archive",
      "fitwriter_version",
      "fitrecovery_version",
      "fitbackfill_version",
      "recovery_is_canonical",
      "fitversion_version",
      "fit_editor_version",
      "version_index",
      "version_kind",
      "uploaded_at_ms",
      "deleted_at_ms"
    );

  for await (const snap of query.stream()) {
    const row = snap.data() || {};
    if (row.deleted_at_ms != null) continue;

    fitFilesActive += 1;

    const roles = c090Roles(row);
    const isOriginal =
      roles.includes(C090_ROLE_ORIGINAL);
    const isCanonical =
      roles.some(c090IsCanonicalRole);

    if (roles.includes(C090_ROLE_UNKNOWN)) {
      unknownRoleFiles += 1;
    }

    if (isOriginal) originalUniqueSha += 1;
    if (isCanonical) canonicalUniqueSha += 1;
    if (isOriginal && isCanonical) dualRoleSha += 1;

    if (!isOriginal) continue;

    const names =
      Array.isArray(row.historical_original_names)
        ? c090Strings(row.historical_original_names)
        : [];

    if (names.length > 1) {
      originalDocsMultipleNames += 1;
    }

    if (row.has_original_archive !== true) {
      if (inconsistencies.length < 100) {
        inconsistencies.push({
          sha256: String(row.sha256 || snap.id),
          kind: "ORIGINAL_ROLE_WITHOUT_FLAG",
          file_name: String(row.file_name || "")
        });
      }
    }

    const uploadedAt =
      c091Finite(row.uploaded_at_ms);

    if (uploadedAt != null) {
      uploadMoments.push({
        t: uploadedAt,
        sha256: String(row.sha256 || snap.id)
      });
    }

    const activityId =
      String(row.activity_id || "").trim();

    if (!activityId) {
      originalUnlinkedFiles += 1;
      continue;
    }

    if (!activityIds.has(activityId)) {
      originalDanglingFiles += 1;
      continue;
    }

    originalLinkedFiles += 1;
    activitiesWithOriginal.add(activityId);

    originalPerActivity.set(
      activityId,
      Number(
        originalPerActivity.get(activityId) || 0
      ) + 1
    );
  }

  const multiOriginalActivities =
    [...originalPerActivity.entries()]
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1]);

  const extraLinkedOriginalFiles =
    Math.max(
      0,
      originalLinkedFiles -
        activitiesWithOriginal.size
    );

  uploadMoments.sort((a, b) => a.t - b.t);

  const sessions = [];
  const SESSION_GAP_MS = 10 * 60 * 1000;

  for (const item of uploadMoments) {
    const last = sessions[sessions.length - 1];

    if (
      !last ||
      item.t - last.end_ms > SESSION_GAP_MS
    ) {
      sessions.push({
        start_ms: item.t,
        end_ms: item.t,
        unique_docs: 1
      });
    } else {
      last.end_ms = item.t;
      last.unique_docs += 1;
    }
  }

  return {
    fit_files_active: fitFilesActive,
    original_unique_sha: originalUniqueSha,
    canonical_unique_sha: canonicalUniqueSha,
    dual_role_sha: dualRoleSha,

    original_linked_files: originalLinkedFiles,
    original_unlinked_files: originalUnlinkedFiles,
    original_dangling_files: originalDanglingFiles,
    original_accounting_ok:
      originalUniqueSha ===
      originalLinkedFiles +
        originalUnlinkedFiles +
        originalDanglingFiles,

    activities_with_original:
      activitiesWithOriginal.size,
    activities_with_multiple_originals:
      multiOriginalActivities.length,
    extra_linked_original_files:
      extraLinkedOriginalFiles,
    max_originals_for_one_activity:
      multiOriginalActivities.length
        ? multiOriginalActivities[0][1]
        : 1,

    original_docs_multiple_names:
      originalDocsMultipleNames,
    unknown_role_files: unknownRoleFiles,
    metadata_inconsistencies:
      inconsistencies,

    recent_original_sessions:
      sessions.slice(-10).reverse(),

    multi_original_examples:
      multiOriginalActivities
        .slice(0, 100)
        .map(([activity_id, count]) => ({
          activity_id,
          count
        }))
  };
}

/* CGWEB091_FIT_RECONCILE_RESOLVE001_HELPERS_END */


  /* CGWEB092_ORIGINAL_MATCH_DEEP_ANALYSIS001_HELPERS_START */

  function c092FirstFinite(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function c092DurationSeconds(row) {
    const seconds = c092FirstFinite(
      row?.duration_s,
      row?.elapsed_time_s,
      row?.timer_time_s,
      row?.moving_time_s
    );
    if (seconds != null && seconds >= 0) return seconds;

    const ms = c092FirstFinite(
      row?.duration_ms,
      row?.elapsed_time_ms,
      row?.timer_time_ms,
      row?.moving_time_ms
    );
    if (ms != null && ms >= 0) return ms / 1000;

    const start = c092FirstFinite(row?.start_time_ms);
    const end = c092FirstFinite(row?.end_time_ms);
    if (start != null && end != null && end >= start) {
      return (end - start) / 1000;
    }
    return null;
  }

  function c092TextList(value) {
    if (Array.isArray(value)) {
      return value.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 12);
    }
    if (value && typeof value === "object") {
      return Object.keys(value).filter((key) => value[key]).slice(0, 12);
    }
    const text = String(value ?? "").trim();
    return text ? [text] : [];
  }

  function c092ActivityMetrics(activityId, row = {}) {
    return {
      activity_id: String(activityId),
      title: c091Title(row, `Activité #${activityId}`),
      start_time_ms: c092FirstFinite(row.start_time_ms),
      sport: c092FirstFinite(row.sport),
      sub_sport: c092FirstFinite(row.sub_sport, row.subSport, 0) ?? 0,
      duration_s: c092DurationSeconds(row),
      distance_m: c092FirstFinite(row.distance_m, row.distance),
      ascent_m: c092FirstFinite(
        row.ascent_m,
        row.total_ascent_m,
        row.elevation_gain_m,
        row.total_elevation_gain
      ),
      avg_hr: c092FirstFinite(row.avg_hr, row.avg_heart_rate, row.average_heart_rate),
      max_hr: c092FirstFinite(row.max_hr, row.max_heart_rate, row.maximum_heart_rate),
      equipment_name: String(
        row.equipment_name || row.equipment || row.gear_name || ""
      ).trim(),
      markers: c092TextList(
        row.landmark_codes || row.landmarks || row.markers || row.reperes
      ),
      import_source: String(
        row.import_source || row.source || row.strava_sport_type || ""
      ).trim()
    };
  }

  function c092FitMetrics(decoded) {
    return {
      start_time_ms: c092FirstFinite(decoded?.startMs),
      sport: c092FirstFinite(decoded?.sport),
      sub_sport: c092FirstFinite(decoded?.subSport, 0) ?? 0,
      duration_s: c092FirstFinite(decoded?.timerSeconds, decoded?.elapsedSeconds),
      distance_m: c092FirstFinite(decoded?.totalDistance),
      ascent_m: c092FirstFinite(decoded?.totalAscent),
      avg_hr: c092FirstFinite(decoded?.avgHeartRate),
      max_hr: c092FirstFinite(decoded?.maxHeartRate),
      record_count: c092FirstFinite(decoded?.recordCount),
      lap_count: c092FirstFinite(decoded?.lapCount),
      integrity: Boolean(decoded?.integrity),
      errors: Array.isArray(decoded?.errors) ? decoded.errors.slice(0, 8) : []
    };
  }

  function c092RelativePct(a, b) {
    const x = Number(a);
    const y = Number(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const base = Math.max(Math.abs(x), Math.abs(y), 1e-9);
    return Math.abs(x - y) / base * 100;
  }

  function c092NumericComparison(metric, fitValue, activityValue, cfg = {}) {
    const fit = c092FirstFinite(fitValue);
    const activity = c092FirstFinite(activityValue);
    const unit = String(cfg.unit || "");

    if (fit == null || activity == null) {
      return {
        metric, fit, activity, delta: null, abs_delta: null,
        relative_pct: null, quality: "NA", unit
      };
    }

    const delta = activity - fit;
    const absDelta = Math.abs(delta);
    const pct = c092RelativePct(fit, activity);

    const within = (absLimit, pctLimit) => {
      const absOk =
        absLimit != null && Number.isFinite(Number(absLimit)) &&
        absDelta <= Number(absLimit);
      const pctOk =
        pctLimit != null && pct != null && pct <= Number(pctLimit);
      return absOk || pctOk;
    };

    let quality = "WEAK";

    if (within(cfg.strongAbs, cfg.strongPct)) {
      quality = "STRONG";
    } else if (within(cfg.compatibleAbs, cfg.compatiblePct)) {
      quality = "COMPATIBLE";
    } else {
      const absContradiction =
        cfg.contradictionAbs != null &&
        absDelta > Number(cfg.contradictionAbs);
      const pctContradiction =
        cfg.contradictionPct != null &&
        pct != null &&
        pct > Number(cfg.contradictionPct);

      if (
        (cfg.contradictionAbs == null || absContradiction) &&
        (cfg.contradictionPct == null || pctContradiction)
      ) {
        quality = "CONTRADICTION";
      }
    }

    return {
      metric, fit, activity, delta, abs_delta: absDelta,
      relative_pct: pct, quality, unit
    };
  }

  function c092ExactComparison(metric, fitValue, activityValue) {
    const fit = c092FirstFinite(fitValue);
    const activity = c092FirstFinite(activityValue);

    if (fit == null || activity == null) {
      return {
        metric, fit, activity, delta: null, abs_delta: null,
        relative_pct: null, quality: "NA", unit: ""
      };
    }

    return {
      metric,
      fit,
      activity,
      delta: activity - fit,
      abs_delta: Math.abs(activity - fit),
      relative_pct: null,
      quality: fit === activity ? "STRONG" : "CONTRADICTION",
      unit: ""
    };
  }

  function c092CandidateEvidence(fit, candidate, activity) {
    const timeResidualSeconds =
      Math.abs(Number(candidate?.residual_ms || 0)) / 1000;

    const comparisons = [
      c092NumericComparison(
        "time_residual_s",
        0,
        timeResidualSeconds,
        {strongAbs: 2, compatibleAbs: 30, contradictionAbs: 180, unit: "s"}
      ),
      c092ExactComparison("sport", fit?.sport, activity?.sport),
      c092ExactComparison("sub_sport", fit?.sub_sport, activity?.sub_sport),
      c092NumericComparison(
        "distance_m",
        fit?.distance_m,
        activity?.distance_m,
        {
          strongAbs: 10, compatibleAbs: 50, contradictionAbs: 200,
          strongPct: 1, compatiblePct: 3, contradictionPct: 8, unit: "m"
        }
      ),
      c092NumericComparison(
        "duration_s",
        fit?.duration_s,
        activity?.duration_s,
        {
          strongAbs: 2, compatibleAbs: 10, contradictionAbs: 30,
          strongPct: 1, compatiblePct: 3, contradictionPct: 8, unit: "s"
        }
      ),
      c092NumericComparison(
        "ascent_m",
        fit?.ascent_m,
        activity?.ascent_m,
        {
          strongAbs: 5, compatibleAbs: 15, contradictionAbs: 40,
          strongPct: 5, compatiblePct: 15, contradictionPct: 30, unit: "m"
        }
      ),
      c092NumericComparison(
        "avg_hr",
        fit?.avg_hr,
        activity?.avg_hr,
        {strongAbs: 2, compatibleAbs: 5, contradictionAbs: 10, unit: "bpm"}
      ),
      c092NumericComparison(
        "max_hr",
        fit?.max_hr,
        activity?.max_hr,
        {strongAbs: 3, compatibleAbs: 7, contradictionAbs: 15, unit: "bpm"}
      )
    ];

    const tested = comparisons.filter((x) => x.quality !== "NA");
    const strong = tested.filter((x) => x.quality === "STRONG").length;
    const compatible = tested.filter((x) => x.quality === "COMPATIBLE").length;
    const weak = tested.filter((x) => x.quality === "WEAK").length;
    const contradictions =
      tested.filter((x) => x.quality === "CONTRADICTION").length;

    const normalizedError = tested.reduce((sum, row) => {
      if (row.metric === "sport" || row.metric === "sub_sport") {
        return sum + (row.quality === "CONTRADICTION" ? 50 : 0);
      }
      if (row.relative_pct != null) {
        return sum + Math.min(100, row.relative_pct);
      }
      if (row.abs_delta != null) {
        return sum + Math.min(100, row.abs_delta);
      }
      return sum;
    }, 0);

    return {
      ...candidate,
      activity,
      comparisons,
      tested_count: tested.length,
      strong_count: strong,
      compatible_count: compatible,
      weak_count: weak,
      contradiction_count: contradictions,
      normalized_error: Math.round(normalizedError * 100) / 100
    };
  }

  function c092CompareEvidence(a, b) {
    return (
      Number(a.contradiction_count || 0) - Number(b.contradiction_count || 0) ||
      Number(b.strong_count || 0) - Number(a.strong_count || 0) ||
      Number(b.compatible_count || 0) - Number(a.compatible_count || 0) ||
      Number(a.weak_count || 0) - Number(b.weak_count || 0) ||
      Number(a.normalized_error || 0) - Number(b.normalized_error || 0) ||
      Math.abs(Number(a.residual_ms || 0)) - Math.abs(Number(b.residual_ms || 0)) ||
      String(a.activity_id).localeCompare(String(b.activity_id))
    );
  }

  function c092Separation(ranked) {
    if (!ranked.length) return "NO_CANDIDATE";
    if (ranked.length === 1) return "SINGLE_CANDIDATE";

    const first = ranked[0];
    const second = ranked[1];

    if (
      first.contradiction_count === 0 &&
      second.contradiction_count > 0
    ) return "CLEAR_METRIC_LEAD";

    if (
      first.contradiction_count < second.contradiction_count
    ) return "CLEAR_METRIC_LEAD";

    if (
      first.strong_count >= second.strong_count + 2 &&
      first.contradiction_count <= second.contradiction_count
    ) return "CLEAR_METRIC_LEAD";

    if (
      first.strong_count > second.strong_count &&
      first.normalized_error < second.normalized_error
    ) return "SLIGHT_METRIC_LEAD";

    return "INDETERMINATE";
  }

  async function c092LoadCandidateActivities(uid, unresolved) {
    const ids = new Set();

    for (const file of unresolved || []) {
      for (const candidate of file?.candidates || []) {
        const id = String(candidate?.activity_id || "").trim();
        if (id) ids.add(id);
      }
    }

    const map = new Map();

    await Promise.all(
      [...ids].map(async (id) => {
        const snap = await db.doc(`${ROOT}/${uid}/activities/${id}`).get();
        if (!snap.exists) return;

        const row = snap.data() || {};
        if (row.deleted_at_ms != null) return;

        map.set(id, c092ActivityMetrics(id, row));
      })
    );

    return map;
  }

  async function c092DecodeOriginal(uid, unresolvedFile) {
    const sha256 = String(unresolvedFile?.sha256 || "").trim();
    if (!sha256) throw new Error("SHA-256 absent.");

    const snap = await fileDoc(uid, sha256).get();
    if (!snap.exists) throw new Error("Document activity_files absent.");

    const row = snap.data() || {};
    const path =
      String(row.object_path || "").trim() ||
      objectPath(
        uid,
        sha256,
        row.start_time_ms || unresolvedFile?.start_time_ms
      );

    const object = bucket().file(path);
    const [exists] = await object.exists();
    if (!exists) throw new Error("Objet FIT absent du Storage.");

    const [buffer] = await object.download();
    const decoded = await decodeCanonicalFitSummary(buffer);

    return {
      bytes: buffer.length,
      decoded: c092FitMetrics(decoded)
    };
  }

  async function c092DeepAnalysis(uid) {
    const inventory = await c091Inventory(uid);
    const activityMap =
      await c092LoadCandidateActivities(uid, inventory.unresolved);

    const filesOut = [];
    let decodedOk = 0;
    let decodedFailed = 0;
    let clearLead = 0;
    let slightLead = 0;
    let indeterminate = 0;
    let singleCandidate = 0;

    for (const file of inventory.unresolved) {
      let original = null;
      let decodeError = null;

      try {
        original = await c092DecodeOriginal(uid, file);
        decodedOk += 1;
      } catch (error) {
        decodedFailed += 1;
        decodeError = error?.message || String(error);
      }

      const fit =
        original?.decoded || {
          start_time_ms: file.start_time_ms,
          sport: file.sport,
          sub_sport: file.sub_sport
        };

      const ranked = (file.candidates || [])
        .map((candidate) => {
          const activity = activityMap.get(String(candidate.activity_id));
          if (!activity) return null;
          return c092CandidateEvidence(fit, candidate, activity);
        })
        .filter(Boolean)
        .sort(c092CompareEvidence)
        .map((row, index) => ({...row, deep_rank: index + 1}));

      const separation =
        decodeError ? "DECODE_FAILED" : c092Separation(ranked);

      if (separation === "CLEAR_METRIC_LEAD") clearLead += 1;
      else if (separation === "SLIGHT_METRIC_LEAD") slightLead += 1;
      else if (separation === "SINGLE_CANDIDATE") singleCandidate += 1;
      else indeterminate += 1;

      filesOut.push({
        sha256: file.sha256,
        file_name: file.file_name,
        link_status: file.link_status,
        resolution_class: file.resolution_class,
        source_start_time_ms: file.start_time_ms,
        source_sport: file.sport,
        source_sub_sport: file.sub_sport,
        decode_ok: !decodeError,
        decode_error: decodeError,
        fit,
        storage_bytes: original?.bytes || null,
        separation,
        candidates: ranked
      });
    }

    filesOut.sort((a, b) => {
      const order = {
        CLEAR_METRIC_LEAD: 0,
        SLIGHT_METRIC_LEAD: 1,
        SINGLE_CANDIDATE: 2,
        INDETERMINATE: 3,
        DECODE_FAILED: 4,
        NO_CANDIDATE: 5
      };

      return (
        (order[a.separation] ?? 99) -
          (order[b.separation] ?? 99) ||
        String(a.file_name).localeCompare(String(b.file_name))
      );
    });

    return {
      summary: {
        unresolved_original_files: inventory.unresolved.length,
        decoded_ok: decodedOk,
        decoded_failed: decodedFailed,
        clear_metric_lead: clearLead,
        slight_metric_lead: slightLead,
        single_candidate: singleCandidate,
        indeterminate: indeterminate
      },
      files: filesOut
    };
  }

  /* CGWEB092_ORIGINAL_MATCH_DEEP_ANALYSIS001_HELPERS_END */


  /* CGWEB093_MATCH_TRIAGE001_HELPERS_START */

  function c093ComparisonMap(candidate) {
    const map = new Map();
    for (const row of candidate?.comparisons || []) {
      map.set(String(row?.metric || ""), row);
    }
    return map;
  }

  function c093Quality(candidate, metric) {
    return String(c093ComparisonMap(candidate).get(metric)?.quality || "NA");
  }

  function c093StrongCore(candidate) {
    if (!candidate) return false;
    return [
      "time_residual_s",
      "sport",
      "sub_sport",
      "distance_m",
      "duration_s"
    ].every((metric) => c093Quality(candidate, metric) === "STRONG");
  }

  function c093Near(a, b, absTol, pctTol = null) {
    const x = Number(a);
    const y = Number(b);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return x === y || (!Number.isFinite(x) && !Number.isFinite(y));
    }

    if (Math.abs(x - y) <= absTol) return true;

    if (pctTol != null) {
      const base = Math.max(Math.abs(x), Math.abs(y), 1e-9);
      return Math.abs(x - y) / base * 100 <= pctTol;
    }

    return false;
  }

  function c093SamePerformance(a, b) {
    const x = a?.activity || {};
    const y = b?.activity || {};

    return (
      c093Near(x.start_time_ms, y.start_time_ms, 2000) &&
      c093Near(x.sport, y.sport, 0) &&
      c093Near(x.sub_sport, y.sub_sport, 0) &&
      c093Near(x.distance_m, y.distance_m, 10, 0.3) &&
      c093Near(x.duration_s, y.duration_s, 2, 0.3) &&
      c093Near(x.ascent_m, y.ascent_m, 5, 3) &&
      c093Near(x.avg_hr, y.avg_hr, 2) &&
      c093Near(x.max_hr, y.max_hr, 3)
    );
  }

  function c093SafeClass(file) {
    if (!file?.decode_ok) {
      return {
        class: "REVIEW_DECODE_FAILED",
        safe: false,
        reasons: ["FIT original non décodé"]
      };
    }

    const ranked = Array.isArray(file?.candidates) ? file.candidates : [];

    if (!ranked.length) {
      return {
        class: "NO_COMPATIBLE_CANDIDATE",
        safe: false,
        reasons: ["aucun candidat CGWEB092"]
      };
    }

    const first = ranked[0];
    const second = ranked[1] || null;

    if (
      second &&
      Number(first.contradiction_count || 0) === 0 &&
      Number(second.contradiction_count || 0) === 0 &&
      c093StrongCore(first) &&
      c093StrongCore(second) &&
      c093SamePerformance(first, second)
    ) {
      return {
        class: "DUPLICATE_ACTIVITY_TIE",
        safe: false,
        reasons: [
          "au moins deux activités correspondent au même profil sportif",
          "aucun choix automatique entre ex æquo"
        ]
      };
    }

    const allPoor = ranked.every((candidate) => {
      const contradictions = Number(candidate.contradiction_count || 0);
      const distanceBad =
        c093Quality(candidate, "distance_m") === "CONTRADICTION";
      const durationBad =
        c093Quality(candidate, "duration_s") === "CONTRADICTION";

      return contradictions >= 3 || (distanceBad && durationBad);
    });

    if (allPoor) {
      return {
        class: "NO_COMPATIBLE_CANDIDATE",
        safe: false,
        reasons: [
          "tous les candidats temporels sont métriquement incompatibles"
        ]
      };
    }

    const tested = Number(first.tested_count || 0);
    const strong = Number(first.strong_count || 0);
    const compatible = Number(first.compatible_count || 0);
    const contradictions = Number(first.contradiction_count || 0);
    const coreStrong = c093StrongCore(first);
    const noWeak = Number(first.weak_count || 0) === 0;

    const competitionClear =
      !second ||
      Number(second.contradiction_count || 0) >= 1;

    if (
      coreStrong &&
      contradictions === 0 &&
      tested >= 5 &&
      strong === tested &&
      competitionClear
    ) {
      return {
        class: "SAFE_EXACT",
        safe: true,
        activity_id: first.activity_id,
        reasons: [
          `${strong}/${tested} critères testés concordent fortement`,
          second
            ? "le second candidat présente au moins une contradiction"
            : "aucun concurrent"
        ]
      };
    }

    if (
      coreStrong &&
      contradictions === 0 &&
      tested >= 5 &&
      strong >= 5 &&
      strong + compatible === tested &&
      noWeak &&
      competitionClear
    ) {
      return {
        class: "SAFE_STRONG",
        safe: true,
        activity_id: first.activity_id,
        reasons: [
          "heure, sport, sous-sport, distance et durée concordent fortement",
          `${strong} concordance(s) forte(s), ${compatible} compatible(s), 0 contradiction`
        ]
      };
    }

    return {
      class: "REVIEW",
      safe: false,
      reasons: [
        "le meilleur candidat ne satisfait pas tous les garde-fous SAFE"
      ]
    };
  }

  function c093SafePreviewFromDeep(deep) {
    const rows = [];
    const summary = {
      unresolved_original_files: 0,
      safe_exact: 0,
      safe_strong: 0,
      duplicate_activity_tie: 0,
      no_compatible_candidate: 0,
      review: 0,
      safe_total: 0
    };

    for (const file of deep?.files || []) {
      summary.unresolved_original_files += 1;

      const result = c093SafeClass(file);
      const first = file?.candidates?.[0] || null;
      const second = file?.candidates?.[1] || null;

      if (result.class === "SAFE_EXACT") summary.safe_exact += 1;
      else if (result.class === "SAFE_STRONG") summary.safe_strong += 1;
      else if (result.class === "DUPLICATE_ACTIVITY_TIE") {
        summary.duplicate_activity_tie += 1;
      } else if (result.class === "NO_COMPATIBLE_CANDIDATE") {
        summary.no_compatible_candidate += 1;
      } else {
        summary.review += 1;
      }

      if (result.safe) summary.safe_total += 1;

      rows.push({
        sha256: file.sha256,
        file_name: file.file_name,
        fit: file.fit,
        classification: result.class,
        safe_to_repair: Boolean(result.safe),
        proposed_activity_id:
          result.safe ? String(result.activity_id || "") : null,
        reasons: result.reasons || [],
        first_candidate: first,
        second_candidate: second
      });
    }

    return {summary, rows};
  }

  function c093CompactFingerprintScore(fit, activity) {
    if (!fit || !activity) return null;

    const fitSport = c092FirstFinite(fit.sport);
    const actSport = c092FirstFinite(activity.sport);

    if (
      fitSport != null &&
      actSport != null &&
      fitSport > 0 &&
      actSport > 0 &&
      fitSport !== actSport
    ) {
      return null;
    }

    const fitDistance = c092FirstFinite(fit.distance_m);
    const actDistance = c092FirstFinite(activity.distance_m);
    const fitDuration = c092FirstFinite(fit.duration_s);
    const actDuration = c092FirstFinite(activity.duration_s);

    if (
      fitDistance == null ||
      actDistance == null ||
      fitDuration == null ||
      actDuration == null
    ) {
      return null;
    }

    const distancePct =
      Math.abs(fitDistance - actDistance) /
      Math.max(Math.abs(fitDistance), Math.abs(actDistance), 1) *
      100;

    const durationPct =
      Math.abs(fitDuration - actDuration) /
      Math.max(Math.abs(fitDuration), Math.abs(actDuration), 1) *
      100;

    if (
      distancePct > 20 &&
      Math.abs(fitDistance - actDistance) > 1000
    ) {
      return null;
    }

    if (
      durationPct > 20 &&
      Math.abs(fitDuration - actDuration) > 600
    ) {
      return null;
    }

    const fitSub = c092FirstFinite(fit.sub_sport, 0) ?? 0;
    const actSub = c092FirstFinite(activity.sub_sport, 0) ?? 0;
    const subPenalty = fitSub === actSub ? 0 : 25;

    return {
      activity_id: String(activity.activity_id),
      compact_score:
        distancePct * 2 +
        durationPct * 2 +
        subPenalty
    };
  }

  function c093FingerprintEvidence(fit, activity, state = {}) {
    const comparisons = [
      c092ExactComparison("sport", fit?.sport, activity?.sport),
      c092ExactComparison("sub_sport", fit?.sub_sport, activity?.sub_sport),
      c092NumericComparison(
        "distance_m",
        fit?.distance_m,
        activity?.distance_m,
        {
          strongAbs: 10, compatibleAbs: 50, contradictionAbs: 200,
          strongPct: 1, compatiblePct: 3, contradictionPct: 8, unit: "m"
        }
      ),
      c092NumericComparison(
        "duration_s",
        fit?.duration_s,
        activity?.duration_s,
        {
          strongAbs: 2, compatibleAbs: 10, contradictionAbs: 30,
          strongPct: 1, compatiblePct: 3, contradictionPct: 8, unit: "s"
        }
      ),
      c092NumericComparison(
        "ascent_m",
        fit?.ascent_m,
        activity?.ascent_m,
        {
          strongAbs: 5, compatibleAbs: 15, contradictionAbs: 40,
          strongPct: 5, compatiblePct: 15, contradictionPct: 30, unit: "m"
        }
      ),
      c092NumericComparison(
        "avg_hr",
        fit?.avg_hr,
        activity?.avg_hr,
        {
          strongAbs: 2, compatibleAbs: 5, contradictionAbs: 10, unit: "bpm"
        }
      ),
      c092NumericComparison(
        "max_hr",
        fit?.max_hr,
        activity?.max_hr,
        {
          strongAbs: 3, compatibleAbs: 7, contradictionAbs: 15, unit: "bpm"
        }
      )
    ];

    const tested = comparisons.filter((x) => x.quality !== "NA");
    const strong = tested.filter((x) => x.quality === "STRONG").length;
    const compatible =
      tested.filter((x) => x.quality === "COMPATIBLE").length;
    const weak = tested.filter((x) => x.quality === "WEAK").length;
    const contradictions =
      tested.filter((x) => x.quality === "CONTRADICTION").length;

    const timeDeltaSeconds =
      fit?.start_time_ms != null &&
      activity?.start_time_ms != null
        ? Math.round(
            (
              Number(activity.start_time_ms) -
              Number(fit.start_time_ms)
            ) / 1000
          )
        : null;

    const map = new Map(
      comparisons.map((row) => [row.metric, row])
    );

    const coreOk = ["sport", "distance_m", "duration_s"]
      .every((metric) => {
        const q = map.get(metric)?.quality;
        return q === "STRONG" || q === "COMPATIBLE";
      });

    let fingerprintClass = "WEAK";
    if (
      contradictions === 0 &&
      coreOk &&
      strong >= Math.min(5, tested.length)
    ) {
      fingerprintClass = "FINGERPRINT_EXACT";
    } else if (
      contradictions === 0 &&
      coreOk &&
      strong + compatible >= Math.min(5, tested.length)
    ) {
      fingerprintClass = "FINGERPRINT_STRONG";
    } else if (
      contradictions <= 1 &&
      coreOk
    ) {
      fingerprintClass = "FINGERPRINT_PLAUSIBLE";
    }

    return {
      activity_id: activity.activity_id,
      activity,
      state: {
        original: Boolean(state?.original),
        canonical: Boolean(state?.canonical),
        original_count: Number(state?.original_count || 0),
        canonical_count: Number(state?.canonical_count || 0)
      },
      time_delta_s: timeDeltaSeconds,
      comparisons,
      tested_count: tested.length,
      strong_count: strong,
      compatible_count: compatible,
      weak_count: weak,
      contradiction_count: contradictions,
      fingerprint_class: fingerprintClass
    };
  }

  function c093FingerprintSort(a, b) {
    const order = {
      FINGERPRINT_EXACT: 0,
      FINGERPRINT_STRONG: 1,
      FINGERPRINT_PLAUSIBLE: 2,
      WEAK: 3
    };

    return (
      (order[a.fingerprint_class] ?? 9) -
        (order[b.fingerprint_class] ?? 9) ||
      Number(a.contradiction_count || 0) -
        Number(b.contradiction_count || 0) ||
      Number(b.strong_count || 0) -
        Number(a.strong_count || 0) ||
      Number(b.compatible_count || 0) -
        Number(a.compatible_count || 0) ||
      Math.abs(Number(a.time_delta_s || 0)) -
        Math.abs(Number(b.time_delta_s || 0))
    );
  }

  async function c093LoadFullActivities(uid, ids) {
    const map = new Map();

    await Promise.all(
      [...new Set(ids.map((x) => String(x)))]
        .map(async (id) => {
          const snap =
            await db.doc(
              `${ROOT}/${uid}/activities/${id}`
            ).get();

          if (!snap.exists) return;

          const row = snap.data() || {};
          if (row.deleted_at_ms != null) return;

          map.set(
            id,
            {
              metrics: c092ActivityMetrics(id, row),
              raw: row
            }
          );
        })
    );

    return map;
  }

  async function c093OrphanFingerprintSearch(
    uid,
    deep,
    inventory,
    safePreview
  ) {
    const targetFiles =
      (safePreview?.rows || [])
        .filter(
          (row) =>
            row.classification ===
            "NO_COMPATIBLE_CANDIDATE"
        );

    const results = [];

    for (const target of targetFiles) {
      const deepFile =
        (deep?.files || []).find(
          (row) => row.sha256 === target.sha256
        );

      if (!deepFile?.fit) continue;

      const compact = [];

      for (const activity of inventory.activities.values()) {
        const scored =
          c093CompactFingerprintScore(
            deepFile.fit,
            activity
          );

        if (scored) compact.push(scored);
      }

      compact.sort(
        (a, b) =>
          a.compact_score - b.compact_score
      );

      const shortlistIds =
        compact.slice(0, 30)
          .map((row) => row.activity_id);

      const full =
        await c093LoadFullActivities(
          uid,
          shortlistIds
        );

      const evidence = [];

      for (const id of shortlistIds) {
        const loaded = full.get(String(id));
        if (!loaded) continue;

        const state =
          inventory.activityState.get(String(id)) || {};

        evidence.push(
          c093FingerprintEvidence(
            deepFile.fit,
            loaded.metrics,
            state
          )
        );
      }

      evidence.sort(c093FingerprintSort);

      results.push({
        sha256: target.sha256,
        file_name: target.file_name,
        fit: deepFile.fit,
        candidates: evidence.slice(0, 10)
      });
    }

    return {
      summary: {
        searched_files: targetFiles.length,
        files_with_exact_fingerprint:
          results.filter(
            (row) =>
              row.candidates?.[0]?.fingerprint_class ===
              "FINGERPRINT_EXACT"
          ).length,
        files_with_strong_fingerprint:
          results.filter(
            (row) =>
              row.candidates?.[0]?.fingerprint_class ===
              "FINGERPRINT_STRONG"
          ).length,
        files_without_plausible_fingerprint:
          results.filter((row) => {
            const c = row.candidates?.[0];
            return (
              !c ||
              ![
                "FINGERPRINT_EXACT",
                "FINGERPRINT_STRONG",
                "FINGERPRINT_PLAUSIBLE"
              ].includes(c.fingerprint_class)
            );
          }).length
      },
      files: results
    };
  }

  function c093StringValue(row, ...keys) {
    for (const key of keys) {
      const value = row?.[key];
      if (value != null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return "";
  }

  async function c093ActivityTechnical(uid, activityId, inventory) {
    const activityRef =
      db.doc(
        `${ROOT}/${uid}/activities/${activityId}`
      );

    const routeRef =
      db.doc(
        `${ROOT}/${uid}/activity_routes/${activityId}`
      );

    const [activitySnap, routeSnap] =
      await Promise.all([
        activityRef.get(),
        routeRef.get()
      ]);

    const row =
      activitySnap.exists
        ? activitySnap.data() || {}
        : {};

    const route =
      routeSnap.exists
        ? routeSnap.data() || {}
        : {};

    const linkedFiles = [];

    const q =
      files(uid)
        .where("activity_id", "==", String(activityId))
        .select(
          "sha256",
          "file_name",
          "source",
          "upload_mode",
          "archive_roles",
          "link_status",
          "fitwriter_version",
          "fitrecovery_version",
          "fitversion_version",
          "fit_editor_version",
          "version_index",
          "version_kind",
          "uploaded_at_ms",
          "first_uploaded_at_ms",
          "deleted_at_ms"
        );

    for await (const snap of q.stream()) {
      const fileRow = snap.data() || {};
      if (fileRow.deleted_at_ms != null) continue;

      const roles = c090Roles(fileRow);

      linkedFiles.push({
        sha256: String(fileRow.sha256 || snap.id),
        file_name: String(fileRow.file_name || ""),
        source: String(fileRow.source || ""),
        upload_mode: String(fileRow.upload_mode || ""),
        archive_roles: roles,
        is_original: roles.includes(C090_ROLE_ORIGINAL),
        is_canonical: roles.some(c090IsCanonicalRole),
        link_status: String(fileRow.link_status || ""),
        version_index:
          c092FirstFinite(fileRow.version_index),
        version_kind:
          String(fileRow.version_kind || ""),
        uploaded_at_ms:
          c092FirstFinite(
            fileRow.uploaded_at_ms,
            fileRow.first_uploaded_at_ms
          )
      });
    }

    const arrays = [
      route?.lat,
      route?.latitude,
      route?.latitudes,
      route?.lon,
      route?.longitude,
      route?.longitudes
    ].filter(Array.isArray);

    const routePoints =
      arrays.length
        ? Math.max(...arrays.map((x) => x.length))
        : c092FirstFinite(
            route?.source_point_count,
            route?.point_count,
            row?.gps_point_count,
            row?.record_count
          );

    const state =
      inventory.activityState.get(String(activityId)) || {};

    const externalIds = {
      strava_id: c093StringValue(
        row,
        "strava_id",
        "strava_activity_id"
      ),
      external_id: c093StringValue(
        row,
        "external_id"
      ),
      provider_id: c093StringValue(
        row,
        "provider_id",
        "source_activity_id",
        "remote_id"
      )
    };

    for (const key of Object.keys(externalIds)) {
      if (!externalIds[key]) delete externalIds[key];
    }

    return {
      activity_id: String(activityId),
      exists: activitySnap.exists,
      metrics: c092ActivityMetrics(activityId, row),
      source: c093StringValue(
        row,
        "import_source",
        "source",
        "origin"
      ),
      external_ids: externalIds,
      created_at_ms: c092FirstFinite(
        row.created_at_ms,
        row.createdAtMs,
        row.imported_at_ms
      ),
      updated_at_ms: c092FirstFinite(
        row.updated_at_ms,
        row.updatedAtMs,
        row.modified_at_ms
      ),
      deleted_at_ms: c092FirstFinite(row.deleted_at_ms),
      route: {
        exists: routeSnap.exists,
        point_count: routePoints,
        source: c093StringValue(
          route,
          "source",
          "import_source"
        )
      },
      state: {
        original: Boolean(state.original),
        canonical: Boolean(state.canonical),
        original_count: Number(state.original_count || 0),
        canonical_count: Number(state.canonical_count || 0)
      },
      fit_links: linkedFiles
    };
  }

  async function c093DuplicateActivityDiagnostic(
    uid,
    deep,
    inventory,
    safePreview
  ) {
    const ties =
      (safePreview?.rows || [])
        .filter(
          (row) =>
            row.classification ===
            "DUPLICATE_ACTIVITY_TIE"
        );

    const groups = [];

    for (const tie of ties) {
      const deepFile =
        (deep?.files || []).find(
          (row) => row.sha256 === tie.sha256
        );

      if (!deepFile) continue;

      const ranked =
        Array.isArray(deepFile.candidates)
          ? deepFile.candidates
          : [];

      const first = ranked[0];
      if (!first) continue;

      const equivalent =
        ranked.filter(
          (candidate) =>
            Number(candidate.contradiction_count || 0) === 0 &&
            c093StrongCore(candidate) &&
            c093SamePerformance(first, candidate)
        );

      const technical = [];

      for (const candidate of equivalent) {
        technical.push(
          await c093ActivityTechnical(
            uid,
            candidate.activity_id,
            inventory
          )
        );
      }

      groups.push({
        sha256: tie.sha256,
        file_name: tie.file_name,
        fit: deepFile.fit,
        duplicate_candidate_count: equivalent.length,
        activities: technical
      });
    }

    return {
      summary: {
        duplicate_groups: groups.length,
        activities_in_duplicate_groups:
          groups.reduce(
            (sum, row) =>
              sum + Number(row.duplicate_candidate_count || 0),
            0
          )
      },
      groups
    };
  }

  async function c093AnalyzeAll(uid) {
    const deep = await c092DeepAnalysis(uid);
    const inventory = await c091Inventory(uid);

    const safePreview =
      c093SafePreviewFromDeep(deep);

    const orphanSearch =
      await c093OrphanFingerprintSearch(
        uid,
        deep,
        inventory,
        safePreview
      );

    const duplicateDiagnostic =
      await c093DuplicateActivityDiagnostic(
        uid,
        deep,
        inventory,
        safePreview
      );

    return {
      safe_preview: safePreview,
      orphan_search: orphanSearch,
      duplicate_diagnostic: duplicateDiagnostic
    };
  }

  /* CGWEB093_MATCH_TRIAGE001_HELPERS_END */


  /* CGWEB094_SAFE_APPLY001_HELPERS_START */

  function c094Json(value) {
    if (value == null) return null;

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, 100)
        .map((x) => c094Json(x));
    }

    if (typeof value === "object") {
      const out = {};
      for (const [key, val] of Object.entries(value).slice(0, 100)) {
        if (typeof val === "function" || val === undefined) continue;
        out[key] = c094Json(val);
      }
      return out;
    }

    return String(value);
  }

  function c094NonEmpty(value) {
    if (value == null) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  }

  function c094Equal(a, b) {
    return JSON.stringify(c094Json(a)) === JSON.stringify(c094Json(b));
  }

  function c094PairKey(row) {
    return (
      String(row?.sha256 || "").toLowerCase() +
      "::" +
      String(row?.activity_id || "")
    );
  }

  function c094ExpectedPairs(body) {
    const raw = Array.isArray(body?.expected_pairs)
      ? body.expected_pairs
      : [];

    return raw
      .map((row) => ({
        sha256: String(row?.sha256 || "").trim().toLowerCase(),
        activity_id: String(row?.activity_id || "").trim()
      }))
      .filter(
        (row) =>
          /^[a-f0-9]{64}$/.test(row.sha256) &&
          row.activity_id
      )
      .sort((a, b) =>
        c094PairKey(a).localeCompare(c094PairKey(b))
      );
  }

  function c094SamePairPlan(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (c094PairKey(a[i]) !== c094PairKey(b[i])) {
        return false;
      }
    }
    return true;
  }

  async function c094BuildWritePlan(uid) {
    const deep = await c092DeepAnalysis(uid);
    const inventory = await c091Inventory(uid);
    const preview = c093SafePreviewFromDeep(deep);

    const safeRows = [];
    const rejectedSafeRows = [];
    const seenTargets = new Set();

    for (const row of preview.rows || []) {
      if (row.classification !== "SAFE_EXACT") continue;

      const sha256 = String(row.sha256 || "").trim().toLowerCase();
      const activityId =
        String(row.proposed_activity_id || "").trim();

      if (!sha256 || !activityId) {
        rejectedSafeRows.push({
          sha256,
          activity_id: activityId || null,
          reason: "proposition SAFE incomplète"
        });
        continue;
      }

      const state =
        inventory.activityState.get(activityId) || {};

      if (Number(state.original_count || 0) > 0) {
        rejectedSafeRows.push({
          sha256,
          activity_id: activityId,
          reason:
            "l'activité cible dispose déjà d'un original"
        });
        continue;
      }

      if (seenTargets.has(activityId)) {
        rejectedSafeRows.push({
          sha256,
          activity_id: activityId,
          reason:
            "activité cible proposée plusieurs fois dans le même plan"
        });
        continue;
      }

      seenTargets.add(activityId);

      safeRows.push({
        sha256,
        file_name: row.file_name,
        activity_id: activityId,
        classification: row.classification,
        reasons: row.reasons || [],
        candidate: row.first_candidate || null
      });
    }

    safeRows.sort((a, b) =>
      c094PairKey(a).localeCompare(c094PairKey(b))
    );

    const orphanRows =
      (preview.rows || [])
        .filter(
          (row) =>
            row.classification ===
            "NO_COMPATIBLE_CANDIDATE"
        )
        .map((row) => ({
          sha256: String(row.sha256 || "").trim().toLowerCase(),
          file_name: row.file_name,
          reason:
            "NO_COMPATIBLE_CANDIDATE",
          reasons: row.reasons || []
        }))
        .sort((a, b) =>
          String(a.sha256).localeCompare(String(b.sha256))
        );

    return {
      deep,
      inventory,
      preview,
      safe_rows: safeRows,
      rejected_safe_rows: rejectedSafeRows,
      orphan_rows: orphanRows
    };
  }

  async function c094SafeApply(uid, body) {
    if (
      String(body?.confirm || "") !==
      "APPLY_SAFE_EXACT"
    ) {
      throw Object.assign(
        new Error(
          "Confirmation APPLY_SAFE_EXACT requise."
        ),
        {status: 400}
      );
    }

    const plan = await c094BuildWritePlan(uid);

    if (plan.rejected_safe_rows.length) {
      throw Object.assign(
        new Error(
          "Plan SAFE refusé : au moins une cible ne respecte plus les garde-fous."
        ),
        {
          status: 409,
          details: plan.rejected_safe_rows
        }
      );
    }

    const currentPairs =
      plan.safe_rows
        .map((row) => ({
          sha256: row.sha256,
          activity_id: row.activity_id
        }))
        .sort((a, b) =>
          c094PairKey(a).localeCompare(c094PairKey(b))
        );

    const expectedPairs = c094ExpectedPairs(body);

    if (!c094SamePairPlan(currentPairs, expectedPairs)) {
      throw Object.assign(
        new Error(
          "Le plan SAFE a changé depuis la prévisualisation. Relance la prévisualisation."
        ),
        {
          status: 409,
          current_pairs: currentPairs
        }
      );
    }

    if (!currentPairs.length) {
      return {
        selected: 0,
        modified: 0,
        skipped: 0,
        pairs: []
      };
    }

    const now = Date.now();
    const batch = db.batch();
    const applied = [];

    for (const row of plan.safe_rows) {
      const [fileSnap, activitySnap] =
        await Promise.all([
          fileDoc(uid, row.sha256).get(),
          db.doc(
            `${ROOT}/${uid}/activities/${row.activity_id}`
          ).get()
        ]);

      if (!fileSnap.exists || !activitySnap.exists) {
        throw Object.assign(
          new Error(
            `Préflight interrompu pour ${row.file_name || row.sha256}: document absent.`
          ),
          {status: 409}
        );
      }

      const file = fileSnap.data() || {};
      const activity = activitySnap.data() || {};

      if (
        file.deleted_at_ms != null ||
        activity.deleted_at_ms != null
      ) {
        throw Object.assign(
          new Error(
            `Préflight interrompu pour ${row.file_name || row.sha256}: document supprimé.`
          ),
          {status: 409}
        );
      }

      const roles = c090Roles(file);

      if (!roles.includes(C090_ROLE_ORIGINAL)) {
        throw Object.assign(
          new Error(
            `Préflight interrompu pour ${row.file_name || row.sha256}: rôle ORIGINAL absent.`
          ),
          {status: 409}
        );
      }

      const currentActivityId =
        String(file.activity_id || "").trim();

      if (currentActivityId) {
        throw Object.assign(
          new Error(
            `Préflight interrompu : ${row.file_name || row.sha256} est déjà lié à ${currentActivityId}.`
          ),
          {status: 409}
        );
      }

      const candidate = row.candidate || {};
      const previousLinkStatus =
        String(file.link_status || "").trim() || null;

      batch.set(
        fileDoc(uid, row.sha256),
        {
          activity_id: row.activity_id,
          link_status: "LINKED_REPAIRED",
          original_match_repair_version:
            "ORIGINAL_MATCH_REPAIR001",
          reconcile_resolve_version:
            "FIT_RECONCILE_RESOLVE001",
          safe_match_apply_version:
            "SAFE_MATCH_APPLY001",
          cgweb094_version: "CGWEB094",
          match_repair_strategy:
            String(
              candidate.strategy ||
              "CGWEB094_SAFE_EXACT"
            ),
          match_repair_delta_ms:
            c092FirstFinite(candidate.delta_ms),
          match_repair_residual_ms:
            c092FirstFinite(candidate.residual_ms),
          match_repair_requested_by:
            "CGWEB094_SAFE_MATCH_APPLY001",
          previous_activity_id: null,
          previous_link_status: previousLinkStatus,
          safe_match_class: "SAFE_EXACT",
          repaired_at_ms: now,
          safe_match_applied_at_ms: now,
          updated_at_ms: now
        },
        {merge: true}
      );

      applied.push({
        sha256: row.sha256,
        file_name: row.file_name,
        activity_id: row.activity_id
      });
    }

    await batch.commit();

    const after = await c091Inventory(uid);

    return {
      selected: applied.length,
      modified: applied.length,
      activities_modified: 0,
      file_metadata_modified: applied.length,
      unresolved_after: after.unresolved.length,
      pairs: applied
    };
  }

  async function c094OrphanHoldState(uid, rows) {
    const out = [];

    for (const row of rows || []) {
      const snap = await fileDoc(uid, row.sha256).get();
      const data = snap.exists ? snap.data() || {} : {};

      out.push({
        ...row,
        exists: snap.exists,
        already_held:
          Boolean(data.orphan_hold) &&
          String(data.orphan_hold_version || "") ===
            "ORPHAN_HOLD001",
        current_activity_id:
          String(data.activity_id || "").trim() || null,
        current_link_status:
          String(data.link_status || "").trim() || null
      });
    }

    return out;
  }

  async function c094OrphanHoldApply(uid, body) {
    if (
      String(body?.confirm || "") !==
      "HOLD_ORPHANS"
    ) {
      throw Object.assign(
        new Error("Confirmation HOLD_ORPHANS requise."),
        {status: 400}
      );
    }

    const plan = await c094BuildWritePlan(uid);
    const currentRows =
      await c094OrphanHoldState(
        uid,
        plan.orphan_rows
      );

    const currentShas =
      currentRows
        .map((row) => row.sha256)
        .sort();

    const expectedShas =
      (Array.isArray(body?.expected_shas)
        ? body.expected_shas
        : [])
        .map((x) => String(x || "").trim().toLowerCase())
        .filter((x) => /^[a-f0-9]{64}$/.test(x))
        .sort();

    if (
      JSON.stringify(currentShas) !==
      JSON.stringify(expectedShas)
    ) {
      throw Object.assign(
        new Error(
          "La liste des orphelins a changé depuis la prévisualisation."
        ),
        {status: 409, current_shas: currentShas}
      );
    }

    const now = Date.now();
    const batch = db.batch();
    let modified = 0;
    let alreadyHeld = 0;

    for (const row of currentRows) {
      if (!row.exists) {
        throw Object.assign(
          new Error(
            `FIT orphelin introuvable : ${row.file_name || row.sha256}`
          ),
          {status: 409}
        );
      }

      if (row.current_activity_id) {
        throw Object.assign(
          new Error(
            `Le FIT ${row.file_name || row.sha256} vient d'être lié. HOLD annulé.`
          ),
          {status: 409}
        );
      }

      if (row.already_held) {
        alreadyHeld += 1;
        continue;
      }

      batch.set(
        fileDoc(uid, row.sha256),
        {
          orphan_hold: true,
          orphan_hold_version: "ORPHAN_HOLD001",
          orphan_hold_reason:
            "NO_COMPATIBLE_CANDIDATE",
          orphan_hold_review_required: true,
          orphan_hold_at_ms: now,
          cgweb094_version: "CGWEB094",
          updated_at_ms: now
        },
        {merge: true}
      );

      modified += 1;
    }

    if (modified > 0) {
      await batch.commit();
    }

    return {
      selected: currentRows.length,
      modified,
      already_held: alreadyHeld,
      activities_modified: 0,
      fit_files_linked: 0,
      shas: currentShas
    };
  }

  function c094MergeFields(row = {}) {
    const keys = [
      "custom_title",
      "name",
      "title",
      "description",
      "notes",
      "equipment_id",
      "equipment_name",
      "gear_id",
      "gear_name",
      "landmark_codes",
      "landmarks",
      "markers",
      "reperes",
      "charge",
      "load",
      "training_load",
      "relative_effort",
      "suffer_score",
      "calories",
      "avg_power",
      "max_power",
      "cadence",
      "manual",
      "private",
      "commute",
      "trainer",
      "import_source",
      "source",
      "origin",
      "strava_id",
      "strava_activity_id",
      "external_id",
      "provider_id",
      "source_activity_id",
      "remote_id",
      "start_time_ms",
      "sport",
      "sub_sport",
      "distance_m",
      "distance",
      "duration_s",
      "elapsed_time_s",
      "moving_time_s",
      "ascent_m",
      "total_ascent_m",
      "elevation_gain_m",
      "avg_hr",
      "avg_heart_rate",
      "max_hr",
      "max_heart_rate"
    ];

    const out = {};

    for (const key of keys) {
      if (row[key] !== undefined) {
        out[key] = c094Json(row[key]);
      }
    }

    return out;
  }

  function c094TechnicalScore(activity) {
    let score = 0;
    const ids = activity?.external_ids || {};

    if (
      ids.strava_id ||
      ids.external_id ||
      ids.provider_id
    ) {
      score += 1000;
    }

    if (activity?.route?.exists) {
      score += 100;
      score += Math.min(
        500,
        Number(activity.route.point_count || 0) / 10
      );
    }

    score +=
      Math.min(
        100,
        Number(activity?.fit_links?.length || 0) * 10
      );

    if (
      String(activity?.source || "")
        .toUpperCase()
        .includes("STRAVA_WEB")
    ) {
      score += 50;
    }

    return score;
  }

  async function c094DuplicateMergePreview(uid) {
    const deep = await c092DeepAnalysis(uid);
    const inventory = await c091Inventory(uid);
    const preview = c093SafePreviewFromDeep(deep);

    const diagnostic =
      await c093DuplicateActivityDiagnostic(
        uid,
        deep,
        inventory,
        preview
      );

    const groups = [];

    for (const group of diagnostic.groups || []) {
      const activities = [];

      for (const technical of group.activities || []) {
        const snap =
          await db.doc(
            `${ROOT}/${uid}/activities/${technical.activity_id}`
          ).get();

        const raw = snap.exists ? snap.data() || {} : {};

        activities.push({
          ...technical,
          merge_fields: c094MergeFields(raw),
          technical_score:
            c094TechnicalScore(technical)
        });
      }

      activities.sort(
        (a, b) =>
          Number(b.technical_score || 0) -
            Number(a.technical_score || 0) ||
          String(a.activity_id)
            .localeCompare(String(b.activity_id))
      );

      const base = activities[0] || null;
      const differences = [];

      if (base) {
        const allKeys = new Set();

        for (const activity of activities) {
          for (const key of Object.keys(
            activity.merge_fields || {}
          )) {
            allKeys.add(key);
          }
        }

        for (const key of [...allKeys].sort()) {
          const values = activities.map((activity) => ({
            activity_id: activity.activity_id,
            value:
              activity.merge_fields?.[key] ?? null
          }));

          const same = values.every((row) =>
            c094Equal(row.value, values[0].value)
          );

          if (same) continue;

          const baseValue =
            base.merge_fields?.[key] ?? null;

          const donorRows =
            values.filter(
              (row) =>
                row.activity_id !== base.activity_id &&
                c094NonEmpty(row.value)
            );

          const baseEmpty =
            !c094NonEmpty(baseValue);

          differences.push({
            field: key,
            values,
            base_activity_id: base.activity_id,
            base_empty: baseEmpty,
            transferable_to_base:
              baseEmpty && donorRows.length > 0,
            conflict:
              !baseEmpty &&
              donorRows.some(
                (row) =>
                  !c094Equal(row.value, baseValue)
              )
          });
        }
      }

      groups.push({
        sha256: group.sha256,
        file_name: group.file_name,
        fit: group.fit,
        activities,
        suggested_base_activity_id:
          base?.activity_id || null,
        suggested_base_reason:
          base
            ? "score de complétude technique maximal (IDs externes, route, FIT liés, provenance)"
            : null,
        differences,
        transferable_fields:
          differences.filter(
            (row) => row.transferable_to_base
          ).length,
        conflict_fields:
          differences.filter(
            (row) => row.conflict
          ).length,
        read_only: true
      });
    }

    return {
      summary: {
        duplicate_groups: groups.length,
        activities_compared:
          groups.reduce(
            (sum, group) =>
              sum + group.activities.length,
            0
          ),
        transferable_fields:
          groups.reduce(
            (sum, group) =>
              sum + group.transferable_fields,
            0
          ),
        conflict_fields:
          groups.reduce(
            (sum, group) =>
              sum + group.conflict_fields,
            0
          )
      },
      groups
    };
  }

  async function c094Preview(uid) {
    const plan = await c094BuildWritePlan(uid);

    const orphanState =
      await c094OrphanHoldState(
        uid,
        plan.orphan_rows
      );

    const mergePreview =
      await c094DuplicateMergePreview(uid);

    return {
      safe: {
        count: plan.safe_rows.length,
        rejected_count:
          plan.rejected_safe_rows.length,
        rows: plan.safe_rows,
        rejected: plan.rejected_safe_rows,
        expected_pairs:
          plan.safe_rows.map((row) => ({
            sha256: row.sha256,
            activity_id: row.activity_id
          }))
      },
      orphans: {
        count: orphanState.length,
        already_held:
          orphanState.filter(
            (row) => row.already_held
          ).length,
        rows: orphanState,
        expected_shas:
          orphanState.map((row) => row.sha256)
      },
      duplicate_merge_preview: mergePreview,
      invariants: {
        safe_apply_modifies:
          "activity_files metadata only",
        orphan_hold_modifies:
          "activity_files hold metadata only",
        duplicate_merge_preview:
          "READ_ONLY",
        activity_documents_modified_by_preview: 0
      }
    };
  }

  /* CGWEB094_SAFE_APPLY001_HELPERS_END */


  /* CGWEB095_GLOBAL_FIT_HELPERS_START */

  function c095Strings(values) {
    return [...new Set(
      (Array.isArray(values) ? values : [])
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
    )];
  }

  function c095Hash(value) {
    return require("crypto")
      .createHash("sha256")
      .update(String(value ?? ""), "utf8")
      .digest("hex");
  }

  function c095Title(row, id) {
    return String(
      row?.custom_title ||
      row?.name ||
      row?.title ||
      `Activité #${id}`
    ).trim();
  }

  function c095TimeMs(row) {
    const values = [
      row?.start_time_ms,
      row?.startTimeMs,
      row?.start_date_ms,
      row?.startDateMs,
      row?.start_time,
      row?.start_date
    ];

    for (const raw of values) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }

    return null;
  }

  async function c095Coverage(uid) {
    const states = new Map();

    const activityQuery =
      db.collection(`${ROOT}/${uid}/activities`);

    for await (const snap of activityQuery.stream()) {
      const row = snap.data() || {};

      if (row.deleted_at_ms != null) continue;

      const activityId = String(snap.id);
      const core = v088Core(row);

      states.set(activityId, {
        activity_id: activityId,
        title: c095Title(row, activityId),
        start_time_ms: c095TimeMs(row),
        source: String(row.source || row.import_source || ""),
        any_fit: false,
        original: false,
        canonical: false,
        edited: false,
        fit_count: 0,
        original_count: 0,
        canonical_count: 0,
        core_ok: Boolean(core?.ok),
        core_missing: Array.isArray(core?.missing)
          ? core.missing.map((x) => String(x))
          : []
      });
    }

    const fitQuery =
      files(uid).select(
        "activity_id",
        "sha256",
        "file_id",
        "file_name",
        "source",
        "upload_mode",
        "archive_roles",
        "fitwriter_version",
        "fitrecovery_version",
        "fitbackfill_version",
        "recovery_is_canonical",
        "fitversion_version",
        "fit_editor_version",
        "version_index",
        "version_kind",
        "deleted_at_ms"
      );

    let fitFilesActive = 0;
    let linkedFitFiles = 0;
    let unlinkedFitFiles = 0;
    let danglingFitFiles = 0;

    for await (const snap of fitQuery.stream()) {
      const row = snap.data() || {};

      if (row.deleted_at_ms != null) continue;

      fitFilesActive += 1;

      const activityId =
        String(row.activity_id || "").trim();

      if (!activityId) {
        unlinkedFitFiles += 1;
        continue;
      }

      const state = states.get(activityId);

      if (!state) {
        danglingFitFiles += 1;
        continue;
      }

      linkedFitFiles += 1;
      state.any_fit = true;
      state.fit_count += 1;

      const roles = c090Roles(row);
      const hasOriginal =
        roles.some(c090IsOriginalRole);
      const hasCanonical =
        roles.some(c090IsCanonicalRole);

      if (hasOriginal) {
        state.original = true;
        state.original_count += 1;
      }

      if (hasCanonical) {
        state.canonical = true;
        state.canonical_count += 1;
      }

      if (
        roles.includes("EDITED") ||
        roles.includes("VERSIONED_EDITED")
      ) {
        state.edited = true;
      }
    }

    let withAny = 0;
    let withOriginal = 0;
    let canonicalOnly = 0;
    let originalOnly = 0;
    let withBoth = 0;
    let withoutFit = 0;
    let withoutFitEligible = 0;
    let withoutFitInsufficient = 0;

    const eligibleIds = [];
    const insufficientIds = [];
    const noFitExamples = [];
    const insufficientExamples = [];
    const canonicalOnlyExamples = [];

    for (const state of states.values()) {
      if (state.any_fit) {
        withAny += 1;

        if (state.original) {
          withOriginal += 1;
        }

        if (state.original && state.canonical) {
          withBoth += 1;
        } else if (state.original) {
          originalOnly += 1;
        } else if (state.canonical) {
          canonicalOnly += 1;

          if (canonicalOnlyExamples.length < 40) {
            canonicalOnlyExamples.push({
              activity_id: state.activity_id,
              title: state.title,
              start_time_ms: state.start_time_ms,
              fit_count: state.fit_count,
              canonical_count: state.canonical_count
            });
          }
        }

        continue;
      }

      withoutFit += 1;

      const example = {
        activity_id: state.activity_id,
        title: state.title,
        start_time_ms: state.start_time_ms,
        source: state.source,
        missing: state.core_missing
      };

      if (state.core_ok) {
        withoutFitEligible += 1;
        eligibleIds.push(state.activity_id);

        if (noFitExamples.length < 80) {
          noFitExamples.push(example);
        }
      } else {
        withoutFitInsufficient += 1;
        insufficientIds.push(state.activity_id);

        if (insufficientExamples.length < 80) {
          insufficientExamples.push(example);
        }
      }
    }

    eligibleIds.sort((a, b) =>
      String(a).localeCompare(String(b))
    );

    insufficientIds.sort((a, b) =>
      String(a).localeCompare(String(b))
    );

    return {
      summary: {
        activities_active: states.size,
        activities_with_any_fit: withAny,
        activities_without_fit: withoutFit,
        activities_with_original: withOriginal,
        activities_canonical_only: canonicalOnly,
        activities_original_only: originalOnly,
        activities_with_both: withBoth,
        activities_without_fit_eligible:
          withoutFitEligible,
        activities_without_fit_insufficient:
          withoutFitInsufficient,
        fit_files_active: fitFilesActive,
        linked_fit_files: linkedFitFiles,
        unlinked_fit_files: unlinkedFitFiles,
        dangling_fit_files: danglingFitFiles,
        coverage_pct: states.size
          ? Math.round(
              (withAny / states.size) * 100000
            ) / 1000
          : 100
      },
      eligible_ids: eligibleIds,
      insufficient_ids: insufficientIds,
      examples: {
        no_fit_eligible: noFitExamples,
        no_fit_insufficient: insufficientExamples,
        canonical_only: canonicalOnlyExamples
      }
    };
  }

  function c095SafePairs(writePlan) {
    return (writePlan?.safe_rows || [])
      .map((row) => ({
        sha256:
          String(row?.sha256 || "")
            .trim()
            .toLowerCase(),
        activity_id:
          String(row?.activity_id || "").trim()
      }))
      .filter(
        (row) =>
          /^[a-f0-9]{64}$/.test(row.sha256) &&
          row.activity_id
      )
      .sort((a, b) =>
        `${a.sha256}|${a.activity_id}`
          .localeCompare(
            `${b.sha256}|${b.activity_id}`
          )
      );
  }

  function c095PlanToken(coverage, writePlan) {
    const payload = {
      active:
        Number(
          coverage?.summary?.activities_active || 0
        ),
      with_fit:
        Number(
          coverage?.summary
            ?.activities_with_any_fit || 0
        ),
      eligible:
        c095Strings(
          coverage?.eligible_ids || []
        ).sort(),
      insufficient:
        c095Strings(
          coverage?.insufficient_ids || []
        ).sort(),
      safe_pairs:
        c095SafePairs(writePlan),
      rejected_safe:
        (writePlan?.rejected_safe_rows || [])
          .map((row) => ({
            sha256:
              String(row?.sha256 || "")
                .trim()
                .toLowerCase(),
            activity_id:
              String(row?.activity_id || "")
                .trim(),
            reason:
              String(row?.reason || "")
          }))
          .sort((a, b) =>
            JSON.stringify(a)
              .localeCompare(JSON.stringify(b))
          )
    };

    return c095Hash(JSON.stringify(payload));
  }

  async function c095BuildPlan(uid) {
    const [coverage, writePlan] =
      await Promise.all([
        c095Coverage(uid),
        c094BuildWritePlan(uid)
      ]);

    const safePairs = c095SafePairs(writePlan);
    const rejected =
      writePlan?.rejected_safe_rows || [];

    return {
      coverage,
      write_plan: writePlan,
      safe_pairs: safePairs,
      safe_original_count: safePairs.length,
      rejected_safe_count: rejected.length,
      rejected_safe_rows: rejected.slice(0, 40),
      orphan_original_count:
        Number(
          writePlan?.orphan_rows?.length || 0
        ),
      plan_token:
        c095PlanToken(coverage, writePlan)
    };
  }

  function c095PublicPlan(plan) {
    return {
      plan_token: plan.plan_token,
      safe_original_count:
        plan.safe_original_count,
      rejected_safe_count:
        plan.rejected_safe_count,
      orphan_original_count:
        plan.orphan_original_count,
      rejected_safe_rows:
        plan.rejected_safe_rows,
      coverage: {
        summary: plan.coverage.summary,
        examples: plan.coverage.examples
      },
      invariants: {
        original_first: true,
        activities_created: 0,
        activities_modified: 0,
        existing_fit_replaced: 0,
        original_link_writes:
          "activity_files metadata only",
        generated_fit_writes:
          "new canonical FIT only for active activities without any linked FIT"
      }
    };
  }

  function c095VerifyToken(body, plan) {
    const supplied =
      String(body?.plan_token || "").trim();

    if (!supplied) {
      throw Object.assign(
        new Error(
          "plan_token absent : relancer l’analyse globale."
        ),
        {status: 400}
      );
    }

    if (supplied !== plan.plan_token) {
      throw Object.assign(
        new Error(
          "Le plan global a changé. Relancer l’analyse avant toute écriture."
        ),
        {
          status: 409,
          expected_plan_token:
            plan.plan_token
        }
      );
    }
  }

  async function c095ApplySafeOriginals(
    uid,
    plan
  ) {
    if (!plan.safe_original_count) {
      return {
        attempted: 0,
        applied: 0,
        blocked: false,
        rejected_safe_count:
          plan.rejected_safe_count
      };
    }

    if (plan.rejected_safe_count > 0) {
      return {
        attempted:
          plan.safe_original_count,
        applied: 0,
        blocked: true,
        rejected_safe_count:
          plan.rejected_safe_count,
        reason:
          "Le plan SAFE contient des cibles rejetées ; aucun rattachement original automatique n'est effectué."
      };
    }

    const result =
      await c094SafeApply(
        uid,
        {
          confirm:
            "APPLY_SAFE_EXACT",
          expected_pairs:
            plan.safe_pairs
        }
      );

    return {
      attempted:
        plan.safe_original_count,
      applied:
        Number(result?.modified || 0),
      blocked: false,
      rejected_safe_count: 0,
      result
    };
  }

  async function c095Map(
    items,
    worker,
    concurrency = 2
  ) {
    const out = new Array(items.length);
    let cursor = 0;

    async function run() {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;

        try {
          out[i] = await worker(items[i]);
        } catch (error) {
          out[i] = {
            ok: false,
            activity_id:
              String(items[i] || ""),
            status: "ERROR",
            error:
              error?.message || String(error)
          };
        }
      }
    }

    await Promise.all(
      Array.from(
        {
          length:
            Math.min(
              Math.max(1, concurrency),
              Math.max(1, items.length)
            )
        },
        () => run()
      )
    );

    return out;
  }

  async function c095GenerateChunk(
    uid,
    ids
  ) {
    const unique =
      c095Strings(ids).slice(0, 50);

    const results =
      await c095Map(
        unique,
        async (activityId) => {
          const linked =
            await files(uid)
              .where(
                "activity_id",
                "==",
                activityId
              )
              .limit(4)
              .get();

          const active =
            linked.docs.some(
              (doc) =>
                (doc.data() || {})
                  .deleted_at_ms == null
            );

          if (active) {
            return {
              ok: true,
              activity_id: activityId,
              status:
                "ALREADY_HAS_FIT",
              stored: false
            };
          }

          const snap =
            await db.doc(
              `${ROOT}/${uid}/activities/${activityId}`
            ).get();

          if (!snap.exists) {
            return {
              ok: false,
              activity_id: activityId,
              status:
                "ACTIVITY_MISSING",
              stored: false
            };
          }

          const row = snap.data() || {};

          if (row.deleted_at_ms != null) {
            return {
              ok: false,
              activity_id: activityId,
              status:
                "ACTIVITY_DELETED",
              stored: false
            };
          }

          const core = v088Core(row);

          if (!core?.ok) {
            return {
              ok: false,
              activity_id: activityId,
              status:
                "INSUFFICIENT",
              stored: false,
              missing:
                core?.missing || []
            };
          }

          return v088RecoverOne(
            uid,
            {
              activity_id:
                activityId
            }
          );
        },
        2
      );

    return {
      requested: unique.length,
      stored:
        results.filter(
          (row) =>
            row?.status === "STORED"
        ).length,
      already_present:
        results.filter(
          (row) =>
            row?.status ===
            "ALREADY_HAS_FIT"
        ).length,
      failed:
        results.filter(
          (row) =>
            row?.ok === false
        ).length,
      results
    };
  }

  /* CGWEB095_GLOBAL_FIT_HELPERS_END */


  /* CGWEB096_DIRECTORY_DOWNLOAD_HELPERS_START */

  function c096Text(value) {
    return String(value ?? "").trim();
  }

  function c096Basename(value) {
    const text = c096Text(value)
      .replace(/^gs:\/\/[^/]+\//i, "")
      .replace(/^\/+/, "")
      .replace(/\\/g, "/");

    const parts = text.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }

  function c096NormalizeObjectName(value, bucketName="") {
    let text = c096Text(value);

    if (!text) return "";

    text = text.replace(/\\/g, "/");

    if (/^gs:\/\//i.test(text)) {
      const prefix = `gs://${bucketName}/`;
      if (
        bucketName &&
        text.toLowerCase().startsWith(prefix.toLowerCase())
      ) {
        text = text.slice(prefix.length);
      } else {
        text = text.replace(/^gs:\/\/[^/]+\//i, "");
      }
    }

    try {
      if (/^https?:\/\//i.test(text)) {
        const url = new URL(text);
        const marker = "/o/";
        const at = url.pathname.indexOf(marker);

        if (at >= 0) {
          text = decodeURIComponent(
            url.pathname.slice(at + marker.length)
          );
        }
      }
    } catch (_) {}

    return text.replace(/^\/+/, "");
  }

  function c096CandidateObjectNames(row, bucketName="") {
    const keys = [
      "storage_path",
      "storagePath",
      "object_path",
      "objectPath",
      "object_name",
      "objectName",
      "cloud_path",
      "cloudPath",
      "gcs_path",
      "gcsPath",
      "full_path",
      "fullPath",
      "path",
      "download_path",
      "downloadPath",
      "file_path",
      "filePath",
      "file_name",
      "fileName"
    ];

    const out = [];

    for (const key of keys) {
      const value = c096NormalizeObjectName(
        row?.[key],
        bucketName
      );

      if (value) out.push(value);
    }

    return [...new Set(out)];
  }

  function c096RoleRank(row) {
    const roles = c090Roles(row);

    if (roles.some(c090IsOriginalRole)) return 300;
    if (roles.some(c090IsCanonicalRole)) return 200;

    if (
      roles.includes("EDITED") ||
      roles.includes("VERSIONED_EDITED")
    ) {
      return 100;
    }

    return 10;
  }

  function c096RoleLabel(row) {
    const roles = c090Roles(row);

    if (roles.some(c090IsOriginalRole)) return "ORIGINAL";
    if (roles.some(c090IsCanonicalRole)) return "CANONICAL";

    if (
      roles.includes("EDITED") ||
      roles.includes("VERSIONED_EDITED")
    ) {
      return "EDITED";
    }

    return roles[0] || "UNKNOWN";
  }

  async function c096StorageIndex() {
    const {getStorage} =
      require("firebase-admin/storage");

    const bucket = getStorage().bucket();
    const [objects] =
      await bucket.getFiles({autoPaginate:true});

    const exact = new Map();
    const basename = new Map();
    const sha = new Map();

    for (const object of objects) {
      const name = c096NormalizeObjectName(
        object.name,
        bucket.name
      );

      if (!name) continue;

      exact.set(name, object.name);

      const base =
        c096Basename(name).toLowerCase();

      if (base) {
        const values = basename.get(base) || [];
        values.push(object.name);
        basename.set(base, values);
      }

      const match =
        String(name).toLowerCase()
          .match(/[a-f0-9]{64}/g) || [];

      for (const token of match) {
        const values = sha.get(token) || [];
        values.push(object.name);
        sha.set(token, values);
      }
    }

    return {
      bucket,
      object_count: objects.length,
      exact,
      basename,
      sha
    };
  }

  async function c096LinkedRows(uid) {
    const byActivity = new Map();

    for await (
      const snap of files(uid).stream()
    ) {
      const row = snap.data() || {};

      if (row.deleted_at_ms != null) continue;

      const activityId =
        c096Text(row.activity_id);

      if (!activityId) continue;

      const entry = {
        ...row,
        __doc_id: snap.id
      };

      const values =
        byActivity.get(activityId) || [];

      values.push(entry);
      byActivity.set(activityId, values);
    }

    for (const values of byActivity.values()) {
      values.sort(
        (a, b) =>
          c096RoleRank(b) -
          c096RoleRank(a)
      );
    }

    return byActivity;
  }

  function c096ResolveRowObject(row, index) {
    const bucketName = index.bucket.name;
    const candidates =
      c096CandidateObjectNames(
        row,
        bucketName
      );

    for (const candidate of candidates) {
      if (index.exact.has(candidate)) {
        return {
          status: "RESOLVED_EXACT",
          object_name:
            index.exact.get(candidate),
          method: "EXACT_METADATA"
        };
      }
    }

    for (const candidate of candidates) {
      const base =
        c096Basename(candidate)
          .toLowerCase();

      if (!base) continue;

      const matches =
        index.basename.get(base) || [];

      if (matches.length === 1) {
        return {
          status: "RESOLVED_BASENAME",
          object_name: matches[0],
          method: "UNIQUE_BASENAME"
        };
      }

      if (matches.length > 1) {
        return {
          status: "AMBIGUOUS_BASENAME",
          object_name: "",
          method: "AMBIGUOUS_BASENAME",
          matches: matches.slice(0, 8)
        };
      }
    }

    const hash =
      c096Text(row?.sha256)
        .toLowerCase();

    if (/^[a-f0-9]{64}$/.test(hash)) {
      const matches =
        index.sha.get(hash) || [];

      if (matches.length === 1) {
        return {
          status: "RESOLVED_SHA",
          object_name: matches[0],
          method: "UNIQUE_SHA"
        };
      }

      if (matches.length > 1) {
        return {
          status: "AMBIGUOUS_SHA",
          object_name: "",
          method: "AMBIGUOUS_SHA",
          matches: matches.slice(0, 8)
        };
      }
    }

    return {
      status: "OBJECT_NOT_FOUND",
      object_name: "",
      method: "NONE"
    };
  }

  function c096ResolvePreferred(
    rows,
    index
  ) {
    let firstFailure = null;

    for (const row of rows || []) {
      const resolved =
        c096ResolveRowObject(
          row,
          index
        );

      const result = {
        ...resolved,
        role: c096RoleLabel(row),
        file_doc_id:
          c096Text(row.__doc_id),
        file_name:
          c096Text(
            row.file_name ||
            row.fileName ||
            c096Basename(
              resolved.object_name
            )
          ),
        sha256:
          c096Text(row.sha256)
      };

      if (
        resolved.status.startsWith(
          "RESOLVED_"
        )
      ) {
        return result;
      }

      if (!firstFailure) {
        firstFailure = result;
      }
    }

    return firstFailure || {
      status: "NO_LINKED_FILE",
      object_name: "",
      method: "NONE",
      role: "NONE",
      file_doc_id: "",
      file_name: "",
      sha256: ""
    };
  }

  async function c096DirectoryAudit(uid) {
    const [coverage, byActivity, index] =
      await Promise.all([
        c095Coverage(uid),
        c096LinkedRows(uid),
        c096StorageIndex()
      ]);

    let linkedMetadata = 0;
    let downloadable = 0;
    let original = 0;
    let canonical = 0;
    let edited = 0;
    let unresolved = 0;
    let ambiguous = 0;
    let noMetadata = 0;

    const unresolvedExamples = [];
    const ambiguousExamples = [];
    const noMetadataExamples = [];

    const activityQuery =
      db.collection(
        `${ROOT}/${uid}/activities`
      );

    for await (
      const snap of activityQuery.stream()
    ) {
      const activity = snap.data() || {};

      if (activity.deleted_at_ms != null) continue;

      const activityId = String(snap.id);
      const rows =
        byActivity.get(activityId) || [];

      if (!rows.length) {
        noMetadata += 1;

        if (noMetadataExamples.length < 40) {
          noMetadataExamples.push({
            activity_id: activityId,
            title:
              c095Title(
                activity,
                activityId
              )
          });
        }

        continue;
      }

      linkedMetadata += 1;

      const resolved =
        c096ResolvePreferred(
          rows,
          index
        );

      if (
        resolved.status.startsWith(
          "RESOLVED_"
        )
      ) {
        downloadable += 1;

        if (resolved.role === "ORIGINAL") {
          original += 1;
        } else if (
          resolved.role === "CANONICAL"
        ) {
          canonical += 1;
        } else {
          edited += 1;
        }

        continue;
      }

      if (
        resolved.status.startsWith(
          "AMBIGUOUS_"
        )
      ) {
        ambiguous += 1;

        if (ambiguousExamples.length < 40) {
          ambiguousExamples.push({
            activity_id: activityId,
            title:
              c095Title(
                activity,
                activityId
              ),
            status: resolved.status,
            role: resolved.role,
            file_name: resolved.file_name
          });
        }

        continue;
      }

      unresolved += 1;

      if (unresolvedExamples.length < 40) {
        unresolvedExamples.push({
          activity_id: activityId,
          title:
            c095Title(
              activity,
              activityId
            ),
          status: resolved.status,
          role: resolved.role,
          file_name: resolved.file_name,
          sha256: resolved.sha256
        });
      }
    }

    return {
      summary: {
        activities_active:
          Number(
            coverage?.summary
              ?.activities_active || 0
          ),
        linked_metadata:
          linkedMetadata,
        downloadable,
        downloadable_original:
          original,
        downloadable_canonical:
          canonical,
        downloadable_edited:
          edited,
        unresolved_object:
          unresolved,
        ambiguous_object:
          ambiguous,
        no_link_metadata:
          noMetadata,
        storage_objects:
          index.object_count,
        download_ready_pct:
          coverage?.summary
            ?.activities_active
            ? Math.round(
                (
                  downloadable /
                  coverage.summary
                    .activities_active
                ) *
                100000
              ) / 1000
            : 100
      },
      examples: {
        unresolved:
          unresolvedExamples,
        ambiguous:
          ambiguousExamples,
        no_metadata:
          noMetadataExamples
      }
    };
  }

  async function c096ResolveActivity(
    uid,
    activityId
  ) {
    const id =
      c096Text(activityId);

    if (!id) {
      throw Object.assign(
        new Error("activity_id absent."),
        {status:400}
      );
    }

    const activitySnap =
      await db.doc(
        `${ROOT}/${uid}/activities/${id}`
      ).get();

    if (!activitySnap.exists) {
      throw Object.assign(
        new Error("Activité introuvable."),
        {status:404}
      );
    }

    const activity =
      activitySnap.data() || {};

    if (activity.deleted_at_ms != null) {
      throw Object.assign(
        new Error("Activité supprimée."),
        {status:404}
      );
    }

    const linked =
      await files(uid)
        .where(
          "activity_id",
          "==",
          id
        )
        .get();

    const rows =
      linked.docs
        .map((snap) => ({
          ...(snap.data() || {}),
          __doc_id: snap.id
        }))
        .filter(
          (row) =>
            row.deleted_at_ms == null
        )
        .sort(
          (a, b) =>
            c096RoleRank(b) -
            c096RoleRank(a)
        );

    if (!rows.length) {
      return {
        activity_id: id,
        title:
          c095Title(
            activity,
            id
          ),
        status: "NO_LINKED_FILE",
        downloadable: false
      };
    }

    const index =
      await c096StorageIndex();

    const resolved =
      c096ResolvePreferred(
        rows,
        index
      );

    if (
      !resolved.status.startsWith(
        "RESOLVED_"
      )
    ) {
      return {
        activity_id: id,
        title:
          c095Title(
            activity,
            id
          ),
        downloadable: false,
        ...resolved
      };
    }

    const file =
      index.bucket.file(
        resolved.object_name
      );

    let url = "";

    try {
      const dispositionName =
        c096Basename(
          resolved.file_name ||
          resolved.object_name
        ) ||
        `activity_${id}.fit`;

      const [signed] =
        await file.getSignedUrl({
          version: "v4",
          action: "read",
          expires:
            Date.now() +
            10 * 60 * 1000,
          responseDisposition:
            `attachment; filename="${dispositionName.replace(/"/g, "")}"`
        });

      url = signed;
    } catch (error) {
      return {
        activity_id: id,
        title:
          c095Title(
            activity,
            id
          ),
        downloadable: false,
        status: "SIGN_URL_ERROR",
        role: resolved.role,
        object_name:
          resolved.object_name,
        file_name:
          resolved.file_name,
        error:
          error?.message ||
          String(error)
      };
    }

    return {
      activity_id: id,
      title:
        c095Title(
          activity,
          id
        ),
      downloadable: true,
      status: "DOWNLOAD_READY",
      role: resolved.role,
      method: resolved.method,
      object_name:
        resolved.object_name,
      file_name:
        resolved.file_name ||
        c096Basename(
          resolved.object_name
        ),
      url,
      expires_in_seconds: 600
    };
  }



  /* CGWEB107_SIGN_FORENSICS_HELPERS_START */

  function c107SignErrorDetail(error){
    const message=String(error?.message||error?.details||error||"").trim();
    const code=String(error?.code??error?.status??error?.response?.status??"").trim();
    const low=(message+" "+code).toLowerCase();
    let classification="SIGN_URL_UNKNOWN";

    if(
      low.includes("iam.serviceaccounts.signblob") ||
      (low.includes("signblob") && (low.includes("permission")||low.includes("denied")))
    ){
      classification="IAM_SIGNBLOB_DENIED";
    }else if(low.includes("signblob")){
      classification="IAM_SIGNBLOB_ERROR";
    }else if(
      low.includes("private key") ||
      low.includes("client_email") ||
      low.includes("could not sign") ||
      low.includes("cannot sign") ||
      low.includes("unable to sign")
    ){
      classification="CREDENTIAL_SIGNING_ERROR";
    }else if(code==="403" || low.includes("permission denied") || low.includes("forbidden")){
      classification="PERMISSION_DENIED";
    }else if(code==="404" || low.includes("not found")){
      classification="NOT_FOUND";
    }else if(low.includes("invalid argument") || low.includes("invalid value")){
      classification="INVALID_SIGN_ARGUMENT";
    }

    return {
      classification,
      code,
      name:String(error?.name||""),
      message:message.slice(0,1200)
    };
  }

  function c107SafeMetadata(row){
    row=row&&typeof row==="object"?row:{};
    return {
      name:String(row.name||""),
      bucket:String(row.bucket||""),
      size_bytes:Number(row.size||0)||0,
      content_type:String(row.contentType||""),
      generation:String(row.generation||""),
      metageneration:String(row.metageneration||""),
      storage_class:String(row.storageClass||""),
      created:String(row.timeCreated||""),
      updated:String(row.updated||""),
      crc32c:String(row.crc32c||""),
      md5_hash:String(row.md5Hash||"")
    };
  }

  async function c107TrySign(file,options){
    try{
      const [url]=await file.getSignedUrl(options);
      return {
        ok:Boolean(url),
        classification:"SIGN_OK",
        code:"",
        error:"",
        expires_in_seconds:120
      };
    }catch(error){
      const d=c107SignErrorDetail(error);
      return {
        ok:false,
        classification:d.classification,
        code:d.code,
        error:d.message,
        expires_in_seconds:0
      };
    }
  }

  async function c107FitSignUrlForensics(uid,activityId){
    const id=c096Text(activityId);
    if(!id)throw Object.assign(new Error("activity_id absent."),{status:400});

    const activitySnap=await db.doc(ROOT+"/"+uid+"/activities/"+id).get();
    if(!activitySnap.exists)throw Object.assign(new Error("Activité introuvable."),{status:404});

    const activity=activitySnap.data()||{};
    if(activity.deleted_at_ms!=null)throw Object.assign(new Error("Activité supprimée."),{status:404});

    const [byActivity,index]=await Promise.all([
      c096LinkedRows(uid),
      c096StorageIndex()
    ]);

    const rows=byActivity.get(id)||[];
    const resolved=c096ResolvePreferred(rows,index);

    const base={
      activity_id:id,
      title:c095Title(activity,id),
      linked_file_count:rows.length,
      role:resolved.role||"NONE",
      resolve_status:resolved.status||"NO_STATUS",
      resolve_method:resolved.method||"NONE",
      file_name:resolved.file_name||"",
      sha256:resolved.sha256||"",
      object_name:resolved.object_name||"",
      bucket:index.bucket.name,
      read_only:true
    };

    if(!String(resolved.status||"").startsWith("RESOLVED_")){
      return {
        ...base,
        storage:{exists:false,metadata_ok:false,error:"Objet non résolu."},
        sign_minimal:{ok:false,classification:"NOT_ATTEMPTED"},
        sign_attachment:{ok:false,classification:"NOT_ATTEMPTED"},
        diagnosis:"OBJECT_RESOLVE_FAILED",
        diagnosis_detail:"Aucun objet Storage unique n'a pu être résolu."
      };
    }

    const file=index.bucket.file(resolved.object_name);
    let exists=false, existsError=null, metadata=null, metadataError=null;

    try{
      const [value]=await file.exists();
      exists=Boolean(value);
    }catch(error){
      existsError=c107SignErrorDetail(error);
    }

    if(exists){
      try{
        const [raw]=await file.getMetadata();
        metadata=c107SafeMetadata(raw);
      }catch(error){
        metadataError=c107SignErrorDetail(error);
      }
    }

    const storage={
      exists,
      exists_check_ok:!existsError,
      metadata_ok:Boolean(metadata),
      metadata,
      exists_error:existsError,
      metadata_error:metadataError
    };

    if(!exists){
      return {
        ...base,
        storage,
        sign_minimal:{ok:false,classification:"NOT_ATTEMPTED"},
        sign_attachment:{ok:false,classification:"NOT_ATTEMPTED"},
        diagnosis:existsError?"STORAGE_VERIFY_ERROR":"STORAGE_OBJECT_MISSING",
        diagnosis_detail:existsError
          ? existsError.classification+" — "+existsError.message
          : "L'objet Storage résolu n'existe plus."
      };
    }

    const expires=Date.now()+2*60*1000;
    const minimal=await c107TrySign(file,{
      version:"v4",action:"read",expires
    });

    const dispositionName=
      c096Basename(resolved.file_name||resolved.object_name)||
      ("activity_"+id+".fit");

    const attachment=await c107TrySign(file,{
      version:"v4",
      action:"read",
      expires,
      responseDisposition:'attachment; filename="'+dispositionName.replace(/"/g,"")+'"'
    });

    let diagnosis="SIGNING_OK_NOW";
    let diagnosisDetail="Les deux signatures V4 réussissent actuellement.";

    if(!minimal.ok && !attachment.ok){
      diagnosis=minimal.classification||attachment.classification||"SIGN_URL_UNKNOWN";
      diagnosisDetail=[minimal.classification,minimal.error].filter(Boolean).join(" — ");
    }else if(minimal.ok && !attachment.ok){
      diagnosis="RESPONSE_DISPOSITION_SIGN_ERROR";
      diagnosisDetail=[attachment.classification,attachment.error].filter(Boolean).join(" — ");
    }else if(!minimal.ok && attachment.ok){
      diagnosis="MINIMAL_SIGN_ANOMALY";
      diagnosisDetail=[minimal.classification,minimal.error].filter(Boolean).join(" — ");
    }

    return {
      ...base,
      storage,
      sign_minimal:minimal,
      sign_attachment:attachment,
      diagnosis,
      diagnosis_detail:diagnosisDetail
    };
  }

  /* CGWEB107_SIGN_FORENSICS_HELPERS_END */

  /* CGWEB107_DIRECT_DOWNLOAD_HELPERS_START */

  function c107DirectName(value,id){
    let name=(c096Basename(value)||("activity_"+String(id||"")+".fit"))
      .replace(/[\u0000-\u001f\u007f]/g,"")
      .replace(/[\\/:*?"<>|]/g,"_")
      .trim();
    if(!/\.fit$/i.test(name))name+=".fit";
    return name.slice(0,220)||("activity_"+String(id||"")+".fit");
  }

  async function c107DirectResolve(uid,activityId){
    const id=c096Text(activityId);

    if(!uid)throw Object.assign(
      new Error("AUTH_DOWNLOAD_GUARD001 : connexion SPORT requise."),
      {status:401,code:"AUTH_REQUIRED"}
    );

    if(!id)throw Object.assign(
      new Error("AUTH_DOWNLOAD_GUARD001 : activity_id absent."),
      {status:400,code:"ACTIVITY_ID_REQUIRED"}
    );

    const activitySnap=await db.doc(ROOT+"/"+uid+"/activities/"+id).get();
    if(!activitySnap.exists)throw Object.assign(
      new Error("AUTH_DOWNLOAD_GUARD001 : activité introuvable."),
      {status:404,code:"ACTIVITY_NOT_FOUND"}
    );

    const activity=activitySnap.data()||{};
    if(activity.deleted_at_ms!=null)throw Object.assign(
      new Error("AUTH_DOWNLOAD_GUARD001 : activité en corbeille."),
      {status:409,code:"ACTIVITY_DELETED"}
    );

    const linked=await files(uid).where("activity_id","==",id).get();
    const rows=linked.docs
      .map(x=>({...x.data(),__doc_id:String(x.id)}))
      .filter(x=>x.deleted_at_ms==null)
      .sort((a,b)=>c096RoleRank(b)-c096RoleRank(a));

    if(!rows.length)throw Object.assign(
      new Error("DOWNLOAD_ERROR_TRUTH001 : aucun FIT lié à cette activité."),
      {status:404,code:"NO_LINKED_FILE"}
    );

    const {getStorage}=require("firebase-admin/storage");
    const bucket=getStorage().bucket();

    for(const row of rows){
      const candidates=c096CandidateObjectNames(row,bucket.name);
      for(const objectName of candidates){
        if(!objectName || objectName===c096Basename(objectName))continue;
        const object=bucket.file(objectName);
        try{
          const [exists]=await object.exists();
          if(!exists)continue;
          const [meta]=await object.getMetadata();
          return {
            id, activity, object,
            object_name:objectName,
            role:c096RoleLabel(row),
            method:"DIRECT_METADATA_PATH",
            file_name:c107DirectName(row.file_name||row.fileName||objectName,id),
            size:Number(meta?.size||0)||0,
            content_type:String(meta?.contentType||"application/vnd.ant.fit")
          };
        }catch(_){}
      }
    }

    const index=await c096StorageIndex();
    const resolved=c096ResolvePreferred(rows,index);

    if(!String(resolved?.status||"").startsWith("RESOLVED_")){
      throw Object.assign(
        new Error("DOWNLOAD_ERROR_TRUTH001 : objet FIT non résolu ("+
          String(resolved?.status||"NO_STATUS")+")."),
        {status:404,code:String(resolved?.status||"OBJECT_NOT_RESOLVED")}
      );
    }

    const object=index.bucket.file(resolved.object_name);
    let meta;
    try{
      [meta]=await object.getMetadata();
    }catch(error){
      throw Object.assign(
        new Error("DOWNLOAD_ERROR_TRUTH001 : objet Storage inaccessible — "+
          (error?.message||String(error))),
        {status:502,code:"STORAGE_OBJECT_READ_ERROR"}
      );
    }

    return {
      id, activity, object,
      object_name:resolved.object_name,
      role:resolved.role||"UNKNOWN",
      method:resolved.method||"CGWEB096_RESOLVER",
      file_name:c107DirectName(resolved.file_name||resolved.object_name,id),
      size:Number(meta?.size||0)||0,
      content_type:String(meta?.contentType||"application/vnd.ant.fit")
    };
  }

  async function c107StreamFit(res,uid,activityId){
    const r=await c107DirectResolve(uid,activityId);
    const ascii=r.file_name.normalize("NFKD")
      .replace(/[^\x20-\x7E]/g,"_").replace(/["\\]/g,"_");
    const encoded=encodeURIComponent(r.file_name);

    res.status(200);
    res.set("Content-Type",r.content_type);
    res.set("Content-Disposition",
      'attachment; filename="'+ascii+'"; filename*=UTF-8\'\''+encoded);
    res.set("Cache-Control","private, no-store, max-age=0");
    res.set("X-Content-Type-Options","nosniff");
    res.set("X-Sport-Download-Service","FIT_DIRECT_DOWNLOAD001");
    res.set("X-Sport-Fit-Role",String(r.role||""));
    res.set("X-Sport-Fit-Resolve-Method",String(r.method||""));
    res.set("X-Sport-Fit-Object-Size",String(r.size||0));
    res.set("Access-Control-Expose-Headers",
      "Content-Disposition, Content-Length, X-Sport-Download-Service, X-Sport-Fit-Role, X-Sport-Fit-Resolve-Method, X-Sport-Fit-Object-Size");
    if(r.size>0)res.set("Content-Length",String(r.size));

    return await new Promise(resolve=>{
      const stream=r.object.createReadStream();
      let done=false;
      const finish=()=>{if(!done){done=true;resolve();}};
      stream.on("error",error=>{
        console.error("STORAGE_STREAM_DOWNLOAD001",r.id,r.object_name,error);
        if(!res.headersSent){
          res.status(502).json({
            ok:false,status:"STORAGE_STREAM_ERROR",
            error:error?.message||String(error)
          });
        }else{
          try{res.destroy(error);}catch(_){}
        }
        finish();
      });
      res.on("finish",finish);
      res.on("close",finish);
      stream.pipe(res);
    });
  }

  /* CGWEB107_DIRECT_DOWNLOAD_HELPERS_END */

  /* CGWEB108_ORPHAN_AUDIT_HELPERS_START */

  function c108Text(v){
    return String(v ?? "").trim();
  }

  function c108ExternalIds(row){
    const keys=[
      "strava_id","strava_activity_id","stravaActivityId",
      "external_id","externalId","provider_id","providerId",
      "source_activity_id","sourceActivityId","remote_id","remoteId"
    ];
    return [...new Set(
      keys.map(k=>c108Text(row?.[k])).filter(Boolean)
    )];
  }

  function c108Source(row){
    return c108Text(
      row?.import_source ?? row?.source ?? row?.origin ??
      row?.provider ?? row?.upload_mode ?? row?.strava_sport_type
    );
  }

  function c108IsStrava(row){
    return Boolean(
      c108Text(row?.strava_id ?? row?.strava_activity_id) ||
      c108Source(row).toLowerCase().includes("strava")
    );
  }

  function c108Lineage(raw,byActivity,index){
    const parentId=c108Text(raw?.split_parent_activity_id ?? raw?.split_parent_id);
    let parentFit=null;

    if(parentId){
      const linked=byActivity.get(parentId)||[];
      if(linked.length){
        const r=c096ResolvePreferred(linked,index);
        parentFit={
          activity_id:parentId,
          status:r.status,
          role:r.role,
          downloadable:c108Text(r.status).startsWith("RESOLVED_"),
          file_name:r.file_name||"",
          sha256:r.sha256||""
        };
      }
    }

    return {
      import_source:c108Source(raw),
      strava_import:c108IsStrava(raw),
      external_ids:c108ExternalIds(raw),
      split_status:c108Text(raw?.split_status),
      split_parent_activity_id:parentId||null,
      split_children_ids:Array.isArray(raw?.split_children_ids)
        ? raw.split_children_ids.map(c108Text).filter(Boolean)
        : [],
      parent_fit:parentFit
    };
  }

  async function c108Audit(uid){
    const [
      directory,
      inventory,
      deep,
      byActivity,
      index
    ]=await Promise.all([
      c099DirectoryData(uid,true),
      c091Inventory(uid),
      c092DeepAnalysis(uid),
      c096LinkedRows(uid),
      c096StorageIndex()
    ]);

    const safe=c093SafePreviewFromDeep(deep);
    const orphanSearch=await c093OrphanFingerprintSearch(
      uid,deep,inventory,safe
    );

    const activeFileRows=[];
    const representedObjects=new Set();

    for await(const snap of files(uid).stream()){
      const row=snap.data()||{};
      if(row.deleted_at_ms!=null)continue;

      const entry={...row,__doc_id:String(snap.id)};
      activeFileRows.push(entry);

      const resolved=c096ResolveRowObject(entry,index);
      if(c108Text(resolved.status).startsWith("RESOLVED_") && resolved.object_name){
        representedObjects.add(resolved.object_name);
      }
    }

    const unindexedObjects=[
      ...index.exact.values()
    ].filter(name=>
      /\.fit$/i.test(name) &&
      !representedObjects.has(name)
    );

    const safeByActivity=new Map();
    for(const row of safe?.rows||[]){
      const id=c108Text(row?.proposed_activity_id);
      if(id && row?.classification==="SAFE_EXACT"){
        if(!safeByActivity.has(id))safeByActivity.set(id,[]);
        safeByActivity.get(id).push(row);
      }
    }

    const fingerprintByActivity=new Map();
    for(const fileRow of orphanSearch?.files||[]){
      for(const candidate of fileRow?.candidates||[]){
        const id=c108Text(candidate?.activity_id);
        if(!id)continue;
        if(!fingerprintByActivity.has(id))fingerprintByActivity.set(id,[]);
        fingerprintByActivity.get(id).push({
          sha256:fileRow.sha256,
          file_name:fileRow.file_name,
          fit:fileRow.fit,
          ...candidate
        });
      }
    }

    for(const values of fingerprintByActivity.values()){
      values.sort(c093FingerprintSort);
    }

    const rows=[];

    for(const directoryRow of directory.rows||[]){
      const id=c108Text(directoryRow.activity_id);
      if(!id)continue;

      const linked=byActivity.get(id)||[];
      const resolved=c096ResolvePreferred(linked,index);

      if(c108Text(resolved.status).startsWith("RESOLVED_")){
        continue;
      }

      const raw=directory.rawById.get(id)||{};
      const lineage=c108Lineage(raw,byActivity,index);
      const safeExact=safeByActivity.get(id)||[];
      const fingerprint=fingerprintByActivity.get(id)||[];

      const exactFingerprint=fingerprint.filter((item,indexPos)=>{
        if(item?.fingerprint_class!=="FINGERPRINT_EXACT")return false;
        if(Number(item?.contradiction_count||0)!==0)return false;
        if(indexPos>0 && ["FINGERPRINT_EXACT","FINGERPRINT_STRONG"].includes(fingerprint[0]?.fingerprint_class)){
          return false;
        }
        return true;
      });

      let classification="";
      let truth="";
      let selected=null;

      if(safeExact.length===1){
        const r=safeExact[0];
        selected={
          sha256:r.sha256,
          file_name:r.file_name,
          reasons:r.reasons||[],
          source:"SAFE_EXACT"
        };
        classification="EXACT_FILE_DOC_UNLINKED";
        truth="FIT_PRESENT_RELINKABLE_PREVIEW";
      }else if(safeExact.length>1){
        classification="MULTIPLE_CANDIDATES";
        truth="FIT_PRESENT_BUT_AMBIGUOUS";
      }else if(exactFingerprint.length===1){
        const r=exactFingerprint[0];
        selected={
          sha256:r.sha256,
          file_name:r.file_name,
          reasons:[
            "empreinte "+r.fingerprint_class,
            "contradictions "+String(r.contradiction_count||0),
            "écart temps "+String(r.time_delta_s??"NA")+" s"
          ],
          source:"FINGERPRINT_EXACT"
        };
        classification="EXACT_ORPHAN_MATCH";
        truth="FIT_PRESENT_RELINKABLE_PREVIEW";
      }else if(
        fingerprint[0] &&
        ["FINGERPRINT_EXACT","FINGERPRINT_STRONG","FINGERPRINT_PLAUSIBLE"]
          .includes(fingerprint[0].fingerprint_class)
      ){
        if(
          fingerprint[1] &&
          ["FINGERPRINT_EXACT","FINGERPRINT_STRONG"]
            .includes(fingerprint[1].fingerprint_class)
        ){
          classification="MULTIPLE_CANDIDATES";
          truth="FIT_PRESENT_BUT_AMBIGUOUS";
        }else{
          classification="PROBABLE_STORAGE_MATCH";
          truth="FIT_PRESENT_PROBABLE";
          selected={
            sha256:fingerprint[0].sha256,
            file_name:fingerprint[0].file_name,
            reasons:[
              "empreinte "+fingerprint[0].fingerprint_class,
              "écart temps "+String(fingerprint[0].time_delta_s??"NA")+" s"
            ],
            source:"FINGERPRINT"
          };
        }
      }else if(lineage.parent_fit?.downloadable){
        classification="SPLIT_PARENT_ORIGINAL_FOUND";
        truth="FIT_PRESENT_ON_SPLIT_PARENT";
      }else if(linked.length){
        classification="LINKED_OBJECT_MISSING";
        truth="FILE_DOC_PRESENT_OBJECT_UNRESOLVED";
      }else if(unindexedObjects.length===0){
        classification="ARCHIVE_REQUIRED";
        truth="TRUE_ABSENT_CLOUD";
      }else{
        classification="DEEP_STORAGE_SCAN_REQUIRED";
        truth="NO_INDEXED_MATCH_UNINDEXED_OBJECTS_REMAIN";
      }

      rows.push({
        activity_id:id,
        title:directoryRow.title,
        start_time_ms:directoryRow.start_time_ms,
        sport:directoryRow.sport,
        distance_m:directoryRow.distance_m,
        duration_s:directoryRow.duration_s,
        source:directoryRow.source,
        external_id:directoryRow.external_id||"",
        strava_import:c108IsStrava(raw),
        external_ids:c108ExternalIds(raw),
        linked_metadata_count:linked.length,
        linked_status:resolved.status||"NO_LINKED_FILE",
        linked_role:resolved.role||"NONE",
        lineage,
        classification,
        no_fit_truth:truth,
        selected_preview:selected,
        safe_exact_candidates:safeExact.slice(0,4).map(r=>({
          sha256:r.sha256,file_name:r.file_name,reasons:r.reasons||[]
        })),
        fingerprint_candidates:fingerprint.slice(0,5).map(r=>({
          sha256:r.sha256,
          file_name:r.file_name,
          class:r.fingerprint_class,
          strong_count:r.strong_count,
          compatible_count:r.compatible_count,
          contradiction_count:r.contradiction_count,
          time_delta_s:r.time_delta_s
        }))
      });
    }

    rows.sort((a,b)=>Number(b.start_time_ms||0)-Number(a.start_time_ms||0));

    const exactPreview=rows
      .filter(r=>["EXACT_FILE_DOC_UNLINKED","EXACT_ORPHAN_MATCH"].includes(r.classification))
      .map(r=>({
        activity_id:r.activity_id,
        title:r.title,
        start_time_ms:r.start_time_ms,
        classification:r.classification,
        sha256:r.selected_preview?.sha256||"",
        file_name:r.selected_preview?.file_name||"",
        reasons:r.selected_preview?.reasons||[]
      }));

    const count=type=>rows.filter(r=>r.classification===type).length;

    return {
      summary:{
        activities_active:(directory.rows||[]).length,
        activities_without_downloadable_fit:rows.length,
        strava_without_downloadable_fit:rows.filter(r=>r.strava_import).length,
        exact_file_doc_unlinked:count("EXACT_FILE_DOC_UNLINKED"),
        exact_orphan_match:count("EXACT_ORPHAN_MATCH"),
        probable_storage_match:count("PROBABLE_STORAGE_MATCH"),
        multiple_candidates:count("MULTIPLE_CANDIDATES"),
        split_parent_original_found:count("SPLIT_PARENT_ORIGINAL_FOUND"),
        linked_object_missing:count("LINKED_OBJECT_MISSING"),
        deep_storage_scan_required:count("DEEP_STORAGE_SCAN_REQUIRED"),
        archive_required:count("ARCHIVE_REQUIRED"),
        exact_relink_preview:exactPreview.length,
        unresolved_original_file_docs:(inventory.unresolved||[]).length,
        storage_objects:index.object_count,
        unindexed_fit_objects:unindexedObjects.length,
        fingerprint_searched_files:Number(orphanSearch?.summary?.searched_files||0)
      },
      exact_relink_preview:exactPreview,
      rows,
      storage_reconciliation:{
        storage_objects:index.object_count,
        represented_fit_objects:representedObjects.size,
        unindexed_fit_objects:unindexedObjects.length,
        unindexed_fit_object_examples:unindexedObjects.slice(0,100),
        unresolved_original_file_docs:(inventory.unresolved||[]).length
      }
    };
  }

  /* CGWEB108_ORPHAN_AUDIT_HELPERS_END */

  /* CGWEB109_FIT_TRUTH_HELPERS_START */

  const C109_LEGACY_QUICK_LIST_LIMIT=1000;
  const C109_BULK_LIMIT=1000;

  function c109Text(value){
    return String(value ?? "").trim();
  }

  function c109Finite(value){
    if(value==null || value==="")return null;
    const n=Number(value);
    return Number.isFinite(n)?n:null;
  }

  function c109StartMs(row){
    const direct=[
      row?.start_time_ms,
      row?.start_ms,
      row?.start_date_ms,
      row?.startDateMs,
      row?.timestamp_ms
    ];

    for(const value of direct){
      const n=c109Finite(value);
      if(n!=null && n>0){
        return n>1e12?n:(n>1e9?n*1000:null);
      }
    }

    const texts=[
      row?.start_iso,
      row?.start_time_iso,
      row?.start_date_local,
      row?.start_date,
      row?.start_time,
      row?.started_at,
      row?.date
    ];

    for(const value of texts){
      const text=c109Text(value);
      if(!text)continue;
      const ms=Date.parse(text);
      if(Number.isFinite(ms))return ms;
    }

    return null;
  }

  function c109Year(row){
    const ms=c109StartMs(row);

    if(ms!=null){
      const y=new Date(ms).getUTCFullYear();
      if(Number.isInteger(y) && y>=1980 && y<=2200){
        return String(y);
      }
    }

    const candidates=[
      row?.start_iso,
      row?.start_date_local,
      row?.start_date,
      row?.date
    ];

    for(const value of candidates){
      const text=c109Text(value);
      const match=text.match(/^(19|20|21)\d{2}/);
      if(match)return match[0];
    }

    return "unknown";
  }

  function c109CompactTruth(
    activityId,
    row,
    raw,
    linked,
    resolved
  ){
    const merged={
      ...(raw||{}),
      ...(row||{})
    };

    const status=c109Text(
      resolved?.status || "NO_LINKED_FILE"
    );

    const downloadable=
      status.startsWith("RESOLVED_");

    return {
      activity_id:String(activityId),
      year:c109Year(merged),
      start_time_ms:c109StartMs(merged),
      title:c095Title(
        merged,
        activityId
      ),
      source:c109Text(
        merged?.import_source ??
        merged?.source ??
        merged?.origin ??
        merged?.provider
      ),
      linked_file_count:
        Array.isArray(linked)
          ? linked.length
          : 0,
      downloadable,
      status,
      role:c109Text(
        resolved?.role || "NONE"
      ),
      method:c109Text(
        resolved?.method || "NONE"
      ),
      file_name:c109Text(
        resolved?.file_name
      ),
      sha256:c109Text(
        resolved?.sha256
      ),
      object_name:c109Text(
        resolved?.object_name
      )
    };
  }

  async function c109DirectoryFitTruthParity(uid){
    const [
      data,
      byActivity,
      index
    ]=await Promise.all([
      c099DirectoryData(uid,true),
      c096LinkedRows(uid),
      c096StorageIndex()
    ]);

    const rows=[];
    const years=new Map();

    let linkedMetadata=0;
    let truthDownloadable=0;
    let trueMissing=0;
    let unresolvedObject=0;
    let ambiguousObject=0;
    let original=0;
    let canonical=0;
    let edited=0;

    for(const row of data.rows||[]){
      const id=c109Text(row?.activity_id);
      if(!id)continue;

      const raw=data.rawById.get(id)||{};

      if(raw.deleted_at_ms!=null){
        continue;
      }

      const linked=byActivity.get(id)||[];

      if(linked.length){
        linkedMetadata+=1;
      }

      const resolved=
        c096ResolvePreferred(
          linked,
          index
        );

      const compact=
        c109CompactTruth(
          id,
          row,
          raw,
          linked,
          resolved
        );

      rows.push(compact);

      if(compact.downloadable){
        truthDownloadable+=1;

        if(compact.role==="ORIGINAL"){
          original+=1;
        }else if(compact.role==="CANONICAL"){
          canonical+=1;
        }else{
          edited+=1;
        }
      }else{
        trueMissing+=1;

        if(
          compact.status.startsWith(
            "AMBIGUOUS_"
          )
        ){
          ambiguousObject+=1;
        }else if(
          compact.status!=="NO_LINKED_FILE"
        ){
          unresolvedObject+=1;
        }
      }

      if(!years.has(compact.year)){
        years.set(
          compact.year,
          {
            year:compact.year,
            activities:0,
            truth_downloadable:0,
            true_missing:0,
            linked_metadata:0,
            original:0,
            canonical:0,
            edited:0
          }
        );
      }

      const bucket=years.get(compact.year);

      bucket.activities+=1;

      if(compact.linked_file_count>0){
        bucket.linked_metadata+=1;
      }

      if(compact.downloadable){
        bucket.truth_downloadable+=1;

        if(compact.role==="ORIGINAL"){
          bucket.original+=1;
        }else if(compact.role==="CANONICAL"){
          bucket.canonical+=1;
        }else{
          bucket.edited+=1;
        }
      }else{
        bucket.true_missing+=1;
      }
    }

    const byYear=[
      ...years.values()
    ]
      .map(row=>({
        ...row,
        truth_pct:
          row.activities
            ? Math.round(
                100000*
                row.truth_downloadable/
                row.activities
              )/1000
            : 0
      }))
      .sort((a,b)=>{
        if(a.year==="unknown")return 1;
        if(b.year==="unknown")return -1;
        return Number(b.year)-Number(a.year);
      });

    rows.sort(
      (a,b)=>
        Number(b.start_time_ms||0)-
        Number(a.start_time_ms||0)
    );

    return {
      summary:{
        activities_active:rows.length,
        linked_metadata:linkedMetadata,
        truth_downloadable:truthDownloadable,
        true_missing:trueMissing,
        downloadable_original:original,
        downloadable_canonical:canonical,
        downloadable_edited:edited,
        unresolved_object:unresolvedObject,
        ambiguous_object:ambiguousObject,
        storage_objects:index.object_count,
        legacy_quick_list_limit:
          C109_LEGACY_QUICK_LIST_LIMIT,
        legacy_quick_limit_risk:
          truthDownloadable>
          C109_LEGACY_QUICK_LIST_LIMIT,
        minimum_possible_legacy_false_negatives:
          Math.max(
            0,
            truthDownloadable-
            C109_LEGACY_QUICK_LIST_LIMIT
          )
      },
      by_year:byYear,
      rows
    };
  }

  async function c109BulkDownloadability(
    uid,
    activityIds
  ){
    const ids=[
      ...new Set(
        (Array.isArray(activityIds)
          ? activityIds
          : []
        )
          .map(c109Text)
          .filter(Boolean)
      )
    ];

    if(ids.length>C109_BULK_LIMIT){
      throw Object.assign(
        new Error(
          "BULK_DOWNLOADABILITY001 : "+
          "maximum "+
          C109_BULK_LIMIT+
          " identifiants par appel."
        ),
        {status:400}
      );
    }

    const [
      byActivity,
      index
    ]=await Promise.all([
      c096LinkedRows(uid),
      c096StorageIndex()
    ]);

    const availability={};

    for(const id of ids){
      const linked=
        byActivity.get(id)||[];

      const resolved=
        c096ResolvePreferred(
          linked,
          index
        );

      const status=c109Text(
        resolved?.status ||
        "NO_LINKED_FILE"
      );

      availability[id]={
        activity_id:id,
        downloadable:
          status.startsWith(
            "RESOLVED_"
          ),
        linked_file_count:
          linked.length,
        status,
        role:c109Text(
          resolved?.role ||
          "NONE"
        ),
        method:c109Text(
          resolved?.method ||
          "NONE"
        ),
        file_name:c109Text(
          resolved?.file_name
        ),
        sha256:c109Text(
          resolved?.sha256
        )
      };
    }

    return {
      requested:ids.length,
      limit:C109_BULK_LIMIT,
      availability
    };
  }

  /* CGWEB109_FIT_TRUTH_HELPERS_END */



/* CGWEB096_DIRECTORY_DOWNLOAD_HELPERS_END */


  /* CGWEB097_FIT_ORIGIN_HELPERS_START */

  function c097ToIso(value) {
    if (value == null) return "";

    try {
      if (
        value &&
        typeof value.toDate === "function"
      ) {
        return value.toDate().toISOString();
      }

      if (
        value &&
        typeof value.toMillis === "function"
      ) {
        return new Date(
          value.toMillis()
        ).toISOString();
      }

      if (
        typeof value === "number" &&
        Number.isFinite(value)
      ) {
        const ms =
          value > 1e12
            ? value
            : value > 1e9
              ? value * 1000
              : NaN;

        if (Number.isFinite(ms)) {
          return new Date(ms).toISOString();
        }
      }

      const text =
        String(value).trim();

      if (!text) return "";

      const ms = Date.parse(text);

      if (Number.isFinite(ms)) {
        return new Date(ms).toISOString();
      }
    } catch (_) {}

    return "";
  }

  function c097ActivityStartIso(activity) {
    const keys = [
      "start_date_local",
      "start_date",
      "start_time",
      "startTime",
      "started_at",
      "startedAt",
      "date",
      "datetime",
      "start_date_ms",
      "startDateMs",
      "start_time_ms",
      "startTimeMs",
      "timestamp"
    ];

    for (const key of keys) {
      const iso = c097ToIso(
        activity?.[key]
      );

      if (iso) return iso;
    }

    return "";
  }

  function c097InProblemPeriod(iso) {
    if (!iso) return false;

    const day = iso.slice(0, 10);

    return (
      day >= "2026-08-26" &&
      day <= "2026-09-14"
    );
  }

  async function c097OriginAudit(uid) {
    const [
      coverage,
      byActivity,
      index
    ] = await Promise.all([
      c095Coverage(uid),
      c096LinkedRows(uid),
      c096StorageIndex()
    ]);

    const activities = [];

    for await (
      const snap of db
        .collection(
          ROOT + "/" + uid + "/activities"
        )
        .stream()
    ) {
      const activity = snap.data() || {};

      if (
        activity.deleted_at_ms != null
      ) {
        continue;
      }

      const activityId = String(snap.id);
      const rows =
        byActivity.get(activityId) || [];

      const resolved =
        c096ResolvePreferred(
          rows,
          index
        );

      const startIso =
        c097ActivityStartIso(activity);

      activities.push({
        activity_id: activityId,
        title:
          c095Title(
            activity,
            activityId
          ),
        start_iso: startIso,
        role:
          resolved?.role || "NONE",
        downloadable:
          Boolean(
            resolved?.status?.startsWith(
              "RESOLVED_"
            )
          ),
        resolution_status:
          resolved?.status || "NO_LINKED_FILE",
        resolution_method:
          resolved?.method || "NONE",
        file_name:
          resolved?.file_name || "",
        object_name:
          resolved?.object_name || "",
        in_problem_period:
          c097InProblemPeriod(
            startIso
          )
      });
    }

    activities.sort(
      (a, b) =>
        String(b.start_iso)
          .localeCompare(
            String(a.start_iso)
          )
    );

    const canonical =
      activities.filter(
        row =>
          row.role === "CANONICAL"
      );

    const original =
      activities.filter(
        row =>
          row.role === "ORIGINAL"
      );

    const absent =
      activities.filter(
        row =>
          !row.downloadable
      );

    const canonicalPeriod =
      canonical.filter(
        row => row.in_problem_period
      );

    return {
      summary: {
        activities_active:
          Number(
            coverage?.summary
              ?.activities_active || 0
          ),
        original:
          original.length,
        canonical:
          canonical.length,
        absent:
          absent.length,
        canonical_problem_period:
          canonicalPeriod.length,
        problem_period_start:
          "2026-08-26",
        problem_period_end:
          "2026-09-14"
      },
      canonical_activities:
        canonical,
      canonical_problem_period:
        canonicalPeriod
    };
  }

  async function c097StatesForActivities(
    uid,
    activityIds
  ) {
    const ids =
      [...new Set(
        (Array.isArray(activityIds)
          ? activityIds
          : []
        )
          .map(value =>
            String(value || "").trim()
          )
          .filter(Boolean)
      )]
        .slice(0, 250);

    if (!ids.length) {
      return {
        states: {}
      };
    }

    const [
      byActivity,
      index
    ] = await Promise.all([
      c096LinkedRows(uid),
      c096StorageIndex()
    ]);

    const states = {};

    for (const activityId of ids) {
      const rows =
        byActivity.get(activityId) || [];

      const resolved =
        c096ResolvePreferred(
          rows,
          index
        );

      states[activityId] = {
        activity_id: activityId,
        role:
          resolved?.role || "NONE",
        downloadable:
          Boolean(
            resolved?.status?.startsWith(
              "RESOLVED_"
            )
          ),
        status:
          resolved?.status || "NO_LINKED_FILE",
        method:
          resolved?.method || "NONE",
        file_name:
          resolved?.file_name || ""
      };
    }

    return {
      states
    };
  }

  /* CGWEB097_FIT_ORIGIN_HELPERS_END */





  /* CGWEB099_GLOBAL_DIRECTORY_HELPERS_START */

  const c099DirectoryCache =
    new Map();

  function c099Scalar(value) {
    if (value == null) return "";

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return String(value).trim();
    }

    if (Array.isArray(value)) {
      return value
        .map(c099Scalar)
        .filter(Boolean)
        .join(" ");
    }

    if (typeof value === "object") {
      for (const key of [
        "name",
        "label",
        "title",
        "display_name",
        "displayName",
        "value"
      ]) {
        const text =
          c099Scalar(value[key]);

        if (text) return text;
      }
    }

    return "";
  }

  /*
   * CGWEB099 FIX1 · DIRECTORY_TEXT_NORMALIZE001
   *
   * Tous les champs utilisés comme libellés / filtres / options
   * sont normalisés en String. Les champs numériques disposent
   * déjà de c099Number() et ne doivent jamais transiter ici comme
   * Number brut, sinon Array.sort(...localeCompare) peut planter
   * sur les anciennes activités hétérogènes.
   */
  function c099First(
    object,
    keys
  ) {
    for (const key of keys) {
      const value =
        object?.[key];

      if (value == null) continue;

      const text =
        c099Scalar(value);

      if (text) {
        return String(text).trim();
      }
    }

    return "";
  }

  function c099Number(
    object,
    keys,
    fallback = 0
  ) {
    for (const key of keys) {
      const value =
        Number(object?.[key]);

      if (Number.isFinite(value)) {
        return value;
      }
    }

    return fallback;
  }

  function c099Sport(activity) {
    const explicit =
      c099First(
        activity,
        [
          "sport_label",
          "sportLabel",
          "sport_name",
          "sportName",
          "activity_type_name",
          "activityTypeName"
        ]
      );

    if (explicit) return explicit;

    const raw =
      activity?.sport ??
      activity?.sport_type ??
      activity?.sportType ??
      activity?.activity_type ??
      activity?.activityType ??
      activity?.type ??
      "";

    const numeric =
      Number(raw);

    if (
      raw !== "" &&
      Number.isFinite(numeric) &&
      String(raw).trim() !== ""
    ) {
      const fitSportNames = {
        0:"Sport",
        1:"Course",
        2:"Vélo",
        3:"Transition",
        4:"Fitness",
        5:"Natation",
        11:"Marche",
        17:"Randonnée"
      };

      return (
        fitSportNames[numeric] ||
        ("Sport " + numeric)
      );
    }

    const text =
      c099Scalar(raw);

    return text || "INCONNU";
  }

  function c099Equipment(activity) {
    return (
      c099First(
        activity,
        [
          "equipment_name",
          "equipmentName",
          "equipment",
          "gear_name",
          "gearName",
          "gear",
          "material_name",
          "materialName",
          "material",
          "shoe_name",
          "shoeName",
          "bike_name",
          "bikeName"
        ]
      ) ||
      ""
    );
  }

  function c099Markers(activity) {
    const raw =
      c099First(
        activity,
        [
          "markers",
          "marker",
          "reperes",
          "repères",
          "repere",
          "repère",
          "landmarks",
          "landmark",
          "route_markers",
          "routeMarkers"
        ]
      );

    return String(raw || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function c099Source(activity) {
    return (
      c099First(
        activity,
        [
          "import_source",
          "importSource",
          "source",
          "provider",
          "origin",
          "provenance",
          "platform"
        ]
      ) ||
      ""
    );
  }

  function c099ExternalId(activity) {
    return (
      c099First(
        activity,
        [
          "strava_activity_id",
          "stravaActivityId",
          "garmin_activity_id",
          "garminActivityId",
          "external_id",
          "externalId",
          "source_id",
          "sourceId"
        ]
      ) ||
      ""
    );
  }

  function c099Safe(value, depth = 0) {
    if (depth > 10) return null;

    if (
      value == null ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (typeof value === "number") {
      return Number.isFinite(value)
        ? value
        : null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (
      value &&
      typeof value.toDate === "function"
    ) {
      try {
        return value
          .toDate()
          .toISOString();
      } catch (_) {}
    }

    if (Buffer.isBuffer(value)) {
      return null;
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, 25000)
        .map(
          item =>
            c099Safe(
              item,
              depth + 1
            )
        );
    }

    if (typeof value === "object") {
      const out = {};

      for (
        const [key, item]
        of Object.entries(value)
      ) {
        const safe =
          c099Safe(
            item,
            depth + 1
          );

        if (safe !== undefined) {
          out[key] = safe;
        }
      }

      return out;
    }

    return null;
  }

  function c099Row(
    activityId,
    activity
  ) {
    const startMs =
      c099Number(
        activity,
        [
          "start_time_ms",
          "startTimeMs",
          "start_timestamp_ms",
          "startTimestampMs",
          "timestamp_ms",
          "timestampMs"
        ],
        NaN
      );

    const startIso =
      Number.isFinite(startMs) &&
      startMs > 0
        ? new Date(startMs).toISOString()
        : c097ActivityStartIso(activity);

    const distance =
      c099Number(
        activity,
        [
          "distance_m",
          "distance",
          "distanceMeters",
          "total_distance_m",
          "total_distance"
        ],
        0
      );

    const elevation =
      c099Number(
        activity,
        [
          "ascent_m",
          "total_ascent_m",
          "elevation_gain_m",
          "total_elevation_gain",
          "totalElevationGain",
          "elevation_gain",
          "elevationGain",
          "ascent",
          "total_ascent",
          "totalAscent"
        ],
        0
      );

    let duration =
      c099Number(
        activity,
        [
          "duration_s",
          "elapsed_time_s",
          "moving_time_s",
          "timer_time_s",
          "durationSeconds",
          "elapsedTimeSeconds",
          "movingTimeSeconds"
        ],
        NaN
      );

    if (!Number.isFinite(duration)) {
      const durationMs =
        c099Number(
          activity,
          [
            "elapsed_time_ms",
            "timer_time_ms",
            "moving_time_ms",
            "duration_ms",
            "elapsedTimeMs",
            "timerTimeMs",
            "movingTimeMs",
            "durationMs"
          ],
          NaN
        );

      if (Number.isFinite(durationMs)) {
        duration =
          durationMs / 1000;
      }
    }

    if (!Number.isFinite(duration)) {
      duration =
        c099Number(
          activity,
          [
            "moving_time",
            "movingTime",
            "elapsed_time",
            "elapsedTime",
            "duration"
          ],
          0
        );
    }

    const load =
      c099Number(
        activity,
        [
          "charge",
          "load",
          "training_load",
          "trainingLoad",
          "relative_effort",
          "relativeEffort",
          "suffer_score",
          "sufferScore",
          "activity_load",
          "activityLoad"
        ],
        0
      );

    const title =
      String(
        c095Title(
          activity,
          activityId
        ) || ""
      ).trim();

    const sport =
      String(
        c099Sport(activity) || ""
      ).trim() ||
      "INCONNU";

    const equipment =
      String(
        c099Equipment(activity) || ""
      ).trim();

    const markers =
      String(
        c099First(
          activity,
          [
            "landmark_codes",
            "landmarkCodes",
            "markers",
            "marker",
            "reperes",
            "repères",
            "repere",
            "repère",
            "landmarks",
            "landmark",
            "route_markers",
            "routeMarkers"
          ]
        ) || ""
      )
        .replace(/\s+/g," ")
        .trim();

    const source =
      String(
        c099Source(activity) || ""
      ).trim();

    const externalId =
      String(
        c099ExternalId(activity) || ""
      ).trim();

    const haystack = [
      title,
      startIso,
      sport,
      equipment,
      markers,
      source,
      externalId
    ]
      .join(" ")
      .toLowerCase();

    return {
      activity_id:
        String(activityId),
      title,
      start_time_ms:
        Number.isFinite(startMs)
          ? startMs
          : null,
      start_iso:
        startIso,
      year:
        startIso
          ? startIso.slice(0,4)
          : "",
      sport,
      distance_m:
        distance,
      elevation_m:
        elevation,
      duration_s:
        duration,
      equipment,
      markers,
      load,
      source,
      external_id:
        String(externalId || ""),
      haystack
    };
  }

  async function c099DirectoryData(
    uid,
    force = false
  ) {
    const now = Date.now();

    const cached =
      c099DirectoryCache.get(uid);

    if (
      !force &&
      cached &&
      now - cached.at < 60000
    ) {
      return cached.data;
    }

    const rows = [];
    const rawById =
      new Map();

    for await (
      const snap of db
        .collection(
          ROOT + "/" + uid + "/activities"
        )
        .stream()
    ) {
      const activity =
        snap.data() || {};

      if (
        activity.deleted_at_ms != null
      ) {
        continue;
      }

      const id =
        String(snap.id);

      rows.push(
        c099Row(
          id,
          activity
        )
      );

      rawById.set(
        id,
        activity
      );
    }

    rows.sort(
      (a, b) =>
        String(b.start_iso)
          .localeCompare(
            String(a.start_iso)
          )
    );

    const years =
      [...new Set(
        rows
          .map(row => row.year)
          .filter(Boolean)
      )]
        .sort(
          (a, b) =>
            Number(b) - Number(a)
        );

    const sports =
      [...new Set(
        rows
          .map(
            row =>
              String(
                row.sport || ""
              ).trim()
          )
          .filter(Boolean)
      )]
        .sort(
          (a, b) =>
            String(a).localeCompare(
              String(b),
              "fr",
              {
                sensitivity:
                  "base",
                numeric:
                  true
              }
            )
        );

    const equipment =
      [...new Set(
        rows
          .map(
            row =>
              String(
                row.equipment || ""
              ).trim()
          )
          .filter(Boolean)
      )]
        .sort(
          (a, b) =>
            String(a).localeCompare(
              String(b),
              "fr",
              {
                sensitivity:
                  "base",
                numeric:
                  true
              }
            )
        );

    const data = {
      rows,
      rawById,
      meta: {
        total:
          rows.length,
        years,
        sports,
        equipment
      }
    };

    c099DirectoryCache.set(
      uid,
      {
        at: now,
        data
      }
    );

    return data;
  }

  function c099QueryFilters(
    rows,
    input
  ) {
    const year =
      String(
        input?.year || ""
      ).trim();

    const sport =
      String(
        input?.sport || ""
      ).trim()
        .toLowerCase();

    const equipment =
      String(
        input?.equipment || ""
      ).trim()
        .toLowerCase();

    const marker =
      String(
        input?.marker || ""
      ).trim()
        .toLowerCase();

    const search =
      String(
        input?.search || ""
      ).trim()
        .toLowerCase();

    const dateFromMs =
      Number(
        input?.date_from_ms
      );

    const dateToMs =
      Number(
        input?.date_to_ms
      );

    const hasDateRange =
      Number.isFinite(dateFromMs) &&
      Number.isFinite(dateToMs) &&
      dateToMs > dateFromMs;

    return rows.filter(row => {
      if (
        year &&
        year !== "ALL" &&
        row.year !== year
      ) {
        return false;
      }

      if (
        hasDateRange
      ) {
        let rowMs =
          Number(
            row.start_time_ms
          );

        if (
          !Number.isFinite(rowMs)
        ) {
          rowMs =
            Date.parse(
              String(
                row.start_iso || ""
              )
            );
        }

        if (
          !Number.isFinite(rowMs) ||
          rowMs < dateFromMs ||
          rowMs >= dateToMs
        ) {
          return false;
        }
      }

      if (
        sport &&
        sport !== "all" &&
        String(row.sport || "")
          .toLowerCase() !== sport
      ) {
        return false;
      }

      if (
        equipment &&
        equipment !== "all" &&
        String(row.equipment || "")
          .toLowerCase() !== equipment
      ) {
        return false;
      }

      if (
        marker &&
        !String(row.markers || "")
          .toLowerCase()
          .includes(marker)
      ) {
        return false;
      }

      if (
        search &&
        !String(row.haystack || "")
          .includes(search)
      ) {
        return false;
      }

      return true;
    });
  }


/* CGWEB102_FIT_PROVENANCE_FILTER_START */

function c102NormalizeFitFilter(value){
  const normalized=
    String(value || "ALL")
      .trim()
      .toUpperCase();

  if(
    [
      "ALL",
      "ORIGINAL",
      "CANONICAL",
      "ABSENT",
      "RESTORE"
    ].includes(normalized)
  ){
    return normalized;
  }

  return "ALL";
}

async function c102FilterByFitProvenance(
  uid,
  rows,
  requestedFilter
){
  const filter=
    c102NormalizeFitFilter(
      requestedFilter
    );

  if(
    filter==="ALL" ||
    !Array.isArray(rows) ||
    !rows.length
  ){
    return rows;
  }

  const [
    byActivity,
    index
  ]=
    await Promise.all([
      c096LinkedRows(uid),
      c096StorageIndex()
    ]);

  const kept=[];

  for(const row of rows){
    const activityId=
      String(
        row?.activity_id || ""
      ).trim();

    if(!activityId){
      continue;
    }

    const linked=
      byActivity.get(
        activityId
      ) || [];

    const resolved=
      c096ResolvePreferred(
        linked,
        index
      );

    const downloadable=
      Boolean(
        resolved?.status?.startsWith(
          "RESOLVED_"
        )
      );

    const role=
      downloadable
        ? String(
            resolved?.role || "NONE"
          ).toUpperCase()
        : "ABSENT";

    row.fit_role=role;
    row.fit_downloadable=
      downloadable;
    row.fit_resolution_status=
      resolved?.status ||
      "NO_LINKED_FILE";
    row.fit_resolution_method=
      resolved?.method || "NONE";

    const keep=
      filter==="ORIGINAL"
        ? role==="ORIGINAL"
        : filter==="CANONICAL"
          ? role==="CANONICAL"
          : filter==="ABSENT"
            ? role==="ABSENT"
            : filter==="RESTORE"
              ? (
                  role==="CANONICAL" ||
                  role==="ABSENT"
                )
              : true;

    if(keep){
      kept.push(row);
    }
  }

  return kept;
}

/* CGWEB102_FIT_PROVENANCE_FILTER_END */


  /* CGWEB103_FIT_RECOVERY_HELPERS_START */

  function c103FitState(
    activityId,
    byActivity,
    storageIndex
  ){
    const id=
      String(activityId || "").trim();

    if(!id){
      return {
        role:"ABSENT",
        downloadable:false,
        status:"NO_ACTIVITY_ID",
        method:"NONE",
        file_name:""
      };
    }

    const linked=
      byActivity.get(id) || [];

    const resolved=
      c096ResolvePreferred(
        linked,
        storageIndex
      );

    const downloadable=
      Boolean(
        resolved?.status?.startsWith(
          "RESOLVED_"
        )
      );

    return {
      role:
        downloadable
          ? String(
              resolved?.role || "NONE"
            ).toUpperCase()
          : "ABSENT",
      downloadable,
      status:
        resolved?.status ||
        "NO_LINKED_FILE",
      method:
        resolved?.method || "NONE",
      file_name:
        resolved?.file_name || ""
    };
  }

  function c103StringArray(value){
    if(!Array.isArray(value)){
      return [];
    }

    return value
      .map(item =>
        String(item || "").trim()
      )
      .filter(Boolean);
  }

  function c103Number(value){
    const n=Number(value);
    return Number.isFinite(n)
      ? n
      : null;
  }

  function c103RecoveryHint(
    role,
    isSplitChild,
    parentExists,
    parentRole
  ){
    if(
      role!=="CANONICAL" &&
      role!=="ABSENT"
    ){
      return "NO_RECOVERY_NEEDED";
    }

    if(!isSplitChild){
      return role==="CANONICAL"
        ? "ARCHIVE_ORIGINAL_NEEDED"
        : "FIT_ARCHIVE_NEEDED";
    }

    if(!parentExists){
      return "PARENT_DOCUMENT_MISSING";
    }

    if(parentRole==="ORIGINAL"){
      return "PARENT_ORIGINAL_AVAILABLE";
    }

    if(parentRole==="CANONICAL"){
      return "PARENT_CANONICAL_ONLY";
    }

    return "PARENT_FIT_ABSENT";
  }

  function c103LineageStatus(
    childId,
    parentId,
    parent,
    routeParentId
  ){
    const hasSplitEvidence=
      Boolean(parentId) ||
      Boolean(routeParentId);

    if(!hasSplitEvidence){
      return "PARENT_ID_MISSING";
    }

    if(!parent){
      return "PARENT_DOCUMENT_MISSING";
    }

    const children=
      c103StringArray(
        parent.split_children_ids
      );

    if(
      children.length &&
      !children.includes(
        String(childId)
      )
    ){
      return "PARENT_CHILD_LINK_MISMATCH";
    }

    return "OK";
  }

  async function c103FitRecoveryAudit(uid){
    const [
      byActivity,
      storageIndex
    ]=
      await Promise.all([
        c096LinkedRows(uid),
        c096StorageIndex()
      ]);

    const activities=
      new Map();

    for await(
      const snap of db
        .collection(
          ROOT+"/"+uid+"/activities"
        )
        .stream()
    ){
      activities.set(
        String(snap.id),
        {
          id:String(snap.id),
          ...(snap.data() || {})
        }
      );
    }

    const routeParents=
      new Map();

    for await(
      const snap of db
        .collection(
          ROOT+"/"+uid+"/activity_routes"
        )
        .stream()
    ){
      const row=snap.data() || {};

      const parentId=
        String(
          row.split_parent_activity_id || ""
        ).trim();

      if(parentId){
        routeParents.set(
          String(snap.id),
          parentId
        );
      }
    }

    const fitCache=
      new Map();

    const fitState=
      activityId => {
        const id=
          String(activityId || "");

        if(!fitCache.has(id)){
          fitCache.set(
            id,
            c103FitState(
              id,
              byActivity,
              storageIndex
            )
          );
        }

        return fitCache.get(id);
      };

    const active=[];

    for(const [id,row] of activities){
      if(row.deleted_at_ms!=null){
        continue;
      }

      active.push(
        {
          id,
          row
        }
      );
    }

    const recovery=[];
    const lineage=[];

    let originalCount=0;
    let canonicalCount=0;
    let absentCount=0;
    let splitChildren=0;
    let splitRecovery=0;
    let parentOriginalAvailable=0;
    let parentCanonicalOnly=0;
    let parentFitAbsent=0;
    let parentMissing=0;
    let lineageMismatch=0;
    let deletedParents=0;

    for(const item of active){
      const id=item.id;
      const row=item.row;
      const state=fitState(id);

      if(state.role==="ORIGINAL"){
        originalCount++;
      }else if(state.role==="CANONICAL"){
        canonicalCount++;
      }else{
        absentCount++;
      }

      const activityParentId=
        String(
          row.split_parent_activity_id || ""
        ).trim();

      const routeParentId=
        String(
          routeParents.get(id) || ""
        ).trim();

      const parentId=
        activityParentId ||
        routeParentId;

      const isSplitChild=
        Boolean(parentId) ||
        row.import_source==="WEB_SPLIT" ||
        c103Number(row.split_part)!=null;

      let parent=null;
      let parentState=null;
      let lineageStatus=
        "NOT_SPLIT";

      if(isSplitChild){
        splitChildren++;

        parent=
          parentId
            ? activities.get(parentId) || null
            : null;

        parentState=
          parentId
            ? fitState(parentId)
            : {
                role:"ABSENT",
                downloadable:false,
                status:"NO_PARENT_ID",
                method:"NONE",
                file_name:""
              };

        lineageStatus=
          c103LineageStatus(
            id,
            parentId,
            parent,
            routeParentId
          );

        if(
          parent &&
          parent.deleted_at_ms!=null
        ){
          deletedParents++;
        }

        if(
          lineageStatus===
          "PARENT_DOCUMENT_MISSING"
        ){
          parentMissing++;
        }

        if(
          lineageStatus===
          "PARENT_CHILD_LINK_MISMATCH"
        ){
          lineageMismatch++;
        }

        const splitRow={
          activity_id:id,
          title:
            String(
              row.custom_title ||
              row.title ||
              row.name ||
              "Activité"
            ),
          start_iso:
            String(
              row.start_iso ||
              row.start_time_iso ||
              ""
            ),
          fit_role:
            state.role,
          fit_status:
            state.status,
          split_parent_activity_id:
            parentId,
          split_parent_from:
            activityParentId
              ? "ACTIVITY"
              : routeParentId
                ? "ROUTE"
                : "NONE",
          split_part:
            c103Number(
              row.split_part
            ),
          split_total:
            c103Number(
              row.split_total
            ),
          split_reason:
            String(
              row.split_reason || ""
            ),
          split_gap_ms:
            c103Number(
              row.split_gap_ms
            ),
          import_source:
            String(
              row.import_source || ""
            ),
          import_profile:
            String(
              row.import_profile || ""
            ),
          lineage_status:
            lineageStatus,
          parent_exists:
            Boolean(parent),
          parent_deleted:
            Boolean(
              parent &&
              parent.deleted_at_ms!=null
            ),
          parent_split_status:
            String(
              parent?.split_status || ""
            ),
          parent_split_profile:
            String(
              parent?.split_profile || ""
            ),
          parent_children_ids:
            c103StringArray(
              parent?.split_children_ids
            ),
          parent_fit_role:
            parentState?.role || "ABSENT",
          parent_fit_status:
            parentState?.status ||
            "NO_PARENT_STATE"
        };

        lineage.push(splitRow);
      }

      if(
        state.role==="CANONICAL" ||
        state.role==="ABSENT"
      ){
        const hint=
          c103RecoveryHint(
            state.role,
            isSplitChild,
            Boolean(parent),
            parentState?.role ||
              "ABSENT"
          );

        if(isSplitChild){
          splitRecovery++;

          if(
            hint===
            "PARENT_ORIGINAL_AVAILABLE"
          ){
            parentOriginalAvailable++;
          }else if(
            hint===
            "PARENT_CANONICAL_ONLY"
          ){
            parentCanonicalOnly++;
          }else if(
            hint===
            "PARENT_FIT_ABSENT"
          ){
            parentFitAbsent++;
          }
        }

        recovery.push({
          activity_id:id,
          title:
            String(
              row.custom_title ||
              row.title ||
              row.name ||
              "Activité"
            ),
          start_iso:
            String(
              row.start_iso ||
              row.start_time_iso ||
              ""
            ),
          sport:
            row.sport ?? null,
          distance_m:
            c103Number(
              row.distance_m ??
              row.distance
            ),
          fit_role:
            state.role,
          fit_status:
            state.status,
          fit_method:
            state.method,
          fit_file_name:
            state.file_name,
          is_split_child:
            isSplitChild,
          split_parent_activity_id:
            parentId,
          split_part:
            c103Number(
              row.split_part
            ),
          split_total:
            c103Number(
              row.split_total
            ),
          split_reason:
            String(
              row.split_reason || ""
            ),
          split_gap_ms:
            c103Number(
              row.split_gap_ms
            ),
          lineage_status:
            lineageStatus,
          parent_exists:
            Boolean(parent),
          parent_deleted:
            Boolean(
              parent &&
              parent.deleted_at_ms!=null
            ),
          parent_fit_role:
            parentState?.role ||
              (isSplitChild
                ? "ABSENT"
                : ""),
          parent_fit_status:
            parentState?.status || "",
          recovery_hint:
            hint
        });
      }
    }

    recovery.sort(
      (a,b) =>
        String(b.start_iso)
          .localeCompare(
            String(a.start_iso)
          )
    );

    lineage.sort(
      (a,b) =>
        String(b.start_iso)
          .localeCompare(
            String(a.start_iso)
          )
    );

    return {
      summary:{
        active_activities:
          active.length,
        original:
          originalCount,
        canonical:
          canonicalCount,
        absent:
          absentCount,
        recovery_candidates:
          recovery.length,
        split_children:
          splitChildren,
        split_recovery_candidates:
          splitRecovery,
        parent_original_available:
          parentOriginalAvailable,
        parent_canonical_only:
          parentCanonicalOnly,
        parent_fit_absent:
          parentFitAbsent,
        parent_document_missing:
          parentMissing,
        lineage_mismatch:
          lineageMismatch,
        deleted_parents:
          deletedParents
      },
      recovery_candidates:
        recovery,
      split_lineage:
        lineage
    };
  }

  /* CGWEB103_FIT_RECOVERY_HELPERS_END */

  /* CGWEB104_FIT_RECOVERY_PLAN_HELPERS_START */

  function c104Title(row,id){
    return String(
      row?.custom_title ||
      row?.title ||
      row?.name ||
      ("Activité "+String(id || ""))
    );
  }

  function c104StartIso(row){
    const value=
      row?.start_iso ||
      row?.start_time_iso ||
      row?.start_date ||
      row?.start_time_ms ||
      "";

    if(
      typeof value==="number" &&
      Number.isFinite(value)
    ){
      try{
        return new Date(value).toISOString();
      }catch(_){
        return "";
      }
    }

    return String(value || "");
  }

  function c104CloneRow(row){
    if(!row || typeof row!=="object"){
      return {};
    }

    const out={};

    for(
      const [key,value]
      of Object.entries(row)
    ){
      if(
        value &&
        typeof value.toMillis==="function"
      ){
        out[key]=value.toMillis();
      }else if(
        value &&
        typeof value.toDate==="function"
      ){
        out[key]=
          value.toDate().getTime();
      }else{
        out[key]=value;
      }
    }

    return out;
  }

  async function c104AllActivities(uid){
    const map=new Map();

    for await(
      const snap of db
        .collection(
          ROOT+"/"+uid+"/activities"
        )
        .stream()
    ){
      map.set(
        String(snap.id),
        {
          id:String(snap.id),
          ...(snap.data() || {})
        }
      );
    }

    return map;
  }

  async function c104RouteExists(uid,id){
    if(!id)return false;

    const snap=
      await db.doc(
        ROOT+"/"+uid+
        "/activity_routes/"+
        String(id)
      ).get();

    return snap.exists;
  }

  function c104ResolvedFor(
    activityId,
    byActivity,
    index
  ){
    const rows=
      byActivity.get(
        String(activityId)
      ) || [];

    const resolved=
      c096ResolvePreferred(
        rows,
        index
      );

    return {
      rows,
      resolved,
      downloadable:
        Boolean(
          resolved?.status?.startsWith(
            "RESOLVED_"
          )
        ),
      role:
        Boolean(
          resolved?.status?.startsWith(
            "RESOLVED_"
          )
        )
          ? String(
              resolved?.role || "NONE"
            ).toUpperCase()
          : "ABSENT"
    };
  }

  function c104ChildOriginalCandidate(
    children,
    byActivity,
    index
  ){
    const candidates=[];

    for(const child of children){
      const state=
        c104ResolvedFor(
          child.id,
          byActivity,
          index
        );

      if(
        !state.downloadable ||
        state.role!=="ORIGINAL"
      ){
        continue;
      }

      const fileDocId=
        String(
          state.resolved?.file_doc_id || ""
        ).trim();

      const raw=
        state.rows.find(
          row =>
            String(
              row.__doc_id || ""
            )===fileDocId
        );

      if(
        !fileDocId ||
        !raw
      ){
        continue;
      }

      candidates.push({
        child_id:
          String(child.id),
        file_doc_id:
          fileDocId,
        file_name:
          String(
            state.resolved?.file_name || ""
          ),
        object_name:
          String(
            state.resolved?.object_name || ""
          ),
        sha256:
          String(
            state.resolved?.sha256 || ""
          ),
        file_row:
          c104CloneRow(raw)
      });
    }

    const unique=
      new Map();

    for(const item of candidates){
      unique.set(
        item.file_doc_id,
        item
      );
    }

    return [
      ...unique.values()
    ];
  }

  function c104PlanStatus({
    parent,
    parentRouteExists,
    lineageOk,
    parentFit,
    childOriginals
  }){
    if(!parent){
      return {
        code:"BLOCKED_PARENT_MISSING",
        ready:false
      };
    }

    if(
      String(
        parent.split_status || ""
      )!=="SOURCE_AUTO"
    ){
      return {
        code:"BLOCKED_PARENT_NOT_AUTO",
        ready:false
      };
    }

    if(
      parent.deleted_at_ms==null
    ){
      return {
        code:"BLOCKED_PARENT_ALREADY_ACTIVE",
        ready:false
      };
    }

    if(!parentRouteExists){
      return {
        code:"BLOCKED_PARENT_ROUTE_MISSING",
        ready:false
      };
    }

    if(!lineageOk){
      return {
        code:"BLOCKED_LINEAGE",
        ready:false
      };
    }

    if(
      parentFit.downloadable &&
      (
        parentFit.role==="ORIGINAL" ||
        parentFit.role==="CANONICAL"
      )
    ){
      return {
        code:"READY_PARENT_FIT",
        ready:true,
        strategy:"KEEP_PARENT_FIT"
      };
    }

    if(childOriginals.length===1){
      return {
        code:
          "READY_RELINK_CHILD_ORIGINAL",
        ready:true,
        strategy:
          "RELINK_CHILD_ORIGINAL"
      };
    }

    return {
      code:"BLOCKED_ARCHIVE_REQUIRED",
      ready:false,
      strategy:"ARCHIVE_REQUIRED"
    };
  }

  async function c104RecoveryPlan(uid){
    const [
      audit,
      activities,
      byActivity,
      index
    ]=
      await Promise.all([
        c103FitRecoveryAudit(uid),
        c104AllActivities(uid),
        c096LinkedRows(uid),
        c096StorageIndex()
      ]);

    const groups=new Map();

    for(
      const row
      of audit.split_lineage || []
    ){
      const parentId=
        String(
          row.split_parent_activity_id || ""
        ).trim();

      if(!parentId)continue;

      if(!groups.has(parentId)){
        groups.set(
          parentId,
          []
        );
      }

      groups.get(parentId).push(row);
    }

    const plans=[];

    for(
      const [parentId,lineageRows]
      of groups
    ){
      const parent=
        activities.get(parentId) ||
        null;

      const declaredIds=
        c103StringArray(
          parent?.split_children_ids
        );

      const observedIds=
        [
          ...new Set(
            lineageRows.map(
              row =>
                String(
                  row.activity_id || ""
                )
            ).filter(Boolean)
          )
        ];

      const childIds=
        declaredIds.length
          ? declaredIds
          : observedIds;

      const children=
        childIds
          .map(
            id =>
              activities.get(id) ||
              null
          )
          .filter(Boolean);

      const allObservedBelong=
        lineageRows.every(
          row =>
            row.lineage_status==="OK"
        );

      const allDeclaredPresent=
        childIds.length>0 &&
        children.length===
          childIds.length;

      const allChildParentsMatch=
        children.every(
          child =>
            String(
              child.split_parent_activity_id ||
              ""
            )===parentId
        );

      const lineageOk=
        allObservedBelong &&
        allDeclaredPresent &&
        allChildParentsMatch;

      const parentFit=
        c104ResolvedFor(
          parentId,
          byActivity,
          index
        );

      const childOriginals=
        c104ChildOriginalCandidate(
          children,
          byActivity,
          index
        );

      const parentRouteExists=
        await c104RouteExists(
          uid,
          parentId
        );

      const status=
        c104PlanStatus({
          parent,
          parentRouteExists,
          lineageOk,
          parentFit,
          childOriginals
        });

      plans.push({
        parent_activity_id:
          parentId,
        parent_title:
          c104Title(
            parent,
            parentId
          ),
        parent_start_iso:
          c104StartIso(parent),
        parent_deleted:
          Boolean(
            parent &&
            parent.deleted_at_ms!=null
          ),
        parent_split_status:
          String(
            parent?.split_status || ""
          ),
        parent_fit_role:
          parentFit.role,
        parent_fit_status:
          String(
            parentFit.resolved
              ?.status || ""
          ),
        parent_route_exists:
          parentRouteExists,
        children_count:
          children.length,
        children_ids:
          children.map(
            child =>
              String(child.id)
          ),
        active_children_count:
          children.filter(
            child =>
              child.deleted_at_ms==null
          ).length,
        child_original_candidates:
          childOriginals.map(
            item => ({
              child_id:item.child_id,
              file_doc_id:
                item.file_doc_id,
              file_name:
                item.file_name,
              sha256:
                item.sha256
            })
          ),
        lineage_ok:
          lineageOk,
        plan_code:
          status.code,
        ready:
          status.ready,
        strategy:
          status.strategy || "",
        restore_effect:
          status.ready
            ? (
                "Réactiver le parent puis placer "+
                children.length+
                " enfant(s) dans la corbeille."
              )
            : ""
      });
    }

    plans.sort(
      (a,b) =>
        String(
          b.parent_start_iso
        ).localeCompare(
          String(
            a.parent_start_iso
          )
        )
    );

    const summary={
      parent_groups:
        plans.length,
      ready:
        plans.filter(
          row => row.ready
        ).length,
      ready_parent_fit:
        plans.filter(
          row =>
            row.plan_code===
            "READY_PARENT_FIT"
        ).length,
      ready_relink:
        plans.filter(
          row =>
            row.plan_code===
            "READY_RELINK_CHILD_ORIGINAL"
        ).length,
      blocked_archive:
        plans.filter(
          row =>
            row.plan_code===
            "BLOCKED_ARCHIVE_REQUIRED"
        ).length,
      blocked_lineage:
        plans.filter(
          row =>
            row.plan_code===
            "BLOCKED_LINEAGE"
        ).length,
      blocked_other:
        plans.filter(
          row =>
            !row.ready &&
            ![
              "BLOCKED_ARCHIVE_REQUIRED",
              "BLOCKED_LINEAGE"
            ].includes(
              row.plan_code
            )
        ).length
    };

    return {
      summary,
      plans
    };
  }

  async function c104PrepareParentRestore(
    uid,
    parentId
  ){
    const id=
      String(parentId || "").trim();

    if(!id){
      throw Object.assign(
        new Error(
          "Identifiant parent requis."
        ),
        {status:400}
      );
    }

    const [
      activities,
      byActivity,
      index
    ]=
      await Promise.all([
        c104AllActivities(uid),
        c096LinkedRows(uid),
        c096StorageIndex()
      ]);

    const parent=
      activities.get(id) || null;

    if(!parent){
      throw Object.assign(
        new Error(
          "Parent introuvable."
        ),
        {status:404}
      );
    }

    if(
      String(
        parent.split_status || ""
      )!=="SOURCE_AUTO"
    ){
      throw Object.assign(
        new Error(
          "Restauration refusée : le parent n'est pas SOURCE_AUTO."
        ),
        {status:409}
      );
    }

    if(
      parent.deleted_at_ms==null
    ){
      throw Object.assign(
        new Error(
          "Restauration refusée : le parent est déjà actif."
        ),
        {status:409}
      );
    }

    const routeExists=
      await c104RouteExists(
        uid,
        id
      );

    if(!routeExists){
      throw Object.assign(
        new Error(
          "Restauration refusée : route parent absente."
        ),
        {status:409}
      );
    }

    const childIds=
      c103StringArray(
        parent.split_children_ids
      );

    if(!childIds.length){
      throw Object.assign(
        new Error(
          "Restauration refusée : aucun enfant déclaré."
        ),
        {status:409}
      );
    }

    const children=[];

    for(const childId of childIds){
      const child=
        activities.get(childId) ||
        null;

      if(!child){
        throw Object.assign(
          new Error(
            "Restauration refusée : enfant introuvable "+childId+"."
          ),
          {status:409}
        );
      }

      if(
        String(
          child.split_parent_activity_id ||
          ""
        )!==id
      ){
        throw Object.assign(
          new Error(
            "Restauration refusée : filiation incohérente pour "+childId+"."
          ),
          {status:409}
        );
      }

      children.push(child);
    }

    const parentFit=
      c104ResolvedFor(
        id,
        byActivity,
        index
      );

    const originals=
      c104ChildOriginalCandidate(
        children,
        byActivity,
        index
      );

    let strategy="";
    let relink=null;

    if(
      parentFit.downloadable &&
      (
        parentFit.role==="ORIGINAL" ||
        parentFit.role==="CANONICAL"
      )
    ){
      strategy="KEEP_PARENT_FIT";
    }else if(
      originals.length===1
    ){
      strategy=
        "RELINK_CHILD_ORIGINAL";

      relink={
        ...originals[0],
        from_activity_id:
          originals[0].child_id,
        to_activity_id:id
      };
    }else{
      throw Object.assign(
        new Error(
          "Restauration refusée : aucun FIT source unique n'est disponible. Archive FIT requise."
        ),
        {status:409}
      );
    }

    return {
      read_only_prepare:true,
      parent:{
        id,
        row:c104CloneRow(parent)
      },
      children:
        children.map(
          child => ({
            id:String(child.id),
            row:c104CloneRow(child)
          })
        ),
      strategy,
      relink,
      confirmation:{
        parent_activity_id:id,
        child_count:
          children.length,
        message:
          "Réactiver le parent, puis placer les enfants dans la corbeille."
      }
    };
  }

  /* CGWEB104_FIT_RECOVERY_PLAN_HELPERS_END */

  /* CGWEB105_JOIN_DISCOVERY_HELPERS_START */

  function c105Text(value){
    return String(
      value ?? ""
    ).trim();
  }

  function c105Num(value){
    const n=Number(value);
    return Number.isFinite(n)
      ? n
      : null;
  }

  function c105LocalDateKey(row){
    const direct=[
      row?.local_date,
      row?.date_local,
      row?.start_local_date,
      row?.activity_date,
      row?.date
    ]
      .map(c105Text)
      .find(
        value =>
          /^\d{4}-\d{2}-\d{2}$/.test(
            value
          )
      );

    if(direct){
      return direct;
    }

    const localIso=[
      row?.start_local,
      row?.start_local_iso,
      row?.start_iso
    ]
      .map(c105Text)
      .find(Boolean);

    if(
      localIso &&
      /^\d{4}-\d{2}-\d{2}/.test(
        localIso
      )
    ){
      return localIso.slice(0,10);
    }

    const ms=
      c105Num(
        row?.start_time_ms ??
        row?.start_ms
      );

    if(ms!=null){
      const offsetMin=
        c105Num(
          row?.timezone_offset_min ??
          row?.utc_offset_min ??
          row?.tz_offset_min
        );

      const adjusted=
        offsetMin!=null
          ? ms+offsetMin*60000
          : ms;

      return new Date(adjusted)
        .toISOString()
        .slice(0,10);
    }

    return "";
  }

  function c105SportKey(row){
    return c105Text(
      row?.sport ??
      row?.sport_type ??
      row?.type
    ).toLocaleLowerCase(
      "fr-FR"
    );
  }

  function c105IsSplitRelated(row){
    if(!row){
      return false;
    }

    if(
      c105Text(
        row.split_parent_activity_id
      )
    ){
      return true;
    }

    if(
      Array.isArray(
        row.split_children_ids
      ) &&
      row.split_children_ids.length
    ){
      return true;
    }

    if(
      c105Text(
        row.split_status
      )
    ){
      return true;
    }

    if(
      c105Num(
        row.split_part
      )!=null ||
      c105Num(
        row.split_total
      )!=null
    ){
      return true;
    }

    if(
      c105Text(
        row.import_source
      ).toUpperCase()==="WEB_SPLIT"
    ){
      return true;
    }

    return false;
  }

  function c105StartMs(row){
    const direct=
      c105Num(
        row?.start_time_ms ??
        row?.start_ms
      );

    if(direct!=null){
      return direct;
    }

    const iso=
      c105Text(
        row?.start_iso ??
        row?.start_time_iso
      );

    const parsed=
      iso
        ? Date.parse(iso)
        : NaN;

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  function c105DurationSec(row){
    return c105Num(
      row?.moving_time_s ??
      row?.elapsed_time_s ??
      row?.duration_s ??
      row?.time_s
    ) ?? 0;
  }

  function c105DistanceM(row){
    return c105Num(
      row?.distance_m ??
      row?.distance
    ) ?? 0;
  }

  function c105ElevationM(row){
    return c105Num(
      row?.elevation_gain_m ??
      row?.total_elevation_gain ??
      row?.dplus_m ??
      row?.elevation_m
    ) ?? 0;
  }

  function c105Equipment(row){
    return c105Text(
      row?.equipment_name ??
      row?.equipment ??
      row?.gear_name ??
      row?.material_name
    );
  }

  function c105Title(row,id){
    return c105Text(
      row?.custom_title ??
      row?.title ??
      row?.name
    ) || (
      "Activité "+
      String(id || "")
    );
  }

  async function c105SameDaySameSportCandidates(
    uid,
    activityId
  ){
    const id=
      c105Text(activityId);

    if(!id){
      throw Object.assign(
        new Error(
          "activity_id requis."
        ),
        {status:400}
      );
    }

    const [
      data,
      byActivity,
      storageIndex
    ]=
      await Promise.all([
        c099DirectoryData(
          uid,
          false
        ),
        c096LinkedRows(uid),
        c096StorageIndex()
      ]);

    const sourceRaw=
      data.rawById.get(id) ||
      null;

    const sourceRow=
      data.rows.find(
        row =>
          String(
            row.activity_id
          )===id
      ) || null;

    const source=
      sourceRaw
        ? {
            ...sourceRaw,
            ...(sourceRow || {})
          }
        : sourceRow;

    if(!source){
      throw Object.assign(
        new Error(
          "Activité source introuvable."
        ),
        {status:404}
      );
    }

    if(
      source.deleted_at_ms!=null
    ){
      throw Object.assign(
        new Error(
          "La jonction ne peut pas partir d'une activité en corbeille."
        ),
        {status:409}
      );
    }

    if(
      c105IsSplitRelated(
        source
      )
    ){
      throw Object.assign(
        new Error(
          "NON_SPLIT_GUARD001 : l'activité ouverte appartient à une lignée WEBSPLIT."
        ),
        {status:409}
      );
    }

    const dateKey=
      c105LocalDateKey(
        source
      );

    const sportKey=
      c105SportKey(
        source
      );

    if(!dateKey){
      throw Object.assign(
        new Error(
          "Date locale de l'activité source indéterminable."
        ),
        {status:409}
      );
    }

    if(!sportKey){
      throw Object.assign(
        new Error(
          "Sport de l'activité source indéterminable."
        ),
        {status:409}
      );
    }

    const fitState=
      activityId =>
        c103FitState(
          activityId,
          byActivity,
          storageIndex
        );

    const compact=
      (row,raw) => {
        const merged={
          ...(raw || {}),
          ...(row || {})
        };

        const activityId=
          c105Text(
            row?.activity_id ??
            raw?.id ??
            raw?.activity_id
          );

        const startMs=
          c105StartMs(
            merged
          );

        const durationSec=
          c105DurationSec(
            merged
          );

        const state=
          fitState(
            activityId
          );

        return {
          activity_id:
            activityId,
          title:
            c105Title(
              merged,
              activityId
            ),
          local_date:
            c105LocalDateKey(
              merged
            ),
          sport:
            c105Text(
              merged?.sport ??
              merged?.sport_type ??
              merged?.type
            ),
          sport_key:
            c105SportKey(
              merged
            ),
          start_iso:
            c105Text(
              merged?.start_iso ??
              merged?.start_time_iso
            ),
          start_time_ms:
            startMs,
          end_time_ms:
            startMs!=null
              ? startMs+
                durationSec*1000
              : null,
          duration_s:
            durationSec,
          distance_m:
            c105DistanceM(
              merged
            ),
          elevation_gain_m:
            c105ElevationM(
              merged
            ),
          equipment:
            c105Equipment(
              merged
            ),
          fit_role:
            state.role,
          fit_status:
            state.status,
          is_split_related:
            c105IsSplitRelated(
              merged
            )
        };
      };

    const sourceCompact=
      compact(
        sourceRow || {
          activity_id:id
        },
        sourceRaw
      );

    const candidates=[];

    for(const row of data.rows){
      const candidateId=
        c105Text(
          row.activity_id
        );

      if(
        !candidateId ||
        candidateId===id
      ){
        continue;
      }

      const raw=
        data.rawById.get(
          candidateId
        ) || {};

      const merged={
        ...raw,
        ...row
      };

      if(
        merged.deleted_at_ms!=null
      ){
        continue;
      }

      if(
        c105IsSplitRelated(
          merged
        )
      ){
        continue;
      }

      if(
        c105LocalDateKey(
          merged
        )!==dateKey
      ){
        continue;
      }

      if(
        c105SportKey(
          merged
        )!==sportKey
      ){
        continue;
      }

      candidates.push(
        compact(
          row,
          raw
        )
      );
    }

    candidates.sort(
      (a,b) =>
        (
          a.start_time_ms ??
          Number.MAX_SAFE_INTEGER
        )-
        (
          b.start_time_ms ??
          Number.MAX_SAFE_INTEGER
        )
    );

    return {
      source:
        sourceCompact,
      local_date:
        dateKey,
      sport_key:
        sportKey,
      candidate_count:
        candidates.length,
      candidates,
      join_lineage_preview:{
        join_status:
          "JOIN_PARENT",
        join_source_activity_ids:[
          id
        ],
        join_version:
          "CGWEB105"
      }
    };
  }

  /* CGWEB105_JOIN_DISCOVERY_HELPERS_END */



async function c099GlobalDirectoryQuery(
    uid,
    input
  ) {
    const data =
      await c099DirectoryData(
        uid,
        Boolean(input?.force_refresh)
      );

    /*
     * 1. Filtres économiques d'abord.
     * 2. Résolution physique FIT uniquement si demandée.
     */
    let rows =
      c099QueryFilters(
        data.rows,
        input
      );

    rows=
      await c102FilterByFitProvenance(
        uid,
        rows,
        input?.fit_provenance
      );

    const sort =
      String(
        input?.sort || "newest"
      );

    if (sort === "oldest") {
      rows =
        [...rows].sort(
          (a,b) =>
            String(a.start_iso)
              .localeCompare(
                String(b.start_iso)
              )
        );
    }

    const limit =
      Math.max(
        20,
        Math.min(
          100,
          Number(input?.limit) || 100
        )
      );

    const offset =
      Math.max(
        0,
        Number(input?.offset) || 0
      );

    const page =
      rows.slice(
        offset,
        offset + limit
      );

    return {
      summary: {
        total_activities:
          data.meta.total,
        total_filtered:
          rows.length,
        offset,
        limit,
        returned:
          page.length,
        has_more:
          offset + page.length <
          rows.length,
        fit_provenance:
          c102NormalizeFitFilter(
            input?.fit_provenance
          )
      },
      metadata:
        data.meta,
      rows:
        page.map(row => {
          const copy={...row};
          delete copy.haystack;

          const raw =
            data.rawById.get(
              row.activity_id
            ) || {};

          return {
            ...copy,
            raw_activity:
              c099Safe(raw)
          };
        })
    };
  }

  async function c099GlobalActivity(
    uid,
    activityId
  ) {
    const id =
      String(
        activityId || ""
      ).trim();

    if (!id) {
      throw Object.assign(
        new Error(
          "activity_id absent."
        ),
        {status:400}
      );
    }

    const data =
      await c099DirectoryData(
        uid
      );

    let activity =
      data.rawById.get(id);

    if (!activity) {
      const snap =
        await db.doc(
          ROOT +
          "/" +
          uid +
          "/activities/" +
          id
        ).get();

      if (!snap.exists) {
        throw Object.assign(
          new Error(
            "Activité introuvable."
          ),
          {status:404}
        );
      }

      activity =
        snap.data() || {};
    }

    return {
      activity_id: id,
      activity: {
        ...c099Safe(activity),
        id,
        activity_id: id
      }
    };
  }

  function c099RelativeDiff(
    a,
    b
  ) {
    const max =
      Math.max(
        Math.abs(a),
        Math.abs(b),
        1
      );

    return (
      Math.abs(a - b) /
      max
    );
  }

  function c099DuplicatePair(
    a,
    b
  ) {
    const ta =
      Date.parse(a.start_iso || "");

    const tb =
      Date.parse(b.start_iso || "");

    if (
      !Number.isFinite(ta) ||
      !Number.isFinite(tb)
    ) {
      return null;
    }

    const dtSec =
      Math.abs(ta - tb) / 1000;

    if (dtSec > 120) {
      return null;
    }

    const sportSame =
      String(a.sport || "")
        .toLowerCase() ===
      String(b.sport || "")
        .toLowerCase();

    if (!sportSame) {
      return null;
    }

    const distanceDiff =
      Math.abs(
        Number(a.distance_m || 0) -
        Number(b.distance_m || 0)
      );

    const durationDiff =
      Math.abs(
        Number(a.duration_s || 0) -
        Number(b.duration_s || 0)
      );

    const elevationDiff =
      Math.abs(
        Number(a.elevation_m || 0) -
        Number(b.elevation_m || 0)
      );

    const sameExternal =
      Boolean(
        a.external_id &&
        b.external_id &&
        String(a.external_id) ===
        String(b.external_id)
      );

    const exact =
      sameExternal ||
      (
        dtSec <= 5 &&
        (
          distanceDiff <= 15 ||
          c099RelativeDiff(
            Number(a.distance_m || 0),
            Number(b.distance_m || 0)
          ) <= 0.003
        ) &&
        durationDiff <= 8 &&
        elevationDiff <= 10
      );

    const probable =
      !exact &&
      dtSec <= 90 &&
      (
        distanceDiff <= 150 ||
        c099RelativeDiff(
          Number(a.distance_m || 0),
          Number(b.distance_m || 0)
        ) <= 0.015
      ) &&
      (
        durationDiff <= 90 ||
        c099RelativeDiff(
          Number(a.duration_s || 0),
          Number(b.duration_s || 0)
        ) <= 0.03
      ) &&
      elevationDiff <= 40;

    if (
      !exact &&
      !probable
    ) {
      return null;
    }

    return {
      classification:
        exact
          ? "EXACT"
          : "PROBABLE",
      a,
      b,
      evidence: {
        start_delta_s:
          Number(dtSec.toFixed(1)),
        distance_delta_m:
          Number(distanceDiff.toFixed(1)),
        duration_delta_s:
          Number(durationDiff.toFixed(1)),
        elevation_delta_m:
          Number(elevationDiff.toFixed(1)),
        same_external_id:
          sameExternal
      }
    };
  }

  async function c099DuplicateAudit(
    uid
  ) {
    const data =
      await c099DirectoryData(
        uid
      );

    const rows =
      [...data.rows]
        .filter(row => row.start_iso)
        .sort(
          (a, b) =>
            String(a.start_iso)
              .localeCompare(
                String(b.start_iso)
              )
        );

    const pairs = [];

    for (
      let i = 0;
      i < rows.length;
      i += 1
    ) {
      const a = rows[i];
      const ta =
        Date.parse(a.start_iso);

      for (
        let j = i + 1;
        j < rows.length;
        j += 1
      ) {
        const b = rows[j];
        const tb =
          Date.parse(b.start_iso);

        if (
          Number.isFinite(ta) &&
          Number.isFinite(tb) &&
          (tb - ta) / 1000 > 120
        ) {
          break;
        }

        const pair =
          c099DuplicatePair(
            a,
            b
          );

        if (pair) {
          pairs.push(pair);
        }

        if (pairs.length >= 1000) {
          break;
        }
      }

      if (pairs.length >= 1000) {
        break;
      }
    }

    const exact =
      pairs.filter(
        pair =>
          pair.classification ===
          "EXACT"
      );

    const probable =
      pairs.filter(
        pair =>
          pair.classification ===
          "PROBABLE"
      );

    return {
      summary: {
        activities_scanned:
          rows.length,
        exact_pairs:
          exact.length,
        probable_pairs:
          probable.length,
        truncated:
          pairs.length >= 1000
      },
      exact:
        exact.slice(0, 250),
      probable:
        probable.slice(0, 250)
    };
  }


  /* CGWEB112_FIRST_DISPLAY_FIT_ENSURE_BACKEND_START */

  const C112_LEASE_MS = 120000;
  const C112_WAIT_ATTEMPTS = 8;
  const C112_WAIT_MS = 300;

  function c112Text(value) {
    return String(value ?? "").trim();
  }

  async function c112Sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function c112AcquireLease(uid, activityId) {
    const id = c112Text(activityId);
    const ref = db.doc(`${ROOT}/${uid}/fit_ensure_locks/${id}`);
    const token = crypto.randomBytes(12).toString("hex");
    let acquired = false;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const row = snap.exists ? (snap.data() || {}) : {};
      const now = Date.now();
      const started = Number(row.started_at_ms || 0);
      const active =
        row.state === "RUNNING" &&
        Number.isFinite(started) &&
        started > 0 &&
        now - started < C112_LEASE_MS;

      if (active) return;

      tx.set(
        ref,
        {
          state: "RUNNING",
          token,
          started_at_ms: now,
          updated_at_ms: now,
          version: "CGWEB112"
        },
        {merge: true}
      );

      acquired = true;
    });

    return {acquired, token, ref};
  }

  async function c112ReleaseLease(lease) {
    if (!lease?.acquired || !lease?.ref || !lease?.token) return;

    try {
      const snap = await lease.ref.get();
      const row = snap.exists ? (snap.data() || {}) : {};

      if (c112Text(row.token) === c112Text(lease.token)) {
        await lease.ref.delete();
      }
    } catch (error) {
      console.warn(
        "CGWEB112 lease release",
        error?.message || error
      );
    }
  }

  async function c112WaitForAvailability(uid, activityId) {
    let last = null;

    for (let i = 0; i < C112_WAIT_ATTEMPTS; i += 1) {
      if (i > 0) await c112Sleep(C112_WAIT_MS);

      last = await c096ResolveActivity(uid, activityId);

      if (last?.downloadable === true) return last;

      if (c112Text(last?.status) !== "NO_LINKED_FILE") {
        return last;
      }
    }

    return last;
  }

  async function c112EnsureActivityFit(uid, rawActivityId) {
    const activityId = c112Text(rawActivityId);

    if (!activityId) {
      throw Object.assign(
        new Error("activity_id absent."),
        {status: 400}
      );
    }

    const before = await c096ResolveActivity(uid, activityId);

    if (before?.downloadable === true) {
      return {
        ok: true,
        version: "CGWEB112",
        activity_id: activityId,
        status: "ALREADY_AVAILABLE",
        downloadable: true,
        generated: false,
        role: before.role || null,
        file_name: before.file_name || null,
        resolution_status: before.status || null,
        resolution_method: before.method || null
      };
    }

    if (c112Text(before?.status) !== "NO_LINKED_FILE") {
      return {
        ok: true,
        version: "CGWEB112",
        activity_id: activityId,
        status: "STORAGE_UNRESOLVED",
        downloadable: false,
        generated: false,
        resolution_status: before?.status || "UNKNOWN",
        resolution_method: before?.method || "NONE"
      };
    }

    const lease = await c112AcquireLease(uid, activityId);

    if (!lease.acquired) {
      const waited = await c112WaitForAvailability(uid, activityId);

      if (waited?.downloadable === true) {
        return {
          ok: true,
          version: "CGWEB112",
          activity_id: activityId,
          status: "AVAILABLE_AFTER_WAIT",
          downloadable: true,
          generated: false,
          role: waited.role || null,
          file_name: waited.file_name || null,
          resolution_status: waited.status || null,
          resolution_method: waited.method || null
        };
      }

      return {
        ok: true,
        version: "CGWEB112",
        activity_id: activityId,
        status: "IN_PROGRESS",
        downloadable: false,
        generated: false,
        resolution_status: waited?.status || "NO_LINKED_FILE"
      };
    }

    try {
      const locked = await c096ResolveActivity(uid, activityId);

      if (locked?.downloadable === true) {
        return {
          ok: true,
          version: "CGWEB112",
          activity_id: activityId,
          status: "ALREADY_AVAILABLE",
          downloadable: true,
          generated: false,
          role: locked.role || null,
          file_name: locked.file_name || null,
          resolution_status: locked.status || null,
          resolution_method: locked.method || null
        };
      }

      if (c112Text(locked?.status) !== "NO_LINKED_FILE") {
        return {
          ok: true,
          version: "CGWEB112",
          activity_id: activityId,
          status: "STORAGE_UNRESOLVED",
          downloadable: false,
          generated: false,
          resolution_status: locked?.status || "UNKNOWN",
          resolution_method: locked?.method || "NONE"
        };
      }

      const activitySnap =
        await db.doc(`${ROOT}/${uid}/activities/${activityId}`).get();

      if (!activitySnap.exists) {
        return {
          ok: false,
          version: "CGWEB112",
          activity_id: activityId,
          status: "ACTIVITY_MISSING",
          downloadable: false,
          generated: false
        };
      }

      const activity = activitySnap.data() || {};

      if (activity.deleted_at_ms != null) {
        return {
          ok: false,
          version: "CGWEB112",
          activity_id: activityId,
          status: "ACTIVITY_DELETED",
          downloadable: false,
          generated: false
        };
      }

      const core = v088Core(activity);

      if (!core?.ok) {
        return {
          ok: true,
          version: "CGWEB112",
          activity_id: activityId,
          status: "INSUFFICIENT",
          downloadable: false,
          generated: false,
          missing: Array.isArray(core?.missing) ? core.missing : []
        };
      }

      const generated =
        await v088RecoverOne(
          uid,
          {activity_id: activityId}
        );

      if (generated?.ok === false) {
        return {
          ...generated,
          version: "CGWEB112",
          downloadable: false,
          generated: false
        };
      }

      const after = await c096ResolveActivity(uid, activityId);

      if (after?.downloadable === true) {
        return {
          ok: true,
          version: "CGWEB112",
          activity_id: activityId,
          status:
            generated?.status === "STORED"
              ? "STORED_AVAILABLE"
              : "ALREADY_AVAILABLE",
          downloadable: true,
          generated: generated?.status === "STORED",
          generation_status: generated?.status || null,
          role: after.role || null,
          file_name: after.file_name || null,
          resolution_status: after.status || null,
          resolution_method: after.method || null
        };
      }

      return {
        ok: true,
        version: "CGWEB112",
        activity_id: activityId,
        status: "POST_WRITE_NOT_DOWNLOADABLE",
        downloadable: false,
        generated: generated?.status === "STORED",
        generation_status: generated?.status || null,
        resolution_status: after?.status || "UNKNOWN",
        resolution_method: after?.method || "NONE"
      };
    } finally {
      await c112ReleaseLease(lease);
    }
  }


  /* CGWEB113_FIT_TIMESTAMP_PARITY_AUDIT001_START */

  const C113_TIME_ZONE =
    "Europe/Paris";

  function c113Text(value) {
    return String(
      value ?? ""
    ).trim();
  }

  function c113Finite(value) {
    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : null;
  }

  function c113UtcCanonicalPrefix(
    startMs
  ) {
    const date =
      new Date(
        Number(startMs)
      );

    if (
      !Number.isFinite(
        date.getTime()
      )
    ) {
      return null;
    }

    const pad =
      value =>
        String(value)
          .padStart(2, "0");

    return [
      date.getUTCFullYear(),
      pad(
        date.getUTCMonth() + 1
      ),
      pad(
        date.getUTCDate()
      ),
      pad(
        date.getUTCHours()
      ),
      pad(
        date.getUTCMinutes()
      ),
      pad(
        date.getUTCSeconds()
      )
    ].join("_");
  }

  function c113CanonicalNameInfo(
    fileName
  ) {
    const name =
      c113Text(fileName);

    const match =
      name.match(
        /^(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_([A-Z0-9]{1,4})\.fit$/i
      );

    if (!match) {
      return {
        canonical_pattern:
          false,
        code: null,
        prefix: null
      };
    }

    return {
      canonical_pattern:
        true,
      code:
        String(
          match[7] || "C"
        ).toUpperCase(),
      prefix:
        match
          .slice(1, 7)
          .join("_")
    };
  }

  function c113StoragePath(
    uid,
    row,
    docId,
    activityStartMs
  ) {
    const direct = [
      row?.object_path,
      row?.storage_path,
      row?.storage_object,
      row?.object_name,
      row?.path
    ]
      .map(c113Text)
      .find(Boolean);

    if (direct) {
      return direct;
    }

    const hash =
      c113Text(
        row?.sha256 ||
        row?.hash ||
        docId
      );

    if (!hash) {
      return null;
    }

    const start =
      c113Finite(
        row?.start_time_ms
      ) ??
      c113Finite(
        activityStartMs
      );

    return objectPath(
      uid,
      hash,
      start
    );
  }

  async function c113LinkedFiles(
    uid,
    activityId
  ) {
    const snap =
      await files(uid)
        .where(
          "activity_id",
          "==",
          activityId
        )
        .limit(30)
        .get();

    return snap.docs.map(
      docSnap => ({
        id: docSnap.id,
        ...(
          docSnap.data() ||
          {}
        )
      })
    );
  }

  function c113ChooseFile(
    rows,
    resolved
  ) {
    const list =
      Array.isArray(rows)
        ? rows
        : [];

    const wantedName =
      c113Text(
        resolved?.file_name
      );

    if (wantedName) {
      const exact =
        list.find(
          row =>
            c113Text(
              row?.file_name ||
              row?.original_name ||
              row?.name
            ) === wantedName
        );

      if (exact) {
        return exact;
      }
    }

    const wantedRole =
      c113Text(
        resolved?.role
      ).toUpperCase();

    if (wantedRole) {
      const roleMatch =
        list.find(
          row =>
            c113Text(
              row?.role ||
              row?.fit_role
            ).toUpperCase() ===
            wantedRole
        );

      if (roleMatch) {
        return roleMatch;
      }
    }

    return (
      list.find(
        row =>
          c113Text(
            row?.role ||
            row?.fit_role
          ).toUpperCase() ===
          "ORIGINAL"
      ) ||
      list.find(
        row =>
          c113Text(
            row?.role ||
            row?.fit_role
          ).toUpperCase() ===
          "CANONICAL"
      ) ||
      list[0] ||
      null
    );
  }

  /* CGWEB113_FIX1_DIRECT_STORAGE_PARITY_AUDIT001 */

  async function c113AuditOne(
    uid,
    rawActivityId
  ) {
    const activityId =
      c113Text(
        rawActivityId
      );

    if (!activityId) {
      return {
        activity_id: "",
        status:
          "INVALID_ACTIVITY_ID"
      };
    }

    const activitySnap =
      await db.doc(
        `${ROOT}/${uid}/activities/${activityId}`
      ).get();

    if (!activitySnap.exists) {
      return {
        activity_id:
          activityId,
        status:
          "ACTIVITY_MISSING"
      };
    }

    const activity =
      activitySnap.data() || {};

    const activityStartMs =
      c113Finite(
        activity.start_time_ms
      );

    if (
      activityStartMs == null ||
      activityStartMs <= 0
    ) {
      return {
        activity_id:
          activityId,
        status:
          "ACTIVITY_START_MISSING"
      };
    }


    /*
     * CGWEB113 FIX1 · DIRECT_STORAGE_PARITY_AUDIT001
     *
     * L'audit de parité ne doit PAS dépendre de c096ResolveActivity(),
     * car cette fonction essaie aussi de fabriquer une URL signée V4.
     * Une erreur de signature peut donc produire downloadable=false
     * alors que l'objet FIT existe réellement et se télécharge déjà
     * via le flux direct Storage utilisé par le Répertoire.
     *
     * Ici on utilise exactement la vérité Storage :
     *   c096LinkedRows + c096StorageIndex + c096ResolvePreferred.
     */
    const [
      linkedByActivity,
      index
    ] = await Promise.all([
      c096LinkedRows(uid),
      c096StorageIndex()
    ]);

    const linked =
      linkedByActivity.get(
        activityId
      ) || [];

    if (!linked.length) {
      return {
        activity_id:
          activityId,
        status:
          "FIT_METADATA_MISSING",
        activity_start_ms:
          activityStartMs,
        resolve_status:
          "NO_LINKED_FILE",
        resolve_method:
          "NONE"
      };
    }

    const resolved =
      c096ResolvePreferred(
        linked,
        index
      );

    const resolveStatus =
      c113Text(
        resolved?.status ||
        "NO_LINKED_FILE"
      );

    if (
      !resolveStatus.startsWith(
        "RESOLVED_"
      )
    ) {
      return {
        activity_id:
          activityId,
        status:
          "FIT_NOT_RESOLVED",
        activity_start_ms:
          activityStartMs,
        resolve_status:
          resolveStatus,
        resolve_method:
          resolved?.method ||
          "NONE",
        resolved_file_name:
          resolved?.file_name ||
          null,
        storage_object:
          resolved?.object_name ||
          null
      };
    }

    /*
     * SIGN_URL_INDEPENDENCE001
     * À partir d'ici aucun getSignedUrl() n'est appelé.
     */
    const row =
      c113ChooseFile(
        linked,
        resolved
      ) ||
      linked[0] ||
      null;

    if (!row) {
      return {
        activity_id:
          activityId,
        status:
          "FIT_METADATA_MISSING",
        activity_start_ms:
          activityStartMs,
        resolve_status:
          resolveStatus,
        resolve_method:
          resolved?.method ||
          "NONE"
      };
    }

    const actualName =
      c113Text(
        resolved?.file_name ||
        row?.file_name ||
        row?.original_name ||
        row?.name
      );

    const nameInfo =
      c113CanonicalNameInfo(
        actualName
      );

    const expectedName =
      nameInfo.canonical_pattern
        ? canonicalFitFileName(
            activityStartMs,
            nameInfo.code
          )
        : null;

    const expectedPrefix =
      expectedName
        ? expectedName
            .replace(
              /_[A-Z0-9]{1,4}\.fit$/i,
              ""
            )
        : null;

    const utcPrefix =
      c113UtcCanonicalPrefix(
        activityStartMs
      );

    const legacyUtcName =
      Boolean(
        nameInfo.canonical_pattern &&
        utcPrefix &&
        nameInfo.prefix ===
          utcPrefix &&
        expectedPrefix &&
        nameInfo.prefix !==
          expectedPrefix
      );

    const storagePath =
      c113Text(
        resolved?.object_name
      ) ||
      c113StoragePath(
        uid,
        row,
        row?.__doc_id ||
        row?.id,
        activityStartMs
      );

    let fitStartMs=null;
    let fitReadStatus=
      "NOT_READ";

    if (storagePath) {
      try {
        /*
         * FIT_INTERNAL_TIMESTAMP_READ001
         * Lecture directe dans le bucket déjà indexé par c096StorageIndex().
         */
        const object =
          index.bucket.file(
            storagePath
          );

        const [exists] =
          await object.exists();

        if (!exists) {
          fitReadStatus =
            "OBJECT_NOT_FOUND";
        } else {
          const [buffer] =
            await object.download();

          fitStartMs =
            await fitStartTimeMsFromBuffer(
              buffer
            );

          fitReadStatus =
            fitStartMs == null
              ? "START_NOT_FOUND"
              : "OK";
        }
      } catch (error) {
        fitReadStatus =
          "READ_ERROR:" +
          c113Text(
            error?.message ||
            error
          ).slice(0, 180);
      }
    } else {
      fitReadStatus =
        "OBJECT_PATH_UNKNOWN";
    }

    const internalDeltaMs =
      fitStartMs == null
        ? null
        : fitStartMs -
          activityStartMs;

    const internalTimestampOk =
      internalDeltaMs == null
        ? null
        : Math.abs(
            internalDeltaMs
          ) <= 1000;

    const localNameOk =
      nameInfo.canonical_pattern
        ? actualName ===
          expectedName
        : null;

    let status="OK";

    if (
      internalTimestampOk ===
      false
    ) {
      status =
        "INTERNAL_TIMESTAMP_MISMATCH";
    } else if (
      legacyUtcName
    ) {
      status =
        "LEGACY_UTC_FILENAME";
    } else if (
      localNameOk === false
    ) {
      status =
        "CANONICAL_FILENAME_MISMATCH";
    } else if (
      internalTimestampOk == null
    ) {
      status =
        "FIT_INTERNAL_TIME_UNVERIFIED";
    } else if (
      localNameOk == null
    ) {
      status =
        "ORIGINAL_FILENAME_NOT_CANONICAL";
    }

    return {
      activity_id:
        activityId,
      status,
      time_zone:
        C113_TIME_ZONE,
      activity_start_ms:
        activityStartMs,
      fit_start_ms:
        fitStartMs,
      internal_delta_ms:
        internalDeltaMs,
      internal_timestamp_ok:
        internalTimestampOk,
      fit_read_status:
        fitReadStatus,
      actual_file_name:
        actualName || null,
      expected_local_file_name:
        expectedName,
      local_filename_ok:
        localNameOk,
      legacy_utc_filename:
        legacyUtcName,
      role:
        resolved?.role ||
        row?.role ||
        row?.fit_role ||
        null,
      resolve_status:
        resolveStatus,
      resolve_method:
        resolved?.method ||
        "NONE",
      sign_url_required:
        false,
      storage_path:
        storagePath
    };
  }

  async function c113AuditMany(
    uid,
    rawIds
  ) {
    const ids = [
      ...new Set(
        (
          Array.isArray(rawIds)
            ? rawIds
            : []
        )
          .map(c113Text)
          .filter(Boolean)
      )
    ]
      .slice(0, 25);

    const rows=[];

    /*
     * Lecture séquentielle volontaire :
     * on évite un pic de téléchargements Storage lors d'un audit.
     */
    for (const id of ids) {
      try {
        rows.push(
          await c113AuditOne(
            uid,
            id
          )
        );
      } catch (error) {
        rows.push({
          activity_id: id,
          status: "AUDIT_ERROR",
          error:
            c113Text(
              error?.message ||
              error
            ).slice(0, 240)
        });
      }
    }

    const summary =
      rows.reduce(
        (acc,row)=>{
          const key =
            c113Text(
              row?.status ||
              "UNKNOWN"
            );

          acc[key] =
            Number(
              acc[key] || 0
            ) + 1;

          return acc;
        },
        {}
      );

    return {
      ok: true,
      version: "CGWEB113",
      time_zone:
        C113_TIME_ZONE,
      requested:
        ids.length,
      rows,
      summary
    };
  }

  /* CGWEB113_FIT_TIMESTAMP_PARITY_AUDIT001_END */
  /* CGWEB113_FIX2_HISTORICAL_LOCAL_FILENAME_REPAIR001_START */

  const C113_FIX2_TIME_ZONE = "Europe/Paris";
  const C113_FIX2_PREVIEW_MAX = 25;
  const C113_FIX2_APPLY_MAX = 10;
  const C113_FIX2_APPLY_TOKEN = "APPLY_LEGACY_UTC_NAMES";

  /* CGWEB113_FIX2_FIX1_ROLE_INFERENCE_START */

  function c113Fix2DirectRole(row) {
    const raw =
      c113Text(
        row?.role ||
        row?.fit_role
      ).toUpperCase();

    if (!raw) return "UNKNOWN";
    if (raw.includes("ORIGINAL")) return "ORIGINAL";
    if (raw.includes("EDITED")) return "EDITED";
    if (raw.includes("CANONICAL")) return "CANONICAL";

    return raw;
  }

  function c113Fix2ResolverRole(row) {
    /*
     * RESOLVER_ROLE_FALLBACK001
     *
     * Réutilise l'inférence historique déjà centralisée dans
     * c096RoleLabel()/CGWEB090 : source, upload_mode, archive_roles,
     * fitwriter_version, fitrecovery_version, fitbackfill_version,
     * version_kind, etc.
     */
    const label =
      c113Text(
        c096RoleLabel(row)
      ).toUpperCase();

    return label || "UNKNOWN";
  }

  function c113Fix2RoleEvidence(
    row,
    docId,
    index,
    linkedByActivity
  ) {
    const directRole =
      c113Fix2DirectRole(row);

    const resolverRole =
      c113Fix2ResolverRole(row);

    const c090RolesList =
      (
        typeof c090Roles === "function"
          ? c090Roles(row)
          : []
      )
        .map(
          value =>
            c113Text(value)
              .toUpperCase()
        )
        .filter(Boolean);

    const base = {
      role: "UNKNOWN",
      direct_role: directRole,
      resolver_role: resolverRole,
      role_source: "NONE",
      role_confidence: "NONE",
      role_evidence: [],
      resolver_selected: false,
      linked_file_count: 0,
      resolved_object_name: null
    };

    if (
      ["ORIGINAL","EDITED","CANONICAL"]
        .includes(directRole)
    ) {
      return {
        ...base,
        role: directRole,
        role_source: "DIRECT_ROLE_FIELD",
        role_confidence: "EXPLICIT",
        role_evidence: [
          "DIRECT_ROLE_FIELD"
        ]
      };
    }

    if (
      ["ORIGINAL","EDITED","CANONICAL"]
        .includes(resolverRole)
    ) {
      return {
        ...base,
        role: resolverRole,
        role_source: "RESOLVER_ROLE_FALLBACK001",
        role_confidence: "HIGH",
        role_evidence: [
          "C096_ROLE_LABEL",
          ...c090RolesList.map(
            role =>
              "C090:" + role
          )
        ]
      };
    }

    /*
     * LEGACY_CANONICAL_ROLE_INFERENCE001
     *
     * NO_FILENAME_ONLY_TRUST001 :
     * le suffixe _C.fit n'est JAMAIS une preuve suffisante.
     *
     * Il faut simultanément :
     * - un activity_id ;
     * - le document réellement présent parmi les fichiers liés ;
     * - un objet Storage résolu ;
     * - c096ResolvePreferred() sélectionnant précisément ce document ;
     * - le code canonique C dans le nom.
     *
     * Après cette inférence, c113Fix2InspectFile() doit encore lire le FIT
     * et confirmer la parité de son timestamp interne à ±1 seconde.
     */
    const currentName =
      c113Fix2CurrentName(row);

    const nameInfo =
      c113CanonicalNameInfo(
        currentName
      );

    const activityId =
      c113Text(
        row?.activity_id
      );

    const linked =
      activityId &&
      linkedByActivity instanceof Map
        ? (
            linkedByActivity.get(
              activityId
            ) || []
          )
        : [];

    const presentInLinked =
      linked.some(
        item =>
          c113Text(
            item?.__doc_id
          ) === c113Text(docId)
      );

    const candidateRow = {
      __doc_id: docId,
      ...row
    };

    const rowResolved =
      c096ResolveRowObject(
        candidateRow,
        index
      );

    const storageResolved =
      c113Text(
        rowResolved?.status
      ).startsWith(
        "RESOLVED_"
      );

    const preferred =
      linked.length
        ? c096ResolvePreferred(
            linked,
            index
          )
        : null;

    const resolverSelected =
      Boolean(
        preferred &&
        c113Text(
          preferred?.status
        ).startsWith(
          "RESOLVED_"
        ) &&
        c113Text(
          preferred?.file_doc_id
        ) ===
          c113Text(docId) &&
        (
          !rowResolved?.object_name ||
          !preferred?.object_name ||
          c113Text(
            preferred.object_name
          ) ===
            c113Text(
              rowResolved.object_name
            )
        )
      );

    const canonicalCode =
      Boolean(
        nameInfo?.canonical_pattern &&
        c113Text(
          nameInfo?.code
        ).toUpperCase() ===
          "C"
      );

    const evidence=[];

    if (canonicalCode) {
      evidence.push(
        "CANONICAL_FILENAME_CODE_C"
      );
    }

    if (activityId) {
      evidence.push(
        "ACTIVITY_ID_PRESENT"
      );
    }

    if (presentInLinked) {
      evidence.push(
        "LINKED_METADATA_MATCH"
      );
    }

    if (storageResolved) {
      evidence.push(
        "STORAGE_OBJECT_RESOLVED"
      );
    }

    if (resolverSelected) {
      evidence.push(
        "RESOLVER_SELECTED_THIS_FILE"
      );
    }

    if (
      canonicalCode &&
      activityId &&
      presentInLinked &&
      storageResolved &&
      resolverSelected
    ) {
      return {
        ...base,
        role: "CANONICAL",
        role_source:
          "LEGACY_CANONICAL_ROLE_INFERENCE001",
        role_confidence: "GUARDED",
        role_evidence: evidence,
        resolver_selected: true,
        linked_file_count: linked.length,
        resolved_object_name:
          rowResolved?.object_name ||
          preferred?.object_name ||
          null
      };
    }

    return {
      ...base,
      role_evidence: evidence,
      resolver_selected: resolverSelected,
      linked_file_count: linked.length,
      resolved_object_name:
        rowResolved?.object_name ||
        null
    };
  }

  function c113Fix2Role(row) {
    const direct =
      c113Fix2DirectRole(row);

    if (
      ["ORIGINAL","EDITED","CANONICAL"]
        .includes(direct)
    ) {
      return direct;
    }

    return c113Fix2ResolverRole(
      row
    );
  }

  /* CGWEB113_FIX2_FIX1_ROLE_INFERENCE_END */

  function c113Fix2CurrentName(row) {
    return c113Text(row?.file_name || row?.original_name || row?.name);
  }

  async function c113Fix2ActivityStartMs(uid, row) {
    const activityId = c113Text(row?.activity_id);

    if (activityId) {
      const snap = await db.doc(`${ROOT}/${uid}/activities/${activityId}`).get();
      if (snap.exists) {
        const value = c113Finite(snap.data()?.start_time_ms);
        if (value != null && value > 0) {
          return {activity_id: activityId, start_time_ms: value, source: "ACTIVITY"};
        }
      }
    }

    const metadataStart = c113Finite(row?.start_time_ms);
    if (metadataStart != null && metadataStart > 0) {
      return {
        activity_id: activityId || null,
        start_time_ms: metadataStart,
        source: "FILE_METADATA"
      };
    }

    return {activity_id: activityId || null, start_time_ms: null, source: "NONE"};
  }

  async function c113Fix2InspectFile(
    uid,
    docId,
    row,
    index,
    linkedByActivity
  ) {
    const currentName =
      c113Fix2CurrentName(row);

    const roleInfo =
      c113Fix2RoleEvidence(
        row,
        docId,
        index,
        linkedByActivity
      );

    const role =
      roleInfo.role;

    const timeInfo =
      await c113Fix2ActivityStartMs(
        uid,
        row
      );

    const startMs =
      timeInfo.start_time_ms;

    const base = {
      file_doc_id: docId,
      activity_id: timeInfo.activity_id,
      role: role || null,
      raw_role: roleInfo.direct_role,
      resolver_role: roleInfo.resolver_role,
      role_source: roleInfo.role_source,
      role_confidence: roleInfo.role_confidence,
      role_evidence: roleInfo.role_evidence,
      resolver_selected: roleInfo.resolver_selected,
      linked_file_count: roleInfo.linked_file_count,
      inferred_object_name: roleInfo.resolved_object_name,
      current_name: currentName || null,
      start_time_ms: startMs,
      start_time_source: timeInfo.source,
      time_zone: C113_FIX2_TIME_ZONE,
      repairable: false
    };

    if (role !== "CANONICAL") {
      return {
        ...base,
        status: "SKIP_NOT_CANONICAL"
      };
    }

    if (!currentName) {
      return {
        ...base,
        status: "SKIP_NAME_MISSING"
      };
    }

    const nameInfo =
      c113CanonicalNameInfo(
        currentName
      );

    if (!nameInfo.canonical_pattern) {
      return {
        ...base,
        status: "SKIP_NONCANONICAL_NAME"
      };
    }

    if (
      c113Text(
        nameInfo.code
      ).toUpperCase() !== "C"
    ) {
      return {
        ...base,
        status:
          "SKIP_NONBASE_CANONICAL_CODE"
      };
    }

    if (startMs == null || startMs <= 0) {
      return {...base, status: "BLOCK_START_TIME_MISSING"};
    }

    const expectedName = canonicalFitFileName(startMs, nameInfo.code);
    const expectedPrefix = expectedName.replace(/_[A-Z0-9]{1,4}\.fit$/i, "");
    const utcPrefix = c113UtcCanonicalPrefix(startMs);

    const withNames = {
      ...base,
      expected_local_name: expectedName,
      legacy_utc_prefix: utcPrefix,
      local_prefix: expectedPrefix
    };

    if (currentName === expectedName) return {...withNames, status: "ALREADY_LOCAL"};

    if (!utcPrefix || nameInfo.prefix !== utcPrefix) {
      return {...withNames, status: "BLOCK_OTHER_NAME_MISMATCH"};
    }

    /*
     * METADATA_ONLY_RENAME001
     * Le chemin Storage est basé sur le hash, pas sur le nom humain.
     * Aucun déplacement/copie/suppression Storage n'est nécessaire.
     */
    const candidateRow = {__doc_id: docId, ...row};
    const resolved = c096ResolvePreferred([candidateRow], index);
    const resolveStatus = c113Text(resolved?.status || "NO_LINKED_FILE");

    if (!resolveStatus.startsWith("RESOLVED_")) {
      return {
        ...withNames,
        status: "BLOCK_STORAGE_NOT_RESOLVED",
        resolve_status: resolveStatus,
        resolve_method: resolved?.method || "NONE"
      };
    }

    const storagePath =
      c113Text(resolved?.object_name) ||
      c113StoragePath(uid, row, docId, startMs);

    if (!storagePath) {
      return {...withNames, status: "BLOCK_STORAGE_PATH_UNKNOWN"};
    }

    let fitStartMs = null;
    try {
      const object = index.bucket.file(storagePath);
      const [exists] = await object.exists();
      if (!exists) {
        return {
          ...withNames,
          status: "BLOCK_STORAGE_OBJECT_MISSING",
          storage_path: storagePath
        };
      }

      const [buffer] = await object.download();
      fitStartMs = await fitStartTimeMsFromBuffer(buffer);
    } catch (error) {
      return {
        ...withNames,
        status: "BLOCK_FIT_READ_ERROR",
        error: c113Text(error?.message || error).slice(0, 220),
        storage_path: storagePath
      };
    }

    if (fitStartMs == null) {
      return {
        ...withNames,
        status: "BLOCK_INTERNAL_TIME_UNVERIFIED",
        storage_path: storagePath
      };
    }

    const deltaMs = fitStartMs - startMs;
    if (Math.abs(deltaMs) > 1000) {
      return {
        ...withNames,
        status: "BLOCK_INTERNAL_TIMESTAMP_MISMATCH",
        fit_start_ms: fitStartMs,
        internal_delta_ms: deltaMs,
        storage_path: storagePath
      };
    }

    return {
      ...withNames,
      status: "LEGACY_UTC_FILENAME",
      repairable: true,
      fit_start_ms: fitStartMs,
      internal_delta_ms: deltaMs,
      storage_path: storagePath,
      resolve_status: resolveStatus,
      resolve_method: resolved?.method || "NONE"
    };
  }

  async function c113Fix2Preview(uid, rawBody) {
    const body = rawBody && typeof rawBody === "object" ? rawBody : {};
    const requestedLimit = Number(body.limit);
    const limit = Math.max(
      1,
      Math.min(
        C113_FIX2_PREVIEW_MAX,
        Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : C113_FIX2_PREVIEW_MAX
      )
    );

    const cursor = c113Text(body.cursor);
    let query = files(uid).orderBy(FieldPath.documentId()).limit(limit);
    if (cursor) query = query.startAfter(cursor);

    const [
      snap,
      index,
      linkedByActivity
    ] = await Promise.all([
      query.get(),
      c096StorageIndex(),
      c096LinkedRows(uid)
    ]);

    const rows = [];

    for (const docSnap of snap.docs) {
      rows.push(
        await c113Fix2InspectFile(
          uid,
          docSnap.id,
          docSnap.data() || {},
          index,
          linkedByActivity
        )
      );
    }

    const summary = rows.reduce(
      (acc, row) => {
        const status = c113Text(row?.status || "UNKNOWN");
        acc[status] = Number(acc[status] || 0) + 1;
        if (row?.repairable === true) acc.repairable = Number(acc.repairable || 0) + 1;
        return acc;
      },
      {scanned: rows.length, repairable: 0}
    );

    const last = snap.docs.length ? snap.docs[snap.docs.length - 1].id : null;

    return {
      ok: true,
      version: "CGWEB113_FIX2",
      mode: "DRY_RUN",
      time_zone: C113_FIX2_TIME_ZONE,
      cursor: cursor || null,
      next_cursor: last,
      done: snap.size < limit,
      limit,
      summary,
      rows
    };
  }

  async function c113Fix2ApplyOne(
    uid,
    rawItem,
    index,
    linkedByActivity
  ) {
    const item = rawItem && typeof rawItem === "object" ? rawItem : {};
    const fileDocId = c113Text(item.file_doc_id);
    const requestedFrom = c113Text(item.from_name);
    const requestedTo = c113Text(item.to_name);

    if (!fileDocId || !requestedFrom || !requestedTo) {
      return {ok: false, file_doc_id: fileDocId || null, status: "INVALID_REQUEST"};
    }

    const ref = files(uid).doc(fileDocId);
    const snap = await ref.get();

    if (!snap.exists) {
      return {ok: false, file_doc_id: fileDocId, status: "FILE_METADATA_MISSING"};
    }

    const audit =
      await c113Fix2InspectFile(
        uid,
        fileDocId,
        snap.data() || {},
        index,
        linkedByActivity
      );

    /*
     * INTERNAL_TIMESTAMP_GUARD001
     * L'écriture est impossible sans lecture du FIT et parité temporelle <= 1 s.
     */
    if (
      audit?.repairable !== true ||
      audit?.status !== "LEGACY_UTC_FILENAME" ||
      Math.abs(Number(audit?.internal_delta_ms)) > 1000
    ) {
      return {
        ok: false,
        file_doc_id: fileDocId,
        activity_id: audit?.activity_id || null,
        status: "GUARD_REJECTED",
        audit_status: audit?.status || null,
        internal_delta_ms: audit?.internal_delta_ms ?? null
      };
    }

    if (audit.current_name !== requestedFrom || audit.expected_local_name !== requestedTo) {
      return {
        ok: false,
        file_doc_id: fileDocId,
        activity_id: audit.activity_id || null,
        status: "REQUEST_STALE",
        current_name: audit.current_name,
        expected_local_name: audit.expected_local_name
      };
    }

    const repairedAt = Date.now();

    await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (!current.exists) throw new Error("FILE_METADATA_MISSING_DURING_TRANSACTION");

      const latest =
        current.data() || {};

      const latestRoleInfo =
        c113Fix2RoleEvidence(
          latest,
          fileDocId,
          index,
          linkedByActivity
        );

      if (
        latestRoleInfo.role !== "CANONICAL" ||
        c113Fix2CurrentName(
          latest
        ) !== requestedFrom ||
        c113Text(
          latest?.activity_id
        ) !==
          c113Text(
            audit?.activity_id
          )
      ) {
        throw new Error(
          "FILE_METADATA_CHANGED_DURING_REPAIR"
        );
      }

      /*
       * METADATA_ONLY_RENAME001
       * Le contenu FIT, le hash, l'objet Storage et tous les timestamps restent inchangés.
       */
      tx.set(
        ref,
        {
          file_name: requestedTo,
          filename_timezone: C113_FIX2_TIME_ZONE,
          filename_repair_version: "CGWEB113_FIX2",
          filename_repaired_at_ms: repairedAt,
          filename_repaired_from: requestedFrom
        },
        {merge: true}
      );
    });

    /*
     * POST_REPAIR_REAUDIT001
     */
    const after = audit.activity_id
      ? await c113AuditOne(uid, audit.activity_id)
      : null;

    const verified = Boolean(
      after &&
      after.internal_timestamp_ok === true &&
      after.local_filename_ok === true
    );

    return {
      ok: verified,
      file_doc_id: fileDocId,
      activity_id: audit.activity_id || null,
      status: verified ? "REPAIRED_AND_VERIFIED" : "REPAIRED_REAUDIT_FAILED",
      from_name: requestedFrom,
      to_name: requestedTo,
      internal_delta_ms: after?.internal_delta_ms ?? audit.internal_delta_ms ?? null,
      reaudit_status: after?.status || null,
      storage_path: audit.storage_path || null
    };
  }

  async function c113Fix2Apply(uid, rawBody) {
    const body = rawBody && typeof rawBody === "object" ? rawBody : {};

    if (c113Text(body.confirm) !== C113_FIX2_APPLY_TOKEN) {
      throw Object.assign(new Error("Confirmation CGWEB113 FIX2 absente."), {status: 400});
    }

    const items = (Array.isArray(body.items) ? body.items : []).slice(0, C113_FIX2_APPLY_MAX);
    if (!items.length) {
      return {ok: true, version: "CGWEB113_FIX2", applied: 0, rows: []};
    }

    const [
      index,
      linkedByActivity
    ] = await Promise.all([
      c096StorageIndex(),
      c096LinkedRows(uid)
    ]);

    const rows = [];

    for (const item of items) {
      try {
        rows.push(
          await c113Fix2ApplyOne(
            uid,
            item,
            index,
            linkedByActivity
          )
        );
      } catch (error) {
        rows.push({
          ok: false,
          file_doc_id: c113Text(item?.file_doc_id) || null,
          status: "APPLY_ERROR",
          error: c113Text(error?.message || error).slice(0, 240)
        });
      }
    }

    return {
      ok: rows.every(row => row?.ok === true),
      version: "CGWEB113_FIX2",
      applied: rows.filter(row => row?.status === "REPAIRED_AND_VERIFIED").length,
      rows
    };
  }

  /* CGWEB113_FIX2_HISTORICAL_LOCAL_FILENAME_REPAIR001_END */


  /* CGWEB112_FIRST_DISPLAY_FIT_ENSURE_BACKEND_END */

  /* CGWEB099_GLOBAL_DIRECTORY_HELPERS_END */

  return onRequest(
    {region: REGION, timeoutSeconds: 300, memory: "512MiB", cors: false},
    async (req, res) => {
      cors(res);
      if (req.method === "OPTIONS") return res.status(204).send("");

      try {
        const decoded = await requireUser(req);
        const uid = decoded.uid;
        const action = String(req.query.action || "health").trim();

        if (action === "fit_filename_repair_preview") {
          if (req.method !== "POST") {
            return res.status(405).json({ok:false, version:"CGWEB113_FIX2", error:"POST requis."});
          }
          const body = req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)
            ? req.body
            : {};
          return res.json(await c113Fix2Preview(uid, body));
        }

        if (action === "fit_filename_repair_apply") {
          if (req.method !== "POST") {
            return res.status(405).json({ok:false, version:"CGWEB113_FIX2", error:"POST requis."});
          }
          const body = req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)
            ? req.body
            : {};
          return res.json(await c113Fix2Apply(uid, body));
        }

        if (action === "fit_timestamp_parity_audit") {
          if (req.method !== "POST") {
            return res.status(405).json({
              ok: false,
              version: "CGWEB113",
              error: "POST requis."
            });
          }

          const body =
            req.body &&
            typeof req.body === "object" &&
            !Buffer.isBuffer(req.body)
              ? req.body
              : {};

          const result =
            await c113AuditMany(
              uid,
              body.activity_ids
            );

          return res.json(result);
        }

        if (action === "ensure_activity_fit") {
          if (req.method !== "POST") {
            return res.status(405).json({
              ok: false,
              version: "CGWEB112",
              error: "POST requis."
            });
          }

          const body =
            req.body &&
            typeof req.body === "object" &&
            !Buffer.isBuffer(req.body)
              ? req.body
              : {};

          const activityId =
            String(
              body.activity_id ||
              req.query.activity_id ||
              ""
            ).trim();

          const result =
            await c112EnsureActivityFit(
              uid,
              activityId
            );

          return res.json(result);
        }

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

            fit_signature:
              generated.stats.fitSignature || null,
            fit_signature_version:
              generated.stats.fitSignatureVersion || null,
            fit_signature_serial:
              Number(generated.stats.serialNumber || 0) || null,
            fit_signature_seed_source:
              generated.stats.fitSignatureSeedSource || null,

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

          const editorMode = String(body.fit_editor_mode || "").toUpperCase() === "FITEDITOR001";

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
          prepared.payload.activity_id = activityId;
          prepared.payload.fit_signature_seed = activityId;
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
            fit_signature: generated.stats.fitSignature || null,
            fit_signature_version: generated.stats.fitSignatureVersion || null,
            fit_signature_serial: Number(generated.stats.serialNumber || 0) || null,
            fit_signature_seed_source: generated.stats.fitSignatureSeedSource || null,
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
/* CGWEB078_FITVERSION001_ACTION_START */
        if (action === "version") {
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
            return res.status(400).json({error: "FITVERSION001 : activity_id requis."});
          }

          const parentHash = String(body.parent_sha256 || "").trim().toLowerCase();
          let parent = null;

          if (parentHash) {
            if (!/^[a-f0-9]{64}$/.test(parentHash)) {
              return res.status(400).json({error: "FITVERSION001 : parent_sha256 invalide."});
            }
            const parentSnap = await fileDoc(uid, parentHash).get();
            if (!parentSnap.exists) {
              return res.status(404).json({error: "FITVERSION001 : FIT parent introuvable."});
            }
            parent = parentSnap.data() || {};
            if (parent.deleted_at_ms != null) {
              return res.status(409).json({error: "FITVERSION001 : FIT parent supprimé."});
            }
            if (parent.activity_id && String(parent.activity_id) !== activityId) {
              return res.status(409).json({error: "FITVERSION001 : FIT parent lié à une autre activité."});
            }
          }

          const activityRef = db.doc(`${ROOT}/${uid}/activities/${activityId}`);
          const routeRef = db.doc(`${ROOT}/${uid}/activity_routes/${activityId}`);
          const [activitySnap, routeSnap] = await Promise.all([
            activityRef.get(),
            routeRef.get()
          ]);

          if (!activitySnap.exists) {
            return res.status(404).json({error: `FITVERSION001 : activité ${activityId} absente.`});
          }

          const activity = activitySnap.data() || {};
          if (activity.deleted_at_ms != null) {
            return res.status(422).json({error: "FITVERSION001 : activité source supprimée."});
          }

          const route = routeSnap.exists ? routeSnap.data() || {} : {};
          const prepared = v078BuildPayload(activity, route);
          const edited = v078ApplyOverrides(prepared, body);
          const generated = await encodeCanonicalFit(edited.payload);
          const validation = await inspectFitBuffer(generated.buffer);

          if (!validation.ok) {
            return res.status(500).json({
              error: "FITVERSION001 : FIT généré invalide.",
              validation
            });
          }

          const decodedFit = await decodeCanonicalFitSummary(generated.buffer);
          if (!decodedFit.integrity || decodedFit.activityCount !== 1 || decodedFit.sessionCount !== 1) {
            return res.status(500).json({
              error: "FITVERSION001 : structure FIT non conforme.",
              decoded: decodedFit
            });
          }

          const versionIndex = await v078NextVersionIndex(uid, activityId);
          const fileName = editorMode
            ? safeName(generated.fileName || parent?.file_name || "activity.fit")
            : v078VersionedName(
                generated.fileName || parent?.file_name || "activity.fit",
                versionIndex
              );
          const hash = sha256(generated.buffer);

          if (parentHash && hash === parentHash) {
            return res.status(409).json({
              error: "FITVERSION001 : la version générée est identique au FIT parent ; aucun fichier remplacé."
            });
          }

          const ref = fileDoc(uid, hash);
          const existing = await ref.get();
          const previous = existing.exists ? existing.data() || {} : {};

          if (existing.exists && previous.deleted_at_ms == null) {
            if (String(previous.activity_id || "") !== activityId) {
              return res.status(409).json({
                error: "FITVERSION001 : ce contenu existe déjà dans le coffre sous un autre lien ; aucun manifeste modifié."
              });
            }
            let activityPatch = null;

            if (editorMode && body.activate_version === true) {
              activityPatch = await v085aActivateVersion(
                uid,
                activityId,
                ref,
                {
                  ...previous,
                  sha256: previous.sha256 || hash,
                  version_index: Number(previous.version_index || versionIndex),
                  file_name: previous.file_name || fileName
                },
                activity,
                edited
              );
            }

            return res.json({
              ok: true,
              service: editorMode ? "FITEDITOR001" : "FITVERSION001",
              activity_id: activityId,
              version_index: Number(previous.version_index || versionIndex),
              parent_sha256: previous.parent_sha256 || parentHash || null,
              edits: edited.edits,
              file: {
                ...previous,
                is_active_version:
                  editorMode && body.activate_version === true
                    ? true
                    : Boolean(previous.is_active_version)
              },
              activity_patch: activityPatch,
              validation,
              fit: decodedFit,
              stored: true,
              deduplicated: true,
              reused_existing_version: true,
              activity_modified: Boolean(activityPatch),
              activities_created: 0,
              activities_modified: activityPatch ? 1 : 0
            });
          }

          const path = objectPath(uid, hash, edited.payload.start_time_ms);
          const object = bucket().file(path);
          const [exists] = await object.exists();

          const familyId = String(
            parent?.version_family_id ||
            parent?.sha256 ||
            parentHash ||
            hash
          );

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
                  source: editorMode ? "WEB_FITEDITOR" : "WEB_FITVERSION",
                  mode: "VERSIONED_CANONICAL",
                  writer: "FITWRITER001",
                  versioner: "FITVERSION001",
                  version_family_id: familyId,
                  parent_sha256: parentHash || ""
                }
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
            size_bytes: generated.buffer.length,
            mime_type: "application/vnd.ant.fit",
            source: "WEB_FITVERSION",
            upload_mode: "VERSIONED_CANONICAL",
            start_time_ms: edited.payload.start_time_ms,
            sport: generated.stats.sport,
            sub_sport: generated.stats.subSport,
            activity_id: activityId,
            link_status: "LINKED_VERSION",
            point_count: generated.stats.pointCount,
            fit_integrity: true,
            fitwriter_version: "FITWRITER001",
            fitversion_version: "FITVERSION001",
            fit_editor_version: editorMode ? "FITEDITOR001" : null,
            version_index: versionIndex,
            version_family_id: familyId,
            parent_sha256: parentHash || null,
            version_kind: editorMode ? "ACTIVE_EDITABLE_CANONICAL" : "EDITED_CANONICAL",
            start_offset_s: edited.edits.start_offset_s,
            start_time_ms_source: edited.edits.start_time_ms_source,
            heart_rate_mode: edited.edits.heart_rate_mode,
            avg_hr_override: edited.edits.avg_hr_override,
            max_hr_override: edited.edits.max_hr_override,
            route_source_present: Boolean(routeSnap.exists),
            is_active_version: false,
            first_uploaded_at_ms: Number(previous.first_uploaded_at_ms || now),
            uploaded_at_ms: now,
            last_seen_at_ms: now,
            deleted_at_ms: null,
            storage_version: "FITCLOUD001"
          };

          await ref.set(metadata, {merge: true});

          let activityPatch = null;

          if (editorMode && body.activate_version === true) {
            activityPatch = await v085aActivateVersion(
              uid,
              activityId,
              ref,
              metadata,
              activity,
              edited
            );

            metadata.is_active_version = true;
          }

          return res.json({
            ok: true,
            service: editorMode ? "FITEDITOR001" : "FITVERSION001",
            activity_id: activityId,
            version_index: versionIndex,
            parent_sha256: parentHash || null,
            edits: edited.edits,
            file: metadata,
            activity_patch: activityPatch,
            validation,
            fit: decodedFit,
            stored: true,
            deduplicated: Boolean(existing.exists || exists),
            activity_modified: Boolean(activityPatch),
            activities_created: 0,
            activities_modified: activityPatch ? 1 : 0
          });
        }
        /* CGWEB078_FITVERSION001_ACTION_END */
/* CGWEB080_FITDRIVE001_ACTION_START */
        if (action === "drive_mark") {
          if (req.method !== "POST") {
            return res.status(405).json({error: "POST requis."});
          }

          let body = req.body;
          if (Buffer.isBuffer(body)) {
            try { body = JSON.parse(body.toString("utf8")); }
            catch { body = null; }
          }
          if (!body || typeof body !== "object" || Array.isArray(body)) body = {};

          const sha = String(body.sha256 || "").trim().toLowerCase();
          const driveSha = String(body.drive_sha256 || sha).trim().toLowerCase();
          const driveFileId = String(body.drive_file_id || "").trim();

          if (!/^[a-f0-9]{64}$/.test(sha)) {
            return res.status(400).json({error: "FITDRIVE001 : sha256 invalide."});
          }
          if (driveSha !== sha) {
            return res.status(409).json({error: "FITDRIVE001 : SHA Drive différent du SHA Cloud."});
          }
          if (!driveFileId || driveFileId.length > 300) {
            return res.status(400).json({error: "FITDRIVE001 : drive_file_id invalide."});
          }

          const ref = fileDoc(uid, sha);
          const snap = await ref.get();
          if (!snap.exists) {
            return res.status(404).json({error: "FITDRIVE001 : FIT Cloud introuvable."});
          }
          const current = snap.data() || {};
          if (current.deleted_at_ms != null) {
            return res.status(409).json({error: "FITDRIVE001 : FIT Cloud supprimé."});
          }

          const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);
          const link = clean(body.drive_web_view_link, 1200);
          const patch = {
            drive_file_id: driveFileId,
            drive_file_name: clean(body.drive_file_name, 300) || current.file_name || `${sha}.fit`,
            drive_folder_id: clean(body.drive_folder_id, 300) || null,
            drive_path: clean(body.drive_path, 600) || null,
            drive_web_view_link: /^https:\/\//i.test(link) ? link : null,
            drive_sha256: sha,
            drive_backup_state: "OK",
            drive_backup_version: "FITDRIVE001",
            drive_reused: Boolean(body.drive_reused),
            drive_uploaded_at_ms: Date.now(),
            last_seen_at_ms: Date.now()
          };

          await ref.set(patch, {merge: true});
          const updated = await ref.get();

          return res.json({
            ok: true,
            service: "FITDRIVE001",
            file: updated.data() || {...current, ...patch},
            activities_created: 0,
            activities_modified: 0
          });
        }
        /* CGWEB080_FITDRIVE001_ACTION_END */





        /* CGWEB088_FITBACKFILL001_ACTION_START */
        if (action === "recovery_plan") {
          if (req.method!=="GET") return res.status(405).json({error:"GET requis."});
          const inv=await v088Inventory(uid);
          const limit=Math.max(10,Math.min(200,Number(req.query.limit||50)));
          return res.json({
            ok:true,service:"FITRECOVERY001",version:"CGWEB088",dry_run:true,
            activities_modified:0,fit_files_created:0,
            summary:{
              activities_active:inv.active,already_with_fit:inv.already,
              missing_fit:inv.candidates.length+inv.insufficient.length,
              reconstructible:inv.candidates.length,insufficient:inv.insufficient.length
            },
            next_candidates:inv.candidates.slice(0,limit),
            insufficient_examples:inv.insufficient.slice(0,50)
          });
        }

        if (action === "recovery_batch") {
          if (req.method!=="POST") return res.status(405).json({error:"POST requis."});
          let body=req.body;
          if (Buffer.isBuffer(body)) { try{body=JSON.parse(body.toString("utf8"));}catch{body={};} }
          if (!body||typeof body!=="object"||Array.isArray(body)) body={};
          const size=Math.max(1,Math.min(50,Number(body.batch_size||25)));
          const inv=await v088Inventory(uid);
          const selected=inv.candidates.slice(0,size);
          const results=new Array(selected.length);
          let cursor=0;
          async function worker() {
            while (true) {
              const i=cursor++;
              if (i>=selected.length) return;
              try { results[i]=await v088RecoverOne(uid,selected[i]); }
              catch(error) {
                console.error("FITBACKFILL001",selected[i].activity_id,error);
                results[i]={ok:false,activity_id:selected[i].activity_id,status:"ERROR",error:error?.message||String(error)};
              }
            }
          }
          await Promise.all(Array.from({length:Math.min(2,selected.length)},()=>worker()));
          const stored=results.filter(x=>x?.status==="STORED").length;
          const already=results.filter(x=>x?.status==="ALREADY_HAS_FIT").length;
          const failed=results.filter(x=>!x?.ok).length;
          return res.json({
            ok:failed===0,service:"FITBACKFILL001",version:"CGWEB088",
            requested:size,selected:selected.length,stored,already_present:already,failed,
            remaining_reconstructible:Math.max(0,inv.candidates.length-stored-already),
            insufficient:inv.insufficient.length,activities_modified:0,results
          });
        }
        /* CGWEB088_FITBACKFILL001_ACTION_END */

        /* CGWEB088_FIX3_FITBACKFILL_ERROR_DIAGNOSTIC001_ACTION_START */
        if (action === "recovery_diagnose") {
          if (req.method!=="POST") {
            return res.status(405).json({error:"POST requis."});
          }

          let body=req.body;

          if (Buffer.isBuffer(body)) {
            try {
              body=JSON.parse(body.toString("utf8"));
            } catch {
              body={};
            }
          }

          if (!body || typeof body!=="object" || Array.isArray(body)) {
            body={};
          }

          const size=Math.max(
            1,
            Math.min(50,Number(body.batch_size||50))
          );

          const inv=await v088Inventory(uid);
          const selected=inv.candidates.slice(0,size);
          const results=new Array(selected.length);
          let cursor=0;

          async function worker() {
            while (true) {
              const i=cursor++;
              if (i>=selected.length) return;

              try {
                results[i]=await v088DiagnoseOne(uid,selected[i]);
              } catch(error) {
                console.error(
                  "FITBACKFILL_ERROR_DIAGNOSTIC001",
                  selected[i]?.activity_id,
                  error
                );

                results[i]={
                  ok:false,
                  activity_id:selected[i]?.activity_id||null,
                  status:"ERROR",
                  diagnostic_only:true,
                  error:error?.message||String(error)
                };
              }
            }
          }

          await Promise.all(
            Array.from(
              {length:Math.min(2,selected.length)},
              ()=>worker()
            )
          );

          const valid=results.filter(
            x=>x?.ok && x?.status==="VALID"
          ).length;

          const already=results.filter(
            x=>x?.ok && x?.status==="ALREADY_HAS_FIT"
          ).length;

          const failed=results.filter(
            x=>!x?.ok
          );

          return res.json({
            ok:true,
            service:"FITBACKFILL_ERROR_DIAGNOSTIC001",
            version:"CGWEB088_FIX3",
            dry_run:true,
            writes:0,
            activities_modified:0,
            fit_files_created:0,
            requested:size,
            selected:selected.length,
            valid,
            already_present:already,
            failed:failed.length,
            remaining_reconstructible:inv.candidates.length,
            results
          });
        }
        /* CGWEB088_FIX3_FITBACKFILL_ERROR_DIAGNOSTIC001_ACTION_END */



/* CGWEB091_FIT_RECONCILE_RESOLVE001_ACTIONS_START */

if (action === "reconcile_resolve") {
  if (req.method !== "GET") {
    return res.status(405).json({error: "GET requis."});
  }

  const inv = await c091Inventory(uid);

  const uniqueStrict =
    inv.unresolved.filter(
      (row) => row.auto_repairable
    ).length;

  const ambiguousStrict =
    inv.unresolved.filter(
      (row) =>
        row.resolution_class ===
        "AMBIGUOUS_STRICT"
    ).length;

  const manualExtended =
    inv.unresolved.filter(
      (row) =>
        row.resolution_class ===
        "MANUAL_EXTENDED"
    ).length;

  const noCandidate =
    inv.unresolved.filter(
      (row) =>
        row.resolution_class ===
          "NO_CANDIDATE" ||
        row.resolution_class ===
          "NO_TIME"
    ).length;

  return res.json({
    ok: true,
    service: "FIT_RECONCILE_RESOLVE001",
    version: "CGWEB091",
    read_only: true,
    activities_modified: 0,
    fit_files_modified: 0,
    summary: {
      unresolved_original_files:
        inv.unresolved.length,
      unique_strict_candidates:
        uniqueStrict,
      ambiguous_strict:
        ambiguousStrict,
      manual_extended:
        manualExtended,
      no_candidate:
        noCandidate,
      canonical_only_activities:
        inv.canonicalOnly.length,
      canonical_only_with_candidate:
        inv.canonicalOnly.filter(
          (row) =>
            Number(
              row.candidate_original_count || 0
            ) > 0
        ).length
    },
    unresolved: inv.unresolved,
    canonical_only:
      inv.canonicalOnly.slice(0, 500)
  });
}

if (action === "original_match_repair") {
  if (req.method !== "POST") {
    return res.status(405).json({error: "POST requis."});
  }

  let body = req.body;

  if (Buffer.isBuffer(body)) {
    try {
      body = JSON.parse(
        body.toString("utf8")
      );
    } catch {
      body = {};
    }
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    body = {};
  }

  const result =
    await c091RepairOne(
      uid,
      body.sha256,
      body.activity_id,
      "MANUAL_UI"
    );

  return res.json({
    ok: true,
    service: "ORIGINAL_MATCH_REPAIR001",
    version: "CGWEB091",
    ...result
  });
}

if (action === "original_match_repair_auto") {
  if (req.method !== "POST") {
    return res.status(405).json({error: "POST requis."});
  }

  const inv = await c091Inventory(uid);
  const repairable =
    inv.unresolved.filter(
      (row) => row.auto_repairable
    );

  const results = [];

  for (const row of repairable) {
    const strict =
      row.candidates.filter(
        (candidate) =>
          candidate.strategy ===
          "STRICT_3MIN"
      );

    if (strict.length !== 1) continue;

    try {
      results.push({
        ok: true,
        ...await c091RepairOne(
          uid,
          row.sha256,
          strict[0].activity_id,
          "AUTO_UNIQUE_STRICT"
        )
      });
    } catch (error) {
      results.push({
        ok: false,
        sha256: row.sha256,
        error:
          error?.message ||
          String(error)
      });
    }
  }

  return res.json({
    ok: true,
    service: "ORIGINAL_MATCH_REPAIR001",
    version: "CGWEB091",
    mode: "AUTO_UNIQUE_STRICT",
    selected: repairable.length,
    repaired:
      results.filter((x) => x.ok).length,
    failed:
      results.filter((x) => !x.ok).length,
    results,
    activities_modified: 0
  });
}

if (action === "transfer_audit") {
  if (req.method !== "GET") {
    return res.status(405).json({error: "GET requis."});
  }

  const result =
    await c091TransferAudit(uid);

  return res.json({
    ok: true,
    service: "TRANSFER_AUDIT001",
    version: "CGWEB091",
    read_only: true,
    activities_modified: 0,
    fit_files_modified: 0,
    summary: result
  });
}


        /* CGWEB092_ORIGINAL_MATCH_DEEP_ANALYSIS001_ACTION_START */
        if (action === "original_match_deep_analysis") {
          if (req.method !== "GET") {
            return res.status(405).json({error: "GET requis."});
          }

          const result = await c092DeepAnalysis(uid);

          return res.json({
            ok: true,
            service: "ORIGINAL_MATCH_DEEP_ANALYSIS001",
            version: "CGWEB092",
            read_only: true,
            activities_modified: 0,
            fit_files_modified: 0,
            ...result
          });
        }
        /* CGWEB092_ORIGINAL_MATCH_DEEP_ANALYSIS001_ACTION_END */

        /* CGWEB093_MATCH_TRIAGE001_ACTIONS_START */

        if (action === "cgweb093_analysis") {
          if (req.method !== "GET") {
            return res.status(405).json({error: "GET requis."});
          }

          const result = await c093AnalyzeAll(uid);

          return res.json({
            ok: true,
            service: "CGWEB093_MATCH_TRIAGE001",
            version: "CGWEB093",
            read_only: true,
            activities_modified: 0,
            fit_files_modified: 0,
            ...result
          });
        }

        if (action === "safe_match_preview") {
          if (req.method !== "GET") {
            return res.status(405).json({error: "GET requis."});
          }

          const deep = await c092DeepAnalysis(uid);
          const result = c093SafePreviewFromDeep(deep);

          return res.json({
            ok: true,
            service: "SAFE_MATCH_PREVIEW001",
            version: "CGWEB093",
            read_only: true,
            activities_modified: 0,
            fit_files_modified: 0,
            ...result
          });
        }

        if (action === "orphan_fingerprint_search") {
          if (req.method !== "GET") {
            return res.status(405).json({error: "GET requis."});
          }

          const deep = await c092DeepAnalysis(uid);
          const inventory = await c091Inventory(uid);
          const preview = c093SafePreviewFromDeep(deep);

          const result =
            await c093OrphanFingerprintSearch(
              uid,
              deep,
              inventory,
              preview
            );

          return res.json({
            ok: true,
            service: "ORPHAN_FINGERPRINT_SEARCH001",
            version: "CGWEB093",
            read_only: true,
            activities_modified: 0,
            fit_files_modified: 0,
            ...result
          });
        }

        if (action === "duplicate_activity_diagnostic") {
          if (req.method !== "GET") {
            return res.status(405).json({error: "GET requis."});
          }

          const deep = await c092DeepAnalysis(uid);
          const inventory = await c091Inventory(uid);
          const preview = c093SafePreviewFromDeep(deep);

          const result =
            await c093DuplicateActivityDiagnostic(
              uid,
              deep,
              inventory,
              preview
            );

          return res.json({
            ok: true,
            service: "DUPLICATE_ACTIVITY_DIAGNOSTIC001",
            version: "CGWEB093",
            read_only: true,
            activities_modified: 0,
            fit_files_modified: 0,
            ...result
          });
        }

        /* CGWEB093_MATCH_TRIAGE001_ACTIONS_END */

        /* CGWEB094_SAFE_APPLY001_ACTIONS_START */

        if (action === "cgweb094_preview") {
          if (req.method !== "GET") {
            return res.status(405).json({error: "GET requis."});
          }

          const result = await c094Preview(uid);

          return res.json({
            ok: true,
            service: "CGWEB094_PREVIEW",
            version: "CGWEB094",
            ...result
          });
        }

        if (action === "safe_match_apply") {
          if (req.method !== "POST") {
            return res.status(405).json({error: "POST requis."});
          }

          const result =
            await c094SafeApply(uid, req.body || {});

          return res.json({
            ok: true,
            service: "SAFE_MATCH_APPLY001",
            version: "CGWEB094",
            ...result
          });
        }

        if (action === "orphan_hold_apply") {
          if (req.method !== "POST") {
            return res.status(405).json({error: "POST requis."});
          }

          const result =
            await c094OrphanHoldApply(
              uid,
              req.body || {}
            );

          return res.json({
            ok: true,
            service: "ORPHAN_HOLD001",
            version: "CGWEB094",
            ...result
          });
        }

        if (
          action ===
          "duplicate_activity_merge_preview"
        ) {
          if (req.method !== "GET") {
            return res.status(405).json({error: "GET requis."});
          }

          const result =
            await c094DuplicateMergePreview(uid);

          return res.json({
            ok: true,
            service:
              "DUPLICATE_ACTIVITY_MERGE_PREVIEW001",
            version: "CGWEB094",
            read_only: true,
            activities_modified: 0,
            ...result
          });
        }

        /* CGWEB094_SAFE_APPLY001_ACTIONS_END */





/* CGWEB091_FIT_RECONCILE_RESOLVE001_ACTIONS_END */

        /* CGWEB090_FIT_RECONCILE001_ACTIONS_START */

        if (action === "historical_preflight") {
          if (req.method !== "POST") {
            return res.status(405).json({error: "POST requis."});
          }

          let body = req.body;

          if (Buffer.isBuffer(body)) {
            try {
              body = JSON.parse(body.toString("utf8"));
            } catch {
              body = {};
            }
          }

          if (!body || typeof body !== "object" || Array.isArray(body)) {
            body = {};
          }

          const hashes = c090Strings(
            Array.isArray(body.hashes) ? body.hashes : []
          )
            .map((x) => x.toLowerCase())
            .filter((x) => /^[a-f0-9]{64}$/.test(x))
            .slice(0, 100);

          const items = [];

          for (const hash of hashes) {
            const snap = await fileDoc(uid, hash).get();

            if (!snap.exists) {
              items.push({
                sha256: hash,
                exists: false,
                status: "MISSING",
                needs_upload: true
              });
              continue;
            }

            const row = snap.data() || {};

            if (row.deleted_at_ms != null) {
              items.push({
                sha256: hash,
                exists: true,
                status: "DELETED_METADATA",
                needs_upload: true
              });
              continue;
            }

            const roles = c090Roles(row);
            const hasOriginal = roles.includes(C090_ROLE_ORIGINAL);

            items.push({
              sha256: hash,
              exists: true,
              status: hasOriginal
                ? "ALREADY_ARCHIVED_ORIGINAL"
                : "EXISTS_NEEDS_ORIGINAL_OBSERVATION",
              needs_upload: !hasOriginal,
              activity_id: row.activity_id || null,
              link_status: row.link_status || null,
              archive_roles: roles
            });
          }

          return res.json({
            ok: true,
            service: "HISTORICAL_FIT_TRANSFER001",
            version: "CGWEB090",
            requested: hashes.length,
            items,
            activities_created: 0,
            activities_modified: 0
          });
        }

        if (action === "fit_reconcile") {
          if (req.method !== "GET") {
            return res.status(405).json({error: "GET requis."});
          }

          const result = await c090Reconcile(uid);

          return res.json({
            ok: true,
            service: "FIT_RECONCILE001",
            version: "CGWEB090",
            read_only: true,
            activities_modified: 0,
            fit_files_modified: 0,
            summary: result
          });
        }

        /* CGWEB090_FIT_RECONCILE001_ACTIONS_END */


        /* CGWEB094C_MISSING_FIT_BACKEND_START */
        function c094cBody(req){
          let body=req.body;
          if(Buffer.isBuffer(body)){
            try{body=JSON.parse(body.toString("utf8"));}catch{body={};}
          }
          return (!body||typeof body!=="object"||Array.isArray(body))?{}:body;
        }

        function c094cIds(body,max){
          const out=[],seen=new Set();
          for(const raw of (Array.isArray(body?.activity_ids)?body.activity_ids:[])){
            const id=String(raw??"").trim();
            if(!id||seen.has(id))continue;
            seen.add(id);out.push(id);
            if(out.length>=max)break;
          }
          return out;
        }

        async function c094cPlanOne(uid,id){
          const linked=await files(uid).where("activity_id","==",id).limit(8).get();
          const active=linked.docs.map(x=>x.data()||{}).find(x=>x.deleted_at_ms==null);
          if(active)return {
            activity_id:id,status:"HAS_FIT",eligible:false,
            sha256:active.sha256||active.file_id||null,
            file_name:active.file_name||null
          };

          const snap=await db.doc(`${ROOT}/${uid}/activities/${id}`).get();
          if(!snap.exists)return {
            activity_id:id,status:"ACTIVITY_MISSING",eligible:false,missing:["activity"]
          };
          const a=snap.data()||{};
          if(a.deleted_at_ms!=null)return {
            activity_id:id,status:"ACTIVITY_DELETED",eligible:false,missing:["active_activity"]
          };

          const core=v088Core(a);
          if(!core.ok)return {
            activity_id:id,status:"INSUFFICIENT",eligible:false,missing:core.missing||[]
          };

          return {activity_id:id,status:"ELIGIBLE",eligible:true};
        }

        async function c094cMap(items,worker,concurrency){
          const out=new Array(items.length);let cursor=0;
          async function run(){
            while(true){
              const i=cursor++;
              if(i>=items.length)return;
              try{out[i]=await worker(items[i]);}
              catch(error){
                out[i]={
                  activity_id:String(items[i]||""),status:"ERROR",eligible:false,
                  error:error?.message||String(error)
                };
              }
            }
          }
          await Promise.all(
            Array.from({length:Math.min(concurrency,Math.max(1,items.length))},()=>run())
          );
          return out;
        }

        if(action==="missing_fit_plan"){
          if(req.method!=="POST")return res.status(405).json({error:"POST requis."});
          const ids=c094cIds(c094cBody(req),500);
          const rows=await c094cMap(ids,id=>c094cPlanOne(uid,id),8);
          return res.json({
            ok:true,service:"MISSING_FIT_GENERATE001",version:"CGWEB094C",
            dry_run:true,activities_created:0,activities_modified:0,rows,
            summary:{
              requested:ids.length,
              eligible:rows.filter(x=>x?.status==="ELIGIBLE").length,
              has_fit:rows.filter(x=>x?.status==="HAS_FIT").length,
              insufficient:rows.filter(x=>x?.status==="INSUFFICIENT").length
            }
          });
        }

        if(action==="missing_fit_generate"){
          if(req.method!=="POST")return res.status(405).json({error:"POST requis."});
          const ids=c094cIds(c094cBody(req),50);
          if(!ids.length)return res.status(400).json({error:"Aucun activity_id fourni."});

          const results=await c094cMap(ids,async id=>{
            const planned=await c094cPlanOne(uid,id);
            if(planned.status==="HAS_FIT"){
              return {ok:true,activity_id:id,status:"ALREADY_HAS_FIT",stored:false};
            }
            if(planned.status!=="ELIGIBLE"){
              return {
                ok:false,activity_id:id,status:planned.status,stored:false,
                missing:planned.missing||[],error:planned.error||null
              };
            }
            return v088RecoverOne(uid,{activity_id:id});
          },2);

          const stored=results.filter(x=>x?.status==="STORED").length;
          const already=results.filter(x=>x?.status==="ALREADY_HAS_FIT").length;
          const failed=results.filter(x=>x?.ok===false).length;
          return res.json({
            ok:failed===0,service:"MISSING_FIT_BATCH001",version:"CGWEB094C",
            requested:ids.length,stored,already_present:already,failed,
            activities_created:0,activities_modified:0,results
          });
        }
        /* CGWEB094C_MISSING_FIT_BACKEND_END */


        /* CGWEB095_GLOBAL_FIT_ACTIONS_START */


        /* CGWEB096_DIRECTORY_DOWNLOAD_ACTIONS_START */

        if (
          action ===
          "directory_fit_download_audit"
        ) {
          if (
            req.method !== "GET" &&
            req.method !== "POST"
          ) {
            return res.status(405).json({
              error: "GET ou POST requis."
            });
          }

          const audit =
            await c096DirectoryAudit(uid);

          return res.json({
            ok: true,
            service:
              "DIRECTORY_FIT_DOWNLOAD_AUDIT001",
            version: "CGWEB096",
            read_only: true,
            ...audit
          });
        }

        if (
          action ===
          "directory_fit_resolve"
        ) {
          if (req.method !== "POST") {
            return res.status(405).json({
              error: "POST requis."
            });
          }

          let body = req.body;

          if (Buffer.isBuffer(body)) {
            try {
              body =
                JSON.parse(
                  body.toString("utf8")
                );
            } catch {
              body = {};
            }
          }

          body =
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
              ? {}
              : body;

          const result =
            await c096ResolveActivity(
              uid,
              body.activity_id
            );

          return res.json({
            ok: true,
            service:
              "CLOUD_OBJECT_RESOLVE001",
            version: "CGWEB096",
            ...result
          });
        }



        /* CGWEB107_SIGN_FORENSICS_ACTIONS_START */

        if(action==="fit_sign_url_forensics"){
          if(req.method!=="GET" && req.method!=="POST"){
            return res.status(405).json({error:"GET ou POST requis."});
          }

          const activityId=String(
            req.method==="GET"
              ? (req.query?.activity_id||"")
              : (req.body?.activity_id||"")
          ).trim();

          const result=await c107FitSignUrlForensics(uid,activityId);

          return res.json({
            ok:true,
            service:"FIT_SIGN_URL_FORENSICS001",
            detail_service:"SIGN_ERROR_DETAIL001",
            storage_service:"STORAGE_OBJECT_VERIFY001",
            version:"CGWEB107",
            read_only:true,
            ...result
          });
        }



        /* CGWEB107_DIRECT_DOWNLOAD_ACTIONS_START */

        if(action==="directory_fit_direct_download"){
          if(req.method!=="POST"){
            return res.status(405).json({ok:false,status:"METHOD_NOT_ALLOWED",error:"POST requis."});
          }

          let body=req.body;
          if(Buffer.isBuffer(body)){
            try{body=JSON.parse(body.toString("utf8"));}catch{body={};}
          }
          if(!body||typeof body!=="object"||Array.isArray(body))body={};

          try{
            return await c107StreamFit(res,uid,body.activity_id);
          }catch(error){
            const http=Math.max(400,Math.min(599,Number(error?.status)||500));
            console.error("FIT_DIRECT_DOWNLOAD001",body.activity_id,error);
            return res.status(http).json({
              ok:false,
              service:"FIT_DIRECT_DOWNLOAD001",
              bypass:"SIGNED_URL_BYPASS001",
              stream:"STORAGE_STREAM_DOWNLOAD001",
              auth_guard:"AUTH_DOWNLOAD_GUARD001",
              error_truth:"DOWNLOAD_ERROR_TRUTH001",
              status:error?.code||"DIRECT_DOWNLOAD_ERROR",
              error:error?.message||String(error)
            });
          }
        }

        /* CGWEB107_DIRECT_DOWNLOAD_ACTIONS_END */

        /* CGWEB108_ORPHAN_AUDIT_ACTIONS_START */

        if(action==="strava_fit_orphan_audit"){
          if(req.method!=="GET" && req.method!=="POST"){
            return res.status(405).json({error:"GET ou POST requis."});
          }

          const result=await c108Audit(uid);

          return res.json({
            ok:true,
            version:"CGWEB108",
            service:"STRAVA_FIT_ORPHAN_AUDIT001",
            reconciliation:"STORAGE_ACTIVITY_RECONCILIATION001",
            preview:"EXACT_FIT_RELINK_PREVIEW001",
            lineage:"STRAVA_IMPORT_LINEAGE001",
            truth:"NO_FIT_TRUTH001",
            read_only:true,
            activities_modified:0,
            fit_metadata_modified:0,
            storage_modified:0,
            ...result
          });
        }

        /* CGWEB108_ORPHAN_AUDIT_ACTIONS_END */

        /* CGWEB109_FIT_TRUTH_ACTIONS_START */

        if(action==="directory_fit_truth_parity"){
          if(req.method!=="GET"){
            return res.status(405).json({
              ok:false,
              error:"GET requis."
            });
          }

          const result=
            await c109DirectoryFitTruthParity(
              uid
            );

          return res.json({
            ok:true,
            version:"CGWEB109",
            service:
              "DIRECTORY_FIT_TRUTH_PARITY001",
            icon_audit:
              "ICON_FALSE_NEGATIVE_AUDIT001",
            bulk:
              "BULK_DOWNLOADABILITY001",
            historical:
              "HISTORICAL_FIT_VISIBILITY001",
            read_only:true,
            activities_modified:0,
            fit_metadata_modified:0,
            storage_modified:0,
            ...result
          });
        }

        if(action==="bulk_downloadability"){
          if(req.method!=="POST"){
            return res.status(405).json({
              ok:false,
              error:"POST requis."
            });
          }

          let body=req.body;

          if(Buffer.isBuffer(body)){
            try{
              body=JSON.parse(
                body.toString("utf8")
              );
            }catch{
              body={};
            }
          }

          if(
            !body ||
            typeof body!=="object" ||
            Array.isArray(body)
          ){
            body={};
          }

          const result=
            await c109BulkDownloadability(
              uid,
              body.activity_ids
            );

          return res.json({
            ok:true,
            version:"CGWEB109",
            service:
              "BULK_DOWNLOADABILITY001",
            read_only:true,
            ...result
          });
        }

        /* CGWEB109_FIT_TRUTH_ACTIONS_END */





/* CGWEB107_SIGN_FORENSICS_ACTIONS_END */

/* CGWEB096_DIRECTORY_DOWNLOAD_ACTIONS_END */






        /* CGWEB099_GLOBAL_DIRECTORY_ACTIONS_START */

        if (
          action ===
          "directory_global_query"
        ) {
          if (
            req.method !== "POST"
          ) {
            return res.status(405).json({
              error:
                "POST requis."
            });
          }

          let body = req.body;

          if (Buffer.isBuffer(body)) {
            try {
              body =
                JSON.parse(
                  body.toString("utf8")
                );
            } catch {
              body = {};
            }
          }

          body =
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
              ? {}
              : body;

          const result =
            await c099GlobalDirectoryQuery(
              uid,
              body
            );

          return res.json({
            ok: true,
            service:
              "GLOBAL_DIRECTORY_QUERY001",
            version:
              "CGWEB099",
            ...result
          });
        }

        if (
          action ===
          "directory_global_activity"
        ) {
          if (
            req.method !== "POST"
          ) {
            return res.status(405).json({
              error:
                "POST requis."
            });
          }

          let body = req.body;

          if (Buffer.isBuffer(body)) {
            try {
              body =
                JSON.parse(
                  body.toString("utf8")
                );
            } catch {
              body = {};
            }
          }

          body =
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
              ? {}
              : body;

          const result =
            await c099GlobalActivity(
              uid,
              body.activity_id
            );

          return res.json({
            ok: true,
            service:
              "GLOBAL_DIRECTORY_QUERY001",
            version:
              "CGWEB099",
            ...result
          });
        }

        if (
          action ===
          "activity_duplicate_audit"
        ) {
          if (
            req.method !== "GET" &&
            req.method !== "POST"
          ) {
            return res.status(405).json({
              error:
                "GET ou POST requis."
            });
          }

          const result =
            await c099DuplicateAudit(
              uid
            );

          return res.json({
            ok: true,
            service:
              "ACTIVITY_DUPLICATE_AUDIT001",
            version:
              "CGWEB099",
            read_only:
              true,
            ...result
          });
        }


        /* CGWEB103_FIT_RECOVERY_ACTIONS_START */

        if (
          action ===
          "fit_recovery_audit"
        ) {
          if (
            req.method !== "GET" &&
            req.method !== "POST"
          ) {
            return res.status(405).json({
              error:
                "GET ou POST requis."
            });
          }

          const result =
            await c103FitRecoveryAudit(
              uid
            );

          return res.json({
            ok:true,
            service:
              "FIT_RECOVERY_AUDIT001",
            lineage_service:
              "SPLIT_LINEAGE_AUDIT001",
            version:
              "CGWEB103",
            read_only:true,
            ...result
          });
        }


        /* CGWEB104_FIT_RECOVERY_PLAN_ACTIONS_START */

        if (
          action ===
          "fit_recovery_plan"
        ) {
          if (
            req.method!=="GET" &&
            req.method!=="POST"
          ) {
            return res.status(405).json({
              error:"GET ou POST requis."
            });
          }

          const result=
            await c104RecoveryPlan(uid);

          return res.json({
            ok:true,
            service:
              "FIT_RECOVERY_PLAN001",
            version:"CGWEB104",
            read_only:true,
            ...result
          });
        }

        if (
          action ===
          "split_parent_restore_prepare"
        ) {
          if (
            req.method!=="POST"
          ) {
            return res.status(405).json({
              error:"POST requis."
            });
          }

          const parentId=
            String(
              req.body?.parent_activity_id ||
              ""
            ).trim();

          const result=
            await c104PrepareParentRestore(
              uid,
              parentId
            );

          return res.json({
            ok:true,
            service:
              "SAFE_RESTORE_PREPARE001",
            restore_service:
              "SPLIT_PARENT_RESTORE001",
            version:"CGWEB104",
            ...result
          });
        }


        /* CGWEB105_JOIN_DISCOVERY_ACTIONS_START */

        if (
          action ===
          "same_day_same_sport_join_candidates"
        ) {
          if (
            req.method!=="GET" &&
            req.method!=="POST"
          ) {
            return res.status(405).json({
              error:"GET ou POST requis."
            });
          }

          const activityId=
            String(
              req.method==="GET"
                ? (
                    req.query?.activity_id ||
                    ""
                  )
                : (
                    req.body?.activity_id ||
                    ""
                  )
            ).trim();

          const result=
            await c105SameDaySameSportCandidates(
              uid,
              activityId
            );

          return res.json({
            ok:true,
            service:
              "JOIN_CANDIDATE_DISCOVERY001",
            join_service:
              "SAME_DAY_SAME_SPORT_JOIN001",
            guard:
              "NON_SPLIT_GUARD001",
            preview:
              "JOIN_PREVIEW001",
            lineage:
              "JOIN_LINEAGE001",
            version:
              "CGWEB105",
            read_only:true,
            ...result
          });
        }

        /* CGWEB105_JOIN_DISCOVERY_ACTIONS_END */

/* CGWEB104_FIT_RECOVERY_PLAN_ACTIONS_END */

/* CGWEB103_FIT_RECOVERY_ACTIONS_END */

/* CGWEB099_GLOBAL_DIRECTORY_ACTIONS_END */

        /* CGWEB097_FIT_ORIGIN_ACTIONS_START */

        if (
          action ===
          "fit_origin_audit"
        ) {
          if (
            req.method !== "GET" &&
            req.method !== "POST"
          ) {
            return res.status(405).json({
              error: "GET ou POST requis."
            });
          }

          const result =
            await c097OriginAudit(uid);

          return res.json({
            ok: true,
            service:
              "CANONICAL_ACTIVITY_AUDIT001",
            version: "CGWEB097",
            read_only: true,
            ...result
          });
        }

        if (
          action ===
          "directory_fit_states"
        ) {
          if (req.method !== "POST") {
            return res.status(405).json({
              error: "POST requis."
            });
          }

          let body = req.body;

          if (Buffer.isBuffer(body)) {
            try {
              body =
                JSON.parse(
                  body.toString("utf8")
                );
            } catch {
              body = {};
            }
          }

          body =
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
              ? {}
              : body;

          const result =
            await c097StatesForActivities(
              uid,
              body.activity_ids
            );

          return res.json({
            ok: true,
            service:
              "DOWNLOAD_STATE_TRUTH001",
            version: "CGWEB097",
            ...result
          });
        }

        /* CGWEB097_FIT_ORIGIN_ACTIONS_END */

        if (action === "global_fit_plan") {
          if (
            req.method !== "GET" &&
            req.method !== "POST"
          ) {
            return res.status(405).json({
              error: "GET ou POST requis."
            });
          }

          const plan =
            await c095BuildPlan(uid);

          return res.json({
            ok: true,
            service:
              "GLOBAL_FIT_COVERAGE001",
            version: "CGWEB095",
            dry_run: true,
            ...c095PublicPlan(plan)
          });
        }

        if (
          action ===
          "original_first_backfill"
        ) {
          if (req.method !== "POST") {
            return res.status(405).json({
              error: "POST requis."
            });
          }

          let body = req.body;

          if (Buffer.isBuffer(body)) {
            try {
              body =
                JSON.parse(
                  body.toString("utf8")
                );
            } catch {
              body = {};
            }
          }

          body =
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
              ? {}
              : body;

          if (
            String(body.confirm || "") !==
            "APPLY_ORIGINAL_FIRST"
          ) {
            return res.status(400).json({
              error:
                "Confirmation APPLY_ORIGINAL_FIRST requise."
            });
          }

          const before =
            await c095BuildPlan(uid);

          c095VerifyToken(body, before);

          const originalResult =
            await c095ApplySafeOriginals(
              uid,
              before
            );

          const after =
            await c095BuildPlan(uid);

          return res.json({
            ok: true,
            service:
              "ORIGINAL_FIRST_BACKFILL001",
            version: "CGWEB095",
            activities_created: 0,
            activities_modified: 0,
            existing_fit_replaced: 0,
            originals:
              originalResult,
            next:
              c095PublicPlan(after)
          });
        }

        if (
          action ===
          "missing_fit_global_batch"
        ) {
          if (req.method !== "POST") {
            return res.status(405).json({
              error: "POST requis."
            });
          }

          let body = req.body;

          if (Buffer.isBuffer(body)) {
            try {
              body =
                JSON.parse(
                  body.toString("utf8")
                );
            } catch {
              body = {};
            }
          }

          body =
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
              ? {}
              : body;

          if (
            String(body.confirm || "") !==
            "APPLY_GLOBAL_FIT_BATCH"
          ) {
            return res.status(400).json({
              error:
                "Confirmation APPLY_GLOBAL_FIT_BATCH requise."
            });
          }

          const before =
            await c095BuildPlan(uid);

          c095VerifyToken(body, before);

          const originalResult =
            await c095ApplySafeOriginals(
              uid,
              before
            );

          const afterOriginals =
            await c095Coverage(uid);

          const limit =
            Math.max(
              1,
              Math.min(
                50,
                Number(body.limit || 25)
              )
            );

          const ids =
            afterOriginals.eligible_ids
              .slice(0, limit);

          const generated =
            await c095GenerateChunk(
              uid,
              ids
            );

          const after =
            await c095BuildPlan(uid);

          const remaining =
            Number(
              after.coverage.summary
                .activities_without_fit_eligible ||
              0
            );

          return res.json({
            ok:
              Number(generated.failed || 0) ===
              0,
            service:
              "MISSING_FIT_GLOBAL_BATCH001",
            version: "CGWEB095",
            activities_created: 0,
            activities_modified: 0,
            existing_fit_replaced: 0,
            originals:
              originalResult,
            generation:
              generated,
            remaining_eligible:
              remaining,
            done:
              remaining === 0,
            next:
              c095PublicPlan(after)
          });
        }

        /* CGWEB095_GLOBAL_FIT_ACTIONS_END */

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

          const incomingRole = c090IncomingRole(source, mode);
          const archiveRoles = c090MergeArchiveRoles(previous, incomingRole);
          const observedSources = c090Strings([
            ...(Array.isArray(previous.observed_sources) ? previous.observed_sources : []),
            previous.source,
            source
          ]);
          const observedModes = c090Strings([
            ...(Array.isArray(previous.observed_modes) ? previous.observed_modes : []),
            previous.upload_mode,
            mode
          ]);
          const historicalOriginalNames = c090Strings([
            ...(Array.isArray(previous.historical_original_names)
              ? previous.historical_original_names
              : []),
            ...(incomingRole === C090_ROLE_ORIGINAL ? [fileName] : [])
          ]);

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
            source: previous.source || source,
            upload_mode: previous.upload_mode || mode,
            observed_sources: observedSources,
            observed_modes: observedModes,
            archive_roles: archiveRoles,
            historical_original_names: historicalOriginalNames,
            has_original_archive: archiveRoles.includes(C090_ROLE_ORIGINAL),
            has_canonical_archive: archiveRoles.some(c090IsCanonicalRole),
            provenance_version: "FIT_RECONCILE001",
            start_time_ms: startMs || previous.start_time_ms || null,
            sport: sport || previous.sport || null,
            sub_sport: subSport || previous.sub_sport || 0,
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
            original_observation_added:
              incomingRole === C090_ROLE_ORIGINAL &&
              !c090Roles(previous).includes(C090_ROLE_ORIGINAL),
            archive_roles: archiveRoles,
            file: metadata,
            activities_created: 0,
            activities_modified: 0
          });
        }


        /* CGWEB085B_FULLARCHIVE001_BACKEND_START */





        /* CGWEB087_FITAUDIT001_BACKEND_START */
        if (action === "audit") {
          if (req.method !== "GET") {
            return res.status(405).json({
              error: "GET requis pour FITAUDIT001."
            });
          }

          const requestedSince = Number(req.query.since_ms || 0);
          const sinceMs =
            Number.isFinite(requestedSince) && requestedSince > 0
              ? requestedSince
              : Date.UTC(2026, 7, 26, 0, 0, 0);

          const requestedDetail = Number(req.query.detail_limit || 500);
          const detailLimit = Math.max(
            20,
            Math.min(
              1000,
              Number.isFinite(requestedDetail)
                ? Math.floor(requestedDetail)
                : 500
            )
          );

          /*
           * CGWEB087 FIX2 · LOWMEM_AUDIT001
           * Les logs ont confirmé un crash V8 heap out of memory.
           * Ici :
           * - aucun QuerySnapshot global ;
           * - activities et activity_files sont lus via .stream() ;
           * - aucun activity_routes n'est lu ;
           * - seuls des objets compacts sont conservés.
           */

          const activityQuery =
            db.collection(`${ROOT}/${uid}/activities`)
              .select(
                "start_time_ms",
                "sport",
                "sub_sport",
                "custom_title",
                "name",
                "title",
                "import_source",
                "source",
                "import_profile",
                "strava_source",
                "created_source",
                "web_source",
                "origin",
                "strava_id",
                "strava_activity_id",
                "deleted_at_ms"
              );

          const fitQuery =
            files(uid)
              .select(
                "activity_id",
                "version_index",
                "parent_sha256",
                "is_active_version",
                "start_time_ms",
                "sport",
                "sub_sport",
                "sha256",
                "file_name",
                "link_status",
                "source",
                "upload_mode",
                "deleted_at_ms"
              );

          const activities = [];
          const activityIds = new Set();

          for await (const docSnap of activityQuery.stream()) {
            const row = docSnap.data() || {};
            if (row.deleted_at_ms != null) continue;

            const compact = {
              __docId: String(docSnap.id),
              start_time_ms: Number(row.start_time_ms || 0),
              sport: Number(row.sport) || 0,
              sub_sport: Number(row.sub_sport) || 0,
              custom_title: String(row.custom_title || ""),
              name: String(row.name || ""),
              title: String(row.title || ""),
              import_source: String(row.import_source || ""),
              source: String(row.source || ""),
              import_profile: String(row.import_profile || ""),
              strava_source: String(row.strava_source || ""),
              created_source: String(row.created_source || ""),
              web_source: String(row.web_source || ""),
              origin: String(row.origin || ""),
              strava_id: row.strava_id ?? null,
              strava_activity_id: row.strava_activity_id ?? null
            };

            activities.push(compact);
            activityIds.add(compact.__docId);
          }

          const linkedByActivity = new Map();
          const orphanFits = [];

          let fitFilesActive = 0;
          let fitRootCount = 0;
          let fitActiveVersionCount = 0;
          let fitUnlinkedCount = 0;
          let fitDanglingCount = 0;

          function compactFit(docSnap, row) {
            return {
              __docId: String(docSnap.id),
              activity_id: String(row.activity_id || "").trim(),
              version_index: Number(row.version_index || 1),
              parent_sha256: String(row.parent_sha256 || "").trim(),
              is_active_version: row.is_active_version === true,
              start_time_ms: Number(row.start_time_ms || 0),
              sport: Number(row.sport) || 0,
              sub_sport: Number(row.sub_sport) || 0,
              sha256: String(row.sha256 || docSnap.id || ""),
              file_name: String(row.file_name || ""),
              link_status: String(row.link_status || ""),
              source: String(row.source || row.upload_mode || "")
            };
          }

          function rank(row) {
            const version = Number(row?.version_index || 1);
            const parent = String(row?.parent_sha256 || "").trim();

            return {
              active: row?.is_active_version === true ? 0 : 1,
              root:
                !parent &&
                (!Number.isFinite(version) || version <= 1)
                  ? 0
                  : 1,
              version: Number.isFinite(version) ? version : 999999
            };
          }

          function better(candidate, current) {
            if (!current) return true;
            const a = rank(candidate);
            const b = rank(current);

            return (
              a.active < b.active ||
              (a.active === b.active && a.root < b.root) ||
              (
                a.active === b.active &&
                a.root === b.root &&
                a.version < b.version
              )
            );
          }

          for await (const docSnap of fitQuery.stream()) {
            const raw = docSnap.data() || {};
            if (raw.deleted_at_ms != null) continue;

            fitFilesActive += 1;
            const row = compactFit(docSnap, raw);

            const version = Number(row.version_index || 1);
            const parent = String(row.parent_sha256 || "").trim();

            if (
              !parent &&
              (!Number.isFinite(version) || version <= 1)
            ) {
              fitRootCount += 1;
            }

            if (row.is_active_version === true) {
              fitActiveVersionCount += 1;
            }

            const activityId = String(row.activity_id || "").trim();

            if (activityId && activityIds.has(activityId)) {
              const state =
                linkedByActivity.get(activityId) || {
                  count: 0,
                  preferred: null
                };

              state.count += 1;
              if (better(row, state.preferred)) {
                state.preferred = row;
              }
              linkedByActivity.set(activityId, state);
            } else {
              if (!activityId) fitUnlinkedCount += 1;
              else fitDanglingCount += 1;
              orphanFits.push(row);
            }
          }

          const orphanBuckets = new Map();

          function bucketMinute(ms) {
            const n = Number(ms || 0);
            return Number.isFinite(n) && n > 0
              ? Math.floor(n / 60000)
              : null;
          }

          function bucketKey(sport, minute) {
            return String(Number(sport) || 0) + "|" + String(minute);
          }

          for (const row of orphanFits) {
            const minute = bucketMinute(row.start_time_ms);
            if (minute == null) continue;

            const key = bucketKey(row.sport, minute);
            const bucket = orphanBuckets.get(key) || [];
            bucket.push(row);
            orphanBuckets.set(key, bucket);
          }

          function nearestOrphanCandidate(activity) {
            const start = Number(activity.start_time_ms || 0);
            if (!Number.isFinite(start) || start <= 0) return null;

            const sport = Number(activity.sport) || 0;
            const center = Math.floor(start / 60000);
            let best = null;

            for (
              let minute = center - 3;
              minute <= center + 3;
              minute += 1
            ) {
              for (const key of [
                bucketKey(sport, minute),
                bucketKey(0, minute)
              ]) {
                const rows = orphanBuckets.get(key) || [];

                for (const row of rows) {
                  const fitSport = Number(row.sport) || 0;

                  if (
                    sport > 0 &&
                    fitSport > 0 &&
                    sport !== fitSport
                  ) {
                    continue;
                  }

                  const fitStart = Number(row.start_time_ms || 0);
                  if (!Number.isFinite(fitStart) || fitStart <= 0) {
                    continue;
                  }

                  const deltaMs = Math.abs(fitStart - start);
                  if (deltaMs > 180000) continue;

                  if (!best || deltaMs < best.delta_ms) {
                    best = {
                      sha256: String(row.sha256 || row.__docId || ""),
                      file_name: String(row.file_name || ""),
                      start_time_ms: fitStart,
                      sport: fitSport,
                      sub_sport: Number(row.sub_sport) || 0,
                      link_status: String(row.link_status || ""),
                      source: String(row.source || ""),
                      delta_ms: deltaMs
                    };
                  }
                }
              }
            }

            return best;
          }

          function sourceLabel(activity) {
            const fields = [
              activity.import_source,
              activity.source,
              activity.import_profile,
              activity.strava_source,
              activity.created_source,
              activity.web_source,
              activity.origin
            ];

            const found =
              fields
                .map((value) => String(value || "").trim())
                .find(Boolean);

            if (found) return found;

            if (
              activity.strava_id != null ||
              activity.strava_activity_id != null
            ) {
              return "STRAVA";
            }

            return "INCONNUE";
          }

          function yearKey(startMs) {
            const n = Number(startMs || 0);
            if (!Number.isFinite(n) || n <= 0) return "unknown";

            const year = new Date(n).getUTCFullYear();
            return Number.isInteger(year) ? String(year) : "unknown";
          }

          const byYear = new Map();
          const details = [];

          let linkedActivityCount = 0;
          let missingActivityCount = 0;
          let candidateActivityCount = 0;

          let recentActivityCount = 0;
          let recentLinkedCount = 0;
          let recentMissingCount = 0;
          let recentCandidateCount = 0;

          for (const activity of activities) {
            const id = String(activity.__docId);
            const state = linkedByActivity.get(id) || null;
            const linkedCount = Number(state?.count || 0);
            const preferred = state?.preferred || null;
            const hasFit = linkedCount > 0;

            const candidate =
              hasFit ? null : nearestOrphanCandidate(activity);

            const startMs = Number(activity.start_time_ms || 0);
            const recent =
              Number.isFinite(startMs) &&
              startMs >= sinceMs;

            if (hasFit) linkedActivityCount += 1;
            else missingActivityCount += 1;

            if (candidate) candidateActivityCount += 1;

            if (recent) {
              recentActivityCount += 1;
              if (hasFit) recentLinkedCount += 1;
              else recentMissingCount += 1;
              if (candidate) recentCandidateCount += 1;
            }

            const year = yearKey(startMs);
            const yearRow =
              byYear.get(year) || {
                year,
                activities: 0,
                linked: 0,
                missing: 0,
                orphan_candidates: 0
              };

            yearRow.activities += 1;
            if (hasFit) yearRow.linked += 1;
            else yearRow.missing += 1;
            if (candidate) yearRow.orphan_candidates += 1;
            byYear.set(year, yearRow);

            if (recent || !hasFit) {
              details.push({
                activity_id: id,
                start_time_ms: startMs || null,
                sport: Number(activity.sport) || 0,
                sub_sport: Number(activity.sub_sport) || 0,
                title: String(
                  activity.custom_title ||
                  activity.name ||
                  activity.title ||
                  ""
                ),
                source: sourceLabel(activity),
                route_present: null,
                route_checked: false,
                fit_status:
                  hasFit
                    ? "LINKED"
                    : (candidate ? "ORPHAN_CANDIDATE" : "ABSENT"),
                linked_fit_count: linkedCount,
                preferred_fit:
                  preferred
                    ? {
                        sha256: String(
                          preferred.sha256 ||
                          preferred.__docId ||
                          ""
                        ),
                        file_name: String(preferred.file_name || ""),
                        version_index: Number(preferred.version_index || 1),
                        is_active_version:
                          preferred.is_active_version === true,
                        source: String(preferred.source || "")
                      }
                    : null,
                orphan_candidate: candidate
              });
            }
          }

          details.sort(
            (a, b) =>
              Number(b.start_time_ms || 0) -
              Number(a.start_time_ms || 0)
          );

          const recentDetails =
            details
              .filter(
                (row) =>
                  Number(row.start_time_ms || 0) >= sinceMs
              )
              .slice(0, detailLimit);

          const gapDetails =
            details
              .filter((row) => row.fit_status !== "LINKED")
              .slice(0, detailLimit);

          const years =
            [...byYear.values()]
              .sort(
                (a, b) =>
                  String(b.year).localeCompare(String(a.year))
              );

          return res.json({
            ok: true,
            service: "FITAUDIT001",
            version: "CGWEB087_FIX2_LOWMEM_AUDIT001",
            readonly: true,
            generated_at_ms: Date.now(),
            since_ms: sinceMs,
            detail_limit: detailLimit,
            summary: {
              activities_active: activities.length,
              fit_files_active: fitFilesActive,
              fit_root_files: fitRootCount,
              fit_active_versions: fitActiveVersionCount,
              activities_with_fit: linkedActivityCount,
              activities_without_fit: missingActivityCount,
              activities_with_orphan_candidate:
                candidateActivityCount,
              fit_orphans_total: orphanFits.length,
              fit_unlinked_no_activity_id: fitUnlinkedCount,
              fit_dangling_activity_id: fitDanglingCount,
              route_scan_mode:
                "DISABLED_FOR_MEMORY_SAFETY",
              routes_checked: 0,
              routes_present_in_checked: 0,
              quick_download_list_limit: 1000,
              quick_download_limit_risk:
                fitFilesActive > 1000
            },
            recent: {
              activities: recentActivityCount,
              linked: recentLinkedCount,
              missing: recentMissingCount,
              orphan_candidates: recentCandidateCount
            },
            by_year: years,
            recent_details: recentDetails,
            gap_details: gapDetails,
            detail_truncated:
              details.length > detailLimit
          });
        }
        /* CGWEB087_FITAUDIT001_BACKEND_END */

        if (action === "list_all") {
          const requested = Math.max(
            1,
            Math.min(10000, Number(req.query.limit || 10000))
          );

          const snap = await files(uid)
            .orderBy("uploaded_at_ms", "desc")
            .limit(requested)
            .get();

          const rows = snap.docs
            .map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() || {})
            }))
            .filter((row) => row.deleted_at_ms == null);

          return res.json({
            ok: true,
            service: "FULLARCHIVE001",
            files: rows,
            count: rows.length
          });
        }
        /* CGWEB085B_FULLARCHIVE001_BACKEND_END */

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
