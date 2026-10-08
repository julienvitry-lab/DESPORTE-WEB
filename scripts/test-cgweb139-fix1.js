"use strict";
const assert = require("node:assert/strict");
const mod = require("../functions/cgweb139fix1");
const OLD="20502985541", UID="user-test", KEY="activity_2012";
const activity={strava_activity_id:OLD,start_time_ms:1341401009000,distance_m:10120,ascent_m:0};
const lock={strava_activity_id:OLD,state:"RECONCILED",lock_token:"test-unique-lock",external_id:"CGWEB_activity_2012"};
const actual = new Map([
 [`sport_users/${UID}/activities/${KEY}`,activity],
 [`sport_users/${UID}/strava_outbound_exports/${KEY}`,lock]
]);
function ref(path) {
  return {path,id:path.split("/").pop(),
    get:async()=>({exists:actual.has(path),data:()=>actual.get(path)}),
    collection:name=>ref(path+"/"+name),doc:id=>ref(path+"/"+id)};
}
const db={doc:ref,runTransaction:async fn=>{
  const staged=[];
  const tx={get:r=>r.get(),create:(r,v)=>staged.push(["create",r.path,v]),
    set:(r,v)=>staged.push(["set",r.path,v]),delete:r=>staged.push(["delete",r.path])};
  await fn(tx);
  for(const [verb,path,val] of staged){
    if(verb==="create"){assert.equal(actual.has(path),false);actual.set(path,val);}
    if(verb==="set")actual.set(path,{...(actual.get(path)||{}),...val});
    if(verb==="delete")actual.delete(path);
  }
}};
const admin={firestore:{FieldValue:{serverTimestamp:()=>"SERVER_TIMESTAMP"}}};
let outcome="missing";
global.fetch=async url=>{
 const parsed=new URL(url);
 if(parsed.pathname==="/api/v3/athlete")return {status:200,json:async()=>({id:123})};
 if(parsed.pathname.includes("/api/v3/activities/")){
  if(outcome==="exists")return {status:200,json:async()=>({id:OLD})};
  if(outcome==="network")throw new Error("fetch failed");
  return {status:404,json:async()=>({message:"Resource Not Found"})};
 }
 if(parsed.pathname.endsWith("/athlete/activities"))return {status:200,json:async()=>outcome==="duplicate" ?
   [{id:"999",start_date:new Date(activity.start_time_ms).toISOString(),distance:10120}] : []};
 throw Error("Unexpected fetch path "+parsed.pathname);
};
const recovery=mod.createRecovery({db,root:"sport_users",admin,
 tokenDocument:async()=>({athlete:{id:123},scope:"activity:read_all,activity:write",refresh_token:"refresh"}),
 refreshTokenIfNeeded:async()=>({access_token:"abc"}),
 apiBase:"https://www.strava.com/api/v3",secret:()=>"long-test-secret"});
(async()=>{
 assert.equal(mod.nearDuplicate(activity,{start_date:new Date(activity.start_time_ms).toISOString(),distance:10120}),true);
 assert.equal(mod.nearDuplicate(activity,{start_date:new Date(activity.start_time_ms+1000000).toISOString(),distance:10120}),false);
 const signature=mod.sign("secret",UID,KEY,OLD,lock,activity,Date.now());
 assert.equal(mod.verify("secret",signature,UID,KEY,OLD,lock,activity),true);
 assert.equal(mod.verify("wrong",signature,UID,KEY,OLD,lock,activity),false);
 outcome="exists";
 const exists=await recovery.check(UID,KEY);
 assert.equal(exists.status,"STILL_EXISTS");assert.equal(exists.proof,null);
 outcome="network";
 const network=await recovery.check(UID,KEY);
 assert.equal(network.status,"UNVERIFIABLE_REMOTE");assert.equal(network.proof,null);
 outcome="duplicate";
 const duplicate=await recovery.check(UID,KEY);
 assert.equal(duplicate.status,"POSSIBLE_DUPLICATE");assert.equal(duplicate.proof,null);
 assert.equal(actual.get(`sport_users/${UID}/activities/${KEY}`).strava_activity_id,OLD);
 outcome="missing";
 const verified=await recovery.check(UID,KEY);
 assert.equal(verified.status,"VERIFIED_NOT_FOUND");assert.ok(verified.proof);
 await assert.rejects(recovery.confirm(UID,{activity_key:KEY,old_strava_activity_id:OLD,
   confirmation:"INVALID",proof:verified.proof}),/Confirmation explicite incorrecte/);
 assert.equal(actual.get(`sport_users/${UID}/activities/${KEY}`).strava_activity_id,OLD);
 const done=await recovery.confirm(UID,{activity_key:KEY,old_strava_activity_id:OLD,
   confirmation:`REIMPORTER ${OLD}`,proof:verified.proof});
 assert.equal(done.status,"UNLINKED_FOR_SAFE_REIMPORT");
 assert.equal(actual.get(`sport_users/${UID}/activities/${KEY}`).strava_activity_id,null);
 assert.equal(actual.get(`sport_users/${UID}/activities/${KEY}`).ascent_m,0);
 assert.equal(actual.has(`sport_users/${UID}/strava_outbound_exports/${KEY}`),false);
 assert.ok(actual.has(done.archive_path));
 assert.equal(actual.get(done.archive_path).old_strava_activity_id,OLD);
 assert.equal(actual.get(`sport_users/${UID}/activities/${KEY}`).strava_reimport_generation,1);
 console.log("PASS CGWEB139 FIX1: existing, network, near-duplicate, signed proof, confirmed unlink, archive, preserved metrics");
})().catch(e=>{console.error(e);process.exitCode=1});
