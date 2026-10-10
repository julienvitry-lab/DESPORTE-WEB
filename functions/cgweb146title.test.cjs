"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const {createTitleSync}=require('./cgweb146title');
const title='2013_01_11_13_14_C';
function rig(opts={}) {
  let updates=[];
  let detail={id:'20498413030',name:'2013_01_11_13_14_11_C'};
  const activity={strava_activity_id:'20498413030',start_time_ms:Date.UTC(2013,0,11,12,14,11),sport:1,...(opts.activity||{})};
  if(opts.remote)detail=opts.remote;
  const api=createTitleSync({
    readActivity:async()=>opts.missing?null:activity,
    readIntegration:async()=>({refresh_token:'dummy',scope:opts.scope??'activity:write activity:read_all'}),
    readRemote:async()=>detail,
    putRemoteTitle:async(_uid,id,name)=>{updates.push({id,name});if(!opts.noWrite)detail={...detail,name};},
    canonicalTitle:()=>opts.title??title
  });
  return {api,updates,getRemote:()=>detail};
}
test('legacy title with seconds changes only its name',async()=>{
  const r=rig();const out=await r.api.sync('owner','1234');
  assert.equal(out.status,'TITLE_UPDATED');
  assert.deepEqual(r.updates,[{id:'20498413030',name:title}]);
  assert.equal(r.getRemote().name,title);
});
test('a repeated sync is idempotent',async()=>{
  const r=rig();await r.api.sync('owner','1234');
  assert.equal((await r.api.sync('owner','1234')).status,'TITLE_ALREADY_CORRECT');
  assert.equal(r.updates.length,1);
});
test('custom Strava title is never replaced',async()=>{
  const r=rig({remote:{id:'20498413030',name:'Ma course du dimanche'}});
  assert.equal((await r.api.sync('owner','1234')).status,'CUSTOM_TITLE_PRESERVED');
  assert.equal(r.updates.length,0);
});
test('canonical minute title with changed departure is updated',async()=>{
  const r=rig({remote:{id:'20498413030',name:'2013_01_11_13_13_C'}});
  assert.equal((await r.api.sync('owner','1234')).status,'TITLE_UPDATED');
});
test('no linked Strava ID results in no remote calls',async()=>{
  const r=rig({activity:{strava_activity_id:null}});
  assert.equal((await r.api.sync('owner','1234')).status,'NOT_LINKED');
  assert.equal(r.updates.length,0);
});
test('deleted activities remain untouched',async()=>{
  const r=rig({activity:{deleted_at_ms:1}});
  assert.equal((await r.api.sync('owner','1234')).status,'ACTIVITY_NOT_AVAILABLE');
});
test('missing write scope blocks mutation',async()=>{
  const r=rig({scope:'activity:read_all'});
  assert.equal((await r.api.sync('owner','1234')).status,'STRAVA_WRITE_SCOPE_MISSING');
  assert.equal(r.updates.length,0);
});
test('mismatched remote ID blocks mutation',async()=>{
  const r=rig({remote:{id:'999',name:'2013_01_11_13_14_11_C'}});
  assert.equal((await r.api.sync('owner','1234')).status,'REMOTE_ID_MISMATCH');
});
test('invalid key is blocked before any mutation',async()=>{
  const r=rig();assert.equal((await r.api.sync('owner','../admin')).status,'INVALID_ACTIVITY_KEY');
});
test('no validated minute title cannot trigger a remote write',async()=>{
  const r=rig({title:'2013_01_11_13_14_11_C'});
  assert.equal((await r.api.sync('owner','1234')).status,'NO_CANONICAL_MINUTE_TITLE');
});
test('unconfirmed remote update is reported, not claimed successful',async()=>{
  const r=rig({noWrite:true});
  assert.equal((await r.api.sync('owner','1234')).status,'TITLE_NOT_CONFIRMED');
});
test('nothing is written to Strava without an action on this activity',async()=>{
  const r=rig();assert.equal(r.updates.length,0);
});
