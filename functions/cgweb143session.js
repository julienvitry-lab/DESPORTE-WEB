"use strict";
/* CGWEB143: add missing Session summary fields without touching existing FIT records.
 * The original local-message definition is restored after the patched Session,
 * including all developer field definitions. No data-record is decoded/re-encoded. */

const FIELDS = Object.freeze({
  7: Object.freeze({size:4,type:0x86}), // total_elapsed_time, 1/1000 s
  8: Object.freeze({size:4,type:0x86}), // total_timer_time, 1/1000 s
  9: Object.freeze({size:4,type:0x86}), // total_distance, 1/100 m
  11:Object.freeze({size:2,type:0x84}), // total_calories, kcal
  22:Object.freeze({size:2,type:0x84})  // total_ascent, metres
});

function fail(label) { throw Object.assign(new Error(`CGWEB143 : ${label}`),{status:422}); }

function quantize(field, amount) {
  const format=FIELDS[field];
  if(!format || !Number.isFinite(amount) || amount<0)fail(`METRIC_INVALID_${field}`);
  const rounded=Math.round(amount);
  const maximum=format.size===4?0xfffffffe:0xfffe;
  if(!Number.isSafeInteger(rounded) || rounded>maximum)fail(`METRIC_OUT_OF_RANGE_${field}`);
  return rounded;
}

function extend(source, parsed, session, additions, crc) {
  if(!Buffer.isBuffer(source) || !Array.isArray(parsed?.rows) ||
    !session || session.definition || session.global!==18 || session.compressed ||
    typeof crc!=="function")fail("UNSAFE_SESSION_LAYOUT");
  if(!Array.isArray(additions) || !additions.length)return source.subarray(parsed.header,parsed.end);
  if(source[session.start]&0xc0)fail("UNSAFE_SESSION_HEADER");
  let definition=null;
  for(const row of parsed.rows) {
    if(row===session)break;
    if(row.definition && (source[row.start]&0x0f)===session.local)definition=row;
  }
  if(!definition || definition.global!==18)fail("SESSION_DEFINITION_NOT_FOUND");
  const originalDef=source.subarray(definition.start,definition.end);
  const originalCount=originalDef[5];
  if(!Number.isInteger(originalCount) || originalCount+additions.length>255)fail("DEFINITION_FIELD_LIMIT");
  const originalStandardEnd=6+originalCount*3;
  if(originalStandardEnd>originalDef.length)fail("CORRUPTED_SESSION_DEFINITION");
  const standardBytes=session.fields.reduce((sum,f)=>sum+f.size,0);
  const devBytes=session.dev.reduce((sum,f)=>sum+f.size,0);
  if(session.end-session.start!==1+standardBytes+devBytes)fail("CORRUPTED_SESSION_BYTES");
  const defs=[];const values=[];const used=new Set(session.fields.map(f=>f.num));
  for(const item of additions) {
    if(!item || !FIELDS[item.field] || used.has(item.field))fail("INVALID_ADDED_FIELD");
    used.add(item.field);
    const schema=FIELDS[item.field];
    const n=quantize(item.field,item.value);
    defs.push(Buffer.from([item.field,schema.size,schema.type]));
    const b=Buffer.alloc(schema.size);
    if(schema.size===4)session.architecture===1?b.writeUInt32BE(n):b.writeUInt32LE(n);
    else session.architecture===1?b.writeUInt16BE(n):b.writeUInt16LE(n);
    values.push(b);
  }
  const nextDefinition=Buffer.concat([
    originalDef.subarray(0,5),
    Buffer.from([originalCount+additions.length]),
    originalDef.subarray(6,originalStandardEnd),
    ...defs,
    originalDef.subarray(originalStandardEnd)
  ]);
  const before=source.subarray(session.start,session.start+1+standardBytes);
  const after=source.subarray(session.start+1+standardBytes,session.end);
  const nextSession=Buffer.concat([before,...values,after]);
  const parts=[];
  for(const row of parsed.rows){
    if(row===session){
      parts.push(nextDefinition,nextSession,originalDef);
    }else parts.push(source.subarray(row.start,row.end));
  }
  return Buffer.concat(parts);
}
module.exports={FIELDS,quantize,extend};
