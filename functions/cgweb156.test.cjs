'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const gap=require('./cgweb156gap');
const stats=require('./cgweb155stats');
const app=fs.readFileSync(path.resolve(__dirname,'../web/app.js'),'utf8');
const ui=fs.readFileSync(path.resolve(__dirname,'../web/cgweb144stats.js'),'utf8');
const date=Date.parse('2026-10-07T05:00:00Z');
const route=(slope=0)=>({distance_m:Array.from({length:61},(_,i)=>i*20),alt_m:Array.from({length:61},(_,i)=>100+i*20*slope/100),time_ms:Array.from({length:61},(_,i)=>date+i*7*1000)});
test('GAP plat : allure comparable à vitesse mesurée',()=>{const g=gap.calculate(route(0));assert.ok(g);assert.ok(Math.abs(g.gap_sec_per_km-350)<0.001);assert.ok(g.coverage>.9)});
test('GAP trail : montée plus rapide que allure brute',()=>{const g=gap.calculate(route(10));assert.ok(g.gap_sec_per_km<350);assert.ok(g.gap_sec_per_km>60)});
test('GAP : aucun chiffre fabriqué sans altitude ou vitesse',()=>{assert.equal(gap.calculate({distance_m:[0,100],alt_m:[]}),null);assert.equal(gap.calculate({distance_m:[0,100],alt_m:[0,0]}),null)});
test('GAP trail : descente asymétrique et bornée',()=>{assert.equal(gap.ratio(-35),1.25);assert.equal(gap.ratio(0),1);assert.ok(gap.ratio(10)>1)});
test('Charge suit le calcul affiché dans les activités',()=>{const x=stats.cg156Load({distance_m:10040,timer_time_ms:3046000,ascent_m:101,avg_hr:80});assert.equal(x,54);assert.equal(stats.cg156Load({}),null)});
test('CGWEB : 2026 mois et année/mois semaines restent indépendants de Strava',async()=>{
 let readStrava=0,auth=0,readRoute=0;
 const db={collection:()=>({where(){return this;},async get(){return {docs:[{id:'act1',data:()=>({start_time_ms:date,sport:1,distance_m:1200,timer_time_ms:420000,ascent_m:120,training_load:40})}]}}}),doc:()=>({get:async()=>{readRoute++;return {exists:true,data:()=>route(10)}}})};
 const r=await stats.breakdown({db,root:'sport_users',uid:'u',tokenDocument:async()=>{auth++;throw Error('No OAuth');},stravaGet:async()=>{readStrava++;return []}},{year:2026,sport:'run'});
 assert.equal(r.rows.length,12);assert.equal(r.compare,false);assert.equal(readStrava,0);assert.equal(auth,0);assert.equal(readRoute,1);
 assert.equal(r.totals.cgweb.metrics.load.value,40);
 assert.ok(r.totals.cgweb.metrics.gap_sec_per_km.value>0);
});
test('Comparaison Strava uniquement sur demande',async()=>{
 let calls=0;const db={collection:()=>({where(){return this;},async get(){return {docs:[]}}})};
 const r=await stats.breakdown({db,root:'sport_users',uid:'u',tokenDocument:async()=>({refresh_token:'abc',scope:'activity:read_all'}),stravaGet:async()=>{calls++;return []}},{year:2026,compare:true});
 assert.equal(r.compare,true);assert.equal(calls,1);
});
test('UI : pas de compteur activités/calories, course à pied par défaut et comparaison explicite',()=>{
 assert.match(ui,/id="cg144Compare"/);assert.match(ui,/compare:comparing/);assert.match(ui,/value="run" selected/);
 assert.doesNotMatch(ui,/\['activities','int'\]/);assert.doesNotMatch(ui,/\['calories','cal'\]/);
 assert.match(ui,/\['load','load'\]/);assert.match(ui,/enteringAnalysis&&!active/);
});
test('Activités : oldest par défaut, GAP sous temps, GAP détail',()=>{
 assert.match(app,/<option value="oldest" selected>/);
 assert.match(app,/\["cgweb099Sort","oldest"\]/);
 assert.match(app,/CGWEB156_GAP/);assert.match(app,/GAP trail V2/);
});
