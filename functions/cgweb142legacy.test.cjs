'use strict';
/* CGWEB142 · deterministic in-memory tests; zero network/cloud writes */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const recovery=require('./cgweb139fix1');
const source=fs.readFileSync(path.join(__dirname,'cgweb139fix1.js'),'utf8');
const KEY='5187',REMOTE='20502985541',UID='fixture-user',ROOT='sport_users';
const START=Date.parse('2012-06-06T09:04:00Z');

// Mock Firestore must reject undefined, even deeply nested in an archive.
function rejectUndefined(value, location='$') {
  if(value===undefined) throw new Error(`Firestore invalid undefined at ${location}`);
  if(Array.isArray(value)) return value.forEach((v,i)=>rejectUndefined(v,`${location}[${i}]`));
  if(value && typeof value==='object' && Object.getPrototypeOf(value)===Object.prototype)
    for(const [k,v] of Object.entries(value))rejectUndefined(v,`${location}.${k}`);
}
function world({lock=null,remote='PRESENT',scope='activity:read_all activity:write',athlete='123',duplicate=false}={}) {
  const aPath=`${ROOT}/${UID}/activities/${KEY}`;
  const lPath=`${ROOT}/${UID}/strava_outbound_exports/${KEY}`;
  const docs=new Map([[aPath,{strava_activity_id:REMOTE,start_time_ms:START,distance_m:12510,
    calories:650,timer_time_ms:4000000,record_count:1348}]]);
  if (lock!==null) docs.set(lPath,{...lock});
  const mutation=[];
  const ref=(p)=>({path:p,id:p.split('/').at(-1),
    get:async()=>snap(p),
    collection(name){return {doc(id){return ref(`${p}/${name}/${id}`)}};}});
  const snap=p=>({exists:docs.has(p),data:()=>docs.get(p),ref:ref(p)});
  const db={doc:ref,async runTransaction(fn){
    const queue=[];
    const tx={get:async r=>snap(r.path),create(r,val){rejectUndefined(val,r.path);queue.push(['create',r.path,val]);},
      delete(r){queue.push(['delete',r.path]);},set(r,val,opts){rejectUndefined(val,r.path);queue.push(['set',r.path,val,opts]);}};
    await fn(tx);
    for(const [op,p,data,opts] of queue){
      if(op==='create'){assert.ok(!docs.has(p));docs.set(p,data)}
      if(op==='delete')docs.delete(p);
      if(op==='set')docs.set(p,opts?.merge?{...docs.get(p),...data}:data);
      mutation.push(`${op}:${p}`);
    }
  }};
  const requests=[];
  const originalFetch=global.fetch;
  global.fetch=async url=>{
    requests.push(String(url));
    let status=200,data={};
    if(url.endsWith('/athlete'))data={id:Number(athlete)};
    else if(url.includes(`/activities/${REMOTE}`)){
      status=remote==='PRESENT'?200:remote==='DELETED'?404:503;
      data=remote==='PRESENT'?{id:Number(REMOTE)}:{};
    }else if(url.includes('/athlete/activities?')){
      data=duplicate?[{id:999,start_date:new Date(START).toISOString(),distance:12510}]:[];
    }else throw Error(`Unexpected Strava call: ${url}`);
    return {status,async json(){return data}};
  };
  const app=recovery.createRecovery({db,root:ROOT,
    admin:{firestore:{FieldValue:{serverTimestamp:()=>0}}},
    tokenDocument:async()=>({refresh_token:'not-a-real-token',scope,athlete:{id:Number(athlete)}}),
    refreshTokenIfNeeded:async()=>({access_token:'mock'}),apiBase:'https://fake.strava/api/v3',secret:()=> 'fixture-secret'});
  return {app,docs,mutation,requests,aPath,lPath,restore:()=>{global.fetch=originalFetch}};
}

// Tests intentionally serialize (global.fetch is an in-memory mock).
const run=(name,fn)=>test(name,{concurrency:false},async()=>{
  let w;
  try {w=await fn(()=>w);} finally {if(w)w.restore();}
});

