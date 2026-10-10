'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {partialCleanupResponse}=require('./cgweb140fix4');
const src=fs.readFileSync(path.join(__dirname,'fitvault.js'),'utf8');
const sha='a'.repeat(64);
const partial={fit_replacement_cleanup_ok:false,fit_active_sha256:sha,
  fit_replacement_archived_count:2,fit_replaced_object_count:1,
  fit_replacement_cleanup_errors:[{sha256:'b'.repeat(64),error:'SIMULATED_DELETE_ERROR'}]};

test('FIX4/01: nettoyage partiel ne peut pas etre declare ok:true',()=>{
  const r=partialCleanupResponse('1179',sha,partial);
  assert.equal(r.ok,false);
  assert.equal(r.status,'FIT_PARTIAL_CLEANUP');
  assert.equal(r.replacement_committed,true);
  assert.equal(r.retry_safe,false);
  assert.equal(r.manual_review_required,true);
});
test('FIX4/02: references, archives et erreurs sont conservees dans le diagnostic',()=>{
  const r=partialCleanupResponse('1179',sha,partial);
  assert.equal(r.activity_id,'1179');
  assert.equal(r.active_fit_sha256,sha);
  assert.equal(r.old_fit_archived_count,2);
  assert.equal(r.old_fit_deleted_object_count,1);
  assert.equal(r.cleanup_errors[0].error,'SIMULATED_DELETE_ERROR');
});
test('FIX4/03: nettoyage complet / edition inactive ne sont pas signales a tort',()=>{
  assert.equal(partialCleanupResponse('1179',sha,{fit_replacement_cleanup_ok:true}),null);
  assert.equal(partialCleanupResponse('1179',sha,{}),null);
  assert.equal(partialCleanupResponse('1179',sha,null),null);
});
test('FIX4/04: les deux branches version bloquent le succes HTTP lorsque le nettoyage est partiel',()=>{
  const marker='const warning = cgweb140fix4.partialCleanupResponse(activityId, hash, activityPatch);';
  assert.equal(src.split(marker).length-1,2);
  assert.equal(src.split('if (warning) return res.status(409).json(warning);').length-1,2);
  const blocks=[...src.matchAll(/if \(editorMode && body\.activate_version === true\) \{\s*const warning = cgweb140fix4\.partialCleanupResponse\(activityId, hash, activityPatch\);\s*if \(warning\) return res\.status\(409\)\.json\(warning\);\s*\}/g)];
  assert.equal(blocks.length,2);
  for(const b of blocks){
    const fn=new Function('editorMode','body','cgweb140fix4','activityId','hash','activityPatch','res',b[0]+'\nreturn null;');
    const response={code:null,status(n){this.code=n;return this;},json(x){this.data=x;return x;}};
    const r=fn(true,{activate_version:true},{partialCleanupResponse},'1179',sha,partial,response);
    assert.equal(response.code,409);
    assert.equal(r.ok,false);
    const response2={code:null,status(n){this.code=n;return this;},json(x){this.data=x;return x;}};
    assert.equal(fn(true,{activate_version:true},{partialCleanupResponse},'1179',sha,{fit_replacement_cleanup_ok:true},response2),null);
    assert.equal(response2.code,null);
  }
});
test('FIX4/05: l activation remonte le statut partiel et les erreurs GCS',()=>{
  const i=src.indexOf('  async function v085aActivateVersion(');
  const j=src.indexOf('  /* CGWEB085A_FITEDITOR001_BACKEND_END */',i);
  assert.ok(i>=0&&j>i);
  const f=src.slice(i,j);
  assert.match(f,/patch\.fit_replacement_cleanup_errors\s*=/);
  assert.match(f,/patch\.fit_replacement_status\s*=/);
  assert.match(f,/"PARTIAL_CLEANUP"/);
});
