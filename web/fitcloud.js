const VAULT_URL = "https://europe-west1-sport-505813.cloudfunctions.net/fitVault";
let selectedFiles = [];
let rows = [];
let busy = false;

function bridge() {
  const value = window.SPORT_WEB_BRIDGE;
  if (!value) throw new Error("Pont SPORT Web indisponible.");
  return value;
}

function node(id) { return document.getElementById(id); }

function canonicalNameMetadata(fileName) {
  const name = String(fileName || "").split(/[\\/]/).pop() || "";
  const match = name.match(/^(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_([CVHTMS])(?:_\d{2})?\.fit$/i);
  if (!match) return {startMs: null, sport: null, subSport: 0};
  const [, y, m, d, hh, mm, ss, rawCode] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  const startMs = Number.isFinite(date.getTime()) ? date.getTime() : null;
  const code = String(rawCode).toUpperCase();
  if (code === "C") return {startMs, sport: 1, subSport: 0};
  if (code === "T") return {startMs, sport: 1, subSport: 21};
  if (code === "V") return {startMs, sport: 2, subSport: 0};
  if (code === "H") return {startMs, sport: 2, subSport: 6};
  if (code === "M") return {startMs, sport: 11, subSport: 0};
  return {startMs, sport: null, subSport: 0};
}

async function fitMetadata(file) {
  const fallback = canonicalNameMetadata(file?.name);
  const buffer = await file.arrayBuffer();
  try {
    const decoded = bridge().decodeFitActivity(buffer, file.name);
    return {
      startMs: Number(decoded?.session?.start_time_ms) || fallback.startMs,
      sport: Number(decoded?.session?.sport) || fallback.sport,
      subSport: Number(decoded?.session?.sub_sport) || fallback.subSport || 0,
      buffer
    };
  } catch (error) {
    return {...fallback, buffer, decodeError: error?.message || String(error)};
  }
}

function loadedActivityMatch(startMs, sport) {
  const b = bridge();
  const start = Number(startMs);
  if (!Number.isFinite(start) || start <= 0) return null;
  const candidates = b.getActivities()
    .filter((activity) => activity?.deleted_at_ms == null)
    .filter((activity) => Math.abs(Number(activity.start_time_ms || 0) - start) <= 180000)
    .filter((activity) => !sport || Number(activity.sport) === Number(sport));
  if (candidates.length !== 1) return null;
  return String(b.activityKey(candidates[0]));
}

async function request(action, options = {}) {
  const user = bridge().getUser();
  if (!user) throw new Error("Connexion SPORT requise.");
  const token = await user.getIdToken();
  const url = new URL(VAULT_URL);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {Authorization: `Bearer ${token}`, ...(options.headers || {})},
    body: options.body
  });
  if (options.binaryResponse) {
    if (!response.ok) throw new Error((await response.text()) || `FIT Cloud ${response.status}`);
    return response.blob();
  }
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; }
  catch { payload = {error: text}; }
  if (!response.ok) throw new Error(payload?.error || `FIT Cloud ${response.status}`);
  return payload;
}

function selectionChanged(files) {
  selectedFiles = [...(files || [])].filter((f) => String(f?.name || "").toLowerCase().endsWith(".fit"));
  const selection = node("webFitCloudSelection");
  const upload = node("webFitCloudUploadButton");
  if (selection) {
    const total = selectedFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
    selection.textContent = selectedFiles.length
      ? `${selectedFiles.length} FIT sélectionné(s) · ${bridge().formatBytes(total)} · 0 activité créée`
      : "Aucun FIT sélectionné.";
  }
  if (upload) upload.disabled = busy || !selectedFiles.length;
}

