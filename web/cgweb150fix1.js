/* CGWEB150 FIX1 - cible UNIQUE 2013-03-09 18:28, reparation FIT operationnel par version FITEDITOR001.
 * Aucune requete directe GCS, aucune creation/suppression Strava.
 */
(() => {
  "use strict";
  const TARGET = "2013_03_09_18_28_C";
  const EXPECTED_RECORDS = 266;
  const PREFIX = "CGWEB150 FIX1";
  let busy = false;
  let scheduled = false;

  function parisMinute(startMs) {
    const d = new Date(Number(startMs));
    if (!Number.isFinite(d.getTime())) return null;
    const fields = {};
    for (const p of new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(d)) {
      if (p.type !== "literal") fields[p.type] = p.value;
    }
    return `${fields.year}_${fields.month}_${fields.day}_${fields.hour}_${fields.minute}`;
  }
  function isTarget(a) {
    return a && a.deleted_at_ms == null &&
      parisMinute(a.start_time_ms) === "2013_03_09_18_28" &&
      Number(a.sport) === 1 &&
      Number(a.distance_m) >= 10000 && Number(a.distance_m) <= 10100;
  }
  function selectedActivity() {
    const view = document.getElementById("detailView");
    if (!view || view.hidden || window.getComputedStyle(view).display === "none") return null;
    if (!String(document.title || "").startsWith(TARGET)) return null;
    const bridge = window.SPORT_WEB_BRIDGE;
    const list = bridge?.getActivities?.();
    if (!Array.isArray(list)) return null;
    const matches = list.filter(isTarget);
    if (matches.length !== 1) return null;
    const key = String(bridge.activityKey(matches[0]) || "").trim();
    if (!/^[A-Za-z0-9_.:-]{1,180}$/.test(key)) return null;
    return { key, activity: matches[0] };
  }
  function status(message, error = false) {
    const elem = document.getElementById("cgweb150fix1Status");
    if (elem) {
      elem.textContent = message;
      elem.style.color = error ? "#ffaaaa" : "#c8eeaf";
    }
  }
  async function repair() {
    if (busy) return;
    const selection = selectedActivity();
    if (!selection) return status("Activité cible introuvable ou ambiguë. Opération interdite.", true);
    const {key, activity} = selection;
    const editor = window.SPORT_FIT_EDITOR;
    if (!editor?.refresh || !editor?.currentRow || !editor?.createActiveVersion) {
      return status("Éditeur FIT indisponible. Actualise la page.", true);
    }
    busy = true;
    const button = document.getElementById("cgweb150fix1Button");
    if (button) button.disabled = true;
    try {
      await editor.refresh();
      const source = editor.currentRow(key);
      const sha = String(source?.sha256 || "").toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(sha) || source?.deleted_at_ms != null ||
          String(source?.activity_id || "") !== key) {
        throw new Error("FIT actif source absent, supprimé ou rattaché à une autre activité.");
      }
      // CGWEB141 : les métadonnées historiques de comptage ne font pas autorité.
      // Le serveur vérifie le nombre de Record dans le binaire FIT source.
      const msg = `ACTIVITÉ UNIQUE : ${TARGET}\nCGWEB #${key}\nFIT source SHA : ${sha}\n\n` +
        `Générer et ACTIVER un nouveau FIT avec 150 bpm de moyenne, 170 bpm au maximum ?\n` +
        `Le serveur doit conserver exactement ${EXPECTED_RECORDS} Record et archiver l'ancien FIT.\n\n` +
        `AVERTISSEMENT : cette opération remplace les FC de l'activité, y compris si elles étaient réellement mesurées.\n` +
        `AUCUN EXPORT ni suppression Strava. Continuer ?`;
      if (!window.confirm(msg)) { status("Opération annulée. Aucun FIT modifié."); return; }
      status("Création et validation serveur du FIT corrigé en cours…");
      const result = await editor.createActiveVersion(key, {
        avg_hr_override: 150,
        max_hr_override: 170,
        target_start_time_ms: Number(activity.start_time_ms),
        start_offset_s: 0
      });
      const newSha = String(result?.file?.sha256 || "").toLowerCase();
      const patch = result?.activity_patch || {};
      if (result?.ok !== true || !/^[0-9a-f]{64}$/.test(newSha) ||
          result?.file?.fit_lossless_verified !== true ||
          Number(result?.file?.point_count) !== EXPECTED_RECORDS ||
          patch.fit_replacement_cleanup_ok !== true ||
          String(patch.fit_active_sha256 || "").toLowerCase() !== newSha ||
          Number(patch.avg_hr) !== 150 || Number(patch.max_hr) !== 170) {
        throw new Error("Réponse incomplète ou postconditions manquantes : ne pas exporter. Vérifier l'état serveur avant toute reprise.");
      }
      status(`FIT ACTIF VALIDÉ · ${EXPECTED_RECORDS} points · 150/170 bpm · SHA ${newSha.slice(0,16)}… · ancien FIT archivé. Actualise CGWEB avant de réexporter vers Strava.`);
      button?.setAttribute("data-cgweb150-done", "1");
    } catch (e) {
      status(`ARRÊT : ${e?.message || e}. Ne pas réexporter tant que l'état FIT n'est pas vérifié.`, true);
      console.error(PREFIX, e);
    } finally {
      busy = false;
      if (button) button.disabled = false;
    }
  }
  function mount() {
    const target = selectedActivity();
    const existing = document.getElementById("cgweb150fix1Button");
    if (!target) {
      if (existing) {
        document.getElementById("cgweb150fix1Block")?.remove();
      }
      return;
    }
    if (existing) return;
    const view = document.getElementById("detailView");
    const buttons = [...view.querySelectorAll("button")];
    const anchor = buttons.find(b => /Strava/i.test(String(b.textContent || "")));
    if (!anchor || !anchor.parentElement) return;
    const block = document.createElement("span");
    block.id = "cgweb150fix1Block";
    block.style.cssText = "display:inline-flex;flex-wrap:wrap;align-items:center;gap:8px;margin-left:6px";
    const button = document.createElement("button");
    button.id = "cgweb150fix1Button";
    button.type = "button";
    button.textContent = "Réparer FC 150/170";
    button.title = "CGWEB150 FIX1 : nouveau FIT canonique, sauvegarde et 266 Record inchangés";
    button.style.cssText = "border:1px solid #97c652;background:#202d18;color:#d6f8b5;border-radius:10px;padding:10px;cursor:pointer";
    button.addEventListener("click", () => { void repair(); });
    const info = document.createElement("span");
    info.id = "cgweb150fix1Status";
    info.style.cssText = "font:12px system-ui;max-width:560px;overflow-wrap:anywhere";
    block.append(button, info);
    anchor.insertAdjacentElement("afterend", block);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; mount(); }, 140);
  }
  window.CGWEB150_FIX1 = Object.freeze({version:"CGWEB150_FIX1", target:TARGET, parisMinute, isTarget, repair});
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => {
    mount(); new MutationObserver(schedule).observe(document.body, {childList:true,subtree:true});
  }, {once:true});
  else { mount(); new MutationObserver(schedule).observe(document.body, {childList:true,subtree:true}); }
})();
