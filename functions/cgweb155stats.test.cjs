'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const stats=require('./cgweb155stats');
const source=fs.readFileSync(path.join(__dirname,'../web/cgweb144stats.js'),'utf8');
test('année 2026 : douze lignes mensuelles, y compris sans activité',()=>{
 const rows=stats.buckets(2026,null);assert.equal(rows.length,12);assert.equal(rows[0].label,'Janvier');assert.equal(rows[11].key,'2026-12');
});
test('octobre 2026 : cinq semaines ISO, aucune date hors octobre incluse',()=>{
 const rows=stats.buckets(2026,10);assert.equal(rows.length,5);assert.equal(rows[0].key,'2026-09-28');
 assert.equal(rows[0].period_start,'2026-10-01');assert.equal(rows[0].period_end,'2026-10-04');
 assert.equal(rows.at(-1).period_end,'2026-10-31');
});
test('les semaines du 1er janvier peuvent appartenir à année ISO précédente',()=>{
 const rows=stats.buckets(2021,1);assert.equal(rows[0].iso_year,2020);assert.equal(rows[0].iso_week,53);
});
test('heure locale Paris, changement heure été et hiver',()=>{
 assert.equal(stats.localDate(Date.parse('2026-03-31T21:30:00Z')),'2026-03-31');
 assert.equal(stats.localDate(Date.parse('2026-03-31T22:30:00Z')),'2026-04-01');
 assert.equal(stats.localDate(Date.parse('2026-10-31T22:30:00Z')),'2026-10-31');
 assert.equal(stats.localDate(Date.parse('2026-10-31T23:30:00Z')),'2026-11-01');
});
test('métriques : somme des temps/distances, GAP pondéré par distance, pas moyenne des allures',()=>{
 const rows=[
  {sport:1,distance_m:1000,timer_time_ms:360000,elapsed_time_ms:400000,ascent_m:10,calories:100,gap_seconds_per_km:300},
  {sport:1,distance_m:3000,timer_time_ms:900000,elapsed_time_ms:910000,ascent_m:30,calories:300,gap_seconds_per_km:360},
 ];
 const x=stats.aggregate(rows,'cgweb','run');assert.equal(x.activities,2);
 assert.equal(x.metrics.distance_m.value,4000);assert.equal(x.metrics.moving_time_s.value,1260);
 assert.equal(x.metrics.average_pace_sec_per_km.value,315);assert.equal(x.metrics.gap_sec_per_km.value,345);
 assert.equal(x.metrics.calories.value,400);
});
test('une calorie absente ne devient jamais zéro ni total complet',()=>{
 const x=stats.aggregate([{sport:1,distance_m:1000,timer_time_ms:300000,calories:100},{sport:1,distance_m:1000,timer_time_ms:300000}],'cgweb','run');
 assert.equal(x.metrics.calories.value,null);assert.equal(x.metrics.calories.available,1);assert.equal(x.metrics.calories.total,2);
});
test('GAP Strava indisponible, pas imputé depuis allure',()=>{
 const s=stats.aggregate([{id:5,sport_type:'Run',distance:10000,moving_time:3000,elapsed_time:3050,total_elevation_gain:50}],'strava','run');
 assert.equal(s.metrics.gap_sec_per_km.value,null);assert.equal(s.metrics.calories.value,null);
 assert.equal(s.metrics.average_pace_sec_per_km.value,300);
});
test('une demande annuelle lit Firestore une fois et Strava une fois pour 12 mois',async()=>{
 const calls=[];let dbReads=0;
 const t=Date.parse('2026-10-04T08:00:00Z');
 const db={collection:()=>({where(){return this;},async get(){dbReads++;return {docs:[{data:()=>({sport:1,start_time_ms:t,distance_m:7000,timer_time_ms:2100000,ascent_m:60,calories:490,gap_seconds_per_km:310})}]};}})};
 const r=await stats.breakdown({db,root:'sport_users',uid:'u',tokenDocument:async()=>({refresh_token:'x',scope:'activity:read_all'}),
  stravaGet:async(_uid,p)=>{calls.push(p);return [{id:123,start_date:'2026-10-04T08:00:00Z',distance:7000,moving_time:2100,elapsed_time:2120,total_elevation_gain:60,calories:490,sport_type:'Run'}];}},
 {year:2026,sport:'run'});
 assert.equal(r.rows.length,12);assert.equal(dbReads,1);assert.equal(calls.length,1);assert.equal(r.rows[9].cgweb.activities,1);
 assert.equal(r.totals.cgweb.metrics.distance_m.value,7000);assert.equal(r.totals.strava.metrics.distance_m.value,7000);
 assert.equal(r.rows[9].cgweb.metrics.average_pace_sec_per_km.value,300);
});
test('mois septembre 2026: semaine à cheval tronquée pour décompte sans double',async()=>{
 const ts=Date.parse('2026-09-30T23:30:00Z'); // Paris = Oct 1: shouldn't be October exclusion issue
 const db={collection:()=>({where(){return this;},async get(){return {docs:[{data:()=>({start_time_ms:ts,sport:1,distance_m:1000,timer_time_ms:300000,ascent_m:4,calories:55})}]};}})};
 const r=await stats.breakdown({db,root:'sport_users',uid:'u',tokenDocument:async()=>({refresh_token:'x',scope:'activity:read_all'}),stravaGet:async()=>[]},{year:2026,month:10});
 assert.equal(r.rows.length,5);assert.equal(r.rows[0].cgweb.activities,1);
});
test('protège les scopes Strava et les entrées invalides',async()=>{
 await assert.rejects(stats.breakdown({tokenDocument:async()=>({refresh_token:'yes',scope:'activity:read'})},{year:2026}),/activity:read_all/);
 await assert.rejects(stats.breakdown({},{year:2026,month:13}),/mois invalide/);
});
test('UI : année 2026, 12 mois, semaine si mois, sous-onglet de classe native placé avant les autres',()=>{
 assert.match(source,/year\.value='2026'/);assert.match(source,/MONTHS\.slice\(1\)/);
 assert.match(source,/container\.prepend\(button\)/);assert.match(source,/ux-subnav-button/);
 assert.match(source,/action=period_breakdown/);
 assert.doesNotMatch(source,/action=(?:version|upload|delete|unlink)/);
});
