"use strict";

/* CGWEB138 · STRAVA_TEXT_BRIDGE001 / HOUSE_TIMESTAMP_TITLE001
 * LANDMARK_SEQUENCE_DESCRIPTION001 / UPLOAD_METADATA_PARITY001
 * POST_UPLOAD_TEXT_AUDIT001 / EXISTING_EXPORT_BACKFILL001
 * No FIT mutation, no new upload, no numeric metric writes.
 */
const crypto = require("crypto");
const VERSION = "CGWEB138";
const START = "[CGWEB138 · REPÈRES ET JALONS]";
const END = "[/CGWEB138]";
const MAX_TITLE = 180;

const clean = x => String(x == null ? "" : x).replace(/\r\n?/g, "\n").trim();
const sha = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function parisStamp(startMs, activity) {
  const stamp = Number(startMs);
  if (!Number.isFinite(stamp) || stamp <= 0) return "";
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone:"Europe/Paris", year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"
  });
  const parts = Object.fromEntries(format.formatToParts(new Date(stamp))
    .filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  const sport = Number(activity?.sport);
  const subSport = Number(activity?.sub_sport);
  const code = sport === 1 ? (subSport === 21 ? "T":"C")
    : sport === 2 ? (subSport === 6 ? "H":"V")
    : sport === 11 ? "M" : "S";
  return [parts.year,parts.month,parts.day,parts.hour,parts.minute,parts.second,code].join("_");
}
function houseTitle(activity) {
  // Explicit persisted text always wins. Never reuse custom_title: it is not
  // necessarily the "horodatage maison" displayed by CGWEB.
  const keys = ["house_timestamp_text","horodatage_maison","house_timestamp",
    "home_timestamp","canonical_timestamp","house_timestamp_title"];
  for(const key of keys) {
    const original=activity?.[key];
    if(typeof original!=="string")continue;
    const value=clean(original);
    if(value && !/^\d{12,}$/.test(value))return value.slice(0,MAX_TITLE);
  }
  const fileCandidates=[activity?.canonical_file_name,activity?.fit_filename,activity?.fit_file_name,activity?.file_name];
  for(const file of fileCandidates) {
    const hit = String(file||"").match(/(?:^|[\\/])(\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}_[CVHTMS])(?:_\d{2})?\.fit$/i);
    if(hit) return hit[1].toUpperCase();
  }
  return parisStamp(activity?.start_time_ms,activity).slice(0,MAX_TITLE);
}
function permitted(activity, code) {
  const c=clean(code).toUpperCase(), sport=Number(activity?.sport);
  if(c==="B") return sport===1;
  if(c==="V") return sport===2;
  return true;
}
function landmarkText(activity) {
  if(activity?.landmark_sequence_override !== null && activity?.landmark_sequence_override !== undefined) {
    // Text authored manually in CGWEB stays verbatim, including intentionally blank overrides.
    return clean(activity.landmark_sequence_override);
  }
  if(Array.isArray(activity?.landmark_sequence_lines)) {
    return activity.landmark_sequence_lines
      .filter(r=>permitted(activity,r?.landmark_code))
      .map(r=>clean(r?.label)).filter(Boolean).join("\n");
  }
  return clean(activity?.landmark_sequence_generated).split("\n")
    .filter(line=>{const m=/^\s*([A-Z0-9_-]+)\s+#/i.exec(line);return !m||permitted(activity,m[1]);})
    .join("\n").trim();
}
function milestoneLabel(activity, kind) {
  const rows=Array.isArray(activity?.daily_milestone_lines)?activity.daily_milestone_lines:[];
  const found=rows.filter(r=>clean(r?.kind)===kind)
    .sort((a,b)=>Number(b?.threshold||0)-Number(a?.threshold||0))[0];
  if(!found)return "";
  const th=Number(found.threshold),global=Number(found.global_rank),
        year=Number(found.year),rank=Number(found.year_rank);
  if(!th||!global||!year||!rank)return "";
  const unit=kind==="distance"?"km":"m D+";
  return `Jours à plus de ${th.toLocaleString("fr-FR")} ${unit} #${global} (${year} #${rank})`;
}
function description(activity) {
  // Mirror CGWEB126/CGWEB130 detail composition: override/generated + maximal
  // daily distance milestone + maximal daily ascent milestone.
  return [landmarkText(activity),milestoneLabel(activity,"distance"),
    milestoneLabel(activity,"ascent")].filter(Boolean).join("\n\n");
}
function metadata(activity) {
  return {title:houseTitle(activity),description:description(activity)};
}
function mergeDescription(existing,desired) {
  const current=clean(existing), text=clean(desired);
  if(!text)return current; // Never wipe a Strava description because no CGWEB landmarks exist.
  const first=current.indexOf(START), last=current.indexOf(END);
  if(first>=0 && last>first) {
    const before=clean(current.slice(0,first));
    const after=clean(current.slice(last+END.length));
    return [before,`${START}\n${text}\n${END}`,after].filter(Boolean).join("\n\n");
  }
  if(!current) return text;
  if(current===text || current.includes(text)) return current;
  return [current,`${START}\n${text}\n${END}`].join("\n\n");
}
function targetFor(activity, remote, mode) {
  const desired=metadata(activity), currentTitle=clean(remote?.name),
    currentDescription=clean(remote?.description);
  const title=desired.title || currentTitle;
  const newDescription= mode==="upload" && !currentDescription
    ? desired.description : mergeDescription(currentDescription,desired.description);
  return {
    source:desired,
    title,
    description:newDescription,
    currentTitle,
    currentDescription,
    title_changed:!!title&&currentTitle!==title,
    description_changed:currentDescription!==newDescription
  };
}
function createBridge({db,root,tokenDocument,refreshTokenIfNeeded,stravaGet,audit,apiBase,FieldPath}) {
  const rowRef=(uid,key)=>db.doc(`${root}/${uid}/activities/${key}`);
  const lockRef=(uid,key)=>db.doc(`${root}/${uid}/strava_outbound_exports/${key}`);
  const idGood=x=>/^[A-Za-z0-9_.:-]{1,180}$/.test(String(x||""));
  const activityId=x=>/^\d{1,24}$/.test(String(x||""));
  async function getManaged(uid,key) {
    if(!idGood(key))throw httpError(400,"CGWEB138 : clé d'activité invalide.");
    const [a,b]=await Promise.all([rowRef(uid,key).get(),lockRef(uid,key).get()]);
    if(!a.exists||!b.exists)throw httpError(404,"CGWEB138 : export CGWEB existant introuvable.");
    const activity=a.data()||{},lock=b.data()||{},id=String(lock.strava_activity_id||"");
    if (!activity.canonical_file_name && lock?.fit_preview?.file_name)
      activity.canonical_file_name=String(lock.fit_preview.file_name);
    if(!activityId(id)|| !["RECONCILED","POSTCHECK_INCOMPLETE","UPLOADED_PROCESSING"].includes(String(lock.state)) ||
       (activity.strava_activity_id && String(activity.strava_activity_id)!==id))
      throw httpError(409,"CGWEB138 : export non confirmé ou identifiants incohérents.");
    return {activity,lock,id};
  }
  async function remote(uid,id){return stravaGet(uid,`/activities/${encodeURIComponent(id)}?include_all_efforts=false`);}
  function hashes(activity,detail) {
    return {source_hash:sha({id:activity?.start_time_ms,metadata:metadata(activity)}),
      remote_hash:sha([clean(detail?.name),clean(detail?.description)])};
  }
  async function writeStatus(uid,key,record,stage){
    await lockRef(uid,key).set({text_bridge:{version:VERSION,checked_at_ms:Date.now(),...record}}, {merge:true});
    await audit(uid,key,stage,{text_bridge_version:VERSION,text_bridge_status:record.status,
      source_hash:record.source_hash,remote_hash:record.remote_hash,
      title_matches:record.title_matches,description_matches:record.description_matches,
      strava_activity_id:record.strava_activity_id,error:record.error||null});
  }
  async function inspect(uid,key,remoteDetail) {
    const managed=await getManaged(uid,key);
    const detail=remoteDetail||await remote(uid,managed.id);
    if(String(detail?.id||"")!==managed.id)throw httpError(409,"CGWEB138 : ID Strava distant incorrect.");
    const t=targetFor(managed.activity,detail,"backfill");
    const h=hashes(managed.activity,detail);
    return {activity_key:key,strava_activity_id:managed.id,
      current_title:t.currentTitle,current_description:t.currentDescription,
      proposed_title:t.title,proposed_description:t.description,
      cgweb_text:t.source.description,source_hash:h.source_hash,
      remote_hash:h.remote_hash,needs_update:t.title_changed||t.description_changed,
      title_changed:t.title_changed,description_changed:t.description_changed};
  }
  async function sync(uid,key,opts={}){
    const managed=await getManaged(uid,key);
    const integration=await tokenDocument(uid);
    const scopes=new Set(String(integration?.scope||"").split(/[\s,]+/));
    if(!integration?.refresh_token||!scopes.has("activity:write"))
      throw httpError(403,"CGWEB138 : permission Strava activity:write requise.");
    const detail=await remote(uid,managed.id);
    if(String(detail?.id||"")!==managed.id)throw httpError(409,"CGWEB138 : ID Strava incohérent.");
    const h=hashes(managed.activity,detail), mode=opts.mode||"upload";
    if(mode==="backfill") {
      if(!opts.source_hash || !opts.remote_hash ||
        opts.source_hash!==h.source_hash || opts.remote_hash!==h.remote_hash)
        throw httpError(409,"CGWEB138 : aperçu périmé (activité CGWEB ou Strava modifiée). Relancer l'aperçu.");
    }
    const target=targetFor(managed.activity,detail,mode);
    const changed=target.title_changed||target.description_changed;
    if(changed) {
      const token=await refreshTokenIfNeeded(uid,integration);
      const payload={};
      if(target.title_changed)payload.name=target.title;
      if(target.description_changed)payload.description=target.description;
      const response=await fetch(`${apiBase}/activities/${encodeURIComponent(managed.id)}`,{
        method:"PUT",headers:{Authorization:`Bearer ${token.access_token}`,"Content-Type":"application/json"},
        body:JSON.stringify(payload)
      });
      const body=await response.text();
      if(!response.ok) {
        const record={status:"TEXT_UPDATE_FAILED",strava_activity_id:managed.id,
          source_hash:h.source_hash,remote_hash:h.remote_hash,error:`HTTP ${response.status}: ${body.slice(0,400)}`};
        await writeStatus(uid,key,record,"TEXT_UPDATE_FAILED");
        throw httpError(response.status,"CGWEB138 : mise à jour texte Strava refusée : "+body.slice(0,200));
      }
    }
    // Remote read-after-write: Strava is canonical for verification.
    const after=changed?await remote(uid,managed.id):detail;
    const titleMatches=clean(after.name)===target.title;
    const descMatches=clean(after.description)===target.description;
    const record={status:titleMatches&&descMatches?"TEXT_VERIFIED":"TEXT_MISMATCH",
      strava_activity_id:managed.id,source_hash:h.source_hash,
      remote_hash:sha([clean(after.name),clean(after.description)]),
      title_matches:titleMatches,description_matches:descMatches,
      updated:changed,mode};
    await writeStatus(uid,key,record,record.status);
    return {ok:titleMatches&&descMatches,activity_key:key,...record};
  }
  async function previewPage(uid,{cursor="",limit=5}={}) {
    const n=Math.max(1,Math.min(10,Number(limit)||5));
    let q=db.collection(`${root}/${uid}/strava_outbound_exports`)
      .orderBy(FieldPath.documentId()).limit(n);
    if(cursor) {
      if(!idGood(cursor)) throw httpError(400,"CGWEB138 : curseur invalide.");
      q=q.startAfter(cursor);
    }
    const snaps=await q.get();
    const rows=[];
    for (const doc of snaps.docs) {
      const data=doc.data()||{};
      if(String(data.state)!=="RECONCILED"||!activityId(data.strava_activity_id)) continue;
      try {rows.push({status:"PREVIEW",...await inspect(uid,doc.id)});}
      catch(e){rows.push({activity_key:doc.id,status:"SKIPPED",error:e.message});}
    }
    return {version:VERSION,rows,next_cursor:snaps.size===n?snaps.docs[snaps.docs.length-1].id:null,
      remaining_unknown:snaps.size===n};
  }
  return {metadata,description,houseTitle,mergeDescription,inspect,sync,previewPage};
}
module.exports={VERSION,START,END,metadata,description,houseTitle,mergeDescription,createBridge};
