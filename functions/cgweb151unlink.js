"use strict";
/* CGWEB151 · INSTANT_STRAVA_UNLINK001
 * User-initiated local unlink. One Firestore transaction; no Strava request,
 * no FIT storage changes, no automatic upload, archive previous mapping/lock.
 */
const crypto = require("node:crypto");
const KEY = /^[A-Za-z0-9_.:-]{1,180}$/;
const REMOTE = /^\d{1,24}$/;
const SAFE_STATES = new Set(["", "RECONCILED", "STRAVA_ERROR"]);
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function assertUnlinkable(activity, lock, expected) {
  if (!activity || activity.deleted_at_ms != null) fail(409, "Activité CGWEB absente ou supprimée.");
  const id = String(activity.strava_activity_id ?? "").trim();
  if (!REMOTE.test(id) || id !== expected) fail(409, "Le lien Strava a changé. Actualise CGWEB et recommence.");
  if (lock) {
    const state = String(lock.state || "");
    const lockId = String(lock.strava_activity_id || "").trim();
    if (lockId && lockId !== id) fail(409, "Verrou Strava associé à un autre identifiant.");
    if (!SAFE_STATES.has(state)) fail(409, `Export Strava en cours ou incertain (${state}) : dissociation refusée pour éviter un doublon.`);
  }
  return id;
}
function create({ db, admin, root }) {
  if (!db || !admin || !root) throw new Error("CGWEB151 : dépendances Firestore manquantes.");
  return async function instantUnlink(uid, body) {
    const key = String(body?.activity_key || "").trim();
    const expected = String(body?.old_strava_activity_id || "").trim();
    if (!KEY.test(key) || !REMOTE.test(expected) || !uid) fail(400, "Activité ou ancien identifiant Strava invalide.");
    const aRef = db.doc(`${root}/${uid}/activities/${key}`);
    const lRef = db.doc(`${root}/${uid}/strava_outbound_exports/${key}`);
    const now = Date.now();
    const unique = crypto.randomBytes(8).toString("hex");
    const archiveRef = db.doc(`${root}/${uid}/strava_export_history/${key.slice(0,70)}_${expected}_${now}_${unique}`);
    const changeRef = db.doc(`${root}/${uid}/changes/cgweb151_unlink_${unique}`);
    const stateRef = db.doc(`${root}/${uid}/meta/state`);
    await db.runTransaction(async tx => {
      const [aSnap, lSnap] = await Promise.all([tx.get(aRef), tx.get(lRef)]);
      const a = aSnap.exists ? aSnap.data() || {} : null;
      const l = lSnap.exists ? lSnap.data() || {} : null;
      assertUnlinkable(a, l, expected);
      const generation = Math.min(9999, Math.max(0, Number(a.strava_reimport_generation) || 0) + 1);
      const patch = {
        strava_activity_id: null,
        strava_upload_id: null,
        strava_export_state: "LOCAL_UNLINKED_BY_USER",
        strava_canonical_active: false,
        strava_prior_activity_id: expected,
        strava_reimport_generation: generation,
        strava_reimport_authorized_at_ms: now,
        strava_export_history_ref: archiveRef.path,
        __sportKey: key,
        __updatedAtMs: now
      };
      tx.create(archiveRef, {
        version: "CGWEB151", activity_key: key,
        old_strava_activity_id: expected,
        old_activity_link: {
          strava_activity_id: a.strava_activity_id,
          strava_upload_id: a.strava_upload_id ?? null,
          strava_export_state: a.strava_export_state ?? null,
          strava_canonical_distance_m: a.strava_canonical_distance_m ?? null,
          strava_canonical_elevation_gain_m: a.strava_canonical_elevation_gain_m ?? null,
          distance_m: a.distance_m ?? null,
          timer_time_ms: a.timer_time_ms ?? null,
          elapsed_time_ms: a.elapsed_time_ms ?? null,
          ascent_m: a.ascent_m ?? null,
          calories: a.calories ?? null
        },
        prior_export_lock: l,
        archive_state: "USER_LOCAL_UNLINK_REMOTE_UNVERIFIED",
        remote_deletion_claimed: false,
        user_requested: true,
        no_remote_api_call: true,
        created_at_ms: now
      });
      tx.set(aRef, patch, { merge: true });
      if (lSnap.exists) tx.delete(lRef);
      tx.create(changeRef, {
        eventId: changeRef.id, deviceId: "CGWEB151_LOCAL_UNLINK", firebaseSeq: now,
        sourceChangeSeq: 0, table: "activities", rowKey: key,
        operation: "UPSERT", changedAtMs: now,
        publishedAt: admin.firestore.FieldValue.serverTimestamp(),
        androidVersion: 0, webVersion: "CGWEB151", row: patch
      });
      tx.set(stateRef, {updatedAtMs:now,sourceDeviceId:"CGWEB151_LOCAL_UNLINK",webVersion:"CGWEB151"}, {merge:true});
    });
    return {
      ok: true, status: "LOCAL_STRAVA_LINK_REMOVED", activity_key: key,
      old_strava_activity_id: expected, archive_path: archiveRef.path,
      remote_deleted: false, strava_upload_performed: false,
      fit_mutated: false, metrics_modified: false,
      warning: "Seul le lien CGWEB a été cassé. Si l'ancienne activité existe encore sur Strava, le contrôle anti-doublon peut bloquer un nouvel upload."
    };
  };
}
module.exports={create,assertUnlinkable};