async function uploadOne(file) {
  const metadata = await fitMetadata(file);
  const activityId = loadedActivityMatch(metadata.startMs, metadata.sport);
  const headers = {
    "Content-Type": "application/vnd.ant.fit",
    "X-Sport-Filename": file.name,
    "X-Sport-Source": "HISTORICAL_PHONE_MIGRATION",
    "X-Sport-Mode": "HISTORICAL_FILE_ONLY"
  };
  if (activityId) headers["X-Sport-Activity-Id"] = activityId;
  if (metadata.startMs) headers["X-Sport-Start-Ms"] = String(metadata.startMs);
  if (metadata.sport) headers["X-Sport-Sport"] = String(metadata.sport);
  if (metadata.subSport != null) headers["X-Sport-Sub-Sport"] = String(metadata.subSport);
  return request("upload", {method: "POST", headers, body: metadata.buffer});
}

async function uploadHistorical() {
  if (busy || !selectedFiles.length) return;
  const files = [...selectedFiles];
  const ok = window.confirm(
    `Importer ${files.length} FIT dans le coffre Cloud ?\n\n` +
    "WEB074 ne crée, ne remplace et ne supprime aucune activité pendant cette migration."
  );
  if (!ok) return;

  busy = true;
  const status = node("webFitCloudStatus");
  const progress = node("webFitCloudProgress");
  const upload = node("webFitCloudUploadButton");
  if (upload) upload.disabled = true;
  if (progress) {
    progress.max = files.length;
    progress.value = 0;
    progress.classList.remove("hidden");
  }

  let fresh = 0, duplicate = 0, failed = 0;
  try {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      if (status) status.textContent = `Migration Cloud ${i + 1}/${files.length} · ${file.name}`;
      try {
        const result = await uploadOne(file);
        if (result?.deduplicated) duplicate += 1;
        else fresh += 1;
      } catch (error) {
        failed += 1;
        console.error("FITCLOUD001 upload", file.name, error);
      }
      if (progress) progress.value = i + 1;
    }
    if (status) status.textContent = `${fresh} nouveau(x) · ${duplicate} doublon(s) évité(s) · ${failed} échec(s) · 0 activité créée.`;
    selectedFiles = [];
    if (node("webFitCloudFiles")) node("webFitCloudFiles").value = "";
    if (node("webFitCloudFolder")) node("webFitCloudFolder").value = "";
    selectionChanged([]);
    await renderCloud();
  } finally {
    busy = false;
    if (progress) progress.classList.add("hidden");
    if (upload) upload.disabled = !selectedFiles.length;
  }
}

function linkLabel(row) {
  if (row?.activity_id) return `Activité #${row.activity_id}`;
  if (row?.link_status === "UNLINKED_AMBIGUOUS") return "Lien ambigu";
  if (row?.link_status === "UNLINKED_NO_MATCH") return "Aucune activité correspondante";
  if (row?.link_status === "UNLINKED_NO_TIME") return "Date FIT non reconnue";
  return "Non lié";
}

async function download(row) {
  const blob = await request("download", {query: {sha256: row.sha256}, binaryResponse: true});
  bridge().triggerBlobDownload(blob, row.file_name || `${row.sha256}.fit`);
}

async function remove(row) {
  const ok = window.confirm(
    `Supprimer du coffre Cloud « ${row.file_name || row.sha256} » ?\n\nL'activité SPORT liée restera intacte.`
  );
  if (!ok) return;
  await request("delete", {method: "POST", query: {sha256: row.sha256}});
  await renderCloud();
}

