'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const front=fs.readFileSync(path.join(root,'web/fitcloud.js'),'utf8');
const vault=fs.readFileSync(path.join(__dirname,'fitvault.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');
function between(src,a,b){
  const start=src.indexOf(a),end=src.indexOf(b,start+a.length);
  assert.ok(start>=0&&end>start,`Ancrage absent : ${a}`);
  return src.slice(start,end);
}
const editor=between(front,'async function cgweb085aCreateActiveVersion(',
  'window.SPORT_FIT_EDITOR = Object.freeze({');
const recovery=between(front,'async function cgweb121Fix8CreateActiveVersionFromSource(',
  'window.SPORT_FIT_SOURCE_RECOVERY = Object.freeze({');
const endpoint=between(vault,'        if (action === "version") {',
  '        /* CGWEB078_FITVERSION001_ACTION_END */');

test('FIX5/01 : editeur principal transmet deja les quatre indicateurs requis',()=>{
  for(const x of ['fit_editor_mode: "FITEDITOR001"','activate_version: true',
    'replace_existing_fit: true','apply_activity_changes: true'])
    assert.ok(editor.includes(x),x);
  assert.equal(editor.split('apply_activity_changes: true').length-1,1);
});

test('FIX5/02 : recuperation FIT conserve le consentement explicite',()=>{
  for(const x of ['activate_version: true','replace_existing_fit: true','apply_activity_changes: true'])
    assert.ok(recovery.includes(x),x);
});

test('FIX5/03 : provenance SHA et preservation du nombre de Records sont obligatoires',()=>{
  for(const x of ['body.apply_activity_changes === true',
    'if(editorMode && body.activate_version === true && !losslessEditor)',
    'sha256(sourceBytes)!==parentHash','sourceRecordCount < minimum',
    'finalCount!==sourceRecordCount']) assert.ok(endpoint.includes(x),x);
});

test('FIX5/04 : export Strava choisit le FIT actif valide, jamais la route reduite',()=>{
  const x=between(vault,'    const activeHash=String(activity.fit_active_sha256',
    '    const declared=originalRecordCount;');
  for(const marker of ['originals.length!==1','originalRecordCount<declaredSourceCount',
    'cgweb140.sha(originalBuffer)!==originalHash'])assert.ok(x.includes(marker),marker);
});

test('FIX5/05 : Strava fait autorite sur distance, deux temps, D+ et calories',()=>{
  const x=between(server,'  const patch = {\n    pre_strava_export_distance_m:',
    '  /*\n   * CGWEB136 FIX1 · LOAD_IMMUTABILITY_AUDIT001');
  for(const field of ['distance_m','timer_time_ms','elapsed_time_ms','ascent_m','calories'])
    assert.match(x,new RegExp('\\n    '+field+':\\s*strava\\.'+field));
  assert.ok(x.includes('patch.cgweb_metrics_authority="STRAVA_POST_EXPORT"'));
});

test('FIX5/06 : les deux voies de version signalent HTTP 409 si nettoyage partiel',()=>{
  assert.equal(endpoint.split('const warning = cgweb140fix4.partialCleanupResponse(activityId, hash, activityPatch);').length-1,2);
  assert.equal(endpoint.split('if (warning) return res.status(409).json(warning);').length-1,2);
});

test('FIX5/07 : webhook ne remplace pas le parcours FIT ni les mesures consolidees',()=>{
  const x=between(server,
    '  // CGWEB140 FIX3 FIX2: a webhook must never replace a full FIT-backed route.',
    '  // Les choix manuels et la corbeille SPORT restent prioritaires sur Strava.');
  for(const marker of ['"CGWEB140"','"STRAVA_POST_EXPORT"','route=null','elapsed_time_ms'])
    assert.ok(x.includes(marker),marker);
});
