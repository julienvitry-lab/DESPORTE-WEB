"use strict";
const fs=require("fs"),path=require("path"),{execFileSync}=require("child_process");
const PROJECT="sport-505813",BUCKET="sport-505813.firebasestorage.app";
const DB=`projects/${PROJECT}/databases/(default)`;
const API=`https://firestore.googleapis.com/v1/${DB}/documents`;
const sources=[
 ["16/06/2012",4510,"6ed2becb2efbe2e4ffef161e4263c7379acf80b0c2c6fef9e66f452f5a3f1883","6158"]
];
const CONFIRMED_START=1339830120000;
const ORIGINAL_START=1339797720000;
const CLOCK_APPROVAL={state:"USER_CONFIRMED",original_sha256:sources[0][2],original_start_time_ms:ORIGINAL_START,
 target_start_time_ms:CONFIRMED_START,offset_seconds:32400,authorization:"USER_CONFIRMED_2012_06_16_09_02_EUROPE_PARIS"};
function stop(s){throw new Error(s);}
function decode(v){
 if("nullValue" in v)return null;
 if("integerValue" in v)return Number(v.integerValue);
 if("doubleValue" in v)return v.doubleValue;
 if("booleanValue" in v)return v.booleanValue;
 if("stringValue" in v)return v.stringValue;
 if("arrayValue" in v)return (v.arrayValue.values||[]).map(decode);
 if("mapValue" in v)return fields(v.mapValue.fields);
 return v.timestampValue??v.referenceValue??null;
}
function fields(f={}){return Object.fromEntries(Object.entries(f).map(([k,v])=>[k,decode(v)]));}
function encode(v){
 if(v===null)return {nullValue:null};
 if(typeof v==="boolean")return {booleanValue:v};
 if(typeof v==="string")return {stringValue:v};
 if(typeof v==="number"&&Number.isFinite(v))return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
 if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};
 if(v&&typeof v==="object")return {mapValue:{fields:encoded(v)}};
 stop("Valeur Firestore non prise en charge");
}
function encoded(v){return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]));}
function finite(v){return v==null||v===""||typeof v==="boolean"?null:Number.isFinite(Number(v))?Number(v):null;}
function restoredAscent(a,original){
 const current=finite(a.ascent_m),previous=finite(a.pre_strava_export_ascent_m),remote=finite(a.strava_canonical_elevation_gain_m);
 return previous!==null && remote!==null && previous===original && current===remote && current!==previous ? previous : current;
}
function isOriginal(row){return (row.archive_roles||[]).includes("ORIGINAL_HISTORICAL") ||
 ["HISTORICAL_ARCHIVE_TRANSFER","HISTORICAL_PHONE_MIGRATION","WEB_MANUAL_FIT_FUTURE"].includes(row.source) ||
 ["HISTORICAL_ORIGINAL","HISTORICAL_FILE_ONLY","FUTURE_IMPORT_ORIGINAL"].includes(row.upload_mode);}
function update(name,data,prior){return {update:{name,fields:encoded(data)},updateMask:{fieldPaths:Object.keys(data)},
 currentDocument:prior?.updateTime?{updateTime:prior.updateTime}:{exists:false}};}
