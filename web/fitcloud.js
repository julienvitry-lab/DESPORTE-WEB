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

function init() {
  node("webFitCloudFiles")?.addEventListener("change", (e) => selectionChanged(e.currentTarget.files));
  node("webFitCloudFolder")?.addEventListener("change", (e) => selectionChanged(e.currentTarget.files));
  node("webFitCloudUploadButton")?.addEventListener("click", () => void uploadHistorical());
  node("webFitCloudRefreshButton")?.addEventListener("click", () => void renderCloud());
  node("webFitWriterTestButton")?.addEventListener("click", () => void testFitWriter());
  selectionChanged([]);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, {once: true});
} else {
  queueMicrotask(init);
}
