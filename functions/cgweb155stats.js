"use strict";
/* CGWEB155 · Year=>12 calendar months, month=>ISO weeks clipped to month.
 * Read only. One Firestore range query + paginated Strava listing, not 12 API roundtrips.
 * GAP uses persisted activity summaries only. Never invent Strava GAP or calories. */
const {periodBounds,cgwebSport,stravaSport}=require("./cgweb144stats");
const cg156gap=require("./cgweb156gap");
const ZONE="Europe/Paris";
const partsFormat=new Intl.DateTimeFormat("en-GB",{timeZone:ZONE,year:"numeric",month:"2-digit",day:"2-digit"});
const MONTHS=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const SHORT=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const num=v=>v==null||v===""||!Number.isFinite(Number(v))?null:Number(v);
const first=(...args)=>{for(const a of args){const n=num(a);if(n!==null)return n;}return null;};
const httpError=(status,message)=>Object.assign(new Error(message),{status});
function localDate(ms){
 const values={};for(const p of partsFormat.formatToParts(new Date(ms)))if(p.type!=="literal")values[p.type]=Number(p.value);
 return `${values.year}-${String(values.month).padStart(2,'0')}-${String(values.day).padStart(2,'0')}`;
}
const dateUtc=s=>new Date(`${s}T00:00:00.000Z`);
function isoWeek(s){
 const d=dateUtc(s),day=(d.getUTCDay()+6)%7;
 const monday=new Date(d.getTime()-day*86400000);
 const thursday=new Date(monday.getTime()+3*86400000),isoYear=thursday.getUTCFullYear();
 const jan4=new Date(Date.UTC(isoYear,0,4)),firstMonday=jan4.getTime()-((jan4.getUTCDay()+6)%7)*86400000;
 const week=Math.round((monday.getTime()-firstMonday)/(7*86400000))+1;
 return {key:monday.toISOString().slice(0,10),year:isoYear,week,start:monday,end:new Date(monday.getTime()+6*86400000)};
}
function buckets(year,month){
 if(!month)return MONTHS.map((label,i)=>({key:`${year}-${String(i+1).padStart(2,'0')}`,label,sort:i+1}));
 const last=new Date(Date.UTC(year,month,0)).getUTCDate(),output=[],seen=new Set();
 for(let d=1;d<=last;d++){
   const day=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
   const week=isoWeek(day);if(seen.has(week.key))continue;seen.add(week.key);
   const start=Math.max(1,week.start.getUTCFullYear()===year&&week.start.getUTCMonth()+1===month?week.start.getUTCDate():1);
   const end=Math.min(last,week.end.getUTCFullYear()===year&&week.end.getUTCMonth()+1===month?week.end.getUTCDate():last);
   output.push({key:week.key,label:`S${String(week.week).padStart(2,'0')} · ${start}–${end} ${SHORT[month-1]}`,
     iso_year:week.year,iso_week:week.week,period_start:`${year}-${String(month).padStart(2,'0')}-${String(start).padStart(2,'0')}`,
     period_end:`${year}-${String(month).padStart(2,'0')}-${String(end).padStart(2,'0')}`});
 }
 return output;
}
function cg156Load(a){
 const specified=first(a.training_load,a.trainingLoad,a.load,a.activity_load,a.activityLoad,
   a.trimp,a.charge_score,a.chargeScore,a.sport_load,a.sportLoad);
 if(specified!==null&&specified>=0)return Math.round(specified);
 const duration=first(a.timer_time_ms,a.moving_time_ms,a.duration_ms);
 const km=num(a.distance_m),ascent=first(a.ascent_m,a.elevation_gain_m);
 if(duration===null||km===null||ascent===null)return null;
 const hr=first(a.avg_hr,a.average_heart_rate);
 const factor=hr!==null&&hr>0?Math.max(.75,Math.min(1.5,hr/130)):1;
 return Math.round((duration/60000+(km/1000)*2+ascent/100)*factor);
}
function cgwebMetrics(a){return {
 distance_m:num(a.distance_m),
 moving_time_s:(v=>v===null?null:v/1000)(first(a.timer_time_ms,a.moving_time_ms,a.duration_ms)),
 elapsed_time_s:(v=>v===null?null:v/1000)(first(a.elapsed_time_ms,a.duration_ms)),
 ascent_m:first(a.ascent_m,a.elevation_gain_m),
 calories:first(a.calories,a.total_calories,a.active_calories,a.kcal),
 load:cg156Load(a),
 gap_sec_per_km:first(a.cgweb156_gap_sec_per_km,a.personal_gap,a.personalGap,a.generic_gap,a.genericGap,a.gap_seconds_per_km,a.gap_s_per_km,a.gapSecondsPerKm,
   a.grade_adjusted_pace_s_per_km,a.gap_sec_per_km,a.grade_adjusted_pace_sec_per_km)
};}
function stravaMetrics(a){return {distance_m:num(a.distance),moving_time_s:num(a.moving_time),elapsed_time_s:num(a.elapsed_time),ascent_m:num(a.total_elevation_gain),calories:num(a.calories),load:null,gap_sec_per_km:null};}
const keys=["distance_m","moving_time_s","elapsed_time_s","ascent_m","calories","load"];
function aggregate(rows,source,sportFilter){
 const data=rows.map(a=>({sport:source==="cgweb"?cgwebSport(a):stravaSport(a),v:source==="cgweb"?cgwebMetrics(a):stravaMetrics(a)}));
 const metrics={};
 for(const k of keys){const values=data.map(d=>d.v[k]);const found=values.filter(Number.isFinite);
  metrics[k]={value:found.length===data.length?found.reduce((a,b)=>a+b,0):null,available:found.length,total:data.length};}
 // For mixed sports, average speed applies to the whole row, while GAP is running-only.
 const run=data.filter(d=>d.sport==="run");
 const gapEligible=run.filter(d=>Number.isFinite(d.v.distance_m)&&d.v.distance_m>0);
 const good=gapEligible.filter(d=>Number.isFinite(d.v.gap_sec_per_km)&&d.v.gap_sec_per_km>30&&d.v.gap_sec_per_km<3600);
 const meters=good.reduce((s,x)=>s+x.v.distance_m,0);
 metrics.gap_sec_per_km={value:gapEligible.length>0&&good.length===gapEligible.length&&meters>0?
  good.reduce((s,x)=>s+x.v.gap_sec_per_km*x.v.distance_m,0)/meters:null,
  available:good.length,total:gapEligible.length};
 const duration=metrics.moving_time_s.value,distance=metrics.distance_m.value;
 metrics.average_pace_sec_per_km={value:Number.isFinite(duration)&&Number.isFinite(distance)&&distance>0?duration/(distance/1000):null};
 metrics.average_speed_kmh={value:Number.isFinite(duration)&&Number.isFinite(distance)&&duration>0?distance/1000/(duration/3600):null};
 return {activities:data.length,metrics};
}
function bucketKey(ms,month){const local=localDate(ms);return month?isoWeek(local).key:local.slice(0,7);}
/* Calcul GAP à la demande, sans écrire dans Firestore. Lectures bornées aux parcours
 * nécessaires ; un GAP manquant reste « — » et n'est pas remplacé par l'allure plate. */