if(process.argv.includes("--self-test")){
 const assert=require("assert/strict");
 const example={zero:0,no:false,nil:null,list:["a",2],nested:{v:1.5}};
 assert.deepEqual(fields(encoded(example)),example);
 assert.equal(restoredAscent({ascent_m:240,pre_strava_export_ascent_m:394,strava_canonical_elevation_gain_m:240},394),394);
 assert.equal(restoredAscent({ascent_m:250,pre_strava_export_ascent_m:394,strava_canonical_elevation_gain_m:240},394),250);
 assert.equal(restoredAscent({ascent_m:240},394),240);
 assert.equal(restoredAscent({ascent_m:0,pre_strava_export_ascent_m:38,strava_canonical_elevation_gain_m:0},38),38);
 assert.deepEqual(update("x",{a:1},{updateTime:"t"}).currentDocument,{updateTime:"t"});
 assert.deepEqual(update("x",{a:1},null).currentDocument,{exists:false});
 console.log("CGWEB140 FIX2 : tests des conversions, préconditions et restaurations ciblées OK");
 process.exit(0);
}
let token;
async function request(url,{method="GET",body,raw=false,missing=false,headers={}}={}){
 const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,...(body&&!Buffer.isBuffer(body)?{"Content-Type":"application/json"}:{}),...headers},
 body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
 if(response.status===404&&missing)return null;
 if(!response.ok){let message="";try{message=(await response.json()).error?.message||"";}catch{}stop(`HTTP ${response.status} : ${message}`);}
 return raw?Buffer.from(await response.arrayBuffer()):response.status===204?{}:response.json();
}
async function document(rel){return request(`${API}/${rel}`,{missing:true});}
async function query(parent,filters){
 const result=await request(`${API}/${parent}:runQuery`,{method:"POST",body:{structuredQuery:{from:[{collectionId:"activities"}],where:filters.length===1?filters[0]:{compositeFilter:{op:"AND",filters}},limit:10}}});
 return result.filter(r=>r.document).map(r=>r.document);
}
const filter=(field,op,value)=>({fieldFilter:{field:{fieldPath:field},op,value:encode(value)}});
async function roots(){
 const result=[];let page="";
 do{const r=await request(`${API}/sport_users?showMissing=true&pageSize=100${page?`&pageToken=${encodeURIComponent(page)}`:""}`);
 result.push(...(r.documents||[]));page=r.nextPageToken||"";}while(page);
 return result;
}
function match(doc,source){
 if(!doc)return false;const a=fields(doc.fields);
 return source.id==="6158" && a.deleted_at_ms==null &&
   finite(a.start_time_ms)===CONFIRMED_START && finite(a.record_count)===4510 && finite(a.distance_m)===32970;
}

