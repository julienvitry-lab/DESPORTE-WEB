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
