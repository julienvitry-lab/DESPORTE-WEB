'use strict';
/* CGWEB140 FIX3 FIX3 · INTEGRATION_VALIDATION001
   Uses the actual deployment source and wholly in-memory Firestore/GCS doubles.
   NO Firebase SDK, credentials, network, mutation of real cloud data. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = __dirname;
const vault = fs.readFileSync(path.join(base, 'fitvault.js'), 'utf8');
const index = fs.readFileSync(path.join(base, 'index.js'), 'utf8');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');

function excerpt(text, from, until, label) {
  const a=text.indexOf(from);
  const b=a<0?-1:text.indexOf(until,a+from.length);
  assert.ok(a>=0 && b>a, `Ancre du code reel absente : ${label}`);
  return text.slice(a,b);
}
const familyFn = excerpt(vault,'  async function v121ReplaceFitFamily(', '  async function v085aActivateVersion(', 'remplacement operationnel');
const activateFn = excerpt(vault,'  async function v085aActivateVersion(', '  /* CGWEB085A_FITEDITOR001_BACKEND_END */', 'activation version');
const patchCode = excerpt(index,'  const patch = {\n    pre_strava_export_distance_m:', '  /*\n   * CGWEB136 FIX1 · LOAD_IMMUTABILITY_AUDIT001', 'reconciliation Strava');

function fakeWorld() {
  const uid='fixture-test-user', id='fixture-1179', root='sport_users';
  const docs=new Map(), activity=new Map(), storage=new Map(), events=[];
  const undeletable=new Set();
  const filePath=hash=>`${root}/${uid}/fit_vault/2025/${hash}.fit`;
  const archivedPath=hash=>`${root}/${uid}/fit_superseded/${id}/${hash}.fit`;
  function snapshot(key){
    const data=docs.get(key);
    return {id:key,exists:data!==undefined,data:()=>data===undefined?undefined:structuredClone(data),ref:docRef('file',key)};
  }
  function docRef(type,key){return {
    id:key,
    get:async()=>type==='file'?snapshot(key):{
      exists:activity.has(key),data:()=>structuredClone(activity.get(key)||{})
    },
    set:async(p,options={})=>apply(type,key,p,options)
  };}
  function apply(type,key,p,options){
    const map=type==='file'?docs:activity;
    const old=map.get(key)||{};
    map.set(key,options.merge?{...old,...structuredClone(p)}:structuredClone(p));
    events.push(`firestore.${type}.set:${key}`);
  }
  function files(){return {where(field,operator,value){
    assert.equal(operator,'==');return {
      limit(limit){return {get:async()=>({docs:[...docs].filter(([,v])=>String(v[field])===String(value)).slice(0,limit).map(([key])=>snapshot(key))})};}
    };}
  };}
  const db={
    doc(ref){const parts=ref.split('/');return docRef(parts[2]==='activities'?'activity':'file',parts[3]);},
    batch(){const queue=[];return {
      set(ref,data,options){queue.push([ref,data,options]);},
      async commit(){for(const [ref,data,options] of queue)await ref.set(data,options);events.push('firestore.batch.commit');}
    };}
  };
  function bucket(){return {file(p){return {
    async download(){if(!storage.has(p))throw new Error(`Storage missing ${p}`);events.push('gcs.get:'+p);return [Buffer.from(storage.get(p))];},
    async exists(){return [storage.has(p)];},
    async save(buf){storage.set(p,Buffer.from(buf));events.push('gcs.save:'+p);},
    async delete(){if(undeletable.has(p))throw new Error('SIMULATED_DELETE_ERROR');storage.delete(p);events.push('gcs.delete:'+p);}
  };}};}
  const api = new Function('db','files','fileDoc','bucket','sha256','safeName','ROOT','v078Finite',
    familyFn+'\n'+activateFn+'\nreturn {replace:v121ReplaceFitFamily,activate:v085aActivateVersion};')(
    db,files,(_uid,hash)=>docRef('file',hash),bucket,sha,
    value=>String(value||'activity.fit').replace(/[\\/]/g,'_'),root,
    x=>Number.isFinite(Number(x))?Number(x):null
  );
  const originalStart=Date.parse('2025-06-13T18:15:18.000Z');
  activity.set(id,{start_time_ms:originalStart});
  function seed(label,current=false){
    const bytes=Buffer.from(`FIT_TEST_FIXTURE_${label}_${'a'.repeat(80)}`),hash=sha(bytes),name=filePath(hash);
    storage.set(name,bytes);
    docs.set(hash,{activity_id:id,sha256:hash,object_path:name,file_name:`${label}.fit`,
      deleted_at_ms:null,is_active_version:current,archive_roles:current?['ORIGINAL_HISTORICAL']:[],
      fit_lossless_verified:!current});
    if(current)activity.set(id,{...activity.get(id),fit_active_sha256:hash});
    return {bytes,hash,name};
  }
  return {uid,id,api,storage,docs,activity,events,undeletable,seed,sha,filePath,archivedPath,originalStart};
}
function liveFileRow(world,hash){return {...world.docs.get(hash),version_index:2};}
function edited(world,minutes=1){return {payload:{start_time_ms:world.originalStart+minutes*60000},
  edits:{start_offset_s:60,heart_rate_mode:'SOURCE'},replace_existing_fit:true};}

