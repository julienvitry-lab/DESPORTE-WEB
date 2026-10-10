'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const start = '  // CGWEB140 FIX3 FIX2: a webhook must never replace a full FIT-backed route.';
const end = '  // Les choix manuels et la corbeille SPORT restent prioritaires sur Strava.';
assert.equal(source.split(start).length, 2, 'Protection webhook unique');
const body = source.split(start)[1].split(end)[0];
assert.ok(body && body.includes('route=null'), 'Conservation du parcours');
const execute = new Function('existing','activity','route',body+'\nreturn {activity,route};');
const fields = ['distance_m','timer_time_ms','elapsed_time_ms','ascent_m','descent_m','calories',
 'avg_hr','max_hr','record_count','gps_point_count','start_time_ms','avg_speed_mps','max_speed_mps'];
for(const authority of ['CGWEB140','STRAVA_POST_EXPORT']){
 test(`webhook preserves FIT route and complete summary for ${authority}`,()=>{
  const existing = {cgweb_metrics_authority:authority};
  const incoming = {cgweb_metrics_authority:'REMOTE_UNVERIFIED'};
  fields.forEach((field,i)=>{existing[field]=1000+i;incoming[field]=i;});
  const result = execute(existing,incoming,{source_point_count:12,lat:[1,2]});
  for(const field of fields) assert.equal(result.activity[field],existing[field],field);
  assert.equal(result.activity.cgweb_metrics_authority,authority);
  assert.equal(result.route,null);
 });
}
test('unmanaged Strava activity continues normal import',()=>{
 const incoming={distance_m:10};
 const route={lat:[1,2]};
 const result=execute({},incoming,route);
 assert.equal(result.activity.distance_m,10);
 assert.equal(result.route,route);
});