function renderList() {
  const host = node("webFitCloudList");
  if (!host) return;
  host.innerHTML = "";
  if (!rows.length) {
    host.innerHTML = '<div class="web-files-empty">Aucun FIT dans le coffre Cloud.</div>';
    return;
  }
  for (const row of rows) {
    const card = document.createElement("article");
    card.className = "web-fit-cloud-card";
    card.innerHTML = `
      <div class="web-fit-cloud-card-main">
        <div>
          <strong>${bridge().escapeHtml(row.file_name || "activity.fit")}</strong>
          <small>${bridge().escapeHtml(bridge().formatBytes(row.size_bytes))} · ${bridge().escapeHtml(linkLabel(row))}</small>
        </div>
        <span class="web-file-sha" title="${bridge().escapeHtml(row.sha256 || "")}">${bridge().escapeHtml(String(row.sha256 || "").slice(0, 14))}…</span>
      </div>
      <div class="web-fit-cloud-card-actions">
        <button class="secondary compact web074-download" type="button">Télécharger</button>
        <button class="secondary compact danger-soft web074-delete" type="button">Supprimer Cloud</button>
      </div>`;
    card.querySelector(".web074-download")?.addEventListener("click", () => void download(row));
    card.querySelector(".web074-delete")?.addEventListener("click", () => void remove(row));
    host.appendChild(card);
  }
}

async function renderCloud() {
  const status = node("webFitCloudStatus");
  const badge = node("webFitCloudBadge");
  if (!status || !badge || busy || !bridge().getUser()) return;
  busy = true;
  status.textContent = "Lecture du coffre FIT Cloud…";
  try {
    const health = await request("health");
    const payload = await request("list", {query: {limit: 500}});
    rows = Array.isArray(payload?.files) ? payload.files : [];
    badge.textContent = `${rows.length} FIT Cloud`;
    badge.className = rows.length ? "pill ok" : "pill neutral";
    status.textContent = `${rows.length} FIT distant(s) · ${health?.service || "FITCLOUD001"} privé.`;
    renderList();
  } catch (error) {
    badge.textContent = "Cloud indisponible";
    badge.className = "pill error";
    status.textContent = `FIT Cloud indisponible : ${error?.message || error}`;
  } finally {
    busy = false;
    if (node("webFitCloudUploadButton")) node("webFitCloudUploadButton").disabled = !selectedFiles.length;
  }
}


/* CGWEB075_FITWRITER001_WEB_START */

