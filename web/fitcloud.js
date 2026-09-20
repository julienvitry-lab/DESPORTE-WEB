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
    v080RenderDriveState();
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

/* CGWEB078_FITVERSION001_WEB_START */
function v078VersionText(row) {
  const version = Number(row?.version_index || 0);
  if (!version || version <= 1) return "";

  const parts = [`v${version}`];
  const offset = Number(row?.start_offset_s || 0);
  if (Number.isFinite(offset) && offset !== 0) {
    parts.push(`départ ${offset >= 0 ? "+" : ""}${offset}s`);
  }

  if (String(row?.heart_rate_mode || "") === "SIMULATED") {
    const avg = Number(row?.avg_hr_override);
    const max = Number(row?.max_hr_override);
    const fc = [
      Number.isFinite(avg) ? Math.round(avg) : null,
      Number.isFinite(max) ? Math.round(max) : null
    ].filter((value) => value != null);
    parts.push(fc.length ? `FC simulée ${fc.join("/")}` : "FC simulée");
  }

  return ` · ${parts.join(" · ")}`;
}

function v078OptionalNumber(raw, label, min, max) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${label} invalide (${min} à ${max}).`);
  }
  return n;
}

async function v078CreateVersion(row) {
  const status = node("webFitCloudStatus");
  const activityId = String(row?.activity_id || "").trim();

  if (!activityId) {
    throw new Error("Ce FIT n’est lié à aucune activité SPORT.");
  }

  const offsetRaw = window.prompt(
    "Décalage de l’heure de départ en secondes.\n\nExemples : 60 = +1 min ; -30 = -30 s ; 0 = inchangé.",
    "0"
  );
  if (offsetRaw == null) return null;

  const avgRaw = window.prompt(
    "FC moyenne cible (bpm).\n\nLaisser vide pour conserver la FC source.",
    ""
  );
  if (avgRaw == null) return null;

  const maxRaw = window.prompt(
    "FC maximale cible (bpm).\n\nLaisser vide pour conserver la FC source.",
    ""
  );
  if (maxRaw == null) return null;

  const offset = v078OptionalNumber(offsetRaw, "Décalage", -86400, 86400) ?? 0;
  const avgHr = v078OptionalNumber(avgRaw, "FC moyenne", 20, 250);
  const maxHr = v078OptionalNumber(maxRaw, "FC maximale", 20, 260);

  if (avgHr != null && maxHr != null && maxHr < avgHr) {
    throw new Error("La FC maximale doit être supérieure ou égale à la FC moyenne.");
  }

  if (offset === 0 && avgHr == null && maxHr == null) {
    throw new Error("Aucune modification demandée : version non créée.");
  }

  const summary = [
    `Activité #${activityId}`,
    `Décalage départ : ${offset >= 0 ? "+" : ""}${offset}s`,
    avgHr != null || maxHr != null
      ? `FC simulée : ${avgHr ?? "auto"}/${maxHr ?? "auto"} bpm`
      : "FC : source conservée",
    "",
    "Le FIT parent et l’activité SPORT resteront inchangés."
  ].join("\n");

  if (!window.confirm(`Créer une nouvelle version FIT ?\n\n${summary}`)) return null;

  if (status) status.textContent = `FIT version : génération pour activité #${activityId}…`;

  const result = await request("version", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      activity_id: activityId,
      parent_sha256: String(row?.sha256 || ""),
      start_offset_s: offset,
      avg_hr_override: avgHr,
      max_hr_override: maxHr
    })
  });

  await v080MaybeAutoBackupResult(result);
  await renderCloud();

  if (status) {
    status.textContent =
      `FIT version OK · v${result?.version_index || "?"} · ` +
      `${result?.file?.file_name || "FIT"} · ` +
      `activité inchangée · intégrité OK.`;
  }

  return result;
}
/* CGWEB078_FITVERSION001_WEB_END */

/* CGWEB080_FITDRIVE001_WEB_START */
let v080DriveBulkBusy = false;
const v080DriveInFlight = new Set();

function v080DriveApi() {
  return window.SPORT_FIT_DRIVE || null;
}

function v080DriveBacked(row) {
  const sha = String(row?.sha256 || "").toLowerCase();
  return Boolean(
    row?.drive_file_id &&
    sha &&
    String(row?.drive_sha256 || "").toLowerCase() === sha
  );
}

function v080DriveSuffix(row) {
  return v080DriveBacked(row) ? " · Drive ✓" : " · Drive —";
}

function v080DriveButtonLabel(row) {
  return v080DriveBacked(row) ? "Drive ✓" : "Sauvegarder Drive";
}

function v080RenderDriveState() {
  const state = node("webFitDriveState");
  const button = node("webFitDriveBackupMissingButton");
  const drive = v080DriveApi();
  const missing = rows.filter((row) => !v080DriveBacked(row)).length;
  const connected = Boolean(drive?.isConnected?.());

  if (state) {
    state.textContent = connected
      ? `Drive connecté · auto nouveaux FIT actif · ${missing} manquant(s)`
      : `Drive non connecté · ${missing} FIT Cloud sans sauvegarde Drive connue`;
  }
  if (button) {
    button.disabled = v080DriveBulkBusy || !rows.length;
    button.textContent = missing ? `Sauvegarder Drive (${missing})` : "Drive ✓";
  }
}

async function v080MarkDrive(row, remote) {
  const sha = String(row?.sha256 || "").trim().toLowerCase();
  const drive = v080DriveApi();
  const path = String(remote?.drive_path || drive?.pathFor?.(row) || "");
  const result = await request("drive_mark", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      sha256: sha,
      drive_sha256: sha,
      drive_file_id: remote?.id || "",
      drive_file_name: remote?.name || row?.file_name || `${sha}.fit`,
      drive_folder_id: remote?.drive_folder_id || remote?.parents?.[0] || "",
      drive_path: path,
      drive_web_view_link: remote?.webViewLink || "",
      drive_reused: Boolean(remote?.reused)
    })
  });

  if (result?.file) Object.assign(row, result.file);
  return result;
}

async function v080BackupCloudRow(row, {interactive = true} = {}) {
  if (!row?.sha256) throw new Error("FITDRIVE001 : FIT Cloud sans SHA-256.");
  if (v080DriveBacked(row)) return {ok: true, alreadyMarked: true, file: row};

  const sha = String(row.sha256).toLowerCase();
  if (v080DriveInFlight.has(sha)) return {ok: true, inFlight: true};

  const drive = v080DriveApi();
  if (!drive?.backupCloudFitBlob) {
    if (interactive) throw new Error("FITDRIVE001 : module Google Drive indisponible.");
    return {ok: false, skipped: "drive_module_unavailable"};
  }

  if (!drive.isConnected?.()) {
    if (!interactive) return {ok: false, skipped: "drive_not_connected"};
    await drive.connect();
  }
  if (!drive.isConnected?.()) {
    throw new Error("Google Drive n’est pas connecté.");
  }

  v080DriveInFlight.add(sha);
  try {
    const blob = await request("download", {
      query: {sha256: sha},
      binaryResponse: true
    });
    const remote = await drive.backupCloudFitBlob(row, blob);
    await v080MarkDrive(row, remote);
    v080RenderDriveState();
    return {ok: true, remote, file: row};
  } finally {
    v080DriveInFlight.delete(sha);
  }
}

async function v080MaybeAutoBackupResult(result) {
  const row = result?.file;
  const drive = v080DriveApi();
  if (!row?.sha256 || !drive?.isConnected?.()) return {skipped: true};

  try {
    return await v080BackupCloudRow(row, {interactive: false});
  } catch (error) {
    console.warn("FITDRIVE001 auto backup", error);
    return {ok: false, error: String(error?.message || error)};
  }
}

async function v080BackupMissingCloudFits() {
  if (v080DriveBulkBusy) return;
  const drive = v080DriveApi();
  if (!drive?.backupCloudFitBlob) {
    throw new Error("FITDRIVE001 : module Google Drive indisponible.");
  }

  if (!drive.isConnected?.()) await drive.connect();
  if (!drive.isConnected?.()) return;

  const missing = rows.filter((row) => !v080DriveBacked(row));
  if (!missing.length) {
    const status = node("webFitCloudStatus");
    if (status) status.textContent = "Drive OK · tous les FIT Cloud connus sont sauvegardés.";
    v080RenderDriveState();
    return;
  }

  const ok = window.confirm(
    `Sauvegarder ${missing.length} FIT Cloud manquant(s) dans Google Drive ?\n\n` +
    "Arborescence : SPORT/FIT/AAAA/MM\n" +
    "Déduplication : SHA-256\n\n" +
    "Cette action ne modifie aucune activité SPORT."
  );
  if (!ok) return;

  v080DriveBulkBusy = true;
  v080RenderDriveState();
  const status = node("webFitCloudStatus");
  let success = 0;
  let reused = 0;
  let failed = 0;

  try {
    for (let i = 0; i < missing.length; i += 1) {
      const row = missing[i];
      if (status) {
        status.textContent = `Drive ${i + 1}/${missing.length} · ${row.file_name || row.sha256}`;
      }
      try {
        const result = await v080BackupCloudRow(row, {interactive: false});
        if (result?.remote?.reused) reused += 1;
        success += 1;
      } catch (error) {
        failed += 1;
        console.error("FITDRIVE001 batch", row?.file_name, error);
      }
      renderList();
      v080RenderDriveState();
    }

    if (status) {
      status.textContent =
        `Drive terminé · ${success} sauvegardé(s)` +
        (reused ? ` · ${reused} déjà présent(s)` : "") +
        (failed ? ` · ${failed} échec(s)` : "") +
        ".";
    }
  } finally {
    v080DriveBulkBusy = false;
    v080RenderDriveState();
  }
}
/* CGWEB080_FITDRIVE001_WEB_END */



/* CGWEB081_FITQUICKDOWNLOAD001_CLOUD_START */
const V081_QUICK_CACHE_MS = 3000;
let v081QuickLoadedAt = 0;

function v081ActivityKey(value) {
  return String(value ?? "").trim();
}

function v081RootPreference(row) {
  const version = Number(row?.version_index || 1);
  const parent = String(row?.parent_sha256 || "").trim();
  const edited =
    String(row?.version_kind || "").toUpperCase() === "EDITED_CANONICAL";

  const root =
    !parent &&
    (!Number.isFinite(version) || version <= 1) &&
    !edited;

  const active = row?.is_active_version === true;

  return {
    active: active ? 0 : 1,
    root: root ? 0 : 1,
    version: Number.isFinite(version) ? version : 999999,
    uploaded: Number(
      row?.uploaded_at_ms ||
      row?.first_uploaded_at_ms ||
      0
    )
  };
}

function v081RowsForActivity(activityId) {
  const key = v081ActivityKey(activityId);
  if (!key) return [];

  return rows
    .filter((row) => row?.deleted_at_ms == null && v081ActivityKey(row?.activity_id) === key)
    .sort((a, b) => {
      const pa = v081RootPreference(a);
      const pb = v081RootPreference(b);
      return pa.active - pb.active || pa.root - pb.root || pa.version - pb.version || pb.uploaded - pa.uploaded;
    });
}

function v081PreferredRow(activityId) {
  return v081RowsForActivity(activityId)[0] || null;
}

async function v081EnsureQuickRows(force = false) {
  const fresh = v081QuickLoadedAt > 0 && (Date.now() - v081QuickLoadedAt) < V081_QUICK_CACHE_MS;
  if (!force && fresh) return rows;

  const payload = await request("list", {query: {limit: 1000}});
  rows = Array.isArray(payload?.files) ? payload.files : [];
  v081QuickLoadedAt = Date.now();
  window.dispatchEvent(new CustomEvent("sport-fit-quick-updated"));
  return rows;
}

async function v081Availability(activityIds) {
  await v081EnsureQuickRows(false);
  const out = {};
  for (const raw of Array.isArray(activityIds) ? activityIds : []) {
    const key = v081ActivityKey(raw);
    if (!key) continue;
    const row = v081PreferredRow(key);
    out[key] = row ? {
      hasFit: true,
      sha256: String(row.sha256 || ""),
      file_name: String(row.file_name || "activity.fit"),
      version_index: Number(row.version_index || 1),
      root: !row.parent_sha256 && Number(row.version_index || 1) <= 1
    } : {hasFit: false};
  }
  return out;
}

async function v081DownloadActivity(activityId) {
  const key = v081ActivityKey(activityId);
  if (!key) throw new Error("Identifiant d’activité absent.");

  await v081EnsureQuickRows(false);
  let row = v081PreferredRow(key);

  // Un FIT peut venir d'être créé : un second passage forcé évite un faux négatif de cache.
  if (!row) {
    await v081EnsureQuickRows(true);
    row = v081PreferredRow(key);
  }

  if (!row) {
    throw Object.assign(new Error("Aucun FIT Cloud associé à cette activité."), {code: "NO_FIT"});
  }

  await download(row);
  return {
    activity_id: key,
    sha256: String(row.sha256 || ""),
    file_name: String(row.file_name || "activity.fit"),
    version_index: Number(row.version_index || 1),
    parent_sha256: row.parent_sha256 || null
  };
}

window.SPORT_FIT_QUICKDOWNLOAD = Object.freeze({
  version: "FITQUICKDOWNLOAD001",
  availability: v081Availability,
  downloadActivity: v081DownloadActivity,
  refresh: () => v081EnsureQuickRows(true),
  invalidate: () => { v081QuickLoadedAt = 0; },
  preferredRow: (activityId) => v081PreferredRow(activityId)
});

queueMicrotask(() => {
  window.dispatchEvent(new CustomEvent("sport-fit-quick-ready"));
});
/* CGWEB081_FITQUICKDOWNLOAD001_CLOUD_END */

/* CGWEB085A_FIX2_FITCLOUD_API_START */

async function cgweb085aRefreshFitRows(force = true) {
  if (force) v081QuickLoadedAt = 0;
  return v081EnsureQuickRows(Boolean(force));
}

async function cgweb085aDownloadRowBlob(row) {
  const sha = String(row?.sha256 || "").trim();

  if (!sha) {
    throw new Error("SHA-256 FIT absent.");
  }

  const blob = await request(
    "download",
    {
      query: {sha256: sha},
      binaryResponse: true
    }
  );

  return {
    blob,
    fileName: String(row?.file_name || sha + ".fit"),
    row
  };
}

async function cgweb085aAllFitRows() {
  const payload = await request(
    "list_all",
    {
      query: {limit: 10000}
    }
  );

  return Array.isArray(payload?.files)
    ? payload.files
    : [];
}

async function cgweb085aCreateActiveVersion(
  activityId,
  options = {}
) {
  const key = v081ActivityKey(activityId);

  if (!key) {
    throw new Error("Identifiant activité absent.");
  }

  await v081EnsureQuickRows(false);

  let parent = v081PreferredRow(key);

  if (!parent) {
    await v081EnsureQuickRows(true);
    parent = v081PreferredRow(key);
  }

  if (!parent) {
    throw new Error(
      "FITEDITOR001 : aucun FIT Cloud source pour cette activité."
    );
  }

  const result = await request(
    "version",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        activity_id: key,
        parent_sha256: String(parent.sha256 || ""),
        start_offset_s: Number(options.start_offset_s || 0),
        avg_hr_override: options.avg_hr_override ?? null,
        max_hr_override: options.max_hr_override ?? null,
        fit_editor_mode: "FITEDITOR001",
        activate_version: true,
        apply_activity_changes: true
      })
    }
  );

  await v080MaybeAutoBackupResult(result);
  await renderCloud();
  await v081EnsureQuickRows(true);

  return result;
}

window.SPORT_FIT_EDITOR = Object.freeze({
  version: "FITEDITOR001",
  refresh: () => cgweb085aRefreshFitRows(true),
  currentRow: (activityId) => v081PreferredRow(activityId),
  versions: (activityId) => v081RowsForActivity(activityId),
  createActiveVersion: cgweb085aCreateActiveVersion
});

/*
 * Infrastructure utilisée ensuite par CGWEB085B.
 * allRows() ne sera appelée qu'après ajout de l'action list_all.
 */
window.SPORT_FIT_EXPORT = Object.freeze({
  version: "FITEXPORT_API001",
  refresh: () => cgweb085aRefreshFitRows(true),
  preferredRow: (activityId) => v081PreferredRow(activityId),
  rowsForActivity: (activityId) => v081RowsForActivity(activityId),
  allRows: cgweb085aAllFitRows,
  downloadRowBlob: cgweb085aDownloadRowBlob,
  downloadActivityBlob: async (activityId) => {
    const key = v081ActivityKey(activityId);

    await v081EnsureQuickRows(false);

    let row = v081PreferredRow(key);

    if (!row) {
      await v081EnsureQuickRows(true);
      row = v081PreferredRow(key);
    }

    if (!row) {
      throw new Error(
        "Aucun FIT Cloud associé à cette activité."
      );
    }

    return cgweb085aDownloadRowBlob(row);
  }
});

