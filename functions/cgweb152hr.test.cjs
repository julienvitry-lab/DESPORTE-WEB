'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const hr=require('./cgweb152hr');
const decide=hr.decide;
test('FIT without Record FC repaired only after export click',()=>{
 const d=decide(Array(266).fill(null),266);assert.equal(d.mode,'REPAIR');assert.equal(d.reason,'RECORD_HR_ABSENT');
});
test('39/40 bpm corrupted history is eligible for 150/170 repair',()=>{
 const samples=Array(265).fill(39).concat(170);const d=decide(samples,266);
 assert.equal(d.mode,'REPAIR');assert.equal(d.reason,'IMPLAUSIBLY_LOW_HR');
});
test('authentic heart rates preserved, even with varying effort',()=>{
 const samples=Array.from({length:266},(_,i)=>118+i%37);
 assert.equal(decide(samples,266).mode,'PRESERVE');
});
test('already repaired synthetic 150/170 FIT is idempotent',()=>{
 const samples=Array.from({length:266},(_,i)=>i===45?170:149+(i%3));
 assert.equal(decide(samples,266).mode,'PRESERVE');
});
test('partially missing Record heart rate blocks rather than overwrites originals',()=>{
 assert.equal(decide([100,null,118,121],4).reason,'PARTIAL_HR_PROTECT');
});
test('outliers and missing FIT Records are rejected',()=>{
 assert.equal(decide([150,155,255],3).reason,'HR_OUTLIER_PROTECT');
 assert.equal(decide([null,null],2).reason,'INVALID_RECORD_COUNT');
});
test('unrecognized FC field types are not interpreted as absence',()=>{
 const b=Buffer.alloc(5),r=[{global:20,definition:false,fields:[{num:3,size:2,type:0x84}]}];
 assert.equal(hr.assess(b,{rows:r},()=>null).reason,'UNSUPPORTED_HR_FIELD_TYPE');
});
test('server is integrated before edit of exact original Record bytes',()=>{
 const s=fs.readFileSync(path.join(__dirname,'fitvault.js'),'utf8');
 assert.match(s,/action === "version" \|\| action === "export_hr_prepare"/);
 assert.match(s,/cgweb152hr\.assess\(sourceBytes,sourceScan,cgweb149hr\.readNumber\)/);
 assert.match(s,/avg_hr_override:150,max_hr_override:170/);
 assert.match(s,/fit_lossless_verified!==true/);
 assert.match(s,/if\(finalCount!==sourceRecordCount\)/);
});
test('browser calls repair before Strava preflight and verifies active SHA',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8');
 const a=s.indexOf('endpoint.searchParams.set("action", "export_hr_prepare")');
 const b=s.indexOf('"export_preflight",',a);
 assert.ok(a>0&&b>a);
 assert.match(s.slice(a,b),/fit_replacement_cleanup_ok !== true/);
 assert.match(s.slice(a,b),/fit_active_sha256!==sha/);
});
test('a new export does not mutate old Strava IDs or start an upload',()=>{
 const s=fs.readFileSync(path.join(__dirname,'fitvault.js'),'utf8');
 const a=s.indexOf('const cgweb152Auto = action === "export_hr_prepare";');
 const b=s.indexOf('const editorMode =',a);
 assert.ok(a>0&&b>a);
 assert.match(s.slice(a,b),/strava_activity_id/);
 assert.doesNotMatch(s.slice(a,b),/strava\.com|fetch\(/i);
});