async function testFitWriter() {
  const status =
    node("webFitCloudStatus");

  const button =
    node("webFitWriterTestButton");

  if (button) button.disabled = true;

  if (status) {
    status.textContent =
      "Test du moteur FIT Garmin…";
  }

  try {
    const result =
      await request(
        "writer_health",
        {method: "POST"}
      );

    if (status) {
      status.textContent =
        `FIT Writer OK · ${result.record_messages || 0} records · ${result.bytes || 0} octets · intégrité ${result.integrity ? "OK" : "KO"}.`;
    }
  } catch (error) {
    if (status) {
      status.textContent =
        `FIT Writer en erreur : ${error?.message || error}`;
    }

    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

/* CGWEB075_FITWRITER001_WEB_END */


/* CGWEB076_FITROUNDTRIP001_WEB_START */
function fitRoundTripCandidateActivities() {
  const b = bridge();
  const rows = Array.isArray(b.getActivities?.()) ? b.getActivities() : [];
  return rows
    .filter((activity) => activity && activity.deleted_at_ms == null)
    .filter((activity) => String(b.activityKey?.(activity) || "").trim())
    .sort((a, bRow) => Number(bRow.start_time_ms || 0) - Number(a.start_time_ms || 0));
}

function fitRoundTripComparison(result, metric) {
  const row = Array.isArray(result?.comparisons)
    ? result.comparisons.find((item) => item?.metric === metric)
    : null;
  return row || null;
}

function fitRoundTripDeltaLabel(row, unit, digits = 1) {
  if (!row?.tested || !Number.isFinite(Number(row.delta))) return "—";
  const value = Number(row.delta);
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)} ${unit}`;
}

async function testFitRoundTrip() {
  const status = node("webFitCloudStatus");
  const button = node("webFitRoundTripButton");
  if (button) button.disabled = true;
  if (status) status.textContent = "Round Trip : recherche d’une activité GPS réelle…";

  try {
    const candidates = fitRoundTripCandidateActivities();
    if (!candidates.length) {
      throw new Error("Aucune activité GPS chargée n’est disponible pour le Round Trip.");
    }

    let lastError = null;
    const tested = candidates.slice(0, 20);

    for (let index = 0; index < tested.length; index += 1) {
      const activity = tested[index];
      const id = String(bridge().activityKey(activity) || "").trim();
      if (!id) continue;

      if (status) {
        status.textContent = `Round Trip : activité #${id} (${index + 1}/${tested.length})…`;
      }

      try {
        const result = await request("roundtrip", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({activity_id: id})
        });

        const duration = fitRoundTripComparison(result, "duration_s");
        const distance = fitRoundTripComparison(result, "distance_m");
        const ascent = fitRoundTripComparison(result, "ascent_m");
        const avgHr = fitRoundTripComparison(result, "avg_hr");
        const maxHr = fitRoundTripComparison(result, "max_hr");
        const preview = Number(result?.source?.previewPointCount || 0);
        const sourcePoints = Number(result?.source?.sourcePointCount || 0);
        const pointLabel = sourcePoints > preview
          ? `${preview}/${sourcePoints} pts`
          : `${preview} pts`;

        await renderCloud();

        if (status) {
          status.textContent =
            `Round Trip OK · #${result.activity_id} · ${pointLabel} · ` +
            `Δ durée ${fitRoundTripDeltaLabel(duration, "s", 2)} · ` +
            `distance ${fitRoundTripDeltaLabel(distance, "m", 2)} · ` +
            `D+ ${fitRoundTripDeltaLabel(ascent, "m", 1)} · ` +
            `FC ${fitRoundTripDeltaLabel(avgHr, "bpm", 0)}/${fitRoundTripDeltaLabel(maxHr, "bpm", 0)} · intégrité OK.`;
          status.title = JSON.stringify(result.comparisons || []);
        }

        return result;
      } catch (error) {
        lastError = error;
        const message = String(error?.message || error || "");
        if (/activity_routes|tracé|points GPS/i.test(message)) continue;
        throw error;
      }
    }

    throw lastError || new Error("Aucune activité récente ne possède un tracé Web exploitable.");
  } catch (error) {
    if (status) status.textContent = `Round Trip en erreur : ${error?.message || error}`;
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}
/* CGWEB076_FITROUNDTRIP001_WEB_END */

/* CGWEB077_FITPIPELINE001_WEB_START */

function fp077Finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fp077FirstFinite(...values) {
  for (const value of values) {
    const n = fp077Finite(value);
    if (n != null) return n;
  }
  return null;
}