async function main(){
 const m=require("../functions/cgweb140");
 const originals=[];
 for(const [date,count,hash,id] of sources){
  const buffer=fs.readFileSync(path.join(process.env.HOME,"CGWEB139_FIT_RECUPERES",hash+".fit"));
  if(m.sha(buffer)!==hash)stop(`${date} : empreinte locale incorrecte`);
  const parsed=m.scan(buffer),messages=await m.inspect(buffer),session=messages.sessionMesgs?.[0];
  const hr=(messages.recordMesgs||[]).filter(r=>Number.isFinite(r.heartRate)).length;
  if(m.recordDigest(buffer,parsed).count!==count||hr!==count||messages.sessionMesgs?.length!==1)stop(`${date} : audit intégral/FC non conforme`);
  const start=session.startTime?.getTime();if(!Number.isFinite(start))stop(`${date} : début absent`);
  if(start!==ORIGINAL_START)stop("Départ original différent du fichier confirmé.");
  const aligned=await require("../functions/cgweb140clock").align(buffer,CLOCK_APPROVAL,CONFIRMED_START);
  if(aligned.report.offset_seconds!==32400||!aligned.report.all_non_time_bytes_verified)stop("Correction horaire non conforme.");
  originals.push({date,count,hash,id,buffer,start,session,hr});
 }
 token=execFileSync("gcloud",["auth","print-access-token","--project",PROJECT],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 if(!token)stop("Authentification Google Cloud absente");
 const target=originals.find(s=>s.id==="6158"),accounts=[];
 for(const root of await roots()){
  const uid=root.name.split("/").at(-1),activity=await document(`sport_users/${uid}/activities/6158`);
  if(match(activity,target))accounts.push(uid);
 }
 if(accounts.length!==1)stop(`Compte non identifié de façon unique (${accounts.length} correspondances). Aucune modification effectuée.`);
 const uid=accounts[0],parent=`sport_users/${uid}`,plans=[],backupDocs=[];
 for(const source of originals){
  let matches=source.id?[await document(`${parent}/activities/${source.id}`)]:await query(parent,[filter("start_time_ms","GREATER_THAN_OR_EQUAL",source.start-1000),filter("start_time_ms","LESS_THAN_OR_EQUAL",source.start+1000)]);
  matches=matches.filter(d=>match(d,source));
  if(matches.length!==1)stop(`${source.date} : rattachement ambigu ou absent (${matches.length})`);
  const activity=matches[0],id=activity.name.split("/").at(-1),a=fields(activity.fields);
  const declared=finite(a.record_count);
  if(declared!==null&&declared>source.count)stop(`${source.date} : l'activité déclare davantage d'enregistrements que l'original`);
  const linked=await request(`${API}/${parent}:runQuery`,{method:"POST",body:{structuredQuery:{from:[{collectionId:"activity_files"}],where:filter("activity_id","EQUAL",id)}}});
  for(const item of linked){if(!item.document)continue;const row=fields(item.document.fields);
   if(row.deleted_at_ms==null&&isOriginal(row)&&(row.sha256||item.document.name.split("/").at(-1))!==source.hash)
    stop(`${source.date} : un autre original est déjà rattaché. Arrêt sans remplacement.`);}
  const file=await document(`${parent}/activity_files/${source.hash}`),old=fields(file?.fields);
  if(old.deleted_at_ms!=null||(old.activity_id!=null&&String(old.activity_id)!==id))stop(`${source.date} : document existant incompatible`);
  const objectPath=`${parent}/fit_vault/${new Date(source.start).getUTCFullYear()}/${source.hash}.fit`;
  if(old.object_path&&old.object_path!==objectPath)stop(`${source.date} : chemin existant différent, analyse nécessaire`);
  let ascent=finite(a.ascent_m);
  if(ascent!==394){
    if(finite(a.pre_strava_export_ascent_m)!==394 || ![240,240.1].includes(ascent))
      stop("D+ différent des valeurs vérifiées : aucune restauration automatique.");
    ascent=394;
  }
  plans.push({...source,id,activity,a,file,old,objectPath,ascent});
  backupDocs.push({date:source.date,activity,file});
 }
 const now=Date.now(),backup=path.join(process.env.HOME,"CGWEB140_BACKUPS",`FIX2_${now}`);
 fs.mkdirSync(backup,{recursive:true,mode:0o700});fs.writeFileSync(path.join(backup,"avant_reparation.json"),JSON.stringify(backupDocs,null,2),{mode:0o600});
 console.log("Sauvegarde : "+backup);
 console.table(plans.map(p=>({date:p.date,activite:p.id,records:p.count,FC:p.hr,Dplus_actuel:p.a.ascent_m,Dplus_apres:p.ascent,document_original:p.file?"EXISTANT":"A CREER"})));
 // Add missing Storage objects with a create-only precondition; never overwrite an existing FIT.
 for(const p of plans){
  const url=`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(p.objectPath)}?alt=media`;
  let stored=await request(url,{raw:true,missing:true});
  if(stored===null){
   await request(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&ifGenerationMatch=0&name=${encodeURIComponent(p.objectPath)}`,{method:"POST",body:p.buffer,headers:{"Content-Type":"application/vnd.ant.fit"}});
   stored=await request(url,{raw:true});
  }
  if(m.sha(stored)!==p.hash)stop(`${p.date} : SHA distant non conforme. Catalogue non modifié.`);
  console.log(`${p.date} : original distant vérifié (${p.count} enregistrements)`);
 }
 const writes=[];
 for(const p of plans){
  const fileName=`ORIGINAL_${p.id}_${p.hash.slice(0,12)}.fit`;
  const data={file_id:p.hash,sha256:p.hash,object_path:p.objectPath,file_name:p.old.file_name||fileName,
   original_name:p.old.original_name||fileName,size_bytes:p.buffer.length,mime_type:"application/vnd.ant.fit",
   source:p.old.source||"HISTORICAL_ARCHIVE_TRANSFER",upload_mode:p.old.upload_mode||"HISTORICAL_ORIGINAL",
   archive_roles:[...new Set([...(p.old.archive_roles||[]),"ORIGINAL_HISTORICAL"])],has_original_archive:true,
   start_time_ms:p.start,sport:p.session.sport,sub_sport:p.session.subSport??0,activity_id:p.id,link_status:"LINKED_VERIFIED_CGWEB140_FIX2",
   first_uploaded_at_ms:p.old.first_uploaded_at_ms||now,uploaded_at_ms:now,last_seen_at_ms:now,deleted_at_ms:null,
   storage_version:"FITCLOUD001",cgweb140_fix2_verified_at_ms:now};
  writes.push(update(`${DB}/documents/${parent}/activity_files/${p.hash}`,data,p.file));
  const patch={cgweb140_time_alignment:CLOCK_APPROVAL,cgweb_metrics_authority:"CGWEB140",cgweb140_original_sha256:p.hash,cgweb140_fix2_registered_at_ms:now,__updatedAtMs:now};
  if(p.ascent!==finite(p.a.ascent_m)){
   patch.ascent_m=p.ascent;patch.cgweb140_ascent_restored_from="PRE_STRAVA_EXPORT_MATCHES_ORIGINAL";
   patch.cgweb140_ascent_before_restore=p.a.ascent_m;patch.cgweb140_ascent_restored_at_ms=now;
  }
  writes.push(update(p.activity.name,patch,p.activity));
  // Store native Firestore fields in the change event to preserve unrelated field types.
  const eventId=`cgweb140_fix2_${p.id}_${now}`;
  const event={eventId,deviceId:"CGWEB140_FIX2",firebaseSeq:now,sourceChangeSeq:0,table:"activities",rowKey:p.id,
   operation:"UPSERT",changedAtMs:now,androidVersion:0,webVersion:"CGWEB140_FIX2"};
  const eventFields=encoded(event);eventFields.row={mapValue:{fields:{...p.activity.fields,...encoded(patch)}}};
  writes.push({update:{name:`${DB}/documents/${parent}/changes/${eventId}`,fields:eventFields},currentDocument:{exists:false}});
 }
 const metaName=`${DB}/documents/${parent}/meta/state`;
 writes.push({update:{name:metaName,fields:encoded({updatedAtMs:now,sourceDeviceId:"CGWEB140_FIX2",webVersion:"CGWEB140_FIX2"})},updateMask:{fieldPaths:["updatedAtMs","sourceDeviceId","webVersion"]}});
 await request(`${API}:commit`,{method:"POST",body:{writes}});
 for(const p of plans){
  const [file,activity]=await Promise.all([document(`${parent}/activity_files/${p.hash}`),document(`${parent}/activities/${p.id}`)]);
  const f=fields(file?.fields),a=fields(activity?.fields);
  if(f.activity_id!==p.id||!isOriginal(f)||a.cgweb140_original_sha256!==p.hash||a.cgweb140_time_alignment?.offset_seconds!==32400||finite(a.ascent_m)!==p.ascent)
   stop(`${p.date} : contrôle final non conforme, consulter la sauvegarde.`);
 }
 console.log("CGWEB140 FIX2 TERMINE : original 6158 vérifié et rattaché ; correction +9 h autorisée ; D+ 394 m restauré.");
 console.log("Aucun FIT existant supprimé ou remplacé. Aucune activité envoyée à Strava.");
 console.log("Recharge SPORT Web, puis relance le préflight et la préparation du FIT pour 6158.");
}
main().catch(e=>{console.error("ARRET CGWEB140 FIX2 : "+(e.message||String(e)).replace(/ya29\.[A-Za-z0-9._-]+/g,"[masqué]"));process.exitCode=1;});
