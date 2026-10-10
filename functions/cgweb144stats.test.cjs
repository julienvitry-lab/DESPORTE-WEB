'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const stats=require('./cgweb144stats');
const base=__dirname;

test('Paris dates: DST and ISO weeks remain exact and half-open',()=>{
  const march=stats.periodBounds({period:'month',year:2026,month:3});
  assert.equal(march.start_utc,'2026-02-28T23:00:00.000Z');
  assert.equal(march.end_utc,'2026-03-31T22:00:00.000Z');
  const october=stats.periodBounds({period:'month',year:2026,month:10});
  assert.equal(october.start_utc,'2026-09-30T22:00:00.000Z');
  assert.equal(october.end_utc,'2026-10-31T23:00:00.000Z');
  assert.equal(stats.periodBounds({period:'week',year:2012,week:27}).start_utc,'2012-07-01T22:00:00.000Z');
  assert.throws(()=>stats.periodBounds({period:'week',year:2025,week:53}),/inexistante/);
});
test('Metrics never turn missing activity values into zeros or false parity',()=>{
  const a=stats.aggregate([{distance_m:1000,elapsed_time_ms:700000,timer_time_ms:500000,ascent_m:12,calories:undefined},
    {distance_m:2000,elapsed_time_ms:800000,timer_time_ms:600000,ascent_m:18,calories:60}],false);
  assert.equal(a.activities,2);
  assert.equal(a.metrics.distance_m.value,3000);
  assert.equal(a.metrics.elapsed_time_s.value,1500);
  assert.equal(a.metrics.moving_time_s.value,1100);
  assert.equal(a.metrics.calories.value,null);
  assert.equal(a.metrics.calories.available,1);
});
test('Historical 2012 period reads Firestore and Strava separately, no writes',async()=>{
  const bounded=stats.periodBounds({period:'month',year:2012,month:7});
  const t=Date.parse('2012-07-05T11:22:00.000Z');
  const docs=[{start_time_ms:t,sport:1,distance_m:7619,timer_time_ms:2154000,elapsed_time_ms:2184000,ascent_m:139,calories:614,strava_activity_id:'42'},
    {start_time_ms:t,sport:1,distance_m:4500,timer_time_ms:1300000,elapsed_time_ms:1340000,ascent_m:22,calories:340,deleted_at_ms:1}];
  const queries=[];const calls=[];
  const db={collection(name){assert.equal(name,'sport_users/u/activities');return {
    where(field,op,v){queries.push([field,op,v]);return this;},
    async get(){return {docs:docs.map(v=>({data:()=>v}))}}
  }}};
  const result=await stats.compare({db,root:'sport_users',uid:'u',
    tokenDocument:async()=>({refresh_token:'secret',scope:'activity:read_all,activity:write'}),
    stravaGet:async(_uid,url)=>{calls.push(url);if(url.startsWith('/athlete/activities?'))return [{id:42,start_date:'2012-07-05T11:22:00Z',distance:7620,moving_time:2154,elapsed_time:2184,total_elevation_gain:139,type:'Run'}];
      if(url.startsWith('/activities/42?'))return {id:42,calories:614};throw new Error('Unknown '+url);}
  },{period:'month',year:2012,month:7,sport:'run'});
  assert.equal(result.bounds.start_ms,bounded.start_ms);
  assert.equal(result.cgweb.activities,1);assert.equal(result.strava.activities,1);
  assert.equal(result.linked_activities,1);assert.equal(result.strava.metrics.calories.value,614);
  assert.equal(result.cgweb.metrics.distance_m.value,7619);
  assert.equal(queries.length,2);assert.equal(calls.length,2);
});
test('Reject absent full private scopes',async()=>{
  await assert.rejects(stats.compare({tokenDocument:async()=>({refresh_token:'x',scope:'activity:read'})},{period:'year',year:2012}),/activity:read_all/);
});
test('Title export rule always replaces seconds when start time valid',()=>{
  const mod=require('./cgweb138');
  const activity={start_time_ms:Date.parse('2012-07-05T11:22:00Z'),sport:1,sub_sport:0,
    house_timestamp_text:'2012_07_05_13_22_00_C',canonical_file_name:'2012_07_05_13_22_00_C.fit'};
  assert.equal(mod.houseTitle(activity),'2012_07_05_13_22_C');
  assert.equal(mod.houseTitle({...activity,sport:1,sub_sport:21}),'2012_07_05_13_22_T');
  assert.equal(mod.houseTitle({...activity,sport:2,sub_sport:0}),'2012_07_05_13_22_V');
});
test('Server action is authenticated and read-only, frontend has tab and no FIT mutations',()=>{
 const index=fs.readFileSync(path.join(base,'index.js'),'utf8');
 const ui=fs.readFileSync(path.join(base,'../web/cgweb144stats.js'),'utf8');
 const page=fs.readFileSync(path.join(base,'../web/index.html'),'utf8');
 assert.ok(index.includes('action === "period_totals"'), 'period handler absent');
 assert.ok(index.indexOf('const decoded = await requireUser(req);')<index.indexOf('action === "period_totals"'));
 assert.ok(ui.includes('Semaine'));assert.ok(ui.includes('Mois'));assert.ok(ui.includes('Année'));
 assert.ok(ui.includes('Statistiques'));
 assert.ok(page.includes('./cgweb144stats.js'));
 assert.doesNotMatch(ui,/action=(?:upload|delete|version|export_status)/);
});
