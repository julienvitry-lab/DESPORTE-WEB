"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const policy=require('./cgweb153titlepolicy');
const idx=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');
const bridge=fs.readFileSync(path.join(__dirname,'cgweb138.js'),'utf8');

test('Strava webhook create/update never writes a remote title or description',()=>{
 for(const source of ['WEBHOOK_CREATE','WEBHOOK_UPDATE','WEBHOOK_UNKNOWN','webhook_update']) {
   assert.equal(policy.isWebhookReconciliation(source),true);
   assert.equal(policy.allowRemoteTextMutation(source),false);
 }
});
test('explicit export poll and postcheck can use single title writer',()=>{
 for(const source of ['UPLOAD_STATUS_POLL','POLL_POSTCHECK','EXPLICIT_EXPORT','']) {
   assert.equal(policy.allowRemoteTextMutation(source),true);
 }
});
test('index: both remote writers are inside webhook-denial guard',()=>{
 const start=idx.indexOf('if (cgweb153TitlePolicy.allowRemoteTextMutation(source)) {');
 const end=idx.indexOf('  return finalResult;',start);
 assert.ok(start>0 && end>start);
 const block=idx.slice(start,end);
 assert.match(block,/cgweb138Bridge\.sync\(uid,key/);
 assert.match(block,/cgweb146TitleSync\.sync\(uid, key\)/);
 assert.match(block,/WEBHOOK_TEXT_READ_ONLY/);
 assert.equal((idx.match(/cgweb153TitlePolicy\.allowRemoteTextMutation\(source\)/g)||[]).length,1);
 assert.match(idx,/"WEBHOOK_" \+/);
});
test('CGWEB138 never sends a second remote PUT name',()=>{
 assert.match(bridge,/const changed=target\.description_changed;/);
 assert.doesNotMatch(bridge,/payload\.name\s*=/);
 assert.match(bridge,/if\(target\.description_changed\)payload\.description=target\.description;/);
});
test('backfill calls CGWEB146 after CGWEB138 description and not vice-versa',()=>{
 const s=idx.indexOf('const descriptionSync = await cgweb138Bridge.sync(uid,key,{');
 const e=idx.indexOf('const titleSync = await cgweb146TitleSync.sync(uid,key);',s);
 assert.ok(s>0 && e>s);
});
test('canonical title is minute-only even when legacy timestamp includes seconds',()=>{
 const {houseTitle}=require('./cgweb138');
 assert.equal(houseTitle({start_time_ms:Date.UTC(2013,2,9,17,28,0),sport:1,sub_sport:0,canonical_file_name:'2013_03_09_18_28_00_C.fit'}),'2013_03_09_18_28_C');
 assert.equal(houseTitle({start_time_ms:Date.UTC(2013,2,9,17,28,11),sport:1,sub_sport:0,house_timestamp_text:'2013_03_09_18_28_11_C'}),'2013_03_09_18_28_C');
});
test('webhook stays reconciler, not a remote title dispatcher',()=>{
 assert.match(idx,/exports\.stravaWebhookProcessor = onDocumentCreated/);
 assert.match(idx,/cgweb136HandleOutboundWebhook\(/);
 assert.match(idx,/async function cgweb136ReconcileFromDetail\(/);
 assert.match(idx,/cgweb153_title_policy/);
});
