"use strict";
// CGWEB140: patch existing bytes; never decode/re-encode the record stream.
const crypto = require("crypto");
const cgweb143 = require("./cgweb143session");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
function fail(code) { throw Object.assign(new Error(`CGWEB140 : ${code}`), {status:422}); }
function crc(b) {
  let c=0;
  for(const x of b) { c ^= x; for(let i=0;i<8;i++) c=(c&1)?(c>>>1)^0xa001:c>>>1; }
  return c;
}
function scan(b) {
  if(b.length<14 || b.toString("ascii",8,12)!==".FIT") fail("INVALID_FIT");
  const h=b[0], end=h+b.readUInt32LE(4);
  if(h<12 || end+2!==b.length || crc(b)!==0) fail("INVALID_SIZE_OR_CRC");
  if(h>=14 && crc(b.subarray(0,h))!==0) fail("INVALID_HEADER_CRC");
  const defs=new Map(), rows=[];
  let p=h;
  const need=n=>{if(p+n>end)fail("TRUNCATED_FIT");};
  while(p<end) {
    const start=p; need(1); const header=b[p++];
    const compressed=!!(header&128), local=compressed?(header>>5)&3:header&15;
    if(!compressed && header&64) {
      need(5); const architecture=b[p+1];
      if(architecture!==0 && architecture!==1)fail("UNKNOWN_ARCHITECTURE");
      const global=architecture?b.readUInt16BE(p+2):b.readUInt16LE(p+2);
      const n=b[p+4]; p+=5; need(n*3);
      const fields=[];
      for(let i=0;i<n;i++){fields.push({num:b[p],size:b[p+1],type:b[p+2]});p+=3;}
      const dev=[];
      if(header&32){need(1);const k=b[p++];need(k*3);for(let i=0;i<k;i++){dev.push({num:b[p],size:b[p+1],index:b[p+2]});p+=3;}}
      defs.set(local,{global,architecture,fields,dev});
      rows.push({start,end:p,definition:true,global});
    } else {
      const d=defs.get(local); if(!d)fail("MISSING_DEFINITION");
      if(compressed && (d.fields[0]?.num!==253 || d.fields[0]?.size!==4))fail("INVALID_COMPRESSED_DEFINITION");
      const fields=[];
      for(let i=0;i<d.fields.length;i++) {
        const f=d.fields[i];
        if(compressed && i===0 && f.num===253)continue;
        need(f.size);fields.push({...f,offset:p});p+=f.size;
      }
      for(const f of d.dev){need(f.size);p+=f.size;}
      rows.push({start,end:p,definition:false,...d,fields,compressed,local});
    }
  }
  return {header:h,end,rows};
}
function value(b,r,num) {
  const f=r.fields.find(f=>f.num===num);if(!f)return null;
  const t=f.type&31, be=r.architecture===1;
  if([0,2,10].includes(t)&&f.size===1){const n=b[f.offset];return n===(t===10?0:255)?null:n;}
  if([4,11].includes(t)&&f.size===2){const n=be?b.readUInt16BE(f.offset):b.readUInt16LE(f.offset);return n===(t===11?0:65535)?null:n;}
  if([6,12].includes(t)&&f.size===4){const n=be?b.readUInt32BE(f.offset):b.readUInt32LE(f.offset);return n===(t===12?0:4294967295)?null:n;}
  fail("UNSUPPORTED_FIELD_TYPE");
}
function set(b,r,num,n,allowed) {
  const f=r.fields.find(f=>f.num===num);if(!f)fail(`MISSING_FIELD_${r.global}_${num}`);
  const t=f.type&31, max=f.size===1?254:f.size===2?65534:f.size===4?4294967294:-1;
  if(![0,2,4,6,10,11,12].includes(t)|| !Number.isInteger(n)||n<0||n>max)fail("FIELD_VALUE_OUT_OF_RANGE");
  if(f.size===1)b[f.offset]=n;
  else if(f.size===2)r.architecture?b.writeUInt16BE(n,f.offset):b.writeUInt16LE(n,f.offset);
  else if(f.size===4)r.architecture?b.writeUInt32BE(n,f.offset):b.writeUInt32LE(n,f.offset);
  else fail("UNSUPPORTED_FIELD_SIZE");
  for(let i=0;i<f.size;i++)allowed.add(f.offset+i);
}
function recordDigest(b,parsed) {
  const h=crypto.createHash("sha256");let count=0;
  for(const r of parsed.rows)if(!r.definition&&r.global===20){h.update(b.subarray(r.start,r.end));count++;}
  return {count,sha256:h.digest("hex")};
}
function forInspection(b) {
  const parsed=scan(b);if(!parsed.rows.some(r=>r.compressed))return b;
  const chunks=[];let timestamp=null;
  for(const r of parsed.rows){
    if(r.definition){chunks.push(b.subarray(r.start,r.end));continue;}
    if(r.compressed){
      // SDK currently cannot decode compressed timestamps: expand ONLY the audit copy.
      if(timestamp==null)fail("COMPRESSED_TIMESTAMP_WITHOUT_BASE");
      const offset=b[r.start]&31;
      timestamp+=((offset-(timestamp&31)+32)&31);
      const t=Buffer.alloc(4);r.architecture?t.writeUInt32BE(timestamp):t.writeUInt32LE(timestamp);
      chunks.push(Buffer.from([r.local]),t,b.subarray(r.start+1,r.end));
    }else{
      const t=value(b,r,253);if(t!=null)timestamp=t;
      chunks.push(b.subarray(r.start,r.end));
    }
  }
  const header=Buffer.from(b.subarray(0,parsed.header)),data=Buffer.concat(chunks);
  header.writeUInt32LE(data.length,4);if(parsed.header>=14)header.writeUInt16LE(crc(header.subarray(0,parsed.header-2)),parsed.header-2);
  const body=Buffer.concat([header,data]),checksum=Buffer.alloc(2);checksum.writeUInt16LE(crc(body));return Buffer.concat([body,checksum]);
}
async function inspect(b) {
  const {Decoder,Stream}=await import("@garmin/fitsdk");
  const d=new Decoder(Stream.fromBuffer(forInspection(b)));if(!d.checkIntegrity())fail("SDK_INTEGRITY_FAILED");
  const out=d.read({applyScaleAndOffset:true,convertTypesToStrings:false,convertDateTimesToDates:true,includeUnknownData:true,mergeHeartRates:false,legacyArrayMode:false});
  if(out.errors?.length)fail("SDK_DECODE_ERRORS");
  return out.messages;
}
async function candidate(original,expected,declared) {
  const parsed=scan(original), identity=parsed.rows.filter(r=>!r.definition&&r.global===0);
  if(identity.length!==1 || value(original,identity[0],0)!==4)fail("NOT_SINGLE_ACTIVITY_FILE");
  const sessions=parsed.rows.filter(r=>!r.definition&&r.global===18);
  if(sessions.length!==1)fail("MULTI_SESSION_OR_SESSION_MISSING");
  const records=recordDigest(original,parsed);
  if(!records.count || (declared!=null && records.count!==Number(declared)))fail("ORIGINAL_RECORD_COUNT_MISMATCH");
  const source=await inspect(original), out=Buffer.from(original),allowed=new Set();
  const manufacturer=value(original,identity[0],1),product=value(original,identity[0],2);
  const unknown=manufacturer==null||manufacturer===0||manufacturer===255||product==null||product===0;
  if(unknown){set(out,identity[0],1,1,allowed);set(out,identity[0],2,1967,allowed);}
  // GPS/altitude/FC records, laps, events and developer fields remain byte-identical.
  const s=sessions[0];
  const missing=[];
  for(const [field,n] of [[7,expected.elapsed_time_ms],[8,expected.timer_time_ms],[9,expected.distance_m*100],[11,expected.calories],[22,expected.ascent_m]]) {
    if(!Number.isFinite(n))fail("EXPECTED_METRIC_MISSING");
    // FIT stores integer milliseconds, centimetres, kilocalories and metres.
    // Keep CGWEB/Strava decimal precision in the database after reconciliation;
    // write the nearest representable FIT unit into the Session summary only.
    const rounded=cgweb143.quantize(field,n);
    if(s.fields.some(f=>f.num===field))set(out,s,field,rounded,allowed);
    else missing.push({field,value:rounded});
  }
  let extra=Buffer.alloc(0);
  if(unknown){
    const devices=parsed.rows.filter(r=>!r.definition&&r.global===23&&value(original,r,0)===0);
    if(devices.length>1)fail("AMBIGUOUS_CREATOR_DEVICE");
    if(devices.length){set(out,devices[0],2,1,allowed);set(out,devices[0],4,1967,allowed);}
    else {
      // Append a creator device, after all existing data; no local definition is disturbed.
      extra=Buffer.from([0x4f,0,0,23,0,3,0,1,2,2,2,0x84,4,2,0x84,0x0f,0,1,0,0xaf,7]);
    }
  }
  // Check EVERY existing byte: no change beyond the explicit allowlist.
  for(let i=parsed.header;i<parsed.end;i++)if(out[i]!==original[i]&&!allowed.has(i))fail("UNAUTHORIZED_BYTE_CHANGE");
  // Insert Session-only declarations without editing/rebuilding any Record,
  // and restore the old local FIT definition immediately afterwards.
  const data=cgweb143.extend(out,parsed,s,missing,crc);
  const header=Buffer.from(out.subarray(0,parsed.header));header.writeUInt32LE(data.length+extra.length,4);
  if(parsed.header>=14)header.writeUInt16LE(crc(header.subarray(0,parsed.header-2)),parsed.header-2);
  const body=Buffer.concat([header,data,extra]);
  const checksum=Buffer.alloc(2);checksum.writeUInt16LE(crc(body));const buffer=Buffer.concat([body,checksum]);
  const final=scan(buffer),after=recordDigest(buffer,final);
  if(after.count!==records.count||after.sha256!==records.sha256)fail("RECORD_BYTES_CHANGED");
  const decoded=await inspect(buffer);
  if((decoded.recordMesgs||[]).length!==records.count)fail("SDK_RECORD_COUNT_MISMATCH");
  const session=source.sessionMesgs?.[0];
  return {buffer,source,decoded,report:{version:"CGWEB140",record_export_policy:"STRICT_FULL_ORIGINAL_BINARY",full_record_parity_ok:true,reduced_route_eligible:false,reduced_route_accepted:false,source_declared_point_count:declared,candidate_fit_record_count:records.count,original_sha256:sha(original),record_bytes_sha256:records.sha256,all_existing_bytes_verified:true,source_mutated:false,altitude_mode:"ORIGINAL_RECORD_BYTES_PRESERVED",device_profile:unknown?"GARMIN_FENIX_2_COMPATIBILITY":"ORIGINAL_DEVICE_PRESERVED",original_manufacturer:manufacturer,original_product:product,export_manufacturer:unknown?1:manufacturer,export_product:unknown?1967:product,source_session_ascent_m:session?.totalAscent??null,authoritative_ascent_m:expected.ascent_m,FC_records:(source.recordMesgs||[]).filter(r=>Number.isFinite(r.heartRate)).length}};
}
module.exports={scan,crc,sha,recordDigest,inspect,candidate,forInspection};
