"use strict";
/* CGWEB139 FIX1 - Safe recovery for Strava activities deleted outside CGWEB.
 * A missing remote result is never sufficient on its own to unlink.
 */
const crypto = require("node:crypto");
const VERSION = "CGWEB139_FIX1";
const PROOF_LIFETIME_MS = 5 * 60 * 1000;
const VALID_KEY = /^[A-Za-z0-9_.:-]{1,180}$/;
const VALID_REMOTE = /^\d{1,24}$/;
function error(status, message) {
  return Object.assign(new Error(message), {status});
}
function safeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function nearDuplicate(local, remote) {
  const localMs = safeNumber(local?.start_time_ms);
  const remoteMs = Date.parse(remote?.start_date || remote?.start_date_local || "");
  if (localMs === null || !Number.isFinite(remoteMs)) return false;
  if (Math.abs(localMs - remoteMs) > 2 * 60 * 1000) return false;
  const localDistance = safeNumber(local?.distance_m);
  const remoteDistance = safeNumber(remote?.distance);
  if (localDistance !== null && remoteDistance !== null && localDistance > 0 && remoteDistance > 0 &&
      Math.abs(localDistance - remoteDistance) > Math.max(100, localDistance * 0.02)) return false;
  return true;
}
function proofPayload(uid, key, id, lock, activity, timestamp) {
  return [uid, key, id, String(lock.lock_token || ""), String(activity.start_time_ms || ""), timestamp].join("|");
}
function sign(secret, uid, key, id, lock, activity, timestamp) {
  const digest = crypto.createHmac("sha256", secret)
    .update(proofPayload(uid, key, id, lock, activity, timestamp))
    .digest("hex");
  return `${timestamp}.${digest}`;
}
function verify(secret, proof, uid, key, id, lock, activity, now = Date.now()) {
  const match = /^(\d{13})\.([a-f0-9]{64})$/.exec(String(proof || ""));
  if (!match) return false;
  const at = Number(match[1]);
  if (!Number.isFinite(at) || now - at > PROOF_LIFETIME_MS || at > now + 10000) return false;
  const expected = sign(secret, uid, key, id, lock, activity, at);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(proof)));
}
function createRecovery({db, root, admin, tokenDocument, refreshTokenIfNeeded, apiBase, secret}) {
  const rootDoc = uid => db.doc(`${root}/${uid}`);
  const activityRef = (uid, key) => db.doc(`${root}/${uid}/activities/${key}`);
  const lockRef = (uid, key) => db.doc(`${root}/${uid}/strava_outbound_exports/${key}`);
  async function read(uid, key) {
    if (!VALID_KEY.test(String(key || ""))) throw error(400, "Clé d'activité CGWEB invalide.");
    const [a, l] = await Promise.all([activityRef(uid,key).get(), lockRef(uid,key).get()]);
    if (!a.exists || !l.exists) throw error(409, "Export lié absent ou incomplet : vérification manuelle requise.");
    const activity = a.data() || {}, lock = l.data() || {};
    const id = String(activity.strava_activity_id || "");
    if (activity.deleted_at_ms != null || !VALID_REMOTE.test(id) ||
        id !== String(lock.strava_activity_id || "") || lock.state !== "RECONCILED") {
      throw error(409, "Le lien Strava et le verrou RECONCILED ne concordent pas : aucune libération possible.");
    }
    if (!lock.lock_token) throw error(409, "Verrou d'export sans token : libération interdite.");
    return {activity, lock, id};
  }
  async function api(token, path) {
    let response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        method:"GET", headers:{Authorization:`Bearer ${token}`},
        signal:AbortSignal.timeout(15000)
      });
    } catch (cause) {
      return {status:null, diagnostic:"STRAVA_NETWORK_FAILURE", message:String(cause?.message || cause).slice(0,180)};
    }
    let data = null;
    try { data = await response.json(); }
    catch { if (response.status !== 404) return {status:response.status,diagnostic:"STRAVA_INVALID_RESPONSE"}; }
    return {status:response.status,data};
  }
  async function remoteCheck(uid, activity, id) {
    let integration, token;
    try {
      integration = await tokenDocument(uid);
      const scopes = new Set(String(integration?.scope || "").split(/[\s,]+/));
      if (!integration?.refresh_token || !scopes.has("activity:read_all") || !scopes.has("activity:write"))
        return {status:"UNVERIFIABLE_SCOPE", diagnostic:"Reconnexion Strava nécessaire : activity:read_all et activity:write requis."};
      token = await refreshTokenIfNeeded(uid, integration);
    } catch (e) { return {status:"UNVERIFIABLE_AUTH",diagnostic:String(e?.message||e)}; }
    const athlete = await api(token.access_token, "/athlete");
    if (athlete.status !== 200 || !VALID_REMOTE.test(String(athlete.data?.id||"")))
      return {status:"UNVERIFIABLE_ATHLETE",diagnostic:athlete.diagnostic||`Lecture propriétaire Strava HTTP ${athlete.status||"réseau"}`};
    if (String(integration.athlete?.id || "") !== String(athlete.data.id))
      return {status:"UNVERIFIABLE_OWNER",diagnostic:"Le compte Strava connecté n'est pas le compte de l'export initial."};
    const remote = await api(token.access_token, `/activities/${encodeURIComponent(id)}?include_all_efforts=false`);
    if (remote.status === 200) return {status:"STILL_EXISTS",diagnostic:"L'activité liée est toujours visible par l'API Strava."};
    if (remote.status !== 404) return {status:"UNVERIFIABLE_REMOTE", diagnostic:remote.diagnostic || `Réponse activité Strava HTTP ${remote.status||"réseau"}`,
      http_status:remote.status};
    const start = safeNumber(activity.start_time_ms);
    if (start === null || start <= 0) return {status:"UNVERIFIABLE_DATE",diagnostic:"Date CGWEB absente."};
    const after = Math.max(0,Math.floor((start-18*3600000)/1000));
    const before = Math.ceil((start+18*3600000)/1000);
    let pages = 0, listed = 0;
    for (let page=1; page<=5; page++) {
      const list = await api(token.access_token,
        `/athlete/activities?after=${after}&before=${before}&page=${page}&per_page=200`);
      if (list.status !== 200 || !Array.isArray(list.data)) return {
        status:"UNVERIFIABLE_LIST",diagnostic:list.diagnostic || `Liste Strava HTTP ${list.status||"réseau"}`,
        http_status:list.status
      };
      pages++; listed += list.data.length;
      if (list.data.some(row => String(row?.id || "") === id)) return {
        status:"STILL_EXISTS",diagnostic:"L'ancien identifiant figure dans la liste des activités."};
      const neighbors = list.data.filter(row => nearDuplicate(activity,row));
      if (neighbors.length) return {status:"POSSIBLE_DUPLICATE",diagnostic:"Une autre activité Strava a une date et une distance proches.",
        candidate_ids:neighbors.map(x=>String(x.id)).slice(0,5)};
      if (list.data.length < 200) return {status:"VERIFIED_NOT_FOUND",diagnostic:"404 + même athlète + liste chronologique parcourue intégralement.",
        listing_pages:pages,listed_count:listed,checked_at_ms:Date.now()};
    }
    return {status:"UNVERIFIABLE_PAGINATION",diagnostic:"Plus de 1 000 activités dans la fenêtre : recherche non exhaustive."};
  }
  async function check(uid, key) {
    const managed=await read(uid,key);
    const scan=await remoteCheck(uid,managed.activity,managed.id);
    const good=scan.status === "VERIFIED_NOT_FOUND";
    const checked=Date.now();
    const token=good ? sign(String(secret()),uid,key,managed.id,managed.lock,managed.activity,checked) : null;
    return {version:VERSION,ok:good,status:scan.status,activity_key:key,
      old_strava_activity_id:managed.id,diagnostic:scan.diagnostic,
      candidate_ids:scan.candidate_ids || [],checked_at_ms:checked,
      requires_user_confirmation:true,confirmation_text:`REIMPORTER ${managed.id}`,
      proof:token,expires_at_ms:good ? checked+PROOF_LIFETIME_MS : null,
      warning:"Un 404 ne prouve pas à lui seul une suppression; si une restauration Strava est encore possible, la décision reste à confirmer par l'utilisateur."};
  }
  async function confirm(uid, body) {
    const key=String(body?.activity_key||""), oldId=String(body?.old_strava_activity_id||"");
    const managed=await read(uid,key);
    if (oldId !== managed.id || String(body?.confirmation || "") !== `REIMPORTER ${oldId}`)
      throw error(400,"Confirmation explicite incorrecte : aucune donnée modifiée.");
    if (!verify(String(secret()),body?.proof,uid,key,oldId,managed.lock,managed.activity))
      throw error(409,"Preuve expirée ou différente de l'activité liée. Relancer la vérification.");
    const rescanned=await remoteCheck(uid,managed.activity,oldId);
    if (rescanned.status !== "VERIFIED_NOT_FOUND")
      throw error(409,`La revérification Strava bloque la réimportation : ${rescanned.status}.`);
    const now=Date.now(), archiveId=`${key.slice(0,85)}_${oldId}_${now}_${crypto.randomBytes(4).toString("hex")}`;
    const archiveRef=db.doc(`${root}/${uid}/strava_export_history/${archiveId}`);
    const changeRef=db.doc(`${root}/${uid}/changes/cgweb139fix1_unlink_${crypto.randomBytes(12).toString("hex")}`);
    const aRef=activityRef(uid,key), lRef=lockRef(uid,key);
    await db.runTransaction(async tx=>{
      const [aSnap,lSnap] = await Promise.all([tx.get(aRef),tx.get(lRef)]);
      if (!aSnap.exists || !lSnap.exists) throw error(409,"Activité ou verrou modifié entre-temps.");
      const a=aSnap.data() || {}, l=lSnap.data() || {};
      if (String(a.strava_activity_id||"") !== oldId || String(l.strava_activity_id||"") !== oldId ||
          l.state !== "RECONCILED" || String(l.lock_token||"") !== String(managed.lock.lock_token))
        throw error(409,"Conflit d'état : aucun lien Strava n'a été modifié.");
      const generation = Math.min(9999,Math.max(0,Number(a.strava_reimport_generation)||0)+1);
      const patch={strava_activity_id:null,strava_upload_id:null,
        strava_export_state:"REMOTE_DELETED_ARCHIVED",strava_canonical_active:false,
        strava_prior_activity_id:oldId,strava_reimport_generation:generation,
        strava_reimport_authorized_at_ms:now,strava_export_history_ref:archiveRef.path,
        __sportKey:key,__updatedAtMs:now};
      tx.create(archiveRef,{version:VERSION,activity_key:key,old_strava_activity_id:oldId,
        old_activity_link:{strava_activity_id:a.strava_activity_id,strava_upload_id:a.strava_upload_id,
          strava_export_state:a.strava_export_state,strava_canonical_distance_m:a.strava_canonical_distance_m??null,
          strava_canonical_elevation_gain_m:a.strava_canonical_elevation_gain_m??null,
          ascent_m:a.ascent_m??null,distance_m:a.distance_m??null,
          timer_time_ms:a.timer_time_ms??null,calories:a.calories??null},
        prior_export_lock:l,verified_at_ms:rescanned.checked_at_ms||now,
        verification:rescanned.diagnostic,user_confirmed:true,created_at_ms:now,
        archive_state:"HISTORICAL_RECORD_NO_REMOTE_DELETE"});
      tx.set(aRef,patch,{merge:true});
      tx.delete(lRef);
      tx.create(changeRef,{eventId:changeRef.id,deviceId:"CGWEB139_FIX1_REIMPORT",firebaseSeq:now,
        sourceChangeSeq:0,table:"activities",rowKey:key,operation:"UPSERT",changedAtMs:now,
        publishedAt:admin.firestore.FieldValue.serverTimestamp(),androidVersion:0,
        webVersion:VERSION,row:patch});
      tx.set(rootDoc(uid).collection("meta").doc("state"),{
        updatedAtMs:now,sourceDeviceId:"CGWEB139_FIX1_REIMPORT",webVersion:VERSION
      },{merge:true});
    });
    return {ok:true,status:"UNLINKED_FOR_SAFE_REIMPORT",activity_key:key,
      former_strava_activity_id:oldId,archive_path:archiveRef.path,
      reimport_requires_new_preflight:true,automatic_upload_performed:false,
      metrics_modified:false,old_fit_deleted:false,
      warning:"Rafraîchir SPORT Web, puis déclencher manuellement le préflight et l'export. Strava peut encore refuser un doublon FIT."};
  }
  return {check,confirm,remoteCheck};
}
module.exports={VERSION,nearDuplicate,sign,verify,createRecovery};