test('INTEGRATION/01: toutes les versions sont archivees avec SHA exact avant retrait du coffre actif',async()=>{
  const w=fakeWorld(),old=w.seed('original',true),prior=w.seed('prior'),current=w.seed('corrected');
  const outcome=await w.api.replace(w.uid,w.id,current.hash,'corrected.fit',w.originalStart+60000);
  assert.equal(outcome.ok,true);
  assert.equal(outcome.archived_objects,2);
  for(const row of [old,prior]){
    assert.equal(sha(w.storage.get(w.archivedPath(row.hash))),row.hash);
    assert.equal(w.storage.has(row.name),false);
    assert.ok(w.docs.get(row.hash).deleted_at_ms>0);
  }
  assert.equal(w.storage.has(current.name),true);
  assert.equal(w.activity.get(w.id).fit_active_sha256,current.hash);
  assert.deepEqual([...w.docs.values()].filter(x=>x.deleted_at_ms==null).map(x=>x.sha256),[current.hash]);
  assert.ok(w.events.indexOf('firestore.batch.commit')<w.events.findIndex(x=>x.startsWith('gcs.delete:')),
    'Suppression GCS apres commit et archivage');
  for(const row of [old,prior])assert.ok(w.events.indexOf('gcs.save:'+w.archivedPath(row.hash))<w.events.indexOf('firestore.batch.commit'));
});

test('INTEGRATION/02: deux activations successives ne laissent qu une reference operationnelle',async()=>{
  const w=fakeWorld(),original=w.seed('original',true),first=w.seed('edit1');
  const a=await w.api.activate(w.uid,w.id,{},{...liveFileRow(w,first.hash),sha256:first.hash},
    w.activity.get(w.id),edited(w,1));
  assert.equal(a.fit_replacement_cleanup_ok,true);
  assert.equal(w.activity.get(w.id).fit_active_sha256,first.hash);
  const second=w.seed('edit2');
  const b=await w.api.activate(w.uid,w.id,{},{...liveFileRow(w,second.hash),sha256:second.hash},
    w.activity.get(w.id),edited(w,2));
  assert.equal(b.fit_replacement_cleanup_ok,true);
  assert.equal(w.activity.get(w.id).fit_active_sha256,second.hash);
  assert.equal([...w.docs.values()].filter(x=>x.deleted_at_ms==null).length,1);
  for(const prev of [original,first])assert.equal(sha(w.storage.get(w.archivedPath(prev.hash))),prev.hash);
});

test('INTEGRATION/03: SHA source incoherent bloque tout remplacement avant mutation',async()=>{
  const w=fakeWorld(),old=w.seed('original',true),current=w.seed('candidate');
  w.storage.set(old.name,Buffer.from('CORRUPTED'));
  await assert.rejects(w.api.replace(w.uid,w.id,current.hash,'new.fit',w.originalStart),/SHA original incohérent/);
  assert.equal(w.activity.get(w.id).fit_active_sha256,old.hash);
  assert.equal(w.docs.get(old.hash).deleted_at_ms,null);
  assert.equal(w.storage.has(old.name),true);
  assert.equal(w.events.some(e=>e==='firestore.batch.commit'),false);
});

test('INTEGRATION/04: archive preexistante corrompue bloque tout remplacement',async()=>{
  const w=fakeWorld(),old=w.seed('original',true),current=w.seed('candidate');
  w.storage.set(w.archivedPath(old.hash),Buffer.from('DAMAGED ARCHIVE'));
  await assert.rejects(w.api.replace(w.uid,w.id,current.hash,'new.fit',w.originalStart),/archive différente/);
  assert.equal(w.activity.get(w.id).fit_active_sha256,old.hash);
  assert.equal(w.events.some(e=>e==='firestore.batch.commit'),false);
});

test('INTEGRATION/05: le nettoyage GCS partiel est signale sans perte d archive',async()=>{
  const w=fakeWorld(),old=w.seed('original',true),current=w.seed('candidate');
  w.undeletable.add(old.name);
  const outcome=await w.api.replace(w.uid,w.id,current.hash,'new.fit',w.originalStart+60000);
  assert.equal(outcome.ok,false);
  assert.equal(w.activity.get(w.id).fit_replacement_cleanup_ok,false);
  assert.equal(sha(w.storage.get(w.archivedPath(old.hash))),old.hash);
  assert.equal(w.storage.has(old.name),true);
  assert.equal(w.activity.get(w.id).fit_active_sha256,current.hash);
  console.log('ATTENTION · suppression impossible APRES changement de reference : etat partiel conserve, ne pas deployer avant gestion operationnelle.');
});

