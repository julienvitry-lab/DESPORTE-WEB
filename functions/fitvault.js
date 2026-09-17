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

          const [
            activitySnap,
            fitSnap,
            routeSnap
          ] = await Promise.all([
            db.collection(`${ROOT}/${uid}/activities`).get(),
            files(uid).get(),
            db.collection(`${ROOT}/${uid}/activity_routes`).get()
          ]);

          const activities = activitySnap.docs
            .map((docSnap) => ({
              __docId: docSnap.id,
              ...(docSnap.data() || {})
            }))
            .filter((row) => row.deleted_at_ms == null);

          const fitRows = fitSnap.docs
            .map((docSnap) => ({
              __docId: docSnap.id,
              ...(docSnap.data() || {})
            }))
            .filter((row) => row.deleted_at_ms == null);

          const routeIds = new Set(
            routeSnap.docs
              .filter((docSnap) => {
                const row = docSnap.data() || {};
                return row.deleted_at_ms == null;
              })
              .map((docSnap) => String(docSnap.id))
          );

          const activityIds = new Set(
            activities.map((row) => String(row.__docId))
          );

          const linkedByActivity = new Map();
          const orphanFits = [];
          let fitRootCount = 0;
          let fitActiveVersionCount = 0;
          let fitUnlinkedCount = 0;
          let fitDanglingCount = 0;

          for (const row of fitRows) {
            const activityId =
              String(row.activity_id || "").trim();

            const versionIndex =
              Number(row.version_index || 1);
            const parent =
              String(row.parent_sha256 || "").trim();

            if (
              !parent &&
              (!Number.isFinite(versionIndex) || versionIndex <= 1)
            ) {
              fitRootCount += 1;
            }

            if (row.is_active_version === true) {
              fitActiveVersionCount += 1;
            }

            if (activityId && activityIds.has(activityId)) {
              const bucket =
                linkedByActivity.get(activityId) || [];
              bucket.push(row);
              linkedByActivity.set(activityId, bucket);
            } else {
              if (!activityId) fitUnlinkedCount += 1;
              else fitDanglingCount += 1;
              orphanFits.push(row);
            }
          }

          const orphanBuckets = new Map();

          function minuteBucket(startMs) {
            const n = Number(startMs || 0);
            if (!Number.isFinite(n) || n <= 0) return null;
            return Math.floor(n / 60000);
          }

          function orphanBucketKey(sport, minute) {
            return String(Number(sport) || 0) + "|" + String(minute);
          }

          for (const row of orphanFits) {
            const minute = minuteBucket(row.start_time_ms);
            if (minute == null) continue;

            const key = orphanBucketKey(row.sport, minute);
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

            for (let minute = center - 3; minute <= center + 3; minute += 1) {
              const keys = [
                orphanBucketKey(sport, minute),
                orphanBucketKey(0, minute)
              ];

              for (const key of keys) {
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
                      source: String(row.source || row.upload_mode || ""),
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

            const found = fields
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
            const linked = linkedByActivity.get(id) || [];
            const hasFit = linked.length > 0;
            const candidate = hasFit
              ? null
              : nearestOrphanCandidate(activity);

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
            const yearRow = byYear.get(year) || {
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
                route_present: routeIds.has(id),
                fit_status: hasFit
                  ? "LINKED"
                  : (candidate ? "ORPHAN_CANDIDATE" : "ABSENT"),
                linked_fit_count: linked.length,
                preferred_fit: linked.length
                  ? {
                      sha256: String(linked[0].sha256 || linked[0].__docId || ""),
                      file_name: String(linked[0].file_name || ""),
                      version_index: Number(linked[0].version_index || 1),
                      is_active_version: linked[0].is_active_version === true,
                      source: String(
                        linked[0].source ||
                        linked[0].upload_mode ||
                        ""
                      )
                    }
                  : null,
                orphan_candidate: candidate
              });
            }
          }

          details.sort((a, b) =>
            Number(b.start_time_ms || 0) -
            Number(a.start_time_ms || 0)
          );

          const recentDetails = details
            .filter((row) =>
              Number(row.start_time_ms || 0) >= sinceMs
            )
            .slice(0, detailLimit);

          const gapDetails = details
            .filter((row) => row.fit_status !== "LINKED")
            .slice(0, detailLimit);

          const years = [...byYear.values()]
            .sort((a, b) =>
              String(b.year).localeCompare(String(a.year))
            );

          return res.json({
            ok: true,
            service: "FITAUDIT001",
            version: "CGWEB087",
            readonly: true,
            generated_at_ms: Date.now(),
            since_ms: sinceMs,
            detail_limit: detailLimit,
            summary: {
              activities_active: activities.length,
              routes_active: routeIds.size,
              fit_files_active: fitRows.length,
              fit_root_files: fitRootCount,
              fit_active_versions: fitActiveVersionCount,
              activities_with_fit: linkedActivityCount,
              activities_without_fit: missingActivityCount,
              activities_with_orphan_candidate: candidateActivityCount,
              fit_orphans_total: orphanFits.length,
              fit_unlinked_no_activity_id: fitUnlinkedCount,
              fit_dangling_activity_id: fitDanglingCount,
              quick_download_list_limit: 1000,
              quick_download_limit_risk:
                fitRows.length > 1000
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
