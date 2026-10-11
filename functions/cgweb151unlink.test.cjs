"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {create,assertUnlinkable}=require("./cgweb151unlink");
const VALID_ID="205028973129";
const clone=x=>JSON.parse(JSON.stringify(x));
function setup({missingLock=false,state="RECONCILED",remoteId=VALID_ID,expected=VALID_ID,activityOverride={},lockOverride={}}={}) {
  const root="sport_users",uid="alice",key="5714";
  const actPath=`${root}/${uid}/activities/${key}`;
  const lockPath=`${root}/${uid}/strava_outbound_exports/${key}`;
  const store=new Map([[actPath,{strava_activity_id:remoteId,distance_m:10040,
     timer_time_ms:3046000,record_count:1058,fit_active_sha256:"abc123",
     start_time_ms:1362842880000,strava_reimport_generation:0,...activityOverride}]]);
  if(!missingLock)store.set(lockPath,{strava_activity_id:remoteId,state,lock_token:"abc",...lockOverride});
  const ops=[];
  const ref=path=>({path,id:path.split("/").pop()});
  const db={doc:ref,async runTransaction(callback){
    const tx={
      async get(doc){const value=store.get(doc.path);return{exists:value!==undefined,data:()=>clone(value)};},
      create(doc,value){ops.push(["create",doc.path,clone({...value,publishedAt:"SERVER_TIME"})]);},
      set(doc,value){ops.push(["set",doc.path,clone(value)]);},
      delete(doc){ops.push(["delete",doc.path]);}
    };
    const result=await callback(tx);
    for(const [method,path,value] of ops){
      if(method==="delete")store.delete(path);
      else if(method==="set")store.set(path,{...(store.get(path)||{}),...value});
      else store.set(path,value);
    }
    return result;
  }};
  const admin={firestore:{FieldValue:{serverTimestamp:()=>"SERVER_TIME"}}};
  const unlink=create({db,root,admin});
  return {unlink,store,ops,actPath,lockPath,uid,key,expected};
}
test("managed single-action unlink archives lock before releasing link and preserves FIT & metrics",async()=>{
  const o=setup();const answer=await o.unlink(o.uid,{activity_key:o.key,old_strava_activity_id:o.expected});
  assert.equal(answer.status,"LOCAL_STRAVA_LINK_REMOVED");
  assert.equal(answer.remote_deleted,false);
  assert.equal(answer.strava_upload_performed,false);
  assert.equal(o.store.get(o.lockPath),undefined);
  const a=o.store.get(o.actPath);assert.equal(a.strava_activity_id,null);
  assert.equal(a.strava_prior_activity_id,VALID_ID);assert.equal(a.strava_reimport_generation,1);
  assert.equal(a.fit_active_sha256,"abc123");assert.equal(a.record_count,1058);
  assert.equal(a.distance_m,10040);assert.equal(a.timer_time_ms,3046000);
  const archive=o.store.get(answer.archive_path);assert.equal(archive.prior_export_lock.lock_token,"abc");
  assert.equal(archive.remote_deletion_claimed,false);
  assert.ok(o.ops.find(x=>x[0]==="delete"&&x[1]===o.lockPath));
});
test("legacy no-lock link is dissociated locally",async()=>{
 const o=setup({missingLock:true});const answer=await o.unlink(o.uid,{activity_key:o.key,old_strava_activity_id:o.expected});
 assert.equal(answer.ok,true);assert.equal(o.store.get(o.actPath).strava_activity_id,null);
});
test("in-flight export blocks unlink to prevent duplicate racing",async()=>{
 const o=setup({state:"UPLOAD_REQUESTING"});await assert.rejects(
 ()=>o.unlink(o.uid,{activity_key:o.key,old_strava_activity_id:o.expected}),/en cours ou incertain/);
 assert.equal(o.store.get(o.actPath).strava_activity_id,VALID_ID);assert.equal(o.ops.length,0);
});
test("unknown/unfinished webhook state blocks unlink",async()=>{
 const o=setup({state:"POSTCHECK_INCOMPLETE"});await assert.rejects(
 ()=>o.unlink(o.uid,{activity_key:o.key,old_strava_activity_id:o.expected}),/dissociation refusée/);
 assert.equal(o.ops.length,0);
});
test("outdated UI ID cannot unlink a new remote activity",async()=>{
 const o=setup({expected:"205028973130"});await assert.rejects(
 ()=>o.unlink(o.uid,{activity_key:o.key,old_strava_activity_id:o.expected}),/a changé/);
 assert.equal(o.store.get(o.actPath).strava_activity_id,VALID_ID);
});
test("mismatched lock ID cannot be removed",async()=>{
 const o=setup({lockOverride:{strava_activity_id:"99999999999"}});
 await assert.rejects(()=>o.unlink(o.uid,{activity_key:o.key,old_strava_activity_id:o.expected}),/autre identifiant/);
 assert.ok(o.store.has(o.lockPath));
});
test("deleted activity cannot unlink",async()=>{
 const o=setup({activityOverride:{deleted_at_ms:123}});
 await assert.rejects(()=>o.unlink(o.uid,{activity_key:o.key,old_strava_activity_id:o.expected}),/supprimée/);
});
test("invalid key and ID rejected",async()=>{
 const o=setup();await assert.rejects(()=>o.unlink(o.uid,{activity_key:"../../bad",old_strava_activity_id:VALID_ID}),/invalide/);
 await assert.rejects(()=>o.unlink(o.uid,{activity_key:o.key,old_strava_activity_id:"x"}),/invalide/);
});
test("no network calls required (not a Strava remote deletion)",async()=>{
 const o=setup();const old=global.fetch;global.fetch=()=>{throw Error("should not fetch")};
 try{const result=await o.unlink(o.uid,{activity_key:o.key,old_strava_activity_id:o.expected});assert.equal(result.ok,true)}
 finally{global.fetch=old}
});
