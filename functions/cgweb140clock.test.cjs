"use strict";
const assert=require("assert/strict"),fit=require("./cgweb140"),clock=require("./cgweb140clock");
(async()=>{
 const {Encoder}=await import("@garmin/fitsdk");
 const start=Date.parse("2012-06-15T22:02:00Z"),target=start+32400000;
 function sample(manufacturer=255,product=0){
  const e=new Encoder(),d=new Date(start);
  e.onMesg(0,{type:4,manufacturer,product,timeCreated:d});
  e.onMesg(21,{timestamp:d,event:0,eventType:0});
  for(let i=0;i<10;i++)e.onMesg(20,{timestamp:new Date(start+i*1000),positionLat:12345+i,positionLong:54321+i,altitude:450+i,heartRate:150+i,distance:i*2,cadence:80});
  e.onMesg(19,{timestamp:new Date(start+10000),startTime:d,totalElapsedTime:10,totalTimerTime:9,totalDistance:20,totalCalories:2,totalAscent:3});
  e.onMesg(18,{timestamp:new Date(start+10000),startTime:d,totalElapsedTime:10,totalTimerTime:9,totalDistance:20,totalCalories:2,totalAscent:3,sport:1});
  e.onMesg(34,{timestamp:new Date(start+10000),localTimestamp:Math.floor((start+10000-Date.UTC(1989,11,31))/1000),totalTimerTime:9,numSessions:1,type:0});
  return Buffer.from(e.close());
 }
 const approved=b=>({state:"USER_CONFIRMED",original_sha256:fit.sha(b),original_start_time_ms:start,target_start_time_ms:target,offset_seconds:32400});
 for(const args of [[255,0],[1,1967]]){
  const b=sample(...args),copy=Buffer.from(b),shifted=await clock.align(b,approved(b),target);
  assert.deepEqual(b,copy);
  const a=await fit.inspect(b),c=await fit.inspect(shifted.buffer);
  for(let i=0;i<10;i++){
   const {timestamp:ta,...va}=a.recordMesgs[i],{timestamp:tc,...vc}=c.recordMesgs[i];
   assert.equal(+tc-+ta,32400000);assert.deepEqual(va,vc);
  }
  const result=await fit.candidate(shifted.buffer,{distance_m:20,timer_time_ms:9000,elapsed_time_ms:10000,calories:2,ascent_m:394},10);
  assert.equal(result.decoded.sessionMesgs[0].startTime.getTime(),target);
  assert.equal(result.report.FC_records,10);assert.equal(result.decoded.sessionMesgs[0].totalAscent,394);
  await assert.rejects(()=>clock.align(b,null,target),/non autorisée/);
  await assert.rejects(()=>clock.align(b,{...approved(b),original_sha256:"bad"},target),/non autorisée/);
  await assert.rejects(()=>clock.align(b,approved(b),target+1000),/non autorisée/);
  assert.deepEqual((await clock.align(b,null,start)).buffer,b);
 }
 // Compressed timestamp boundary: +9 h changes the 5-bit timestamp offset.
 const b=sample(),seconds=Math.floor((start-Date.UTC(1989,11,31))/1000);
 const extra=Buffer.from([0x40,0,0,20,0,2,253,4,0x86,3,1,2,0,0,0,0,0,151,0x80|((seconds+1)&31),152]);extra.writeUInt32LE(seconds,13);
 const header=Buffer.from(b.subarray(0,b[0]));header.writeUInt32LE(b.readUInt32LE(4)+extra.length,4);header.writeUInt16LE(fit.crc(header.subarray(0,12)),12);
 const body=Buffer.concat([header,b.subarray(b[0],b.length-2),extra]),crc=Buffer.alloc(2);crc.writeUInt16LE(fit.crc(body));const compressed=Buffer.concat([body,crc]);
 const aligned=await clock.align(compressed,approved(compressed),target),decoded=await fit.inspect(aligned.buffer);
 assert.equal(decoded.recordMesgs.at(-1).timestamp.getTime(),target+1000);
 assert.equal(decoded.recordMesgs.at(-1).heartRate,152);
 assert.equal(aligned.report.all_non_time_bytes_verified,true);
 console.log("CGWEB140 FIX2 TESTS OK : +9 h, intervalles et mesures conservés, permissions liées au SHA, profil Fenix 2 et D+ vérifiés.");
})().catch(e=>{console.error(e);process.exitCode=1;});
