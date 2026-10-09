"use strict";
const assert=require("node:assert/strict");
const m=require("./cgweb140");
(async()=>{
  const {Encoder,Profile}=await import("@garmin/fitsdk");
  assert.equal(Profile.types.garminProduct[1967],"fenix2");
  const expected={elapsed_time_ms:10000,timer_time_ms:9000,distance_m:20,calories:2,ascent_m:3};
  const date=new Date("2012-06-16T07:04:00Z");
  function fixture(manufacturer=255,product=0,device=false){
    const e=new Encoder();
    e.onMesg(0,{type:4,manufacturer,product,serialNumber:42,timeCreated:date});
    if(device)e.onMesg(23,{deviceIndex:0,manufacturer,product,serialNumber:42});
    e.onMesg(21,{timestamp:date,event:0,eventType:0});
    for(let i=0;i<10;i++)e.onMesg(20,{timestamp:new Date(+date+i*1000),positionLat:1000+i,positionLong:2000+i,altitude:500+i,heartRate:150+i,distance:i*2,cadence:80,power:123});
    e.onMesg(19,{timestamp:new Date(+date+10000),startTime:date,totalElapsedTime:10,totalTimerTime:9,totalDistance:20,totalCalories:2,totalAscent:1});
    e.onMesg(18,{timestamp:new Date(+date+10000),startTime:date,totalElapsedTime:10,totalTimerTime:9,totalDistance:20,totalCalories:2,totalAscent:1,sport:1});
    e.onMesg(34,{timestamp:new Date(+date+10000),totalTimerTime:9,numSessions:1,type:0});
    return Buffer.from(e.close());
  }
  for(const [manufacturer,product,device] of [[255,0,false],[255,0,true],[1,1967,true],[1,3113,false]]){
    const b=fixture(manufacturer,product,device),copy=Buffer.from(b);
    const result=await m.candidate(b,expected,10);
    assert.deepEqual(b,copy);
    assert.equal(result.report.FC_records,10);
    assert.equal(result.decoded.sessionMesgs[0].totalAscent,3);
    assert.deepEqual(result.decoded.recordMesgs,result.source.recordMesgs);
    const {inspectFitBuffer,decodeCanonicalFitSummary}=require("./fitwriter");
    assert.equal((await inspectFitBuffer(m.forInspection(result.buffer))).ok,true);
    assert.equal((await decodeCanonicalFitSummary(m.forInspection(result.buffer))).recordCount,10);
    assert.equal(result.decoded.fileIdMesgs[0].product,manufacturer===255?1967:product);
    assert.equal(result.decoded.deviceInfoMesgs?.[0]?.manufacturer,manufacturer===255?1:device?manufacturer:undefined);
  }
  const b=fixture();
  await assert.rejects(()=>m.candidate(b,expected,11),/ORIGINAL_RECORD_COUNT_MISMATCH/);
  const bad=Buffer.from(b);bad[40]^=1;
  await assert.rejects(()=>m.candidate(bad,expected,10),/CRC/);
  await assert.rejects(()=>m.candidate(b,{...expected,ascent_m:3.2},10),/NOT_REPRESENTABLE/);
  // Add an unknown message with opaque fields; it must survive without re-encoding.
  const opaque=Buffer.from([0x4f,0,0,0x30,0x75,1,200,4,13,15,1,2,3,4]);
  const header=Buffer.from(b.subarray(0,b[0]));header.writeUInt32LE(b.readUInt32LE(4)+opaque.length,4);
  header.writeUInt16LE(m.crc(header.subarray(0,12)),12);
  const body=Buffer.concat([header,b.subarray(b[0],b.length-2),opaque]);
  const c=Buffer.alloc(2);c.writeUInt16LE(m.crc(body));
  const withOpaque=Buffer.concat([body,c]);
  const result=await m.candidate(withOpaque,expected,10);
  assert.notEqual(result.buffer.indexOf(opaque),-1);
  // Compressed timestamp records and big-endian definitions remain readable.
  function append(source,extra){
    const header=Buffer.from(source.subarray(0,source[0]));header.writeUInt32LE(source.readUInt32LE(4)+extra.length,4);
    header.writeUInt16LE(m.crc(header.subarray(0,12)),12);
    const body=Buffer.concat([header,source.subarray(source[0],source.length-2),extra]);
    const checksum=Buffer.alloc(2);checksum.writeUInt16LE(m.crc(body));return Buffer.concat([body,checksum]);
  }
  const timestamp=Math.floor((+date-Date.UTC(1989,11,31))/1000);
  const compressed=Buffer.from([0x40,0,0,20,0,2,253,4,0x86,3,1,2,0,0,0,0,0,151,0x80|((timestamp+1)&31),152]);
  compressed.writeUInt32LE(timestamp,13);
  const compressedSource=append(b,compressed);
  const comp=await m.candidate(compressedSource,expected,12);
  assert.deepEqual(comp.decoded.recordMesgs,comp.source.recordMesgs);
  assert.equal(comp.decoded.recordMesgs.at(-1).heartRate,152);
  const endian=Buffer.from([0x4e,0,1,0,20,2,253,4,0x86,3,1,2,14,0,0,0,0,153]);
  endian.writeUInt32BE(timestamp+2,13);
  const be=await m.candidate(append(b,endian),expected,11);
  assert.equal(be.decoded.recordMesgs.at(-1).heartRate,153);
  assert.deepEqual(be.decoded.recordMesgs,be.source.recordMesgs);
  console.log("CGWEB140 TESTS OK : originaux intacts, FC/GPS/altitude et données inconnues conservés, appareils et blocages vérifiés.");
})().catch(e=>{console.error(e);process.exitCode=1;});