async function cg156EnrichGap(db,root,uid,local){
 if(typeof db?.doc!=="function")return {checked:0,skipped:0};
 const runners=local.filter(a=>cgwebSport(a)==="run" && a.__docId);
 // Limite explicite de consultation, pas de total inventé pour les autres.
 const selected=runners.slice(0,600);let checked=0,skipped=0;
 for(let start=0;start<selected.length;start+=12){
   await Promise.all(selected.slice(start,start+12).map(async a=>{
    try{
     const snap=await db.doc(`${root}/${uid}/activity_routes/${a.__docId}`).get();
     if(!snap.exists)return;
     const result=cg156gap.calculate(snap.data()||{});
     if(result){a.cgweb156_gap_sec_per_km=result.gap_sec_per_km;checked++;}
    }catch(e){skipped++;}
   }));
 }
 return {checked,skipped:skipped+Math.max(0,runners.length-selected.length)};
}
async function breakdown({db,root,uid,tokenDocument,stravaGet},input={}){
 const year=Number(input.year),month=input.month==null||input.month===""?null:Number(input.month),sport=String(input.sport||"run"),compare=input.compare===true;
 if(!Number.isInteger(year)||year<2000||year>2100)throw httpError(400,"CGWEB155 : année invalide.");
 if(month!==null&&(!Number.isInteger(month)||month<1||month>12))throw httpError(400,"CGWEB155 : mois invalide.");
 if(!["all","run","bike"].includes(sport))throw httpError(400,"CGWEB155 : sport invalide.");
 const bounds=periodBounds({period:month?"month":"year",year,...(month?{month}:{})});
 if(compare){
  const integration=await tokenDocument(uid);
  const scopes=new Set(String(integration?.scope||"").split(/[\s,]+/));
  if(!integration?.refresh_token||!scopes.has("activity:read_all"))throw httpError(403,"CGWEB156 : autorisation Strava activity:read_all nécessaire pour comparer.");
 }
 const result=await db.collection(`${root}/${uid}/activities`)
  .where("start_time_ms",">=",bounds.start_ms).where("start_time_ms","<",bounds.end_ms).get();
 const local=result.docs.map(d=>({...d.data(),__docId:d.id})).filter(a=>a.deleted_at_ms==null&&Number.isFinite(num(a.start_time_ms))&&
   a.start_time_ms>=bounds.start_ms&&a.start_time_ms<bounds.end_ms&&
   (sport==="all"||cgwebSport(a)===sport));
 const gapAudit=await cg156EnrichGap(db,root,uid,local);
 const remote=[],seen=new Set();let complete=!compare;
 if(compare)for(let page=1;page<=30;page++){
   const part=await stravaGet(uid,`/athlete/activities?after=${Math.floor(bounds.start_ms/1000)-1}&before=${Math.ceil(bounds.end_ms/1000)}&page=${page}&per_page=200`);
   if(!Array.isArray(part))throw httpError(502,"CGWEB155 : pagination Strava invalide.");
   for(const a of part){const id=String(a?.id||"");if(!id||seen.has(id))continue;seen.add(id);
     const ts=Date.parse(a.start_date||"");if(!Number.isFinite(ts)||ts<bounds.start_ms||ts>=bounds.end_ms)continue;
     if(sport!=="all"&&stravaSport(a)!==sport)continue;
     remote.push({...a,_timestamp:ts});}
   if(part.length<200){complete=true;break;}
 }
 if(!complete)throw httpError(422,"CGWEB155 : plafond de pagination atteint. Aucune statistique partielle présentée.");
 const cgGroups=new Map(),stravaGroups=new Map();
 for(const a of local){const key=bucketKey(Number(a.start_time_ms),month);if(!cgGroups.has(key))cgGroups.set(key,[]);cgGroups.get(key).push(a);}
 for(const a of remote){const key=bucketKey(a._timestamp,month);if(!stravaGroups.has(key))stravaGroups.set(key,[]);stravaGroups.get(key).push(a);}
 const rows=buckets(year,month).map(b=>({...b,cgweb:aggregate(cgGroups.get(b.key)||[],"cgweb",sport),
  strava:aggregate(stravaGroups.get(b.key)||[],"strava",sport)}));
 return {ok:true,version:"CGWEB156",compare,mode:month?"weeks":"months",year,month,sport,bounds,
  rows,totals:{cgweb:aggregate(local,"cgweb",sport),strava:aggregate(remote,"strava",sport)},
  time_zone:ZONE,calorie_note:"Strava ne fournit pas systématiquement les calories dans la liste d'activités ; les totaux partiels sont affichés —.",
  gap_note:`GAP trail V2 : ${gapAudit.checked} parcours recalculés, ${gapAudit.skipped} indisponibles/ignorés ; le GAP n'est affiché que si toutes les courses ont une mesure exploitable. GAP Strava non disponible via l'API de liste.`};
}
module.exports={breakdown,buckets,isoWeek,localDate,aggregate,cgwebMetrics,stravaMetrics,cg156Load,cg156EnrichGap};