/* CGWEB085A_FIX1_FITCLOUD_API_END */


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
          <small>${bridge().escapeHtml(bridge().formatBytes(row.size_bytes))} · ${bridge().escapeHtml(linkLabel(row))}${bridge().escapeHtml(v078VersionText(row))}${bridge().escapeHtml(v080DriveSuffix(row))}</small>
        </div>
        <span class="web-file-sha" title="${bridge().escapeHtml(row.sha256 || "")}">${bridge().escapeHtml(String(row.sha256 || "").slice(0, 14))}…</span>
      </div>
      <div class="web-fit-cloud-card-actions">
        <button class="secondary compact web074-download" type="button">Télécharger</button>
        <button class="secondary compact web078-version" type="button">Créer version</button>
        <button class="secondary compact web080-drive" type="button">${bridge().escapeHtml(v080DriveButtonLabel(row))}</button>
        <button class="secondary compact danger-soft web074-delete" type="button">Supprimer Cloud</button>
      </div>`;
    card.querySelector(".web074-download")?.addEventListener("click", () => void download(row));
    const driveButtonNode = card.querySelector(".web080-drive");
    if (driveButtonNode) {
      driveButtonNode.disabled = v080DriveBacked(row);
      driveButtonNode.addEventListener("click", () => {
        driveButtonNode.disabled = true;
        driveButtonNode.textContent = "Drive…";
        void v080BackupCloudRow(row, {interactive: true})
          .then(() => {
            driveButtonNode.textContent = "Drive ✓";
            renderList();
            v080RenderDriveState();
          })
          .catch((error) => {
            const status = node("webFitCloudStatus");
            if (status) status.textContent = `Drive en erreur : ${error?.message || error}`;
            driveButtonNode.disabled = false;
            driveButtonNode.textContent = "Réessayer Drive";
          });
      });
    }
    const versionButtonNode = card.querySelector(".web078-version");
    if (versionButtonNode) {
      versionButtonNode.disabled = !row?.activity_id;
      versionButtonNode.title = row?.activity_id
        ? "Créer une nouvelle version FIT sans modifier l’activité"
        : "FIT non lié à une activité SPORT";
      versionButtonNode.addEventListener("click", () => {
        void v078CreateVersion(row).catch((error) => {
          const status = node("webFitCloudStatus");
          if (status) status.textContent = `FIT version en erreur : ${error?.message || error}`;
          console.error("FITVERSION001", error);
        });
      });
    }
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
    v080RenderDriveState();
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

  await v080MaybeAutoBackupResult(result);

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

  await v080MaybeAutoBackupResult(result);

  return result;
}

window.SPORT_FIT_PIPELINE = Object.freeze({
  version: "FITPIPELINE001",
  generateStravaFit: fp077GenerateStravaFit,
  storeImportedOriginalFit: fp077StoreImportedOriginalFit
});

/* CGWEB077_FITPIPELINE001_WEB_END */


/* CGWEB079_FITCUTOVER001_START */
const SPORT_FIT_AUTHORITY = Object.freeze({
  version: "FITCUTOVER001",
  authority: "SPORT_WEB",
  canonicalWriter: "FITWRITER001",
  cloudVault: "FITCLOUD001",
  futureImportPipeline: "FITPIPELINE001",
  versioning: "FITVERSION001",
  androidRole: "FIREBASE_SYNC_ONLY",
  historicalBackfill: false
});

window.SPORT_FIT_AUTHORITY = SPORT_FIT_AUTHORITY;

function v079RenderFitAuthority() {
  const status = node("webFitAuthorityStatus");
  if (!status) return;
  status.textContent = "Pipeline FIT : SPORT Web maître · Coffre FIT Cloud actif";
  status.title = "FITCUTOVER001 · pipeline FIT géré côté Web · aucun backfill historique";
}
/* CGWEB079_FITCUTOVER001_END */


/* CGWEB084_PERIODZIP001_FIT_START */

async function cgweb084DownloadActivityBlob(activityId) {
  const key = v081ActivityKey(activityId);

  if (!key) {
    throw new Error("Identifiant activité absent.");
  }

  await v081EnsureQuickRows(false);

  let row = v081PreferredRow(key);

  if (!row) {
    await v081EnsureQuickRows(true);
    row = v081PreferredRow(key);
  }

  if (!row) {
    throw new Error(
      "Aucun FIT Cloud associé à l’activité #" + key
    );
  }

  const blob = await request(
    "download",
    {
      query: { sha256: row.sha256 },
      binaryResponse: true
    }
  );

  return {
    blob,
    fileName:
      String(row.file_name || key + ".fit"),
    row: { ...row }
  };
}

window.SPORT_FIT_EXPORT = Object.freeze({
  version: "PERIODZIP001",
  refresh: async (force = true) =>
    v081EnsureQuickRows(Boolean(force)),
  preferredRow: (activityId) =>
    v081PreferredRow(activityId),
  downloadActivityBlob:
    cgweb084DownloadActivityBlob
});

/* CGWEB084_PERIODZIP001_FIT_END */







/* CGWEB087_FITAUDIT001_WEB_START */
let cgweb087LastAudit = null;

function cgweb087Node(id) {
  return document.getElementById(id);
}

function cgweb087Escape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cgweb087DateTime(ms) {
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return "—";

  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      dateStyle: "short",
      timeStyle: "short"
    }
  ).format(new Date(n));
}

function cgweb087SportLabel(row) {
  const sport = Number(row?.sport) || 0;
  const sub = Number(row?.sub_sport) || 0;

  const sportLabel = {
    1: "Course",
    2: "Vélo"
  }[sport] || ("Sport " + sport);

  if (sport === 1 && [3, 6].includes(sub)) {
    return "Trail (" + sport + "/" + sub + ")";
  }

  return sportLabel + " (" + sport + "/" + sub + ")";
}

function cgweb087StatusHtml(row) {
  const status = String(row?.fit_status || "");

  if (status === "LINKED") {
    const file = String(
      row?.preferred_fit?.file_name || "FIT lié"
    );

    return (
      '<span class="fit-linked">LIÉ</span><br>' +
      '<span class="muted">' +
      cgweb087Escape(file) +
      "</span>"
    );
  }

  if (status === "ORPHAN_CANDIDATE") {
    const candidate = row?.orphan_candidate || {};
    const seconds = Math.round(
      Number(candidate.delta_ms || 0) / 1000
    );

    return (
      '<span class="fit-candidate">CANDIDAT ORPHELIN</span><br>' +
      '<span class="muted">' +
      cgweb087Escape(candidate.file_name || candidate.sha256 || "") +
      " · Δ " +
      seconds +
      " s</span>"
    );
  }

  return '<span class="fit-absent">ABSENT</span>';
}

function cgweb087RowsTable(rows) {
  const list = Array.isArray(rows) ? rows : [];

  if (!list.length) {
    return '<p class="muted">Aucune ligne.</p>';
  }

  return (
    "<table>" +
    "<thead><tr>" +
    "<th>Date</th>" +
    "<th>Sport</th>" +
    "<th>Source</th>" +
    "<th>Tracé</th>" +
    "<th>FIT</th>" +
    "<th>ID activité</th>" +
    "</tr></thead><tbody>" +
    list.map((row) =>
      "<tr>" +
      "<td>" + cgweb087Escape(cgweb087DateTime(row.start_time_ms)) + "</td>" +
      "<td>" + cgweb087Escape(cgweb087SportLabel(row)) + "</td>" +
      "<td>" + cgweb087Escape(row.source || "—") + "</td>" +
      "<td>" +
      (
        row.route_checked === false
          ? "Non audité"
          : (row.route_present ? "Oui" : "Non")
      ) +
      "</td>" +
      "<td>" + cgweb087StatusHtml(row) + "</td>" +
      '<td class="cgweb087-id">' +
      cgweb087Escape(row.activity_id || "") +
      "</td>" +
      "</tr>"
    ).join("") +
    "</tbody></table>"
  );
}

function cgweb087YearTable(rows) {
  const list = Array.isArray(rows) ? rows : [];

  if (!list.length) {
    return '<p class="muted">Aucune année.</p>';
  }

  return (
    "<table>" +
    "<thead><tr>" +
    "<th>Année</th>" +
    "<th>Activités</th>" +
    "<th>Avec FIT</th>" +
    "<th>Sans FIT</th>" +
    "<th>Candidats orphelins</th>" +
    "</tr></thead><tbody>" +
    list.map((row) =>
      "<tr>" +
      "<td>" + cgweb087Escape(row.year) + "</td>" +
      "<td>" + Number(row.activities || 0) + "</td>" +
      "<td>" + Number(row.linked || 0) + "</td>" +
      "<td>" + Number(row.missing || 0) + "</td>" +
      "<td>" + Number(row.orphan_candidates || 0) + "</td>" +
      "</tr>"
    ).join("") +
    "</tbody></table>"
  );
}

function cgweb087SummaryCards(payload) {
  const summary = payload?.summary || {};
  const recent = payload?.recent || {};

  const cards = [
    ["Activités", summary.activities_active],
    ["FIT Cloud", summary.fit_files_active],
    ["Activités avec FIT", summary.activities_with_fit],
    ["Activités sans FIT", summary.activities_without_fit],
    ["FIT orphelins", summary.fit_orphans_total],
    ["Depuis la date", recent.activities],
    ["Récentes avec FIT", recent.linked],
    ["Récentes sans FIT", recent.missing],
    ["Candidats orphelins récents", recent.orphan_candidates]
  ];

  return cards.map(([label, value]) =>
    '<div class="cgweb087-card">' +
    "<span>" + cgweb087Escape(label) + "</span>" +
    "<strong>" + Number(value || 0) + "</strong>" +
    "</div>"
  ).join("");
}

function cgweb087CsvCell(value) {
  const text = String(value ?? "");
  return '"' + text.replaceAll('"', '""') + '"';
}

function cgweb087BuildCsv(payload) {
  const rows = [
    [
      "activity_id",
      "date",
      "sport",
      "sub_sport",
      "source",
      "route_present",
      "fit_status",
      "linked_fit_count",
      "fit_file_name",
      "orphan_candidate",
      "candidate_delta_s"
    ]
  ];

  const seen = new Set();
  const combined = [
    ...(payload?.recent_details || []),
    ...(payload?.gap_details || [])
  ];

  for (const row of combined) {
    const key = String(row.activity_id || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);

    rows.push([
      key,
      cgweb087DateTime(row.start_time_ms),
      Number(row.sport || 0),
      Number(row.sub_sport || 0),
      row.source || "",
      row.route_present ? "1" : "0",
      row.fit_status || "",
      Number(row.linked_fit_count || 0),
      row.preferred_fit?.file_name || "",
      row.orphan_candidate?.file_name ||
        row.orphan_candidate?.sha256 ||
        "",
      row.orphan_candidate
        ? Math.round(
            Number(row.orphan_candidate.delta_ms || 0) / 1000
          )
        : ""
    ]);
  }

  return rows
    .map((row) => row.map(cgweb087CsvCell).join(";"))
    .join("\n");
}

function cgweb087DownloadCsv() {
  if (!cgweb087LastAudit) return;

  const csv =
    "\uFEFF" + cgweb087BuildCsv(cgweb087LastAudit);

  const blob = new Blob(
    [csv],
    {type: "text/csv;charset=utf-8"}
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download =
    "SPORT_FITAUDIT_" +
    new Date().toISOString().slice(0, 10) +
    ".csv";

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function cgweb087RunAudit() {
  const button = cgweb087Node("cgweb087AuditRun");
  const csvButton = cgweb087Node("cgweb087AuditCsv");
  const status = cgweb087Node("cgweb087AuditStatus");
  const badge = cgweb087Node("cgweb087AuditBadge");

  const sinceInput =
    cgweb087Node("cgweb087AuditSince")?.value || "2026-08-26";

  const limit =
    Number(cgweb087Node("cgweb087AuditLimit")?.value || 500);

  const sinceDate =
    new Date(sinceInput + "T00:00:00");

  if (!Number.isFinite(sinceDate.getTime())) {
    throw new Error("Date d'audit invalide.");
  }

  if (button) button.disabled = true;
  if (csvButton) csvButton.disabled = true;

  if (status) {
    status.textContent =
      "Audit en cours… lecture des activités, routes et FIT Cloud.";
  }

  if (badge) {
    badge.textContent = "Audit…";
  }

  try {
    const payload = await request(
      "audit",
      {
        query: {
          since_ms: sinceDate.getTime(),
          detail_limit: limit
        }
      }
    );

    if (!payload?.ok) {
      throw new Error(
        payload?.error || "Réponse FITAUDIT001 invalide."
      );
    }

    cgweb087LastAudit = payload;

    const summary = payload.summary || {};
    const recent = payload.recent || {};

    const summaryNode =
      cgweb087Node("cgweb087AuditSummary");

    if (summaryNode) {
      summaryNode.innerHTML =
        cgweb087SummaryCards(payload);
    }

    const recentNode =
      cgweb087Node("cgweb087RecentTable");

    if (recentNode) {
      recentNode.innerHTML =
        cgweb087RowsTable(payload.recent_details);
    }

    const gapNode =
      cgweb087Node("cgweb087GapTable");

    if (gapNode) {
      gapNode.innerHTML =
        cgweb087RowsTable(payload.gap_details);
    }

    const yearNode =
      cgweb087Node("cgweb087YearTable");

    if (yearNode) {
      yearNode.innerHTML =
        cgweb087YearTable(payload.by_year);
    }

    const risk =
      summary.quick_download_limit_risk
        ? " · ⚠ plus de 1000 FIT : cache téléchargement rapide à surveiller"
        : "";

    if (status) {
      status.textContent =
        "Audit terminé · " +
        Number(summary.activities_active || 0) +
        " activités · " +
        Number(summary.fit_files_active || 0) +
        " FIT Cloud · " +
        Number(summary.activities_without_fit || 0) +
        " activité(s) sans FIT · depuis la date : " +
        Number(recent.missing || 0) +
        " sans FIT" +
        risk +
        (payload.detail_truncated
          ? " · détails limités à " + Number(payload.detail_limit || 0)
          : "");
    }

    if (badge) {
      badge.textContent =
        Number(summary.activities_without_fit || 0) +
        " sans FIT";
    }

    if (csvButton) csvButton.disabled = false;
  } finally {
    if (button) button.disabled = false;
  }
}

function cgweb087WireAudit() {
  const button = cgweb087Node("cgweb087AuditRun");
  const csvButton = cgweb087Node("cgweb087AuditCsv");

  if (button && button.dataset.cgweb087Wired !== "1") {
    button.dataset.cgweb087Wired = "1";

    button.addEventListener("click", () => {
      void cgweb087RunAudit().catch((error) => {
        console.error("CGWEB087 FITAUDIT001", error);

        const status =
          cgweb087Node("cgweb087AuditStatus");

        const badge =
          cgweb087Node("cgweb087AuditBadge");

        if (status) {
          status.textContent =
            "Audit impossible : " +
            (error?.message || error);
        }

        if (badge) badge.textContent = "Erreur";
      });
    });
  }

  if (
    csvButton &&
    csvButton.dataset.cgweb087Wired !== "1"
  ) {
    csvButton.dataset.cgweb087Wired = "1";
    csvButton.addEventListener(
      "click",
      cgweb087DownloadCsv
    );
  }
}

window.SPORT_FIT_AUDIT = Object.freeze({
  version: "FITAUDIT001/FITGAP001",
  run: cgweb087RunAudit,
  last: () => cgweb087LastAudit
});

queueMicrotask(cgweb087WireAudit);
/* CGWEB087_FITAUDIT001_WEB_END */







/* CGWEB088_FITRECOVERY001_WEB_START */
let cgweb088LastPlan=null, cgweb088Busy=false;
function cgweb088Node(id){return document.getElementById(id);}
function cgweb088Cards(s){
  return [["Activités",s?.activities_active],["Déjà avec FIT",s?.already_with_fit],["FIT manquants",s?.missing_fit],["Reconstructibles",s?.reconstructible],["Insuffisantes",s?.insufficient]]
    .map(([l,v])=>'<div class="cgweb088-card"><span>'+l+'</span><strong>'+Number(v||0)+'</strong></div>').join("");
}
function cgweb088Render(plan){
  cgweb088LastPlan=plan;
  const s=plan?.summary||{};
  const sum=cgweb088Node("cgweb088Summary"), badge=cgweb088Node("cgweb088Badge"), run=cgweb088Node("cgweb088Run"), out=cgweb088Node("cgweb088Results");
  if(sum)sum.innerHTML=cgweb088Cards(s);
  if(badge)badge.textContent=Number(s.reconstructible||0)+" à générer";
  if(run)run.disabled=Number(s.reconstructible||0)<=0;
  if(out){
    const lines=["DRY-RUN · aucune écriture","Prochaines activités :"];
    for(const r of (plan?.next_candidates||[]).slice(0,20))
      lines.push("  "+new Date(Number(r.start_time_ms||0)).toLocaleString("fr-FR")+" · #"+r.activity_id+" · sport "+r.sport+"/"+r.sub_sport);
    if((plan?.insufficient_examples||[]).length){
      lines.push("","Exemples insuffisants :");
      for(const r of plan.insufficient_examples.slice(0,10)) lines.push("  #"+r.activity_id+" · manque "+(r.missing||[]).join(", "));
    }
    out.textContent=lines.join("\n");
  }
}
async function cgweb088Plan(){
  if(cgweb088Busy)return;
  cgweb088Busy=true;
  const p=cgweb088Node("cgweb088Plan"),r=cgweb088Node("cgweb088Run"),st=cgweb088Node("cgweb088Status");
  if(p)p.disabled=true;if(r)r.disabled=true;if(st)st.textContent="Analyse du patrimoine FIT…";
  try{
    const plan=await request("recovery_plan",{query:{limit:50}});
    if(!plan?.ok)throw new Error(plan?.error||"Dry-run invalide.");
    cgweb088Render(plan);
    if(st)st.textContent="Analyse terminée · "+Number(plan.summary?.reconstructible||0)+" reconstructible(s) · "+Number(plan.summary?.insufficient||0)+" insuffisante(s).";
  }finally{cgweb088Busy=false;if(p)p.disabled=false;}
}
async function cgweb088RunBatch(){
  if(cgweb088Busy||!cgweb088LastPlan)return;
  const size=Number(cgweb088Node("cgweb088BatchSize")?.value||25);
  const left=Number(cgweb088LastPlan?.summary?.reconstructible||0);
  if(left<=0)return;
  if(!confirm("Générer "+Math.min(size,left)+" FIT canoniques ?\n\n0 activité modifiée. Aucun FIT existant remplacé."))return;
  cgweb088Busy=true;
  const p=cgweb088Node("cgweb088Plan"),r=cgweb088Node("cgweb088Run"),st=cgweb088Node("cgweb088Status"),out=cgweb088Node("cgweb088Results");
  if(p)p.disabled=true;if(r)r.disabled=true;if(st)st.textContent="Génération du lot…";
  try{
    const x=await request("recovery_batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({batch_size:size})});
    const lines=["FITBACKFILL001 · sélectionnés "+Number(x?.selected||0)+" · stockés "+Number(x?.stored||0)+" · erreurs "+Number(x?.failed||0)];
    for(const row of (x?.results||[])) lines.push((row.ok?"✓ ":"✗ ")+"#"+row.activity_id+" · "+row.status+(row.route_mode?" · "+row.route_mode:"")+(row.error?" · "+row.error:""));
    if(out)out.textContent=lines.join("\n");
    if(st)st.textContent="Lot terminé · "+Number(x?.stored||0)+" FIT ajouté(s) · "+Number(x?.failed||0)+" erreur(s) · 0 activité modifiée.";
  }finally{
    cgweb088Busy=false;if(p)p.disabled=false;
    try{await cgweb088Plan();}catch(error){console.warn("CGWEB088 replan",error);}
  }
}
function cgweb088Wire(){
  const p=cgweb088Node("cgweb088Plan"),r=cgweb088Node("cgweb088Run");
  if(p&&p.dataset.w088!=="1"){p.dataset.w088="1";p.addEventListener("click",()=>void cgweb088Plan().catch(e=>{cgweb088Node("cgweb088Status").textContent="Analyse impossible : "+(e?.message||e);}));}
  if(r&&r.dataset.w088!=="1"){r.dataset.w088="1";r.addEventListener("click",()=>void cgweb088RunBatch().catch(e=>{cgweb088Node("cgweb088Status").textContent="Rattrapage interrompu : "+(e?.message||e);}));}
}
window.SPORT_FIT_RECOVERY=Object.freeze({version:"FITRECOVERY001/FITBACKFILL001",plan:cgweb088Plan,runBatch:cgweb088RunBatch,lastPlan:()=>cgweb088LastPlan});
queueMicrotask(cgweb088Wire);
/* CGWEB088_FITRECOVERY001_WEB_END */



/* CGWEB088_FIX2_FITBACKFILL_AUTO001_WEB_START */

let cgweb088AutoRunning = false;
let cgweb088AutoStopRequested = false;
let cgweb088AutoWakeLock = null;

function cgweb088AutoSetProgress(done, total, label, detail, state="running") {
  const panel = cgweb088Node("cgweb088AutoPanel");
  const bar = cgweb088Node("cgweb088AutoProgressBar");
  const text = cgweb088Node("cgweb088AutoProgressText");
  const pctNode = cgweb088Node("cgweb088AutoPercent");
  const detailNode = cgweb088Node("cgweb088AutoDetail");
  const progress = cgweb088Node("cgweb088AutoProgress");

  const safeTotal = Math.max(0, Number(total || 0));
  const safeDone = Math.max(0, Math.min(safeTotal || Number(done || 0), Number(done || 0)));
  const pct = safeTotal > 0
    ? Math.max(0, Math.min(100, Math.round((safeDone / safeTotal) * 100)))
    : (state === "done" ? 100 : 0);

  if (panel) panel.dataset.state = state;
  if (bar) bar.style.width = pct + "%";
  if (text) text.textContent = label || "";
  if (pctNode) pctNode.textContent = pct + " %";
  if (detailNode) detailNode.textContent = detail || "";
  if (progress) {
    progress.setAttribute("aria-valuenow", String(pct));
    progress.setAttribute("aria-valuetext", label || (pct + " %"));
  }
}

function cgweb088AutoButtons(running) {
  const start = cgweb088Node("cgweb088AutoStart");
  const stop = cgweb088Node("cgweb088AutoStop");
  const plan = cgweb088Node("cgweb088Plan");
  const run = cgweb088Node("cgweb088Run");
  const size = cgweb088Node("cgweb088BatchSize");

  if (start) start.disabled = running;
  if (stop) stop.disabled = !running;
  if (plan) plan.disabled = running;
  if (run) run.disabled = running;
  if (size) size.disabled = running;
}

async function cgweb088AutoAcquireWakeLock() {
  try {
    if ("wakeLock" in navigator && document.visibilityState === "visible") {
      cgweb088AutoWakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (error) {
    console.warn("FITBACKFILL_AUTO001 wake lock", error);
  }
}

async function cgweb088AutoReleaseWakeLock() {
  try {
    if (cgweb088AutoWakeLock) {
      await cgweb088AutoWakeLock.release();
    }
  } catch (error) {
    console.warn("FITBACKFILL_AUTO001 wake release", error);
  } finally {
    cgweb088AutoWakeLock = null;
  }
}

function cgweb088AutoAppendLog(lines, line) {
  lines.push(line);
  if (lines.length > 45) {
    lines.splice(0, lines.length - 45);
  }

  const out = cgweb088Node("cgweb088Results");
  if (out) {
    out.textContent = [
      "FITBACKFILL_AUTO001 · journal des derniers lots",
      "",
      ...lines
    ].join("\n");
    out.scrollTop = out.scrollHeight;
  }
}

async function cgweb088AutoRefreshPlan() {
  const plan = await request("recovery_plan", {query:{limit:50}});
  if (!plan?.ok) {
    throw new Error(plan?.error || "Analyse FITBACKFILL impossible.");
  }
  cgweb088Render(plan);
  return plan;
}

async function cgweb088AutoStart() {
  if (cgweb088AutoRunning || cgweb088Busy) return;

  let plan = await cgweb088AutoRefreshPlan();
  const initialRemaining = Number(plan?.summary?.reconstructible || 0);

  if (initialRemaining <= 0) {
    cgweb088AutoSetProgress(
      0,
      0,
      "Rattrapage terminé",
      "Aucun FIT reconstructible restant.",
      "done"
    );
    return;
  }

  const estimatedLots = Math.ceil(initialRemaining / 50);

  if (!confirm(
    "Rattraper automatiquement " +
    initialRemaining +
    " FIT canoniques ?\n\n" +
    "Traitement séquentiel par lots de 50 (" +
    estimatedLots +
    " lot(s) maximum).\n\n" +
    "0 activité modifiée.\n" +
    "Aucun FIT existant remplacé.\n" +
    "Arrêt automatique à la première erreur."
  )) return;

  cgweb088AutoRunning = true;
  cgweb088AutoStopRequested = false;
  cgweb088AutoButtons(true);
  await cgweb088AutoAcquireWakeLock();

  const log = [];
  let totalStored = 0;
  let lot = 0;
  let previousRemaining = initialRemaining;

  cgweb088AutoSetProgress(
    0,
    initialRemaining,
    "Démarrage du rattrapage automatique…",
    initialRemaining + " FIT à générer · lots de 50",
    "running"
  );

  try {
    while (true) {
      if (cgweb088AutoStopRequested) {
        cgweb088AutoSetProgress(
          totalStored,
          initialRemaining,
          "Arrêt demandé",
          "Aucun nouveau lot ne sera lancé.",
          "stopped"
        );
        break;
      }

      const remaining = Number(plan?.summary?.reconstructible || 0);

      if (remaining <= 0) {
        cgweb088AutoSetProgress(
          initialRemaining,
          initialRemaining,
          "Rattrapage terminé",
          totalStored + " FIT généré(s) pendant cette session.",
          "done"
        );
        break;
      }

      lot += 1;
      const batchSize = Math.min(50, remaining);

      cgweb088AutoSetProgress(
        totalStored,
        initialRemaining,
        "Lot " + lot + " en cours…",
        batchSize + " FIT · " + remaining + " restant(s) avant ce lot",
        "running"
      );

      const x = await request("recovery_batch", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({batch_size: batchSize})
      });

      const selected = Number(x?.selected || 0);
      const stored = Number(x?.stored || 0);
      const already = Number(x?.already_present || 0);
      const failed = Number(x?.failed || 0);

      if (!x?.ok || failed > 0) {
        const firstError = (x?.results || []).find(row => !row?.ok);
        throw new Error(
          "Lot " + lot + " : " +
          failed + " erreur(s)" +
          (firstError?.activity_id ? " · activité #" + firstError.activity_id : "") +
          (firstError?.error ? " · " + firstError.error : "")
        );
      }

      totalStored += stored;

      cgweb088AutoAppendLog(
        log,
        "✓ Lot " + lot +
        " · sélectionnés " + selected +
        " · stockés " + stored +
        (already ? " · déjà présents " + already : "")
      );

      plan = await cgweb088AutoRefreshPlan();

      const nextRemaining = Number(plan?.summary?.reconstructible || 0);
      const progressed = previousRemaining - nextRemaining;

      if (nextRemaining > 0 && progressed <= 0) {
        throw new Error(
          "Protection anti-boucle : aucun progrès après le lot " + lot + "."
        );
      }

      previousRemaining = nextRemaining;

      const effectiveDone =
        Math.max(
          totalStored,
          initialRemaining - nextRemaining
        );

      cgweb088AutoSetProgress(
        effectiveDone,
        initialRemaining,
        nextRemaining > 0
          ? "Lot " + lot + " terminé"
          : "Rattrapage terminé",
        nextRemaining > 0
          ? nextRemaining + " FIT restant(s)"
          : totalStored + " FIT généré(s) pendant cette session.",
        nextRemaining > 0 ? "running" : "done"
      );

      if (nextRemaining <= 0) {
        break;
      }

      if (cgweb088AutoStopRequested) {
        cgweb088AutoSetProgress(
          effectiveDone,
          initialRemaining,
          "Rattrapage arrêté proprement",
          nextRemaining + " FIT restant(s). Tu peux reprendre plus tard.",
          "stopped"
        );
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 350));
    }
  } catch (error) {
    console.error("FITBACKFILL_AUTO001", error);

    cgweb088AutoSetProgress(
      Math.max(totalStored, initialRemaining - previousRemaining),
      initialRemaining,
      "Rattrapage interrompu sur erreur",
      error?.message || String(error),
      "error"
    );

    cgweb088AutoAppendLog(
      log,
      "✗ ARRÊT · " + (error?.message || String(error))
    );

    const st = cgweb088Node("cgweb088Status");
    if (st) {
      st.textContent =
        "Automatique interrompu : " +
        (error?.message || String(error));
    }
  } finally {
    cgweb088AutoRunning = false;
    cgweb088AutoStopRequested = false;
    cgweb088AutoButtons(false);
    await cgweb088AutoReleaseWakeLock();

    try {
      plan = await cgweb088AutoRefreshPlan();
    } catch (error) {
      console.warn("FITBACKFILL_AUTO001 final plan", error);
    }

    const start = cgweb088Node("cgweb088AutoStart");
    const remaining = Number(plan?.summary?.reconstructible || 0);
    if (start) {
      start.textContent =
        remaining > 0
          ? "Reprendre tout le rattrapage"
          : "Rattrapage terminé";
      start.disabled = remaining <= 0;
    }

    const run = cgweb088Node("cgweb088Run");
    if (run) {
      run.disabled = remaining <= 0;
    }
  }
}

function cgweb088AutoStop() {
  if (!cgweb088AutoRunning) return;

  cgweb088AutoStopRequested = true;

  const stop = cgweb088Node("cgweb088AutoStop");
  if (stop) stop.disabled = true;

  const detail = cgweb088Node("cgweb088AutoDetail");
  if (detail) {
    detail.textContent =
      "Arrêt demandé : le lot actuellement en cours se termine, puis le traitement s'arrête.";
  }
}

function cgweb088AutoWire() {
  const start = cgweb088Node("cgweb088AutoStart");
  const stop = cgweb088Node("cgweb088AutoStop");

  if (start && start.dataset.w088fix2 !== "1") {
    start.dataset.w088fix2 = "1";
    start.addEventListener("click", () => {
      void cgweb088AutoStart().catch(error => {
        console.error("FITBACKFILL_AUTO001 start", error);
        cgweb088AutoSetProgress(
          0,
          0,
          "Démarrage impossible",
          error?.message || String(error),
          "error"
        );
      });
    });
  }

  if (stop && stop.dataset.w088fix2 !== "1") {
    stop.dataset.w088fix2 = "1";
    stop.addEventListener("click", cgweb088AutoStop);
  }

  document.addEventListener("visibilitychange", () => {
    if (
      cgweb088AutoRunning &&
      document.visibilityState === "visible" &&
      !cgweb088AutoWakeLock
    ) {
      void cgweb088AutoAcquireWakeLock();
    }
  });
}

window.SPORT_FIT_BACKFILL_AUTO = Object.freeze({
  version: "FITBACKFILL_AUTO001",
  start: cgweb088AutoStart,
  stop: cgweb088AutoStop,
  running: () => cgweb088AutoRunning
});

queueMicrotask(cgweb088AutoWire);

/* CGWEB088_FIX2_FITBACKFILL_AUTO001_WEB_END */



/* CGWEB088_FIX3_FITBACKFILL_ERROR_DIAGNOSTIC001_WEB_START */

let cgweb088DiagLast=null;
let cgweb088DiagBusy=false;

function cgweb088DiagFailedMetrics(row) {
  const metrics=row?.validation?.metrics;
  if (!metrics || typeof metrics!=="object") return [];

  return Object.entries(metrics)
    .filter(([,ok])=>ok===false)
    .map(([name])=>name);
}

function cgweb088DiagLineForRow(row,index) {
  const lines=[];
  const id=String(row?.activity_id??"?");
  const status=String(row?.status||"UNKNOWN");
  const route=String(row?.route_mode||"-");

  lines.push(
    (row?.ok ? "✓ " : "✗ ") +
    "#" + id +
    " · " + status +
    " · route " + route
  );

  if (row?.error) {
    lines.push("    erreur      : "+String(row.error));
  }

  if (row?.conflict_activity_id) {
    lines.push(
      "    conflit avec: #"+
      String(row.conflict_activity_id)
    );
  }

  if (row?.sha256) {
    lines.push("    sha256      : "+String(row.sha256));
  }

  if (row?.fit_signature) {
    lines.push(
      "    signature   : "+
      String(row.fit_signature)
    );
  }

  if (row?.fit_signature_serial!=null) {
    lines.push(
      "    serial FIT  : "+
      String(row.fit_signature_serial)
    );
  }

  if (row?.validation) {
    lines.push(
      "    structure   : "+
      (
        row.validation.structure_ok===true
          ? "OK"
          : "ECHEC"
      )
    );

    const failedMetrics=cgweb088DiagFailedMetrics(row);

    lines.push(
      "    métriques   : "+
      (
        failedMetrics.length
          ? "ECHEC -> "+failedMetrics.join(", ")
          : "OK"
      )
    );

    const normalized=Array.isArray(row.validation.normalized_fields)
      ? row.validation.normalized_fields
      : [];

    if (normalized.length) {
      lines.push(
        "    normalisé   : "+
        normalized.join(", ")
      );
    }
  }

  const d=row?.decoded;

  if (d && typeof d==="object") {
    lines.push(
      "    FIT décodé  : "+
      [
        "start="+(d.start_ms??"-"),
        "sport="+(d.sport??"-")+"/"+(d.sub_sport??"-"),
        "durée="+(d.duration_s??"-")+"s",
        "distance="+(d.distance_m??"-")+"m",
        "D+="+(d.ascent_m??"-")+"m",
        "FC="+(d.avg_hr??"-")+"/"+(d.max_hr??"-"),
        "records="+(d.records??"-"),
        "laps="+(d.laps??"-"),
        "sessions="+(d.sessions??"-"),
        "activities="+(d.activities??"-"),
        "integrity="+String(Boolean(d.integrity))
      ].join(" · ")
    );

    if (Array.isArray(d.errors) && d.errors.length) {
      lines.push(
        "    decoder     : "+
        d.errors.join(" | ")
      );
    }
  }

  return lines.join("\n");
}

function cgweb088DiagFormat(data) {
  const rows=Array.isArray(data?.results)
    ? data.results
    : [];

  const failed=rows.filter(row=>!row?.ok);
  const valid=rows.filter(
    row=>row?.ok && row?.status==="VALID"
  );

  const lines=[
    "FITBACKFILL_ERROR_DIAGNOSTIC001",
    "================================",
    "Mode             : DRY-RUN / LECTURE SEULE",
    "Écritures        : "+Number(data?.writes||0),
    "Activités modif. : "+Number(data?.activities_modified||0),
    "FIT créés        : "+Number(data?.fit_files_created||0),
    "Sélectionnés     : "+Number(data?.selected||0),
    "Valides          : "+valid.length,
    "Échecs           : "+failed.length,
    "Restants         : "+Number(data?.remaining_reconstructible||0),
    ""
  ];

  if (!failed.length) {
    lines.push(
      "Aucune erreur détectée parmi les "+
      Number(data?.selected||0)+
      " prochains FIT."
    );
  } else {
    lines.push(
      "ERREURS DÉTECTÉES",
      "------------------"
    );

    failed.forEach((row,index)=>{
      if (index) lines.push("");
      lines.push(
        cgweb088DiagLineForRow(row,index)
      );
    });
  }

  lines.push(
    "",
    "RÉSUMÉ DES FIT VALIDES",
    "----------------------"
  );

  for (const row of valid.slice(0,10)) {
    lines.push(
      "✓ #"+row.activity_id+
      " · "+String(row.route_mode||"-")+
      " · "+String(row.sha256||"").slice(0,16)+"…"
    );
  }

  if (valid.length>10) {
    lines.push(
      "… "+(valid.length-10)+
      " autre(s) FIT valide(s)."
    );
  }

  return lines.join("\n");
}

async function cgweb088RunDiagnostic() {
  if (cgweb088DiagBusy || cgweb088AutoRunning) return;

  cgweb088DiagBusy=true;

  const panel=cgweb088Node("cgweb088DiagPanel");
  const run=cgweb088Node("cgweb088DiagRun");
  const copy=cgweb088Node("cgweb088DiagCopy");
  const status=cgweb088Node("cgweb088DiagStatus");
  const badge=cgweb088Node("cgweb088DiagBadge");
  const out=cgweb088Node("cgweb088DiagResults");

  if (run) run.disabled=true;
  if (copy) copy.disabled=true;
  if (panel) {
    panel.dataset.state="";
    panel.dataset.hasResults="0";
  }
  if (badge) badge.textContent="Analyse…";
  if (status) {
    status.textContent=
      "Diagnostic des 50 prochains FIT manquants… aucune écriture.";
  }
  if (out) out.textContent="";

  try {
    const data=await request(
      "recovery_diagnose",
      {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({batch_size:50})
      }
    );

    if (!data?.ok) {
      throw new Error(
        data?.error||
        "Diagnostic backend invalide."
      );
    }

    cgweb088DiagLast=data;

    const failed=Number(data?.failed||0);

    if (out) {
      out.textContent=cgweb088DiagFormat(data);
    }

    if (panel) {
      panel.dataset.hasResults="1";
      panel.dataset.state=
        failed>0 ? "error" : "ok";
    }

    if (badge) {
      badge.textContent=
        failed>0
          ? failed+" erreur(s)"
          : "0 erreur";
    }

    if (status) {
      status.textContent=
        "Diagnostic terminé · "+
        Number(data?.selected||0)+
        " testé(s) · "+
        failed+
        " erreur(s) · 0 écriture.";
    }

    if (copy) copy.disabled=false;
  } catch(error) {
    console.error(
      "FITBACKFILL_ERROR_DIAGNOSTIC001",
      error
    );

    if (panel) panel.dataset.state="error";
    if (badge) badge.textContent="Erreur";
    if (status) {
      status.textContent=
        "Diagnostic impossible : "+
        (error?.message||String(error));
    }
    throw error;
  } finally {
    cgweb088DiagBusy=false;
    if (run) run.disabled=false;
  }
}

async function cgweb088CopyDiagnostic() {
  if (!cgweb088DiagLast) return;

  const text=cgweb088DiagFormat(
    cgweb088DiagLast
  );

  try {
    await navigator.clipboard.writeText(text);

    const status=cgweb088Node(
      "cgweb088DiagStatus"
    );

    if (status) {
      status.textContent=
        "Diagnostic copié dans le presse-papiers.";
    }
  } catch(error) {
    console.warn(
      "Copie diagnostic impossible",
      error
    );

    const out=cgweb088Node(
      "cgweb088DiagResults"
    );

    if (out) {
      const range=document.createRange();
      range.selectNodeContents(out);
      const sel=window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

function cgweb088DiagWire() {
  const run=cgweb088Node("cgweb088DiagRun");
  const copy=cgweb088Node("cgweb088DiagCopy");

  if (run && run.dataset.w088fix3!=="1") {
    run.dataset.w088fix3="1";
    run.addEventListener(
      "click",
      ()=>void cgweb088RunDiagnostic()
        .catch(()=>{})
    );
  }

  if (copy && copy.dataset.w088fix3!=="1") {
    copy.dataset.w088fix3="1";
    copy.addEventListener(
      "click",
      ()=>void cgweb088CopyDiagnostic()
    );
  }
}

window.SPORT_FIT_ERROR_DIAGNOSTIC=
  Object.freeze({
    version:"FITBACKFILL_ERROR_DIAGNOSTIC001",
    run:cgweb088RunDiagnostic,
    last:()=>cgweb088DiagLast,
    format:()=>cgweb088DiagLast
      ? cgweb088DiagFormat(cgweb088DiagLast)
      : ""
  });

queueMicrotask(cgweb088DiagWire);

/* CGWEB088_FIX3_FITBACKFILL_ERROR_DIAGNOSTIC001_WEB_END */






/* CGWEB088_FIX4_FITRECOVERY_NORMALIZE001_WEB_START */
window.SPORT_FIT_RECOVERY_NORMALIZE=Object.freeze({
  version:"FITRECOVERY_NORMALIZE001"
});
/* CGWEB088_FIX4_FITRECOVERY_NORMALIZE001_WEB_END */


/* CGWEB090_HISTORICAL_FIT_TRANSFER001_WEB_START */

let c090SelectedFiles = [];
let c090Prepared = [];
let c090Busy = false;
let c090StopRequested = false;
let c090WakeLock = null;

function c090Node(id) {
  return document.getElementById(id);
}

function c090FormatBytes(value) {
  try {
    return bridge().formatBytes(Number(value || 0));
  } catch {
    return Number(value || 0) + " o";
  }
}

function c090Cards(hostId, rows) {
  const host = c090Node(hostId);
  if (!host) return;

  host.innerHTML = rows.map(([label, value]) =>
    '<div class="cgweb090-card">' +
      '<span>' + bridge().escapeHtml(label) + '</span>' +
      '<strong>' + bridge().escapeHtml(String(value ?? 0)) + '</strong>' +
    '</div>'
  ).join("");
}

function c090SetProgress(done, total, text) {
  const p = c090Node("cgweb090Progress");
  const label = c090Node("cgweb090ProgressText");
  const pct = c090Node("cgweb090Percent");

  const safeTotal = Math.max(1, Number(total || 1));
  const safeDone = Math.max(0, Math.min(safeTotal, Number(done || 0)));
  const percent = Math.round((safeDone / safeTotal) * 100);

  if (p) {
    p.max = safeTotal;
    p.value = safeDone;
  }
  if (label) label.textContent = text || "";
  if (pct) pct.textContent = percent + " %";
}

async function c090AcquireWakeLock() {
  try {
    if ("wakeLock" in navigator && document.visibilityState === "visible") {
      c090WakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (error) {
    console.warn("CGWEB090 wake lock", error);
  }
}

async function c090ReleaseWakeLock() {
  try {
    if (c090WakeLock) await c090WakeLock.release();
  } catch (_) {
  } finally {
    c090WakeLock = null;
  }
}

async function c090Sha256(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function c090FallbackMetadata(fileName) {
  if (typeof canonicalNameMetadata === "function") {
    return canonicalNameMetadata(fileName);
  }
  return {startMs:null, sport:null, subSport:0};
}

async function c090PrepareOne(file) {
  const buffer = await file.arrayBuffer();
  const sha256 = await c090Sha256(buffer);
  const fallback = c090FallbackMetadata(file?.name);

  let startMs = fallback.startMs;
  let sport = fallback.sport;
  let subSport = fallback.subSport || 0;
  let decodeError = null;

  try {
    const decoded = bridge().decodeFitActivity(buffer, file.name);
    startMs = Number(decoded?.session?.start_time_ms) || startMs || null;
    sport = Number(decoded?.session?.sport) || sport || null;
    subSport = Number(decoded?.session?.sub_sport) || subSport || 0;
  } catch (error) {
    decodeError = error?.message || String(error);
  }

  return {
    file,
    sha256,
    startMs,
    sport,
    subSport,
    decodeError,
    preflight:null
  };
}

async function c090PreflightBatch(items) {
  const x = await request(
    "historical_preflight",
    {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        hashes:items.map((item) => item.sha256)
      })
    }
  );

  const map = new Map(
    (x?.items || []).map((row) => [
      String(row.sha256 || ""),
      row
    ])
  );

  for (const item of items) {
    item.preflight =
      map.get(item.sha256) ||
      {
        sha256:item.sha256,
        status:"MISSING",
        needs_upload:true
      };
  }
}

function c090SelectionChanged(fileList) {
  c090SelectedFiles = [...(fileList || [])]
    .filter((file) =>
      String(file?.name || "").toLowerCase().endsWith(".fit")
    );

  c090Prepared = [];

  const totalBytes = c090SelectedFiles.reduce(
    (sum, file) => sum + Number(file.size || 0),
    0
  );

  const selection = c090Node("cgweb090Selection");
  const prepare = c090Node("cgweb090Prepare");
  const transfer = c090Node("cgweb090Transfer");
  const badge = c090Node("cgweb090Badge");

  if (selection) {
    selection.textContent =
      c090SelectedFiles.length
        ? c090SelectedFiles.length + " FIT · " +
          c090FormatBytes(totalBytes) +
          " · analyse SHA-256 requise"
        : "Aucun FIT sélectionné.";
  }

  if (prepare) prepare.disabled = !c090SelectedFiles.length || c090Busy;
  if (transfer) transfer.disabled = true;

  if (badge) {
    badge.textContent =
      c090SelectedFiles.length
        ? c090SelectedFiles.length + " sélectionnés"
        : "Non préparé";
  }

  c090Cards("cgweb090TransferSummary", []);
  c090SetProgress(0, 1, "En attente");
}

async function c090PrepareArchive() {
  if (c090Busy || !c090SelectedFiles.length) return;

  c090Busy = true;
  c090StopRequested = false;

  const prepare = c090Node("cgweb090Prepare");
  const transfer = c090Node("cgweb090Transfer");
  const badge = c090Node("cgweb090Badge");

  if (prepare) prepare.disabled = true;
  if (transfer) transfer.disabled = true;

  c090Prepared = new Array(c090SelectedFiles.length);

  try {
    for (let i = 0; i < c090SelectedFiles.length; i += 1) {
      const file = c090SelectedFiles[i];

      c090SetProgress(
        i,
        c090SelectedFiles.length,
        "Analyse " + (i + 1) + "/" + c090SelectedFiles.length + " · " + file.name
      );

      c090Prepared[i] = await c090PrepareOne(file);

      if ((i + 1) % 20 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    for (let start = 0; start < c090Prepared.length; start += 100) {
      const batch = c090Prepared.slice(start, start + 100);

      c090SetProgress(
        start,
        c090Prepared.length,
        "Préflight Cloud " + (start + 1) + "–" +
          Math.min(start + batch.length, c090Prepared.length)
      );

      await c090PreflightBatch(batch);
    }

    /* CGWEB091_TRANSFER_AUDIT001_PREPARE_DEDUP_START */
    const c091UniquePreparedMap = new Map();

    for (const item of c090Prepared) {
      const hash = String(item?.sha256 || "");
      if (!hash || c091UniquePreparedMap.has(hash)) continue;
      c091UniquePreparedMap.set(hash, item);
    }

    const c091UniquePrepared = [...c091UniquePreparedMap.values()];
    const c091InternalDuplicates =
      c090Prepared.length - c091UniquePrepared.length;
    /* CGWEB091_TRANSFER_AUDIT001_PREPARE_DEDUP_END */

    const missing = c091UniquePrepared.filter(
      (item) =>
        item.preflight?.status === "MISSING" ||
        item.preflight?.status === "DELETED_METADATA"
    ).length;

    const observation = c091UniquePrepared.filter(
      (item) =>
        item.preflight?.status === "EXISTS_NEEDS_ORIGINAL_OBSERVATION"
    ).length;

    const already = c091UniquePrepared.filter(
      (item) =>
        item.preflight?.status === "ALREADY_ARCHIVED_ORIGINAL"
    ).length;

    const decodeErrors = c091UniquePrepared.filter(
      (item) => item.decodeError
    ).length;

    const useful = missing + observation;

    c090Cards(
      "cgweb090TransferSummary",
      [
        ["Sélectionnés", c090Prepared.length],
        ["SHA uniques", c091UniquePrepared.length],
        ["Doublons internes", c091InternalDuplicates],
        ["Nouveaux à stocker", missing],
        ["Doublons canoniques à marquer original", observation],
        ["Originaux déjà archivés", already],
        ["Décodage partiel", decodeErrors],
        ["À envoyer", useful]
      ]
    );

    c090SetProgress(
      c090Prepared.length,
      c090Prepared.length,
      "Analyse terminée"
    );

    if (badge) {
      badge.textContent =
        useful
          ? useful + " à transférer"
          : "Archive déjà transférée";
    }

    if (transfer) transfer.disabled = useful <= 0;
  } finally {
    c090Busy = false;
    if (prepare) prepare.disabled = !c090SelectedFiles.length;
  }
}

async function c090UploadPrepared(item) {
  const buffer = await item.file.arrayBuffer();

  const headers = {
    "Content-Type":"application/vnd.ant.fit",
    "X-Sport-Filename":item.file.name,
    "X-Sport-Source":"HISTORICAL_ARCHIVE_TRANSFER",
    "X-Sport-Mode":"HISTORICAL_ORIGINAL"
  };

  if (item.startMs) {
    headers["X-Sport-Start-Ms"] = String(item.startMs);
  }

  if (item.sport) {
    headers["X-Sport-Sport"] = String(item.sport);
  }

  headers["X-Sport-Sub-Sport"] = String(item.subSport || 0);

  return request(
    "upload",
    {
      method:"POST",
      headers,
      body:buffer
    }
  );
}

async function c090TransferArchive() {
  if (c090Busy || !c090Prepared.length) return;

  /* CGWEB091_TRANSFER_AUDIT001_QUEUE_DEDUP_START */
  const rawQueue = c090Prepared.filter(
    (item) => item.preflight?.needs_upload === true
  );

  const c091SeenQueueHashes = new Set();
  const queue = rawQueue.filter((item) => {
    const hash = String(item?.sha256 || "");
    if (!hash || c091SeenQueueHashes.has(hash)) return false;
    c091SeenQueueHashes.add(hash);
    return true;
  });
  /* CGWEB091_TRANSFER_AUDIT001_QUEUE_DEDUP_END */

  if (!queue.length) {
    await c090RunReconcile();
    return;
  }

  const ok = window.confirm(
    "Transférer " + queue.length + " FIT historique(s) utile(s) ?\n\n" +
    "Les FIT déjà archivés comme originaux sont ignorés.\n" +
    "Un original identique à un FIT canonique est conservé comme provenance supplémentaire.\n" +
    "Aucun FIT canonique n'est supprimé ou remplacé.\n" +
    "0 activité créée / 0 activité modifiée."
  );

  if (!ok) return;

  c090Busy = true;
  c090StopRequested = false;

  const prepare = c090Node("cgweb090Prepare");
  const transfer = c090Node("cgweb090Transfer");
  const stop = c090Node("cgweb090Stop");
  const badge = c090Node("cgweb090Badge");

  if (prepare) prepare.disabled = true;
  if (transfer) transfer.disabled = true;
  if (stop) stop.disabled = false;

  await c090AcquireWakeLock();

  let fresh = 0;
  let duplicate = 0;
  let observed = 0;
  let failed = 0;
  let completed = 0;

  const errors = [];
  let cursor = 0;
  const workerCount = Math.min(2, queue.length);

  async function worker() {
    while (true) {
      if (c090StopRequested) return;

      const index = cursor++;
      if (index >= queue.length) return;

      const item = queue[index];

      try {
        const result = await c090UploadPrepared(item);

        if (result?.deduplicated) duplicate += 1;
        else fresh += 1;

        if (result?.original_observation_added) {
          observed += 1;
        }

        item.preflight = {
          ...(item.preflight || {}),
          needs_upload:false,
          status:"TRANSFERRED"
        };
      } catch (error) {
        failed += 1;
        errors.push({
          name:item.file.name,
          sha256:item.sha256,
          error:error?.message || String(error)
        });
      } finally {
        completed += 1;

        c090SetProgress(
          completed,
          queue.length,
          "Transfert " + completed + "/" + queue.length +
          " · " + (item?.file?.name || "")
        );

        c090Cards(
          "cgweb090TransferSummary",
          [
            ["À envoyer", queue.length],
            ["Terminés", completed],
            ["Nouveaux stockés", fresh],
            ["Doublons exacts", duplicate],
            ["Provenances original ajoutées", observed],
            ["Échecs", failed]
          ]
        );
      }
    }
  }

  try {
    await Promise.all(
      Array.from({length:workerCount}, () => worker())
    );

    const details = c090Node("cgweb090TransferErrors");
    const list = c090Node("cgweb090TransferErrorList");

    if (errors.length) {
      if (details) {
        details.classList.remove("hidden");
        details.open = true;
      }

      if (list) {
        list.textContent = errors
          .map(
            (row) =>
              "✗ " + row.name +
              " · " + row.sha256.slice(0, 16) +
              "… · " + row.error
          )
          .join("\n");
      }
    } else {
      if (details) details.classList.add("hidden");
      if (list) list.textContent = "";
    }

    if (badge) {
      badge.textContent =
        c090StopRequested
          ? "Transfert arrêté proprement"
          : (failed ? failed + " échec(s)" : "Transfert terminé");
    }

    await c090RunReconcile();
  } finally {
    c090Busy = false;
    if (stop) stop.disabled = true;
    if (prepare) prepare.disabled = !c090SelectedFiles.length;
    if (transfer) transfer.disabled = true;
    await c090ReleaseWakeLock();
  }
}

function c090Stop() {
  if (!c090Busy) return;
  c090StopRequested = true;

  const stop = c090Node("cgweb090Stop");
  if (stop) stop.disabled = true;

  const badge = c090Node("cgweb090Badge");
  if (badge) badge.textContent = "Arrêt demandé";
}

function c090ExampleLine(row) {
  const date =
    row?.start_time_ms
      ? new Date(Number(row.start_time_ms)).toLocaleString("fr-FR")
      : "date inconnue";

  return (
    (row?.file_name || row?.activity_id || row?.sha256 || "?") +
    " · " + date +
    (row?.link_status ? " · " + row.link_status : "")
  );
}

async function c090RunReconcile() {
  const status = c090Node("cgweb090ReconcileStatus");
  const button = c090Node("cgweb090Reconcile");

  if (button) button.disabled = true;
  if (status) status.textContent = "Réconciliation du coffre en cours…";

  try {
    const x = await request("fit_reconcile");
    const s = x?.summary || {};

    c090Cards(
      "cgweb090ReconcileSummary",
      [
        ["Activités", s.activities_active],
        ["Avec au moins un FIT", s.activities_with_any_fit],
        ["Avec original", s.activities_with_original],
        ["Original + canonique", s.activities_with_both],
        ["Canonique uniquement", s.activities_canonical_only],
        ["Original uniquement", s.activities_original_only],
        ["Sans FIT", s.activities_without_fit],
        ["FIT originaux", s.original_files],
        ["Canoniques backfill", s.canonical_backfill_files],
        ["Canoniques autres", s.canonical_generated_files],
        ["Versions éditées", s.edited_version_files],
        ["Originaux non liés", s.unlinked_original_files],
        ["Originaux ambigus", s.ambiguous_original_files]
      ]
    );

    const canonical = c090Node("cgweb090CanonicalOnlyList");
    if (canonical) {
      const rows = s.canonical_only_examples || [];
      canonical.textContent =
        rows.length
          ? rows.map(
              (row) =>
                "#" + row.activity_id +
                " · " + row.canonical_count + " FIT canonique(s)"
            ).join("\n")
          : "Aucune activité uniquement canonique.";
    }

    const unlinked = c090Node("cgweb090UnlinkedList");
    if (unlinked) {
      const rows = s.unlinked_original_examples || [];
      unlinked.textContent =
        rows.length
          ? rows.map(c090ExampleLine).join("\n")
          : "Aucun FIT original non lié.";
    }

    if (status) {
      status.textContent =
        "Réconciliation terminée · " +
        Number(s.activities_with_original || 0) + "/" +
        Number(s.activities_active || 0) +
        " activité(s) disposent d'au moins un original · " +
        Number(s.activities_canonical_only || 0) +
        " reposent uniquement sur un canonique.";
    }

    return x;
  } catch (error) {
    if (status) {
      status.textContent =
        "Réconciliation impossible : " +
        (error?.message || String(error));
    }
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

function c090Wire() {
  const folder = c090Node("cgweb090Folder");
  const files = c090Node("cgweb090Files");
  const prepare = c090Node("cgweb090Prepare");
  const transfer = c090Node("cgweb090Transfer");
  const stop = c090Node("cgweb090Stop");
  const reconcile = c090Node("cgweb090Reconcile");

  if (folder && folder.dataset.c090 !== "1") {
    folder.dataset.c090 = "1";
    folder.addEventListener(
      "change",
      (event) => c090SelectionChanged(event.currentTarget.files)
    );
  }

  if (files && files.dataset.c090 !== "1") {
    files.dataset.c090 = "1";
    files.addEventListener(
      "change",
      (event) => c090SelectionChanged(event.currentTarget.files)
    );
  }

  if (prepare && prepare.dataset.c090 !== "1") {
    prepare.dataset.c090 = "1";
    prepare.addEventListener(
      "click",
      () => void c090PrepareArchive().catch((error) => {
        const badge = c090Node("cgweb090Badge");
        if (badge) badge.textContent = "Analyse interrompue";
        console.error("HISTORICAL_FIT_TRANSFER001 prepare", error);
      })
    );
  }

  if (transfer && transfer.dataset.c090 !== "1") {
    transfer.dataset.c090 = "1";
    transfer.addEventListener(
      "click",
      () => void c090TransferArchive().catch((error) => {
        console.error("HISTORICAL_FIT_TRANSFER001 transfer", error);
      })
    );
  }

  if (stop && stop.dataset.c090 !== "1") {
    stop.dataset.c090 = "1";
    stop.addEventListener("click", c090Stop);
  }

  if (reconcile && reconcile.dataset.c090 !== "1") {
    reconcile.dataset.c090 = "1";
    reconcile.addEventListener(
      "click",
      () => void c090RunReconcile().catch(() => {})
    );
  }

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        c090Busy &&
        document.visibilityState === "visible" &&
        !c090WakeLock
      ) {
        void c090AcquireWakeLock();
      }
    }
  );
}

window.SPORT_HISTORICAL_FIT_TRANSFER = Object.freeze({
  version:"HISTORICAL_FIT_TRANSFER001",
  reconcileVersion:"FIT_RECONCILE001",
  prepare:c090PrepareArchive,
  transfer:c090TransferArchive,
  reconcile:c090RunReconcile,
  stop:c090Stop
});

queueMicrotask(c090Wire);

/* CGWEB090_HISTORICAL_FIT_TRANSFER001_WEB_END */



/* CGWEB091_FIT_RECONCILE_RESOLVE001_WEB_START */

let c091LastResolve = null;
let c091AuditFiles = [];
let c091AuditBusy = false;

function c091Node(id) {
  return document.getElementById(id);
}

function c091Escape(value) {
  return bridge().escapeHtml(String(value ?? ""));
}

function c091Cards(hostId, rows) {
  const host = c091Node(hostId);
  if (!host) return;

  host.innerHTML = rows.map(([label, value]) =>
    '<div class="cgweb091-card">' +
      '<span>' + c091Escape(label) + '</span>' +
      '<strong>' + c091Escape(value ?? 0) + '</strong>' +
    '</div>'
  ).join("");
}

function c091Date(ms) {
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return "date inconnue";
  return new Date(n).toLocaleString("fr-FR");
}

function c091Delta(ms) {
  const n = Number(ms || 0);
  const sign = n > 0 ? "+" : "";
  const seconds = Math.round(n / 1000);

  if (Math.abs(seconds) < 60) {
    return sign + seconds + " s";
  }

  const minutes = Math.round(seconds / 60);

  if (Math.abs(minutes) < 60) {
    return (minutes > 0 ? "+" : "") + minutes + " min";
  }

  const hours = Math.round((minutes / 60) * 10) / 10;
  return (hours > 0 ? "+" : "") + hours + " h";
}

function c091StrategyLabel(value) {
  const key = String(value || "");

  if (key === "STRICT_3MIN") return "±3 min";
  if (key === "NEAR_15MIN") return "±15 min";
  if (key.startsWith("TZ_SHIFT_")) {
    return "décalage fuseau " + key.replace("TZ_SHIFT_", "");
  }
  if (key === "WIDE_6H") return "fenêtre manuelle ±6 h";
  return key || "candidat";
}

function c091RenderResolve(data) {
  c091LastResolve = data;

  const summary = data?.summary || {};
  const badge = c091Node("cgweb091Badge");
  const status = c091Node("cgweb091Status");
  const auto = c091Node("cgweb091AutoRepair");

  c091Cards(
    "cgweb091Summary",
    [
      ["Originaux non liés", summary.unresolved_original_files],
      ["Candidat unique ±3 min", summary.unique_strict_candidates],
      ["Ambigus ±3 min", summary.ambiguous_strict],
      ["Candidats élargis", summary.manual_extended],
      ["Sans candidat", summary.no_candidate],
      ["Activités canonique uniquement", summary.canonical_only_activities],
      ["Canonique-only avec candidat", summary.canonical_only_with_candidate]
    ]
  );

  if (badge) {
    badge.textContent =
      Number(summary.unresolved_original_files || 0) +
      " non lié(s)";
  }

  if (status) {
    status.textContent =
      "Analyse terminée · " +
      Number(summary.unresolved_original_files || 0) +
      " FIT original(aux) non lié(s) · " +
      Number(summary.canonical_only_activities || 0) +
      " activité(s) uniquement canoniques.";
  }

  if (auto) {
    auto.disabled =
      Number(summary.unique_strict_candidates || 0) <= 0;
  }

  c091RenderUnresolved(data?.unresolved || []);
  c091RenderCanonicalOnly(data?.canonical_only || []);
}

function c091RenderUnresolved(rows) {
  const host = c091Node("cgweb091UnresolvedList");
  if (!host) return;

  host.innerHTML = "";

  if (!rows.length) {
    host.innerHTML =
      '<div class="muted">Aucun FIT original non lié 🎯</div>';
    return;
  }

  for (const row of rows) {
    const card = document.createElement("article");
    card.className = "cgweb091-item";

    const candidates =
      Array.isArray(row.candidates)
        ? row.candidates
        : [];

    const options = candidates.map((candidate) => {
      const label =
        c091StrategyLabel(candidate.strategy) +
        " · " +
        c091Date(candidate.start_time_ms) +
        " · Δ " +
        c091Delta(candidate.delta_ms) +
        " · #" +
        candidate.activity_id +
        " · " +
        (candidate.title || "");

      return (
        '<option value="' +
        c091Escape(candidate.activity_id) +
        '">' +
        c091Escape(label) +
        '</option>'
      );
    }).join("");

    card.innerHTML =
      '<div class="cgweb091-item-head">' +
        '<div class="cgweb091-item-main">' +
          '<strong>' +
            c091Escape(row.file_name || row.sha256) +
          '</strong>' +
          '<small>' +
            c091Escape(c091Date(row.start_time_ms)) +
            ' · sport ' +
            c091Escape(row.sport ?? "-") +
            '/' +
            c091Escape(row.sub_sport ?? "-") +
            ' · ' +
            c091Escape(row.link_status || "UNLINKED") +
          '</small>' +
          '<small class="muted">' +
            c091Escape(row.resolution_class || "") +
            ' · SHA ' +
            c091Escape(String(row.sha256 || "").slice(0, 16)) +
            '…' +
          '</small>' +
        '</div>' +
        '<span class="pill neutral">' +
          c091Escape(candidates.length) +
          ' candidat(s)' +
        '</span>' +
      '</div>' +
      '<div class="cgweb091-item-controls">' +
        '<select class="cgweb091-candidate" ' +
          (candidates.length ? "" : "disabled") +
        '>' +
          (candidates.length
            ? options
            : '<option>Aucun candidat proposé</option>') +
        '</select>' +
        '<button class="secondary cgweb091-link" type="button" ' +
          (candidates.length ? "" : "disabled") +
        '>Lier cet original</button>' +
      '</div>';

    const select = card.querySelector(".cgweb091-candidate");
    const button = card.querySelector(".cgweb091-link");

    button?.addEventListener("click", () => {
      const activityId = select?.value || "";
      if (!activityId) return;

      const candidate =
        candidates.find(
          (item) =>
            String(item.activity_id) === String(activityId)
        );

      const ok = window.confirm(
        "Rattacher ce FIT original à l'activité #" +
        activityId +
        " ?\n\n" +
        "Méthode : " +
        c091StrategyLabel(candidate?.strategy) +
        "\nÉcart horaire : " +
        c091Delta(candidate?.delta_ms) +
        "\n\nAucune activité ne sera modifiée."
      );

      if (!ok) return;

      void c091RepairOne(
        row.sha256,
        activityId
      );
    });

    host.appendChild(card);
  }
}

function c091RenderCanonicalOnly(rows) {
  const host = c091Node("cgweb091CanonicalOnlyList");
  if (!host) return;

  host.innerHTML = "";

  if (!rows.length) {
    host.innerHTML =
      '<div class="muted">Aucune activité uniquement canonique.</div>';
    return;
  }

  for (const row of rows) {
    const card = document.createElement("article");
    card.className = "cgweb091-item";

    const candidates =
      Array.isArray(row.candidate_originals)
        ? row.candidate_originals
        : [];

    card.innerHTML =
      '<div class="cgweb091-item-head">' +
        '<div class="cgweb091-item-main">' +
          '<strong>#' +
            c091Escape(row.activity_id) +
            ' · ' +
            c091Escape(row.title || "") +
          '</strong>' +
          '<small>' +
            c091Escape(c091Date(row.start_time_ms)) +
            ' · sport ' +
            c091Escape(row.sport ?? "-") +
            '/' +
            c091Escape(row.sub_sport ?? "-") +
          '</small>' +
        '</div>' +
        '<span class="pill neutral">' +
          c091Escape(row.candidate_original_count || 0) +
          ' original(aux) candidat(s)' +
        '</span>' +
      '</div>' +
      (candidates.length
        ? '<small class="muted">' +
          c091Escape(
            candidates
              .map(
                (item) =>
                  item.file_name +
                  " · " +
                  c091StrategyLabel(item.strategy) +
                  " · Δ " +
                  c091Delta(item.delta_ms)
              )
              .join(" | ")
          ) +
          '</small>'
        : '');

    host.appendChild(card);
  }
}

async function c091Resolve() {
  const status = c091Node("cgweb091Status");
  const button = c091Node("cgweb091Resolve");

  if (button) button.disabled = true;
  if (status) status.textContent = "Analyse des correspondances…";

  try {
    const data = await request("reconcile_resolve");
    c091RenderResolve(data);
    return data;
  } catch (error) {
    if (status) {
      status.textContent =
        "Analyse impossible : " +
        (error?.message || String(error));
    }
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

async function c091RepairOne(sha256, activityId) {
  const data = await request(
    "original_match_repair",
    {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        sha256,
        activity_id:activityId
      })
    }
  );

  const status = c091Node("cgweb091Status");

  if (status) {
    status.textContent =
      "Rattachement enregistré · #" +
      data.activity_id +
      " · " +
      c091StrategyLabel(data.strategy) +
      " · 0 activité modifiée.";
  }

  await c091Resolve();
  await c091CloudAudit();

  return data;
}

async function c091AutoRepair() {
  const count =
    Number(
      c091LastResolve?.summary
        ?.unique_strict_candidates || 0
    );

  if (!count) return;

  const ok = window.confirm(
    "Réparer automatiquement " +
    count +
    " correspondance(s) ayant exactement un candidat à ±3 minutes ?\n\n" +
    "Aucune activité ne sera modifiée."
  );

  if (!ok) return;

  const button = c091Node("cgweb091AutoRepair");
  if (button) button.disabled = true;

  try {
    const data = await request(
      "original_match_repair_auto",
      {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:"{}"
      }
    );

    const status = c091Node("cgweb091Status");
    if (status) {
      status.textContent =
        "Réparation automatique terminée · " +
        Number(data?.repaired || 0) +
        " lié(s) · " +
        Number(data?.failed || 0) +
        " échec(s).";
    }

    await c091Resolve();
    await c091CloudAudit();
  } finally {
    if (button) button.disabled = false;
  }
}

function c091SessionLine(row) {
  return (
    c091Date(row.start_ms) +
    " → " +
    c091Date(row.end_ms) +
    " · " +
    Number(row.unique_docs || 0) +
    " document(s) originaux uniques"
  );
}

async function c091CloudAudit() {
  const button = c091Node("cgweb091CloudAudit");
  const log = c091Node("cgweb091CloudAuditLog");

  if (button) button.disabled = true;

  try {
    const data = await request("transfer_audit");
    const s = data?.summary || {};

    c091Cards(
      "cgweb091CloudAuditSummary",
      [
        ["FIT actifs", s.fit_files_active],
        ["SHA originaux uniques", s.original_unique_sha],
        ["SHA canoniques uniques", s.canonical_unique_sha],
        ["SHA original + canonique", s.dual_role_sha],
        ["Originaux liés", s.original_linked_files],
        ["Originaux non liés", s.original_unlinked_files],
        ["Liens pendants", s.original_dangling_files],
        ["Activités avec original", s.activities_with_original],
        ["Activités multi-originaux", s.activities_with_multiple_originals],
        ["Originaux supplémentaires sur activité déjà couverte", s.extra_linked_original_files]
      ]
    );

    if (log) {
      const sessions =
        Array.isArray(s.recent_original_sessions)
          ? s.recent_original_sessions
          : [];

      const lines = [
        "TRANSFER_AUDIT001",
        "=================",
        "Identité SHA original = liés + non liés + pendants : " +
          (s.original_accounting_ok ? "OK" : "ECHEC"),
        "Documents originaux avec plusieurs noms connus : " +
          Number(s.original_docs_multiple_names || 0),
        "Rôles inconnus : " +
          Number(s.unknown_role_files || 0),
        "Max originaux pour une activité : " +
          Number(s.max_originals_for_one_activity || 0),
        "",
        "Sessions récentes estimées depuis uploaded_at_ms :",
        ...(sessions.length
          ? sessions.map(c091SessionLine)
          : ["Aucune session détectée."])
      ];

      log.textContent = lines.join("\n");
    }

    return data;
  } finally {
    if (button) button.disabled = false;
  }
}

async function c091Sha256(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);

  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function c091AuditSetProgress(done, total, text) {
  const p = c091Node("cgweb091AuditProgress");
  const label = c091Node("cgweb091AuditProgressText");
  const pct = c091Node("cgweb091AuditPercent");

  const safeTotal = Math.max(1, Number(total || 1));
  const safeDone = Math.max(
    0,
    Math.min(safeTotal, Number(done || 0))
  );
  const percent =
    Math.round((safeDone / safeTotal) * 100);

  if (p) {
    p.max = safeTotal;
    p.value = safeDone;
  }
  if (label) label.textContent = text || "";
  if (pct) pct.textContent = percent + " %";
}

function c091AuditFolderChanged(files) {
  c091AuditFiles = [...(files || [])]
    .filter((file) =>
      String(file?.name || "")
        .toLowerCase()
        .endsWith(".fit")
    );

  const selection =
    c091Node("cgweb091AuditFolderSelection");
  const run =
    c091Node("cgweb091AuditFolderRun");

  const bytes =
    c091AuditFiles.reduce(
      (sum, file) =>
        sum + Number(file.size || 0),
      0
    );

  if (selection) {
    selection.textContent =
      c091AuditFiles.length
        ? (
            c091AuditFiles.length +
            " FIT · " +
            bridge().formatBytes(bytes) +
            " · audit sans transfert"
          )
        : "Aucun dossier sélectionné.";
  }

  if (run) {
    run.disabled =
      !c091AuditFiles.length ||
      c091AuditBusy;
  }

  c091AuditSetProgress(0, 1, "En attente");
  c091Cards("cgweb091AuditFolderSummary", []);

  const dup = c091Node("cgweb091DuplicateList");
  if (dup) dup.textContent = "Non analysé.";
}

async function c091AuditFolder() {
  if (
    c091AuditBusy ||
    !c091AuditFiles.length
  ) {
    return;
  }

  c091AuditBusy = true;

  const run =
    c091Node("cgweb091AuditFolderRun");
  if (run) run.disabled = true;

  const byHash = new Map();

  try {
    for (
      let i = 0;
      i < c091AuditFiles.length;
      i += 1
    ) {
      const file = c091AuditFiles[i];

      c091AuditSetProgress(
        i,
        c091AuditFiles.length,
        "SHA-256 " +
          (i + 1) +
          "/" +
          c091AuditFiles.length +
          " · " +
          file.name
      );

      const hash =
        await c091Sha256(file);

      if (!byHash.has(hash)) {
        byHash.set(hash, []);
      }

      byHash.get(hash).push(
        file.webkitRelativePath ||
        file.name
      );

      if ((i + 1) % 20 === 0) {
        await new Promise(
          (resolve) =>
            setTimeout(resolve, 0)
        );
      }
    }

    const hashes = [...byHash.keys()];
    let alreadyOriginal = 0;
    let existsNeedsOriginal = 0;
    let missing = 0;

    for (
      let start = 0;
      start < hashes.length;
      start += 100
    ) {
      const batch =
        hashes.slice(start, start + 100);

      c091AuditSetProgress(
        start,
        hashes.length,
        "Préflight Cloud " +
          (start + 1) +
          "–" +
          Math.min(start + batch.length, hashes.length)
      );

      const x = await request(
        "historical_preflight",
        {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({hashes:batch})
        }
      );

      for (const row of x?.items || []) {
        if (
          row.status ===
          "ALREADY_ARCHIVED_ORIGINAL"
        ) {
          alreadyOriginal += 1;
        } else if (
          row.status ===
          "EXISTS_NEEDS_ORIGINAL_OBSERVATION"
        ) {
          existsNeedsOriginal += 1;
        } else {
          missing += 1;
        }
      }
    }

    const duplicateGroups =
      [...byHash.entries()]
        .filter(([, names]) => names.length > 1);

    const duplicateOccurrences =
      c091AuditFiles.length -
      hashes.length;

    c091Cards(
      "cgweb091AuditFolderSummary",
      [
        ["Fichiers sélectionnés", c091AuditFiles.length],
        ["SHA uniques", hashes.length],
        ["Occurrences dupliquées", duplicateOccurrences],
        ["Groupes SHA dupliqués", duplicateGroups.length],
        ["SHA déjà originaux Cloud", alreadyOriginal],
        ["SHA Cloud à marquer original", existsNeedsOriginal],
        ["SHA absents du Cloud", missing]
      ]
    );

    const list =
      c091Node("cgweb091DuplicateList");

    if (list) {
      list.textContent =
        duplicateGroups.length
          ? duplicateGroups
              .slice(0, 100)
              .map(
                ([hash, names]) =>
                  hash +
                  "\n  " +
                  names.join("\n  ")
              )
              .join("\n\n")
          : "Aucun doublon SHA interne au dossier.";
    }

    c091AuditSetProgress(
      hashes.length,
      hashes.length,
      "Audit terminé"
    );
  } finally {
    c091AuditBusy = false;
    if (run) {
      run.disabled =
        !c091AuditFiles.length;
    }
  }
}


/* CGWEB092_ORIGINAL_MATCH_DEEP_ANALYSIS001_WEB_START */

function c092QualityLabel(value) {
  const key = String(value || "");
  if (key === "STRONG") return "fort";
  if (key === "COMPATIBLE") return "compatible";
  if (key === "WEAK") return "faible";
  if (key === "CONTRADICTION") return "contradiction";
  return "n/d";
}

function c092SeparationLabel(value) {
  const key = String(value || "");
  if (key === "CLEAR_METRIC_LEAD") return "écart métrique net";
  if (key === "SLIGHT_METRIC_LEAD") return "léger avantage métrique";
  if (key === "SINGLE_CANDIDATE") return "candidat unique";
  if (key === "DECODE_FAILED") return "FIT non décodé";
  if (key === "NO_CANDIDATE") return "aucun candidat";
  return "indéterminé";
}

function c092FmtNumber(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function c092FmtDistance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return c092FmtNumber(n / 1000, 2) + " km";
}

function c092FmtDuration(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const total = Math.max(0, Math.round(n));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return (
    (h ? h + " h " : "") +
    String(m).padStart(h ? 2 : 1, "0") +
    " min " +
    String(s).padStart(2, "0") +
    " s"
  );
}

function c092MetricLabel(row) {
  const metric = String(row?.metric || "");
  const fit = row?.fit;
  const activity = row?.activity;
  const delta = row?.delta;
  const q = c092QualityLabel(row?.quality);

  if (metric === "time_residual_s") {
    return "Heure : résidu " + c092FmtNumber(activity, 0) + " s (" + q + ")";
  }
  if (metric === "distance_m") {
    return "Distance : FIT " + c092FmtDistance(fit) +
      " / activité " + c092FmtDistance(activity) +
      " / Δ " + c092FmtNumber(delta, 0) + " m (" + q + ")";
  }
  if (metric === "duration_s") {
    return "Durée : FIT " + c092FmtDuration(fit) +
      " / activité " + c092FmtDuration(activity) +
      " / Δ " + c092FmtNumber(delta, 0) + " s (" + q + ")";
  }
  if (metric === "ascent_m") {
    return "D+ : FIT " + c092FmtNumber(fit, 0) +
      " m / activité " + c092FmtNumber(activity, 0) +
      " m / Δ " + c092FmtNumber(delta, 0) + " m (" + q + ")";
  }
  if (metric === "avg_hr") {
    return "FC moy. : FIT " + c092FmtNumber(fit, 0) +
      " / activité " + c092FmtNumber(activity, 0) + " bpm (" + q + ")";
  }
  if (metric === "max_hr") {
    return "FC max : FIT " + c092FmtNumber(fit, 0) +
      " / activité " + c092FmtNumber(activity, 0) + " bpm (" + q + ")";
  }
  if (metric === "sport") {
    return "Sport : " + c092FmtNumber(fit, 0) +
      " / " + c092FmtNumber(activity, 0) + " (" + q + ")";
  }
  if (metric === "sub_sport") {
    return "Sous-sport : " + c092FmtNumber(fit, 0) +
      " / " + c092FmtNumber(activity, 0) + " (" + q + ")";
  }
  return metric + " : " + q;
}

function c092OriginalSummary(fit) {
  return [
    "FIT original",
    c091Date(fit?.start_time_ms),
    "sport " + c092FmtNumber(fit?.sport, 0) + "/" +
      c092FmtNumber(fit?.sub_sport, 0),
    "distance " + c092FmtDistance(fit?.distance_m),
    "durée " + c092FmtDuration(fit?.duration_s),
    "D+ " + c092FmtNumber(fit?.ascent_m, 0) + " m",
    "FC " + c092FmtNumber(fit?.avg_hr, 0) + "/" +
      c092FmtNumber(fit?.max_hr, 0),
    "records " + c092FmtNumber(fit?.record_count, 0)
  ].join(" · ");
}

function c092RenderDeep(data) {
  const summary = data?.summary || {};
  const host = c091Node("cgweb092DeepList");
  const status = c091Node("cgweb092DeepStatus");
  const badge = c091Node("cgweb092DeepBadge");

  c091Cards(
    "cgweb092DeepSummary",
    [
      ["Originaux analysés", summary.unresolved_original_files],
      ["FIT décodés", summary.decoded_ok],
      ["Décodage échoué", summary.decoded_failed],
      ["Écart métrique net", summary.clear_metric_lead],
      ["Léger avantage", summary.slight_metric_lead],
      ["Candidat unique", summary.single_candidate],
      ["Indéterminés", summary.indeterminate]
    ]
  );

  if (badge) {
    badge.textContent =
      Number(summary.decoded_ok || 0) + "/" +
      Number(summary.unresolved_original_files || 0) + " décodés";
  }

  if (status) {
    status.textContent =
      "Analyse approfondie terminée · lecture seule · " +
      Number(summary.clear_metric_lead || 0) +
      " cas avec un écart métrique net · " +
      Number(summary.indeterminate || 0) +
      " cas encore indéterminés.";
  }

  if (!host) return;
  host.innerHTML = "";

  const files = Array.isArray(data?.files) ? data.files : [];
  if (!files.length) {
    host.innerHTML =
      '<div class="muted">Aucun FIT original non lié à analyser.</div>';
    return;
  }

  for (const file of files) {
    const details = document.createElement("details");
    details.className = "cgweb092-file";

    if (
      file.separation === "CLEAR_METRIC_LEAD" ||
      file.separation === "SLIGHT_METRIC_LEAD"
    ) {
      details.open = true;
    }

    const summaryNode = document.createElement("summary");
    summaryNode.textContent =
      (file.file_name || file.sha256) + " · " +
      c092SeparationLabel(file.separation) + " · " +
      Number(file.candidates?.length || 0) + " candidat(s)";
    details.appendChild(summaryNode);

    const original = document.createElement("div");
    original.className = "cgweb092-original";
    original.textContent = file.decode_ok
      ? c092OriginalSummary(file.fit)
      : "Décodage impossible : " + (file.decode_error || "erreur inconnue");
    details.appendChild(original);

    const candidatesHost = document.createElement("div");
    candidatesHost.className = "cgweb092-candidates";

    for (const candidate of file.candidates || []) {
      const card = document.createElement("div");
      card.className = "cgweb092-candidate";
      card.dataset.rank = String(candidate.deep_rank || "");

      const head = document.createElement("div");
      head.className = "cgweb092-candidate-head";

      const title = document.createElement("strong");
      title.textContent =
        "Rang technique " + candidate.deep_rank +
        " · #" + candidate.activity_id +
        " · " + (candidate.activity?.title || "");

      const pill = document.createElement("span");
      pill.className = "pill neutral";
      pill.textContent =
        candidate.strong_count + " fortes · " +
        candidate.contradiction_count + " contradiction(s)";

      head.appendChild(title);
      head.appendChild(pill);
      card.appendChild(head);

      const context = document.createElement("div");
      context.className = "muted";
      context.textContent =
        c091Date(candidate.activity?.start_time_ms) +
        (candidate.activity?.equipment_name
          ? " · matériel : " + candidate.activity.equipment_name
          : "") +
        (candidate.activity?.markers?.length
          ? " · repères : " + candidate.activity.markers.join(", ")
          : "") +
        (candidate.activity?.import_source
          ? " · source : " + candidate.activity.import_source
          : "");
      card.appendChild(context);

      const metrics = document.createElement("div");
      metrics.className = "cgweb092-metrics";

      for (const row of candidate.comparisons || []) {
        const span = document.createElement("span");
        span.className =
          "cgweb092-quality-" + String(row.quality || "NA");
        span.textContent = c092MetricLabel(row);
        metrics.appendChild(span);
      }
      card.appendChild(metrics);

      const evidence = document.createElement("div");
      evidence.className = "cgweb092-evidence";
      evidence.textContent =
        "Éléments testés : " + candidate.tested_count +
        " · forts : " + candidate.strong_count +
        " · compatibles : " + candidate.compatible_count +
        " · faibles : " + candidate.weak_count +
        " · contradictions : " + candidate.contradiction_count +
        ". Aucun rattachement automatique.";
      card.appendChild(evidence);

      candidatesHost.appendChild(card);
    }

    details.appendChild(candidatesHost);
    host.appendChild(details);
  }
}

async function c092DeepAnalyze() {
  const button = c091Node("cgweb092DeepAnalyze");
  const status = c091Node("cgweb092DeepStatus");

  if (button) button.disabled = true;
  if (status) {
    status.textContent =
      "Décodage des FIT originaux et comparaison des candidats…";
  }

  try {
    const data = await request("original_match_deep_analysis");
    c092RenderDeep(data);
    return data;
  } catch (error) {
    if (status) {
      status.textContent =
        "Analyse approfondie impossible : " +
        (error?.message || String(error));
    }
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

function c092Wire() {
  const button = c091Node("cgweb092DeepAnalyze");
  if (!button || button.dataset.c092 === "1") return;
  button.dataset.c092 = "1";
  button.addEventListener(
    "click",
    () => void c092DeepAnalyze().catch(console.error)
  );
}

window.SPORT_ORIGINAL_MATCH_DEEP_ANALYSIS = Object.freeze({
  version: "ORIGINAL_MATCH_DEEP_ANALYSIS001",
  analyze: c092DeepAnalyze
});

queueMicrotask(c092Wire);


/* CGWEB093_MATCH_TRIAGE001_WEB_START */

function c093ClassLabel(value) {
  const key = String(value || "");
  const labels = {
    SAFE_EXACT: "SAFE exact",
    SAFE_STRONG: "SAFE fort",
    DUPLICATE_ACTIVITY_TIE: "ex æquo d'activités",
    NO_COMPATIBLE_CANDIDATE: "aucun candidat compatible",
    REVIEW: "revue manuelle",
    REVIEW_DECODE_FAILED: "décodage à revoir",
    FINGERPRINT_EXACT: "empreinte exacte",
    FINGERPRINT_STRONG: "empreinte forte",
    FINGERPRINT_PLAUSIBLE: "empreinte plausible",
    WEAK: "empreinte faible"
  };
  return labels[key] || key || "—";
}

function c093ShortActivity(candidate) {
  if (!candidate) return "—";
  const activity = candidate.activity || {};
  return (
    "#" + candidate.activity_id +
    " · " + (activity.title || ("Activité #" + candidate.activity_id)) +
    " · " + c091Date(activity.start_time_ms)
  );
}

function c093MetricMini(row) {
  const fit = row?.fit;
  const activity = row?.activity;
  const q = c092QualityLabel(row?.quality);
  const metric = String(row?.metric || "");

  if (metric === "distance_m") {
    return "distance " + c092FmtDistance(fit) +
      " ↔ " + c092FmtDistance(activity) + " (" + q + ")";
  }
  if (metric === "duration_s") {
    return "durée " + c092FmtDuration(fit) +
      " ↔ " + c092FmtDuration(activity) + " (" + q + ")";
  }
  if (metric === "ascent_m") {
    return "D+ " + c092FmtNumber(fit, 0) +
      " ↔ " + c092FmtNumber(activity, 0) + " m (" + q + ")";
  }
  if (metric === "avg_hr") {
    return "FC moy " + c092FmtNumber(fit, 0) +
      " ↔ " + c092FmtNumber(activity, 0) + " (" + q + ")";
  }
  if (metric === "max_hr") {
    return "FC max " + c092FmtNumber(fit, 0) +
      " ↔ " + c092FmtNumber(activity, 0) + " (" + q + ")";
  }
  if (metric === "sport") {
    return "sport " + c092FmtNumber(fit, 0) +
      "/" + c092FmtNumber(activity, 0) + " (" + q + ")";
  }
  if (metric === "sub_sport") {
    return "sous-sport " + c092FmtNumber(fit, 0) +
      "/" + c092FmtNumber(activity, 0) + " (" + q + ")";
  }
  return metric + " (" + q + ")";
}

function c093RenderSafe(data) {
  const summary = data?.summary || {};

  c091Cards("cgweb093SafeSummary", [
    ["SAFE exact", summary.safe_exact],
    ["SAFE forts", summary.safe_strong],
    ["SAFE total", summary.safe_total],
    ["Ex æquo activités", summary.duplicate_activity_tie],
    ["Sans candidat compatible", summary.no_compatible_candidate],
    ["Revue manuelle", summary.review]
  ]);

  const host = c091Node("cgweb093SafeList");
  if (!host) return;
  host.innerHTML = "";

  for (const row of data?.rows || []) {
    const card = document.createElement("div");
    card.className =
      "cgweb093-row cgweb093-" + String(row.classification || "");

    const head = document.createElement("div");
    head.className = "cgweb093-row-head";

    const title = document.createElement("strong");
    title.textContent =
      (row.file_name || row.sha256) +
      " · " + c093ClassLabel(row.classification);

    const pill = document.createElement("span");
    pill.className = "pill neutral";
    pill.textContent =
      row.safe_to_repair
        ? "prévisualisation SAFE"
        : "aucune écriture";

    head.appendChild(title);
    head.appendChild(pill);
    card.appendChild(head);

    const info = document.createElement("div");
    info.className = "muted";
    info.textContent =
      "1er : " + c093ShortActivity(row.first_candidate) +
      (row.second_candidate
        ? " · 2e : " + c093ShortActivity(row.second_candidate)
        : "");
    card.appendChild(info);

    const reason = document.createElement("div");
    reason.className = "cgweb093-tech";
    reason.textContent =
      (row.reasons || []).join(" · ") ||
      "Aucun motif détaillé.";
    card.appendChild(reason);

    host.appendChild(card);
  }
}

function c093RenderOrphan(data) {
  const summary = data?.summary || {};

  c091Cards("cgweb093OrphanSummary", [
    ["Originaux recherchés", summary.searched_files],
    ["Empreinte exacte", summary.files_with_exact_fingerprint],
    ["Empreinte forte", summary.files_with_strong_fingerprint],
    ["Sans empreinte plausible", summary.files_without_plausible_fingerprint]
  ]);

  const host = c091Node("cgweb093OrphanList");
  if (!host) return;
  host.innerHTML = "";

  const files = Array.isArray(data?.files) ? data.files : [];

  if (!files.length) {
    host.innerHTML =
      '<div class="muted">Aucun original classé sans candidat compatible.</div>';
    return;
  }

  for (const file of files) {
    const details = document.createElement("details");
    details.className = "cgweb093-row";
    details.open = true;

    const summaryNode = document.createElement("summary");
    summaryNode.textContent =
      (file.file_name || file.sha256) +
      " · recherche globale par empreinte";
    details.appendChild(summaryNode);

    for (const candidate of file.candidates || []) {
      const card = document.createElement("div");
      card.className = "cgweb093-row";

      const head = document.createElement("div");
      head.className = "cgweb093-row-head";

      const title = document.createElement("strong");
      title.textContent =
        c093ClassLabel(candidate.fingerprint_class) +
        " · #" + candidate.activity_id +
        " · " + (candidate.activity?.title || "");

      const pill = document.createElement("span");
      pill.className = "pill neutral";
      pill.textContent =
        candidate.strong_count + " fortes · " +
        candidate.contradiction_count + " contradiction(s)";

      head.appendChild(title);
      head.appendChild(pill);
      card.appendChild(head);

      const context = document.createElement("div");
      context.className = "muted";
      context.textContent =
        c091Date(candidate.activity?.start_time_ms) +
        " · décalage horaire " +
        c092FmtNumber(candidate.time_delta_s, 0) + " s" +
        " · original déjà présent : " +
        (candidate.state?.original ? "oui" : "non") +
        " · canonique : " +
        (candidate.state?.canonical ? "oui" : "non");
      card.appendChild(context);

      const metrics = document.createElement("div");
      metrics.className = "cgweb093-metrics";
      for (const row of candidate.comparisons || []) {
        const span = document.createElement("span");
        span.textContent = c093MetricMini(row);
        metrics.appendChild(span);
      }
      card.appendChild(metrics);

      details.appendChild(card);
    }

    host.appendChild(details);
  }
}

function c093TechLine(activity) {
  const ids = activity?.external_ids || {};
  const idText = Object.entries(ids)
    .map(([k, v]) => k + "=" + v)
    .join(", ") || "aucun";

  const files = Array.isArray(activity?.fit_links)
    ? activity.fit_links
    : [];

  const fileText =
    files.map((f) => {
      const roles =
        Array.isArray(f.archive_roles)
          ? f.archive_roles.join("+")
          : "";
      return (
        (f.file_name || f.sha256) +
        (roles ? " [" + roles + "]" : "")
      );
    }).join(" ; ") || "aucun";

  return [
    "source : " + (activity?.source || "—"),
    "IDs externes : " + idText,
    "route : " +
      (activity?.route?.exists ? "oui" : "non") +
      " · points : " +
      c092FmtNumber(activity?.route?.point_count, 0),
    "état : original=" +
      (activity?.state?.original ? "oui" : "non") +
      " (" + c092FmtNumber(activity?.state?.original_count, 0) + ")" +
      " · canonique=" +
      (activity?.state?.canonical ? "oui" : "non") +
      " (" + c092FmtNumber(activity?.state?.canonical_count, 0) + ")",
    "FIT liés : " + fileText
  ].join("\n");
}

function c093RenderDuplicate(data) {
  const summary = data?.summary || {};

  c091Cards("cgweb093DuplicateSummary", [
    ["Groupes jumelles", summary.duplicate_groups],
    ["Activités concernées", summary.activities_in_duplicate_groups]
  ]);

  const host = c091Node("cgweb093DuplicateList");
  if (!host) return;
  host.innerHTML = "";

  const groups = Array.isArray(data?.groups) ? data.groups : [];

  if (!groups.length) {
    host.innerHTML =
      '<div class="muted">Aucun ex æquo métrique détecté.</div>';
    return;
  }

  for (const group of groups) {
    const details = document.createElement("details");
    details.className = "cgweb093-row";
    details.open = true;

    const summaryNode = document.createElement("summary");
    summaryNode.textContent =
      (group.file_name || group.sha256) +
      " · " + group.duplicate_candidate_count +
      " activité(s) techniquement jumelle(s)";
    details.appendChild(summaryNode);

    for (const activity of group.activities || []) {
      const card = document.createElement("div");
      card.className = "cgweb093-row";

      const title = document.createElement("strong");
      title.textContent =
        "#" + activity.activity_id +
        " · " + (activity.metrics?.title || "");
      card.appendChild(title);

      const metrics = document.createElement("div");
      metrics.className = "muted";
      metrics.textContent =
        c091Date(activity.metrics?.start_time_ms) +
        " · " + c092FmtDistance(activity.metrics?.distance_m) +
        " · " + c092FmtDuration(activity.metrics?.duration_s) +
        " · D+ " + c092FmtNumber(activity.metrics?.ascent_m, 0) + " m" +
        " · FC " + c092FmtNumber(activity.metrics?.avg_hr, 0) +
        "/" + c092FmtNumber(activity.metrics?.max_hr, 0);
      card.appendChild(metrics);

      const tech = document.createElement("div");
      tech.className = "cgweb093-tech";
      tech.textContent = c093TechLine(activity);
      card.appendChild(tech);

      details.appendChild(card);
    }

    host.appendChild(details);
  }
}

async function c093Analyze() {
  const button = c091Node("cgweb093Analyze");
  const status = c091Node("cgweb093Status");

  if (button) button.disabled = true;
  if (status) {
    status.textContent =
      "Triage CGWEB093 en cours : prévisualisation SAFE, empreintes et doublons…";
  }

  try {
    const data = await request("cgweb093_analysis");

    c093RenderSafe(data?.safe_preview || {});
    c093RenderOrphan(data?.orphan_search || {});
    c093RenderDuplicate(data?.duplicate_diagnostic || {});

    if (status) {
      const s = data?.safe_preview?.summary || {};
      status.textContent =
        "Triage terminé · lecture seule · " +
        Number(s.safe_total || 0) +
        " rattachement(s) prévisualisé(s) SAFE · " +
        Number(s.duplicate_activity_tie || 0) +
        " ex æquo · " +
        Number(s.no_compatible_candidate || 0) +
        " original(aux) sans candidat temporel compatible.";
    }

    return data;
  } catch (error) {
    if (status) {
      status.textContent =
        "Triage CGWEB093 impossible : " +
        (error?.message || String(error));
    }
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

function c093Wire() {
  const button = c091Node("cgweb093Analyze");
  if (!button || button.dataset.c093 === "1") return;

  button.dataset.c093 = "1";
  button.addEventListener(
    "click",
    () => void c093Analyze().catch(console.error)
  );
}

window.SPORT_CGWEB093_MATCH_TRIAGE = Object.freeze({
  version: "CGWEB093",
  analyze: c093Analyze
});

queueMicrotask(c093Wire);


/* CGWEB094_SAFE_APPLY001_WEB_START */

let c094LastPreview = null;

function c094FmtValue(value) {
  if (value == null) return "—";
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "[]";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }
  return String(value);
}

function c094RenderSafe(data) {
  const host = c091Node("cgweb094SafeList");
  if (!host) return;

  host.innerHTML = "";

  const rows = Array.isArray(data?.rows)
    ? data.rows
    : [];

  if (!rows.length) {
    host.innerHTML =
      '<div class="muted">Aucun SAFE_EXACT à appliquer.</div>';
    return;
  }

  for (const row of rows) {
    const card = document.createElement("div");
    card.className = "cgweb094-row";

    const head = document.createElement("div");
    head.className = "cgweb094-row-head";

    const title = document.createElement("strong");
    title.textContent =
      (row.file_name || row.sha256) +
      " → activité #" + row.activity_id;

    const pill = document.createElement("span");
    pill.className = "pill neutral";
    pill.textContent = "SAFE_EXACT";

    head.appendChild(title);
    head.appendChild(pill);
    card.appendChild(head);

    const reason = document.createElement("div");
    reason.className = "muted";
    reason.textContent =
      (row.reasons || []).join(" · ");
    card.appendChild(reason);

    host.appendChild(card);
  }
}

function c094RenderOrphans(data) {
  const host = c091Node("cgweb094OrphanList");
  if (!host) return;

  host.innerHTML = "";

  const rows = Array.isArray(data?.rows)
    ? data.rows
    : [];

  if (!rows.length) {
    host.innerHTML =
      '<div class="muted">Aucun orphelin à placer en attente.</div>';
    return;
  }

  for (const row of rows) {
    const card = document.createElement("div");
    card.className = "cgweb094-row";

    const head = document.createElement("div");
    head.className = "cgweb094-row-head";

    const title = document.createElement("strong");
    title.textContent =
      row.file_name || row.sha256;

    const pill = document.createElement("span");
    pill.className = "pill neutral";
    pill.textContent =
      row.already_held
        ? "déjà en attente"
        : "à mettre en attente";

    head.appendChild(title);
    head.appendChild(pill);
    card.appendChild(head);

    const reason = document.createElement("div");
    reason.className = "muted";
    reason.textContent =
      "Aucun rattachement. Motif : " +
      (row.reason || "NO_COMPATIBLE_CANDIDATE");
    card.appendChild(reason);

    host.appendChild(card);
  }
}

function c094RenderMerge(data) {
  const summary = data?.summary || {};

  c091Cards("cgweb094MergeSummary", [
    ["Groupes à prévisualiser", summary.duplicate_groups],
    ["Activités comparées", summary.activities_compared],
    ["Champs transférables", summary.transferable_fields],
    ["Champs en conflit", summary.conflict_fields]
  ]);

  const host = c091Node("cgweb094MergeList");
  if (!host) return;

  host.innerHTML = "";

  const groups = Array.isArray(data?.groups)
    ? data.groups
    : [];

  if (!groups.length) {
    host.innerHTML =
      '<div class="muted">Aucun doublon d’activité à prévisualiser.</div>';
    return;
  }

  for (const group of groups) {
    const details = document.createElement("details");
    details.className = "cgweb094-row";
    details.open = true;

    const summaryNode = document.createElement("summary");
    summaryNode.textContent =
      (group.file_name || group.sha256) +
      " · base technique proposée #" +
      (group.suggested_base_activity_id || "—") +
      " · " +
      Number(group.transferable_fields || 0) +
      " champ(s) transférable(s) · " +
      Number(group.conflict_fields || 0) +
      " conflit(s)";
    details.appendChild(summaryNode);

    const why = document.createElement("div");
    why.className = "muted";
    why.textContent =
      group.suggested_base_reason || "";
    details.appendChild(why);

    for (const activity of group.activities || []) {
      const card = document.createElement("div");
      card.className = "cgweb094-row";

      const title = document.createElement("strong");
      title.textContent =
        "#" + activity.activity_id +
        " · score technique " +
        c092FmtNumber(activity.technical_score, 1) +
        (String(activity.activity_id) ===
          String(group.suggested_base_activity_id)
          ? " · BASE PROPOSÉE"
          : "");

      card.appendChild(title);

      const context = document.createElement("div");
      context.className = "muted";
      context.textContent =
        "source " + (activity.source || "—") +
        " · route " +
        (activity.route?.exists ? "oui" : "non") +
        " (" +
        c092FmtNumber(activity.route?.point_count, 0) +
        " points)" +
        " · FIT liés " +
        Number(activity.fit_links?.length || 0);
      card.appendChild(context);

      details.appendChild(card);
    }

    const diffHost = document.createElement("div");
    diffHost.className = "cgweb094-diff";

    for (const diff of group.differences || []) {
      const line = document.createElement("div");

      if (diff.conflict) {
        line.className = "cgweb094-conflict";
      } else if (diff.transferable_to_base) {
        line.className = "cgweb094-transfer";
      }

      const values =
        (diff.values || [])
          .map(
            (row) =>
              "#" + row.activity_id +
              "=" + c094FmtValue(row.value)
          )
          .join(" | ");

      line.textContent =
        diff.field +
        (diff.transferable_to_base
          ? " · TRANSFÉRABLE VERS LA BASE"
          : diff.conflict
            ? " · CONFLIT À ARBITRER"
            : "") +
        " · " + values;

      diffHost.appendChild(line);
    }

    details.appendChild(diffHost);
    host.appendChild(details);
  }
}

function c094RenderPreview(data) {
  c094LastPreview = data;

  const safe = data?.safe || {};
  const orphans = data?.orphans || {};
  const merge =
    data?.duplicate_merge_preview || {};

  c091Cards("cgweb094Summary", [
    ["SAFE_EXACT applicables", safe.count],
    ["SAFE rejetés", safe.rejected_count],
    ["Orphelins", orphans.count],
    ["Orphelins déjà en attente", orphans.already_held],
    [
      "Groupes fusion à prévisualiser",
      merge?.summary?.duplicate_groups
    ]
  ]);

  c094RenderSafe(safe);
  c094RenderOrphans(orphans);
  c094RenderMerge(merge);

  const applyButton = c091Node("cgweb094ApplySafe");
  const holdButton = c091Node("cgweb094HoldOrphans");

  if (applyButton) {
    applyButton.disabled =
      Number(safe.count || 0) <= 0 ||
      Number(safe.rejected_count || 0) > 0;
    applyButton.textContent =
      "Appliquer " +
      Number(safe.count || 0) +
      " SAFE_EXACT";
  }

  if (holdButton) {
    const remaining =
      Number(orphans.count || 0) -
      Number(orphans.already_held || 0);

    holdButton.disabled = remaining <= 0;
    holdButton.textContent =
      "Mettre " +
      Math.max(0, remaining) +
      " orphelin(s) en attente";
  }

  const status = c091Node("cgweb094Status");
  if (status) {
    status.textContent =
      "Prévisualisation terminée · " +
      Number(safe.count || 0) +
      " SAFE_EXACT éligibles · " +
      Number(orphans.count || 0) +
      " orphelin(s) · fusion d’activités : prévisualisation uniquement.";
  }
}

async function c094Preview() {
  const button = c091Node("cgweb094Preview");
  const status = c091Node("cgweb094Status");

  if (button) button.disabled = true;
  if (status) {
    status.textContent =
      "Prévisualisation CGWEB094 en cours…";
  }

  try {
    const data = await request("cgweb094_preview");
    c094RenderPreview(data);
    return data;
  } catch (error) {
    if (status) {
      status.textContent =
        "Prévisualisation impossible : " +
        (error?.message || String(error));
    }
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

async function c094ApplySafe() {
  if (!c094LastPreview) {
    alert("Relance d’abord la prévisualisation CGWEB094.");
    return;
  }

  const safe = c094LastPreview.safe || {};
  const pairs = Array.isArray(safe.expected_pairs)
    ? safe.expected_pairs
    : [];

  if (!pairs.length) {
    alert("Aucun SAFE_EXACT à appliquer.");
    return;
  }

  const ok = confirm(
    "Appliquer " + pairs.length +
    " rattachement(s) SAFE_EXACT ?\n\n" +
    "Écriture limitée à la métadonnée activity_files des FIT originaux.\n" +
    "Aucun document activité ne sera modifié."
  );

  if (!ok) return;

  const button = c091Node("cgweb094ApplySafe");
  const status = c091Node("cgweb094Status");

  if (button) button.disabled = true;

  try {
    const data = await request(
      "safe_match_apply",
      {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          confirm: "APPLY_SAFE_EXACT",
          expected_pairs: pairs
        })
      }
    );

    if (status) {
      status.textContent =
        "SAFE_MATCH_APPLY001 terminé · " +
        Number(data.modified || 0) +
        " FIT original(aux) rattaché(s) · " +
        Number(data.unresolved_after || 0) +
        " original(aux) restent non liés.";
    }

    await c091Resolve();
    await c094Preview();
  } catch (error) {
    if (status) {
      status.textContent =
        "Application SAFE interrompue : " +
        (error?.message || String(error));
    }
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

async function c094HoldOrphans() {
  if (!c094LastPreview) {
    alert("Relance d’abord la prévisualisation CGWEB094.");
    return;
  }

  const orphan = c094LastPreview.orphans || {};
  const shas = Array.isArray(orphan.expected_shas)
    ? orphan.expected_shas
    : [];

  if (!shas.length) {
    alert("Aucun orphelin à mettre en attente.");
    return;
  }

  const ok = confirm(
    "Placer " + shas.length +
    " FIT orphelin(s) sous ORPHAN_HOLD001 ?\n\n" +
    "Ils resteront non liés. Aucun document activité ne sera modifié."
  );

  if (!ok) return;

  const button = c091Node("cgweb094HoldOrphans");
  const status = c091Node("cgweb094Status");

  if (button) button.disabled = true;

  try {
    const data = await request(
      "orphan_hold_apply",
      {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          confirm: "HOLD_ORPHANS",
          expected_shas: shas
        })
      }
    );

    if (status) {
      status.textContent =
        "ORPHAN_HOLD001 terminé · " +
        Number(data.modified || 0) +
        " nouveau(x) HOLD · " +
        Number(data.already_held || 0) +
        " déjà en attente.";
    }

    await c094Preview();
  } catch (error) {
    if (status) {
      status.textContent =
        "ORPHAN_HOLD001 interrompu : " +
        (error?.message || String(error));
    }
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

function c094Wire() {
  const preview = c091Node("cgweb094Preview");
  const apply = c091Node("cgweb094ApplySafe");
  const hold = c091Node("cgweb094HoldOrphans");

  if (preview && preview.dataset.c094 !== "1") {
    preview.dataset.c094 = "1";
    preview.addEventListener(
      "click",
      () => void c094Preview().catch(console.error)
    );
  }

  if (apply && apply.dataset.c094 !== "1") {
    apply.dataset.c094 = "1";
    apply.addEventListener(
      "click",
      () => void c094ApplySafe().catch(console.error)
    );
  }

  if (hold && hold.dataset.c094 !== "1") {
    hold.dataset.c094 = "1";
    hold.addEventListener(
      "click",
      () => void c094HoldOrphans().catch(console.error)
    );
  }
}

window.SPORT_CGWEB094_SAFE_APPLY = Object.freeze({
  version: "CGWEB094",
  preview: c094Preview,
  applySafe: c094ApplySafe,
  holdOrphans: c094HoldOrphans
});

queueMicrotask(c094Wire);

/* CGWEB094_SAFE_APPLY001_WEB_END */



/* CGWEB093_MATCH_TRIAGE001_WEB_END */



/* CGWEB092_ORIGINAL_MATCH_DEEP_ANALYSIS001_WEB_END */



function c091Wire() {
  const resolve = c091Node("cgweb091Resolve");
  const auto = c091Node("cgweb091AutoRepair");
  const cloud = c091Node("cgweb091CloudAudit");
  const folder = c091Node("cgweb091AuditFolder");
  const audit = c091Node("cgweb091AuditFolderRun");

  if (resolve && resolve.dataset.c091 !== "1") {
    resolve.dataset.c091 = "1";
    resolve.addEventListener(
      "click",
      () => void c091Resolve().catch(console.error)
    );
  }

  if (auto && auto.dataset.c091 !== "1") {
    auto.dataset.c091 = "1";
    auto.addEventListener(
      "click",
      () => void c091AutoRepair().catch(console.error)
    );
  }

  if (cloud && cloud.dataset.c091 !== "1") {
    cloud.dataset.c091 = "1";
    cloud.addEventListener(
      "click",
      () => void c091CloudAudit().catch(console.error)
    );
  }

  if (folder && folder.dataset.c091 !== "1") {
    folder.dataset.c091 = "1";
    folder.addEventListener(
      "change",
      (event) =>
        c091AuditFolderChanged(
          event.currentTarget.files
        )
    );
  }

  if (audit && audit.dataset.c091 !== "1") {
    audit.dataset.c091 = "1";
    audit.addEventListener(
      "click",
      () => void c091AuditFolder().catch(console.error)
    );
  }
}

window.SPORT_FIT_RECONCILE_RESOLVE =
  Object.freeze({
    version:"FIT_RECONCILE_RESOLVE001",
    matchRepairVersion:"ORIGINAL_MATCH_REPAIR001",
    transferAuditVersion:"TRANSFER_AUDIT001",
    resolve:c091Resolve,
    cloudAudit:c091CloudAudit,
    auditFolder:c091AuditFolder
  });

queueMicrotask(c091Wire);

/* CGWEB091_FIT_RECONCILE_RESOLVE001_WEB_END */



/* CGWEB094C_MISSING_FIT_CLIENT_START */
async function c094cMissingFitPlan(activityIds=[]){
  const ids=[...new Set((Array.isArray(activityIds)?activityIds:[])
    .map(x=>String(x??"").trim()).filter(Boolean))].slice(0,500);
  return request("missing_fit_plan",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({activity_ids:ids})
  });
}
async function c094cMissingFitGenerate(activityIds=[]){
  const ids=[...new Set((Array.isArray(activityIds)?activityIds:[])
    .map(x=>String(x??"").trim()).filter(Boolean))].slice(0,50);
  return request("missing_fit_generate",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({activity_ids:ids})
  });
}
window.SPORT_MISSING_FIT=Object.freeze({
  version:"CGWEB094C-MISSING_FIT_GENERATE001-MISSING_FIT_BATCH001",
  plan:c094cMissingFitPlan,
  generate:c094cMissingFitGenerate,
  refreshCloud:async()=>{try{await renderCloud();}catch(error){console.warn(error);}}
});
/* CGWEB094C_MISSING_FIT_CLIENT_END */


/* CGWEB095_GLOBAL_FIT_CLIENT_START */

async function c095GlobalPlan(){
  return request(
    "global_fit_plan",
    {method:"GET"}
  );
}

async function c095OriginalFirst(planToken){
  return request(
    "original_first_backfill",
    {
      method:"POST",
      headers:{
        "Content-Type":
          "application/json"
      },
      body:JSON.stringify({
        confirm:
          "APPLY_ORIGINAL_FIRST",
        plan_token:
          String(planToken||"")
      })
    }
  );
}

async function c095GlobalBatchStep(
  planToken,
  limit=25
){
  return request(
    "missing_fit_global_batch",
    {
      method:"POST",
      headers:{
        "Content-Type":
          "application/json"
      },
      body:JSON.stringify({
        confirm:
          "APPLY_GLOBAL_FIT_BATCH",
        plan_token:
          String(planToken||""),
        limit:
          Math.max(
            1,
            Math.min(
              50,
              Number(limit||25)
            )
          )
      })
    }
  );
}

window.SPORT_GLOBAL_FIT=
  Object.freeze({
    version:
      "CGWEB095-GLOBAL_FIT_COVERAGE001-ORIGINAL_FIRST_BACKFILL001-MISSING_FIT_GLOBAL_BATCH001",
    plan:
      c095GlobalPlan,
    applyOriginals:
      c095OriginalFirst,
    step:
      c095GlobalBatchStep
  });

/* CGWEB095_GLOBAL_FIT_CLIENT_END */


/* CGWEB096_DIRECTORY_FIT_CLIENT_START */

async function c096DirectoryAudit(){
  return request(
    "directory_fit_download_audit",
    {method:"GET"}
  );
}

async function c096ResolveDownload(
  activityId
){
  return request(
    "directory_fit_resolve",
    {
      method:"POST",
      headers:{
        "Content-Type":
          "application/json"
      },
      body:JSON.stringify({
        activity_id:
          String(activityId||"")
      })
    }
  );
}



/* CGWEB107_DIRECT_DOWNLOAD_CLIENT_START */

function c107DispositionName(value,fallback){
  const text=String(value||"");
  const utf=text.match(/filename\*=UTF-8''([^;]+)/i);
  if(utf?.[1]){
    try{return decodeURIComponent(utf[1].trim());}catch(_){}
  }
  const normal=text.match(/filename="?([^";]+)"?/i);
  return normal?.[1]?.trim()||fallback;
}

async function c107DirectActivityDownload(activityId){
  const id=String(activityId||"").trim();
  if(!id)throw new Error("ACTIVITY_ID_REQUIRED — activity_id absent.");

  const user=bridge().getUser();
  if(!user)throw new Error("AUTH_REQUIRED — Connexion SPORT requise.");

  const token=await user.getIdToken();
  const url=new URL(VAULT_URL);
  url.searchParams.set("action","directory_fit_direct_download");

  const response=await fetch(url.toString(),{
    method:"POST",
    headers:{
      Authorization:"Bearer "+token,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({activity_id:id}),
    cache:"no-store"
  });

  if(!response.ok){
    const text=await response.text();
    let payload=null;
    try{payload=text?JSON.parse(text):null;}catch(_){}
    throw new Error(
      (payload?.status||("HTTP_"+response.status))+
      " — "+
      (payload?.error||text||("HTTP "+response.status))
    );
  }

  const blob=await response.blob();
  if(!blob.size)throw new Error("DIRECT_DOWNLOAD_EMPTY — FIT vide reçu.");

  const fileName=c107DispositionName(
    response.headers.get("Content-Disposition"),
    "activity_"+id+".fit"
  );

  bridge().triggerBlobDownload(blob,fileName);

  return {
    ok:true,
    status:"DIRECT_DOWNLOAD_OK",
    service:response.headers.get("X-Sport-Download-Service")||"FIT_DIRECT_DOWNLOAD001",
    role:response.headers.get("X-Sport-Fit-Role")||"",
    method:response.headers.get("X-Sport-Fit-Resolve-Method")||"",
    file_name:fileName,
    size_bytes:blob.size
  };
}

/* CGWEB107_DIRECT_DOWNLOAD_CLIENT_END */

window.SPORT_DIRECTORY_FIT=
  Object.freeze({
    version:
      "CGWEB096-DIRECTORY_FIT_DOWNLOAD_AUDIT001-CLOUD_OBJECT_RESOLVE001-DOWNLOAD_BUTTON_REWIRE001",
    audit:
      c096DirectoryAudit,
    resolve:
      c096ResolveDownload,
    directDownload:
      c107DirectActivityDownload
  });


/* CGWEB107_SIGN_FORENSICS_CLIENT_START */

async function c107SignUrlForensics(activityId){
  return request(
    "fit_sign_url_forensics",
    {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({activity_id:String(activityId||"")})
    }
  );
}

window.SPORT_FIT_SIGN_FORENSICS=Object.freeze({
  version:"CGWEB107-FIT_SIGN_URL_FORENSICS001-SIGN_ERROR_DETAIL001-STORAGE_OBJECT_VERIFY001",
  inspect:c107SignUrlForensics
});

/* CGWEB107_SIGN_FORENSICS_CLIENT_END */

/* CGWEB096_DIRECTORY_FIT_CLIENT_END */


/* CGWEB097_FIT_ORIGIN_CLIENT_START */

async function c097OriginAudit(){
  return request(
    "fit_origin_audit",
    {method:"GET"}
  );
}

async function c097States(
  activityIds
){
  return request(
    "directory_fit_states",
    {
      method:"POST",
      headers:{
        "Content-Type":
          "application/json"
      },
      body:JSON.stringify({
        activity_ids:
          Array.isArray(activityIds)
            ? activityIds
            : []
      })
    }
  );
}

window.SPORT_FIT_ORIGIN=
  Object.freeze({
    version:
      "CGWEB097-FIT_ORIGIN_VISUAL001-CANONICAL_ACTIVITY_AUDIT001-DOWNLOAD_STATE_TRUTH001",
    audit:
      c097OriginAudit,
    states:
      c097States
  });

/* CGWEB097_FIT_ORIGIN_CLIENT_END */





/* CGWEB099_GLOBAL_DIRECTORY_CLIENT_START */

async function c099DirectoryQuery(
  input
){
  return request(
    "directory_global_query",
    {
      method:"POST",
      headers:{
        "Content-Type":
          "application/json"
      },
      body:JSON.stringify(
        input || {}
      )
    }
  );
}

async function c099Activity(
  activityId
){
  return request(
    "directory_global_activity",
    {
      method:"POST",
      headers:{
        "Content-Type":
          "application/json"
      },
      body:JSON.stringify({
        activity_id:
          String(activityId||"")
      })
    }
  );
}

async function c099DuplicateAudit(){
  return request(
    "activity_duplicate_audit",
    {method:"GET"}
  );
}

window.SPORT_DIRECTORY_GLOBAL=
  Object.freeze({
    version:
      "CGWEB099-GLOBAL_DIRECTORY_QUERY001-ACTIVITY_DUPLICATE_AUDIT001",
    query:
      c099DirectoryQuery,
    activity:
      c099Activity,
    duplicates:
      c099DuplicateAudit
  });

/* CGWEB099_GLOBAL_DIRECTORY_CLIENT_END */


/* CGWEB103_FIT_RECOVERY_CLIENT_START */

async function c103FitRecoveryAudit(){
  return request(
    "fit_recovery_audit",
    {
      method:"GET"
    }
  );
}

window.SPORT_FIT_RECOVERY=
  Object.freeze({
    version:
      "CGWEB103-FIT_RECOVERY_AUDIT001-SPLIT_LINEAGE_AUDIT001",
    audit:
      c103FitRecoveryAudit
  });

/* CGWEB103_FIT_RECOVERY_CLIENT_END */


/* CGWEB104_FIT_RECOVERY_CLIENT_START */

async function c104RecoveryPlan(){
  return request(
    "fit_recovery_plan",
    {
      method:"GET"
    }
  );
}

async function c104PrepareParentRestore(
  parentActivityId
){
  return request(
    "split_parent_restore_prepare",
    {
      method:"POST",
      headers:{
        "Content-Type":
          "application/json"
      },
      body:JSON.stringify({
        parent_activity_id:
          String(
            parentActivityId || ""
          )
      })
    }
  );
}

window.SPORT_FIT_RECOVERY_PLAN=
  Object.freeze({
    version:
      "CGWEB104-FIT_RECOVERY_PLAN001-SPLIT_PARENT_RESTORE001",
    plan:
      c104RecoveryPlan,
    prepareParentRestore:
      c104PrepareParentRestore
  });

/* CGWEB104_FIT_RECOVERY_CLIENT_END */


/* CGWEB105_JOIN_CLIENT_START */

async function c105JoinCandidates(
  activityId
){
  return request(
    "same_day_same_sport_join_candidates",
    {
      method:"POST",
      headers:{
        "Content-Type":
          "application/json"
      },
      body:JSON.stringify({
        activity_id:
          String(
            activityId || ""
          )
      })
    }
  );
}

window.SPORT_ACTIVITY_JOIN=
  Object.freeze({
    version:
      "CGWEB105-SAME_DAY_SAME_SPORT_JOIN001",
    candidates:
      c105JoinCandidates
  });

/* CGWEB105_JOIN_CLIENT_END */

function init() {
  node("webFitCloudFiles")?.addEventListener("change", (e) => selectionChanged(e.currentTarget.files));
  node("webFitCloudFolder")?.addEventListener("change", (e) => selectionChanged(e.currentTarget.files));
  node("webFitCloudUploadButton")?.addEventListener("click", () => void uploadHistorical());
  node("webFitCloudRefreshButton")?.addEventListener("click", () => void renderCloud());
  node("webFitDriveBackupMissingButton")?.addEventListener("click", () => {
    void v080BackupMissingCloudFits().catch((error) => {
      const status = node("webFitCloudStatus");
      if (status) status.textContent = `Drive en erreur : ${error?.message || error}`;
      v080DriveBulkBusy = false;
      v080RenderDriveState();
    });
  });
  v079RenderFitAuthority();
  node("webFitWriterTestButton")?.addEventListener("click", () => void testFitWriter());
  node("webFitRoundTripButton")?.addEventListener("click", () => void testFitRoundTrip());
  selectionChanged([]);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, {once: true});
} else {
  queueMicrotask(init);
}


/* CGWEB108_ORPHAN_AUDIT_CLIENT_START */

async function c108StravaFitOrphanAudit(){
  return request("strava_fit_orphan_audit",{method:"GET"});
}

window.SPORT_STRAVA_FIT_ORPHAN_AUDIT=Object.freeze({
  version:"CGWEB108-STRAVA_FIT_ORPHAN_AUDIT001",
  audit:c108StravaFitOrphanAudit
});

/* CGWEB108_ORPHAN_AUDIT_CLIENT_END */