test('INTEGRATION/05B: l activation remonte explicitement un nettoyage incomplet (risque de succes HTTP a corriger)',async()=>{
  const w=fakeWorld(),old=w.seed('original',true),next=w.seed('candidate');
  w.undeletable.add(old.name);
  const patch=await w.api.activate(w.uid,w.id,{},liveFileRow(w,next.hash),w.activity.get(w.id),edited(w));
  assert.equal(patch.fit_replacement_cleanup_ok,false);
  assert.equal(w.activity.get(w.id).fit_replacement_cleanup_ok,false);
  assert.equal(sha(w.storage.get(w.archivedPath(old.hash))),old.hash);
  console.log('CONTROLE FIX4 · l activation preserve cleanup_ok:false ; la couche HTTP doit renvoyer FIT_PARTIAL_CLEANUP.');
});

test('INTEGRATION/06: refus d un export provenant d un FIT actif absent ou ambigu',()=>{
  const start=vault.indexOf('    const activeHash=String(activity.fit_active_sha256');
  assert.ok(start>=0,'la reference active est obligatoire');
  const candidate=vault.slice(start,start+1500);
  assert.match(candidate,/originals\.length\s*!==\s*1/);
  assert.match(candidate,/FIT de référence absent\/ambigu/);
  assert.match(candidate,/cgweb141count\.fromFit\(originalRecordCount\)/);
});

test('INTEGRATION/07: Strava ecrase bien les CINQ statistiques principales, sans exception pour les temps',()=>{
  const compile=new Function('before','strava','current','lock','stravaId','CGWEB136_VERSION',patchCode+'\nreturn patch;');
  const before={distance_m:50000,timer_time_ms:9000000,elapsed_time_ms:11000000,ascent_m:1300,calories:2000};
  const remote={distance_m:49999.9,timer_time_ms:9012000,elapsed_time_ms:11111000,ascent_m:1344.6,calories:2017};
  const patch=compile(before,remote,{...before,cgweb_metrics_authority:'CGWEB140'},
    {strava_upload_id:'456',external_id:'ext',fit_preview:{sha256:'a'.repeat(64)}},'12345','CGWEB136');
  for(const k of Object.keys(remote))assert.equal(patch[k],remote[k],`Strava prioritaire : ${k}`);
  for(const k of Object.keys(before))assert.equal(patch['pre_strava_export_'+k],before[k],`Audit original : ${k}`);
  assert.equal(patch.strava_canonical_moving_time_s,9012);
  assert.equal(patch.strava_canonical_elapsed_time_s,11111);
  assert.equal(patch.cgweb_metrics_authority,'STRAVA_POST_EXPORT');
  assert.equal(patch.strava_export_state,'RECONCILED');
});

test('INTEGRATION/08: aucune reconstruction des Record depuis une route reduite en mode edition active',()=>{
  const a=vault.indexOf('          const losslessEditor = editorMode');
  assert.ok(a>=0);
  const section=vault.slice(a,a+3800);
  assert.match(section,/const \[sourceBytes\]=await bucket\(\)\.file\(parent\.object_path\)\.download\(\)/);
  assert.match(section,/cgweb141count\.fromFit\(sourceRecordCount\)/);
  assert.match(section,/finalCount\s*!==\s*sourceRecordCount/);
  assert.match(section,/cgweb140clock/);
});

test('INTEGRATION/09: le certificat SHA et le nombre de Records persistent pour les deux branches de stockage',()=>{
  const a=vault.indexOf('          if (existing.exists && previous.deleted_at_ms == null)');
  const b=vault.indexOf('          const path = objectPath(uid, hash',a);
  assert.ok(a>=0&&b>a);
  assert.match(vault.slice(a,b),/fit_lossless_verified:\s*true/);
  const c=vault.indexOf('          const metadata = {',b);
  assert.ok(c>b);
  assert.match(vault.slice(c,c+1800),/fit_lossless_verified:\s*losslessEditor/);
  assert.match(vault.slice(c,c+1800),/fit_lossless_record_count/);
});

test('INTEGRATION/10: le code commun de correction horaire ne demande aucun nouvel accord si le depart est deja aligne',()=>{
  const s=fs.readFileSync(path.join(base,'cgweb140clock.js'),'utf8');
  assert.match(s,/if\(delta===0\)return 0/);
  assert.match(vault,/originalBuffer,activity\.cgweb140_time_alignment,Number\(activity\.start_time_ms\)/);
});

// A full production validation still requires explicit live calls, intentionally excluded here.