function fp077Array(route, ...keys) {
  for (const key of keys) {
    const value = route?.[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function fp077DurationMs(activity) {
  const elapsed = fp077FirstFinite(
    activity?.elapsed_time_ms,
    activity?.duration_ms,
    activity?.timer_time_ms,
    activity?.moving_time_ms
  );
  return elapsed != null && elapsed >= 0 ? elapsed : 0;
}

function fp077TimerMs(activity, elapsedMs) {
  const timer = fp077FirstFinite(
    activity?.timer_time_ms,
    activity?.moving_time_ms,
    elapsedMs
  );
  return timer != null && timer >= 0 ? timer : elapsedMs;
}

function fp077BuildWriterPayload(activity, route, origin = "STRAVA_WEB") {
  const activityId = String(activity?.id ?? activity?.__docId ?? "").trim();
  const startMs = fp077Finite(activity?.start_time_ms);
  const sport = fp077Finite(activity?.sport);
  const subSport = fp077FirstFinite(activity?.sub_sport, activity?.subSport, 0) ?? 0;

  if (!activityId) throw new Error("FITPIPELINE001 : id activité absent.");
  if (startMs == null || startMs <= 0) throw new Error("FITPIPELINE001 : start_time_ms absent.");
  if (sport == null) throw new Error("FITPIPELINE001 : sport absent.");

  const elapsedMs = fp077DurationMs(activity);
  const timerMs = fp077TimerMs(activity, elapsedMs);
  const totalDistance = Math.max(0, fp077FirstFinite(activity?.distance_m, 0) ?? 0);

  const lat = fp077Array(route, "lat", "latitude", "latitudes");
  const lon = fp077Array(route, "lon", "lng", "longitude", "longitudes");
  const alt = fp077Array(route, "alt_m", "altitude_m", "altitude", "altitudes");
  const dist = fp077Array(route, "distance_m", "distance", "distances");
  const times = fp077Array(route, "time_ms", "timestamp_ms", "timestamps_ms");
  const hrs = fp077Array(route, "hr_bpm", "heart_rate_bpm", "heart_rate", "hr");
  const cadence = fp077Array(route, "cadence", "cadence_rpm");
  const power = fp077Array(route, "power", "watts", "power_w");
  const speed = fp077Array(route, "speed_mps", "enhanced_speed_mps", "speed");

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
    .map(fp077Finite)
    .filter((value) => value != null);

  const useRouteTiming =
    finiteTimes.length >= 2 &&
    finiteTimes[finiteTimes.length - 1] > finiteTimes[0];

  const routeStart = useRouteTiming ? finiteTimes[0] : null;
  const routeSpan = useRouteTiming
    ? finiteTimes[finiteTimes.length - 1] - finiteTimes[0]
    : null;

  const finiteDistances = dist
    .map(fp077Finite)
    .filter((value) => value != null && value >= 0);

  const routeLastDistance = finiteDistances.length
    ? finiteDistances[finiteDistances.length - 1]
    : null;

  const points = [];

  for (let i = 0; i < count; i += 1) {
    const progress = count > 1 ? i / (count - 1) : 0;

    let relative = progress;
    const rawTime = fp077Finite(times[i]);
    if (useRouteTiming && rawTime != null && routeSpan > 0) {
      relative = Math.max(0, Math.min(1, (rawTime - routeStart) / routeSpan));
    }

    let pointDistance = fp077Finite(dist[i]);
    if (routeLastDistance != null && routeLastDistance > 0 && pointDistance != null) {
      pointDistance = Math.max(0, pointDistance * (totalDistance / routeLastDistance));
    } else {
      pointDistance = totalDistance * relative;
    }

    const latitude = fp077Finite(lat[i]);
    const longitude = fp077Finite(lon[i]);

    const point = {
      timestamp_ms: startMs + Math.round(elapsedMs * relative),
      distance_m: pointDistance,
      altitude_m: fp077Finite(alt[i]),
      heart_rate: fp077Finite(hrs[i]),
      cadence: fp077Finite(cadence[i]),
      power: fp077Finite(power[i]),
      speed_mps: fp077Finite(speed[i])
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

  /*
   * Strava peut fournir une activité indoor sans lat/lon, voire sans stream.
   * Le FIT reste valide : deux records de synthèse portent la chronologie
   * et la distance de session, sans inventer de coordonnées GPS.
   */
  if (!points.length) {
    points.push({
      timestamp_ms: startMs,
      distance_m: 0,
      heart_rate: fp077Finite(activity?.avg_hr)
    });

    if (elapsedMs > 0) {
      points.push({
        timestamp_ms: startMs + elapsedMs,
        distance_m: totalDistance,
        heart_rate: fp077FirstFinite(activity?.max_hr, activity?.avg_hr)
      });
    }
  } else {
    points[0].timestamp_ms = startMs;
    if (elapsedMs > 0) {
      if (points.length === 1) {
        points.push({
          ...points[0],
          timestamp_ms: startMs + elapsedMs,
          distance_m: totalDistance
        });
      } else {
        points[points.length - 1].timestamp_ms = startMs + elapsedMs;
        points[points.length - 1].distance_m = totalDistance;
      }
    }
  }

  return {
    activity_id: activityId,
    start_time_ms: startMs,
    sport,
    sub_sport: subSport,
    duration_s: elapsedMs / 1000,
    total_timer_time_s: timerMs / 1000,
    distance_m: totalDistance,
    total_ascent_m: fp077Finite(activity?.ascent_m),
    avg_hr: fp077Finite(activity?.avg_hr),
    max_hr: fp077Finite(activity?.max_hr),
    points,
    pipeline_source: String(origin || "STRAVA_WEB"),
    fitpipeline_version: "FITPIPELINE001"
  };
}

async function fp077GenerateStravaFit(activity, route) {
  const payload = fp077BuildWriterPayload(activity, route, "STRAVA_WEB");
  const status = node("webFitCloudStatus");

  if (status) {
    status.textContent = `FIT auto : génération Strava #${payload.activity_id}…`;
  }

  const result = await request("generate", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });

  if (status) {
    status.textContent =
      `FIT auto OK · ${result?.file?.file_name || "FIT canonique"} · ` +
      `${bridge().formatBytes(result?.file?.size_bytes || 0)} · ` +
      `${result?.deduplicated ? "dédupliqué" : "stocké"} · intégrité OK.`;
  }

  return result;
}

async function fp077StoreImportedOriginalFit(file, activity) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("FITPIPELINE001 : fichier FIT source absent.");
  }

  const activityId = String(activity?.id ?? activity?.__docId ?? "").trim();
  if (!activityId) throw new Error("FITPIPELINE001 : id activité importée absent.");

  const buffer = await file.arrayBuffer();
  const startMs = fp077Finite(activity?.start_time_ms);
  const sport = fp077Finite(activity?.sport);
  const subSport = fp077FirstFinite(activity?.sub_sport, activity?.subSport, 0) ?? 0;

  const headers = {
    "Content-Type": "application/vnd.ant.fit",
    "X-Sport-Filename": String(file.name || "activity.fit"),
    "X-Sport-Source": "WEB_MANUAL_FIT_FUTURE",
    "X-Sport-Mode": "FUTURE_IMPORT_ORIGINAL",
    "X-Sport-Activity-Id": activityId
  };

  if (startMs != null) headers["X-Sport-Start-Ms"] = String(startMs);
  if (sport != null) headers["X-Sport-Sport"] = String(sport);
  headers["X-Sport-Sub-Sport"] = String(subSport);

  const status = node("webFitCloudStatus");
  if (status) {
    status.textContent = `FIT auto : archivage original ${file.name || "FIT"}…`;
  }

  const result = await request("upload", {
    method: "POST",
    headers,
    body: buffer
  });

  if (status) {
    status.textContent =
      `FIT original Cloud OK · ${file.name || "activity.fit"} · ` +
      `${bridge().formatBytes(file.size || buffer.byteLength || 0)} · ` +
      `${result?.deduplicated ? "dédupliqué" : "stocké"}.`;
  }

  return result;
}

window.SPORT_FIT_PIPELINE = Object.freeze({
  version: "FITPIPELINE001",
  generateStravaFit: fp077GenerateStravaFit,
  storeImportedOriginalFit: fp077StoreImportedOriginalFit
});

/* CGWEB077_FITPIPELINE001_WEB_END */

function init() {
  node("webFitCloudFiles")?.addEventListener("change", (e) => selectionChanged(e.currentTarget.files));
  node("webFitCloudFolder")?.addEventListener("change", (e) => selectionChanged(e.currentTarget.files));
  node("webFitCloudUploadButton")?.addEventListener("click", () => void uploadHistorical());
  node("webFitCloudRefreshButton")?.addEventListener("click", () => void renderCloud());
  node("webFitWriterTestButton")?.addEventListener("click", () => void testFitWriter());
  node("webFitRoundTripButton")?.addEventListener("click", () => void testFitRoundTrip());
  selectionChanged([]);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, {once: true});
} else {
  queueMicrotask(init);
}
