"use strict";
/* CGWEB144 · STATS_PERIOD_PARITY001 — independent Firestore/Strava READS.
 * Never report a partial result as an exact total. */
const ZONE="Europe/Paris";
const format=new Intl.DateTimeFormat("en-GB",{timeZone:ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
const asInt=(v,min,max,label)=>{const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw Object.assign(new Error(`CGWEB144: ${label} invalide.`),{status:400});return n;};
function parisMidnight(d){
 const y=d.getUTCFullYear(),m=d.getUTCMonth()+1,day=d.getUTCDate();
 const utc=Date.UTC(y,m-1,day);
 const parts=Object.fromEntries(format.formatToParts(new Date(utc)).filter(p=>p.type!=="literal").map(p=>[p.type,Number(p.value)]));
 const seenLocal=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
 const correction=seenLocal-utc;
 const result=utc-correction;
 const p=Object.fromEntries(format.formatToParts(new Date(result)).filter(x=>x.type!=="literal").map(x=>[x.type,Number(x.value)]));
 if(p.year!==y||p.month!==m||p.day!==day||p.hour!==0||p.minute!==0)throw new Error("CGWEB144 : date de Paris non resolue.");
 return result;
}
function periodBounds(input={}){
 const type=String(input.period||"");
 if(!["week","month","year"].includes(type))throw Object.assign(new Error("CGWEB144 : période inconnue"),{status:400});
 const year=asInt(input.year,2000,2100,"année");
 let begin,end,caption;
 if(type==="year"){
  begin=new Date(Date.UTC(year,0,1));end=new Date(Date.UTC(year+1,0,1));caption=String(year);
 } else if(type==="month"){
  const month=asInt(input.month,1,12,"mois");
  begin=new Date(Date.UTC(year,month-1,1));end=new Date(Date.UTC(year,month,1));
  caption=`${year}-${String(month).padStart(2,'0')}`;
 } else {
  const week=asInt(input.week,1,53,"semaine");
  const jan4=Date.UTC(year,0,4),day=(new Date(jan4).getUTCDay()+6)%7;
  const start=jan4-day*86400000+(week-1)*7*86400000;
  begin=new Date(start);end=new Date(start+7*86400000);
  const thu=new Date(start+3*86400000);
  if(thu.getUTCFullYear()!==year)throw Object.assign(new Error("CGWEB144 : semaine ISO inexistante."),{status:400});
  caption=`${year}-S${String(week).padStart(2,'0')}`;
 }
 const startMs=parisMidnight(begin),endMs=parisMidnight(end);
 return {period:type,label:caption,start_ms:startMs,end_ms:endMs,start_utc:new Date(startMs).toISOString(),end_utc:new Date(endMs).toISOString(),time_zone:ZONE};
}
const number=v=>v===null||v===undefined||v===""?null:Number.isFinite(Number(v))?Number(v):null;
const first=(...list)=>{for(const x of list){const n=number(x);if(n!==null)return n;}return null;};
const stravaSport=x=>{
 const t=String(x?.sport_type||x?.type||"").toLowerCase();
 if(["run","trailrun","virtualrun"].includes(t))return "run";
 if(["ride","virtualride","ebikeride","mountainbikeride","gravelride","emountainbikeride"].includes(t))return "bike";
 return "other";
};
const cgwebSport=x=>Number(x?.sport)===1?"run":Number(x?.sport)===2?"bike":"other";
function aggregate(rows,isStrava){
 const specs={distance_m:[],moving_time_s:[],elapsed_time_s:[],ascent_m:[],calories:[]};
 for(const a of rows){
  const d=isStrava?{
   distance_m:number(a.distance),moving_time_s:number(a.moving_time),elapsed_time_s:number(a.elapsed_time),
   ascent_m:number(a.total_elevation_gain),calories:number(a.calories)
  }:{
   distance_m:number(a.distance_m),
   moving_time_s:first(a.timer_time_ms,a.moving_time_ms,a.duration_ms)===null?null:first(a.timer_time_ms,a.moving_time_ms,a.duration_ms)/1000,
   elapsed_time_s:first(a.elapsed_time_ms,a.duration_ms)===null?null:first(a.elapsed_time_ms,a.duration_ms)/1000,
   ascent_m:first(a.ascent_m,a.elevation_gain_m),calories:first(a.calories,a.total_calories,a.active_calories,a.kcal)
  };
  for(const k of Object.keys(specs))specs[k].push(d[k]);
 }
 const metrics={};
 for(const [k,values] of Object.entries(specs)){
  const found=values.filter(Number.isFinite);
  metrics[k]={value:found.length===rows.length?found.reduce((a,b)=>a+b,0):null,
   available:found.length,total:rows.length};
 }
 return {activities:rows.length,metrics};
}
const err=(status,msg)=>Object.assign(new Error(msg),{status});
async function compare({db,root,uid,stravaGet,tokenDocument},input={}){
 const bounds=periodBounds(input),sport=String(input.sport||"all");
 if(!["all","run","bike"].includes(sport))throw err(400,"CGWEB144 : filtre sport invalide.");
 const integration=await tokenDocument(uid);
 const scopes=new Set(String(integration?.scope||"").split(/[\s,]+/));
 if(!integration?.refresh_token||!scopes.has("activity:read_all"))throw err(403,"CGWEB144 : reconnexion Strava requise avec activity:read_all pour inclure les activités privées.");
 const snaps=await db.collection(`${root}/${uid}/activities`)
  .where("start_time_ms",">=",bounds.start_ms)
  .where("start_time_ms","<",bounds.end_ms).get();
 const allCg=snaps.docs.map(d=>d.data()||{}).filter(x=>x.deleted_at_ms==null)
  .filter(x=>number(x.start_time_ms)!==null&&x.start_time_ms>=bounds.start_ms&&x.start_time_ms<bounds.end_ms);
 const cg=allCg.filter(x=>sport==="all"||cgwebSport(x)===sport);
 const remote=[];const seen=new Set();let complete=false;
 for(let page=1;page<=30;page++){
  const path=`/athlete/activities?after=${Math.floor(bounds.start_ms/1000)-1}&before=${Math.ceil(bounds.end_ms/1000)}&page=${page}&per_page=200`;
  const part=await stravaGet(uid,path);
  if(!Array.isArray(part))throw err(502,"CGWEB144 : reponse Strava invalide.");
  for(const row of part){
   const id=String(row?.id||"");if(!id||seen.has(id))continue;seen.add(id);
   const stamp=Date.parse(row.start_date||"");
   if(!Number.isFinite(stamp)||stamp<bounds.start_ms||stamp>=bounds.end_ms)continue;
   if(sport!=="all"&&stravaSport(row)!==sport)continue;
   remote.push({...row});
  }
  if(part.length<200){complete=true;break;}
 }
 if(!complete)throw err(422,"CGWEB144 : periode Strava depassant le plafond de pagination ; aucun total partiel affiche.");
 // SummaryActivity does not consistently provide calories. For small periods,
 // request authenticated DetailActivity; absent values remain explicitly unknown.
 const DETAIL_LIMIT=15;
 if(remote.length<=DETAIL_LIMIT){
  for(const row of remote){
   if(number(row.calories)!==null)continue;
   try{
    const detail=await stravaGet(uid,`/activities/${encodeURIComponent(row.id)}?include_all_efforts=false`);
    if(String(detail?.id||"")===String(row.id))row.calories=number(detail.calories);
   }catch(error){
    // Rate limits/auth failures must not be hidden as empty calorie data.
    if(error?.status===429||error?.status===401||error?.status===403)throw err(error.status,"CGWEB144 : lecture des calories Strava interrompue ; relancer plus tard.");
    row.calories=null;
   }
  }
 }
 const remoteIds=new Set(remote.map(x=>String(x.id)));
 const linked=new Set(cg.map(x=>String(x.strava_activity_id||"")).filter(x=>remoteIds.has(x)));
 return {ok:true,version:"CGWEB144",bounds,sport,
  cgweb:aggregate(cg,false),strava:aggregate(remote,true),linked_activities:linked.size,
  strava_calorie_detail_policy:remote.length>DETAIL_LIMIT?`Detail Strava limite a ${DETAIL_LIMIT} activites par requete; aucune calorie inventee.`:"Detail Strava lu lorsque necessaire.",
  notes:["Totaux par plateforme, y compris activites non liees ; les effectifs peuvent differer.",
   "Une statistique absente sur une activite entraine un total non disponible, et non zero.",
   "Périodes calendaires Europe/Paris ; semaine ISO du lundi au dimanche."]};
}
module.exports={periodBounds,aggregate,compare,stravaSport,cgwebSport,parisMidnight};
