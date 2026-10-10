'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync(require.resolve('./index.js'),'utf8');
const {createTitleSync}=require('./cgweb146title');

test('first completed export finalizes title after canonical metrics',()=>{
  const start=src.indexOf('CGWEB138 · POST_UPLOAD_TEXT_AUDIT001');
  const end=src.indexOf('async function cgweb136HandleOutboundWebhook',start);
  assert.ok(start>0&&end>start);
  const part=src.slice(start,end);
  assert.match(part,/await cgweb146TitleSync\.sync\(uid, key\)/);
  assert.match(part,/finalResult\.cgweb147_title_sync/);
  assert.match(part,/TITLE_SYNC_PENDING/);
});
test('polling an already reconciled upload retries title only',()=>{
  const start=src.indexOf('async function cgweb136PollSingle');
  const end=src.indexOf('"STRAVA_ERROR"',start);
  assert.ok(start>0&&end>start);
  const part=src.slice(start,end);
  assert.match(part,/await cgweb146TitleSync\.sync\(uid, activityKey\)/);
  assert.match(part,/cgweb147_title_sync/);
  assert.doesNotMatch(part,/cgweb136UploadToStrava|\b\/uploads\b/);
});
test('existing engine only sends name for canonical title (never FIT)',async()=>{
  const calls=[];
  let detail={id:'20531817793',name:'2013_01_23_13_10_11_C'};
  const activity={strava_activity_id:'20531817793',start_time_ms:Date.UTC(2013,0,23,12,10,11),sport:1};
  const title= '2013_01_23_13_10_C';
  const engine=createTitleSync({
    readActivity:async()=>activity,
    readIntegration:async()=>({refresh_token:'dummy',scope:'activity:write'}),
    readRemote:async()=>detail,
    putRemoteTitle:async(_uid,id,name)=>{calls.push({id,name});detail={...detail,name};},
    canonicalTitle:()=>title
  });
  assert.equal((await engine.sync('u','activity')).status,'TITLE_UPDATED');
  assert.deepEqual(calls,[{id:'20531817793',name:title}]);
  assert.equal((await engine.sync('u','activity')).status,'TITLE_ALREADY_CORRECT');
  assert.equal(calls.length,1);
});
