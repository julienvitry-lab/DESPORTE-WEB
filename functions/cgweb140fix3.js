"use strict";
/* CGWEB140 FIX3 · LOSSLESS_RECORD_HR001
 * Add/replace heart rate in Record messages, preserving all pre-existing
 * Record field bytes (excluding an explicitly replaced HR field), timing,
 * developer fields and every other FIT message. No resampling.
 */
const fit = require("./cgweb140");
function fail(code) {
  throw Object.assign(new Error(`CGWEB140 FIX3 : ${code}`), {status: 422});
}
function targetHeartRates(count, targetAverage, targetMax) {
  const avg = Number(targetAverage), max = Number(targetMax);
  if (!Number.isInteger(avg) || !Number.isInteger(max) || avg < 35 || max > 254 || max < avg)
    fail("INVALID_SYNTHETIC_HEART_RATE_TARGET");
  if (count < 1 || (count === 1 && avg !== max)) fail("INCOMPATIBLE_RECORD_COUNT_FOR_HR");
  if (avg === max) return Array(count).fill(avg);
  const spike = Math.floor(count * 0.55);
  const spread = Math.min(14, max - avg, avg - 35);
  const series = Array.from({length: count}, (_, i) => Math.max(35, Math.min(max-1,
    Math.round(avg + spread * (0.6*Math.sin(i*0.023) + 0.4*Math.sin(i*0.071))))));
  if (count === 1) return [max];
  series[spike] = max;
  let delta = avg * count - series.reduce((a,b)=>a+b,0);
  // Rebalance the integer samples to the EXACT requested arithmetic mean.
  for (let pass = 0; delta !== 0 && pass < 300; pass++) {
    let progressed = false;
    for (let i = 0; i < count && delta !== 0; i++) {
      const k = (i + pass) % count;
      if (k === spike) continue;
      if (delta > 0 && series[k] < max-1) {series[k]++; delta--; progressed=true;}
      else if (delta < 0 && series[k] > 35) {series[k]--; delta++; progressed=true;}
    }
    if (!progressed) break;
  }
  if (delta !== 0 || series.reduce((a,b)=>a+b,0) !== avg * count || series.reduce((m,x)=>Math.max(m,x),0) !== max)
    fail("HR_MEAN_MAX_NOT_REPRESENTABLE");
  return series;
}
function augmentHeartRate(original, average, maximum) {
  if (!Buffer.isBuffer(original)) fail("SOURCE_NOT_A_BUFFER");
  const parsed = fit.scan(original);
  const records = parsed.rows.filter(r => !r.definition && r.global === 20);
  if (!records.length) fail("NO_ORIGINAL_RECORDS");
  const values = targetHeartRates(records.length, average, maximum);
  let rIndex = 0;
  const chunks = [];
  for (const r of parsed.rows) {
    const input = original.subarray(r.start, r.end);
    if (r.definition && r.global === 20) {
      const fieldCount = original[r.start + 5];
      const fieldStart = r.start + 6;
      const defs = original.subarray(fieldStart, fieldStart + 3*fieldCount);
      let hasHR = false;
      for (let i=0;i<defs.length;i+=3) {
        if (defs[i] === 3) {
          if (defs[i+1] !== 1 || (defs[i+2]&31) !== 2) fail("UNSUPPORTED_EXISTING_HR_FIELD");
          hasHR = true;
        }
      }
      if (hasHR) chunks.push(input);
      else {
        if (fieldCount === 255) fail("RECORD_DEFINITION_FIELD_LIMIT");
        const copy = Buffer.from(input);
        copy[5] = fieldCount+1;
        chunks.push(copy.subarray(0, 6+3*fieldCount), Buffer.from([3,1,2]), copy.subarray(6+3*fieldCount));
      }
    } else if (!r.definition && r.global === 20) {
      const hr = r.fields.find(f => f.num === 3);
      const bytes = Buffer.from(input);
      if (hr) {
        if (hr.size !== 1 || (hr.type&31) !== 2) fail("UNSUPPORTED_EXISTING_HR_VALUE");
        bytes[hr.offset-r.start] = values[rIndex++];
        chunks.push(bytes);
      } else {
        const developerBytes = r.dev.reduce((sum,f)=>sum+f.size,0);
        const insertAt = bytes.length-developerBytes;
        if (insertAt < 1) fail("INVALID_RECORD_MESSAGE_SIZE");
        chunks.push(bytes.subarray(0,insertAt),Buffer.from([values[rIndex++]]),bytes.subarray(insertAt));
      }
    } else chunks.push(input);
  }
  if (rIndex !== records.length) fail("HR_SAMPLE_COUNT_MISMATCH");
  const header = Buffer.from(original.subarray(0, parsed.header));
  const data = Buffer.concat(chunks);
  header.writeUInt32LE(data.length,4);
  if (parsed.header >= 14) header.writeUInt16LE(fit.crc(header.subarray(0, parsed.header-2)),parsed.header-2);
  const body = Buffer.concat([header,data]);
  const checksum = Buffer.alloc(2); checksum.writeUInt16LE(fit.crc(body));
  const result = Buffer.concat([body,checksum]);
  const after = fit.scan(result);
  if (after.rows.length !== parsed.rows.length) fail("FIT_MESSAGE_COUNT_CHANGED");
  let checked = 0;
  for (let i=0; i<parsed.rows.length;i++) {
    const oldRow = parsed.rows[i], newRow = after.rows[i];
    if (oldRow.global !== newRow.global || oldRow.definition !== newRow.definition) fail("MESSAGE_SEQUENCE_CHANGED");
    if (oldRow.definition) {
      if (oldRow.global !== 20 && !original.subarray(oldRow.start,oldRow.end).equals(result.subarray(newRow.start,newRow.end)))
        fail("NON_RECORD_DEFINITION_CHANGED");
      continue;
    }
    if (oldRow.global !== 20) {
      if (!original.subarray(oldRow.start,oldRow.end).equals(result.subarray(newRow.start,newRow.end)))
        fail("NON_RECORD_MESSAGE_CHANGED");
      continue;
    }
    if (original[oldRow.start] !== result[newRow.start]) fail("RECORD_HEADER_CHANGED");
    for (const field of oldRow.fields) {
      if (field.num === 3) continue;
      const next = newRow.fields.find(f=>f.num === field.num);
      if (!next || field.size !== next.size || field.type !== next.type ||
        !original.subarray(field.offset,field.offset+field.size).equals(result.subarray(next.offset,next.offset+next.size)))
        fail("ORIGINAL_RECORD_FIELD_CHANGED");
    }
    const oldDevSize=oldRow.dev.reduce((sum,f)=>sum+f.size,0);
    const newDevSize=newRow.dev.reduce((sum,f)=>sum+f.size,0);
    if (oldDevSize !== newDevSize || !original.subarray(oldRow.end-oldDevSize,oldRow.end).equals(result.subarray(newRow.end-newDevSize,newRow.end)))
      fail("DEVELOPER_FIELD_CHANGED");
    checked++;
  }
  if (checked !== records.length) fail("RECORD_COUNT_CHANGED");
  return {buffer:result,report:{version:"CGWEB140_FIX3",mode:"RECORD_HR_FIELD_AUGMENT_ONLY",record_count:checked,
    target_avg_hr:average,target_max_hr:maximum,all_original_non_hr_record_fields_preserved:true,
    all_non_record_messages_preserved:true,all_developer_fields_preserved:true}};
}
module.exports={augmentHeartRate,targetHeartRates};