// Caller creates each fake world and restores global.fetch after the test.
test('CGWEB142/01 : legacy sans verrou + activite existante = aucun delien',async()=>{
  const w=world();try {
    const r=await w.app.check(UID,KEY);
    assert.equal(r.status,'STILL_EXISTS');assert.equal(r.ok,false);
    assert.equal(r.link_mode,'LEGACY_NO_LOCK');assert.equal(r.proof,null);
    assert.equal(w.mutation.length,0);
    assert.match(r.diagnostic,/conserver le lien/i);
  } finally {w.restore();}
});
test('CGWEB142/02 : legacy supprime = preuve puis confirmation manuelle, sans upload',async()=>{
  const w=world({remote:'DELETED'});try {
    const r=await w.app.check(UID,KEY);
    assert.equal(r.status,'VERIFIED_NOT_FOUND');assert.equal(r.ok,true);
    assert.equal(r.link_mode,'LEGACY_NO_LOCK');assert.ok(r.proof);
    assert.equal(w.mutation.length,0,'check read-only');
    await assert.rejects(w.app.confirm(UID,{activity_key:KEY,old_strava_activity_id:REMOTE,
      proof:r.proof,confirmation:'wrong'}),/Confirmation explicite/);
    const out=await w.app.confirm(UID,{activity_key:KEY,old_strava_activity_id:REMOTE,
      proof:r.proof,confirmation:r.confirmation_text});
    assert.equal(out.status,'UNLINKED_FOR_SAFE_REIMPORT');
    const a=w.docs.get(w.aPath);
    assert.equal(a.strava_activity_id,null);assert.equal(a.record_count,1348);
    assert.equal(a.distance_m,12510);assert.equal(a.timer_time_ms,4000000);
    const hist=[...w.docs].find(([p])=>p.includes('/strava_export_history/'));
    assert.equal(hist[1].legacy_link_mode,'LEGACY_NO_LOCK');
    assert.equal(hist[1].prior_export_lock,null);
    assert.equal(hist[1].old_activity_link.strava_export_state,null);
    assert.equal(hist[1].old_activity_link.strava_upload_id,null);
    assert.ok(!w.mutation.some(x=>x.includes('fit_vault')));
    assert.ok(w.requests.every(url=>!url.includes('/uploads')));
  } finally {w.restore();}
});
test('CGWEB142/03 : ancien verrou terminal incomplet peut etre verifie et archive',async()=>{
  const w=world({remote:'DELETED',lock:{strava_activity_id:REMOTE,state:'RECONCILED'}});try {
    const r=await w.app.check(UID,KEY);
    assert.equal(r.link_mode,'LEGACY_INCOMPLETE_LOCK');
    await w.app.confirm(UID,{activity_key:KEY,old_strava_activity_id:REMOTE,
      proof:r.proof,confirmation:r.confirmation_text});
    assert.ok(!w.docs.has(w.lPath));
    const hist=[...w.docs].find(([p])=>p.includes('/strava_export_history/'));
    assert.equal(hist[1].prior_export_lock.state,'RECONCILED');
  } finally {w.restore();}
});
test('CGWEB142/04 : ancien verrou contradictoire jamais contourne',async()=>{
  const w=world({lock:{strava_activity_id:'9999',state:'RECONCILED'}});try {
    await assert.rejects(w.app.check(UID,KEY),/autre identifiant/);
    assert.equal(w.requests.length,0);assert.equal(w.mutation.length,0);
  } finally {w.restore();}
});
test('CGWEB142/05 : verrou d export actif jamais contourne',async()=>{
  const w=world({lock:{strava_activity_id:REMOTE,state:'PREPARED',lock_token:'token'}});try {
    await assert.rejects(w.app.check(UID,KEY),/actif ou contradictoire/);
  } finally {w.restore();}
});
test('CGWEB142/06 : 404 + doublon bloque la liberation',async()=>{
  const w=world({remote:'DELETED',duplicate:true});try {
    const r=await w.app.check(UID,KEY);
    assert.equal(r.status,'POSSIBLE_DUPLICATE');assert.equal(r.proof,null);
    assert.equal(w.mutation.length,0);
  } finally {w.restore();}
});
test('CGWEB142/07 : absence des scopes bloque sans mutation',async()=>{
  const w=world({scope:'activity:read'});try {
    const r=await w.app.check(UID,KEY);
    assert.equal(r.status,'UNVERIFIABLE_SCOPE');assert.equal(r.proof,null);
    assert.equal(w.mutation.length,0);
  } finally {w.restore();}
});
test('CGWEB142/08 : nouvelle creation de verrou entre check et confirmation invalide preuve',async()=>{
  const w=world({remote:'DELETED'});try {
    const r=await w.app.check(UID,KEY);
    w.docs.set(w.lPath,{state:'RECONCILED',strava_activity_id:REMOTE,lock_token:'new-lock'});
    await assert.rejects(w.app.confirm(UID,{activity_key:KEY,old_strava_activity_id:REMOTE,
      proof:r.proof,confirmation:r.confirmation_text}),/Preuve expir|Preuve/);
    assert.equal(w.docs.get(w.aPath).strava_activity_id,REMOTE);
  } finally {w.restore();}
});
test('CGWEB142/09 : ancien export complet conserve la logique stricte',async()=>{
  const w=world({remote:'DELETED',lock:{strava_activity_id:REMOTE,state:'RECONCILED',lock_token:'known-token'}});try {
    const r=await w.app.check(UID,KEY);
    assert.equal(r.link_mode,'MANAGED');
    const out=await w.app.confirm(UID,{activity_key:KEY,old_strava_activity_id:REMOTE,
      proof:r.proof,confirmation:r.confirmation_text});
    assert.equal(out.ok,true);assert.equal(w.docs.get(w.aPath).strava_activity_id,null);
  } finally {w.restore();}
});
test('CGWEB142/10 : protection structurelle appels Strava sans POST automatique',()=>{
  assert.match(source,/if \(remote.status === 200\)/);
  assert.match(source,/if \(rescanned.status !== "VERIFIED_NOT_FOUND"\)/);
  assert.match(source,/if \(lSnap.exists\) tx.delete\(lRef\)/);
  assert.match(source,/proofLock\(managed\)/);
});


test('CGWEB142 FIX1/11 : les valeurs historiques presentes restent intactes',async()=>{
  const w=world({remote:'DELETED'});
  try {
    const a=w.docs.get(w.aPath);
    a.strava_upload_id='archive_upload_123';
    a.strava_export_state='RECONCILED';
    const proof=await w.app.check(UID,KEY);
    const result=await w.app.confirm(UID,{activity_key:KEY,
      old_strava_activity_id:REMOTE,proof:proof.proof,
      confirmation:proof.confirmation_text});
    assert.equal(result.ok,true);
    const archive=[...w.docs].find(([k])=>k.includes('/strava_export_history/'))?.[1];
    assert.equal(archive.old_activity_link.strava_upload_id,'archive_upload_123');
    assert.equal(archive.old_activity_link.strava_export_state,'RECONCILED');
    assert.ok(!w.requests.some(u=>u.includes('/uploads')));
  } finally {w.restore();}
});
