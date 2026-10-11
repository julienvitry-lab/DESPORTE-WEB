'use strict';
/* CGWEB152: read-only classification of Record heart-rate samples. The caller
 * must authenticate, verify the exact active FIT bytes/SHA, and handle edits.
 * Never infer genuine HR solely from activity summaries (often stale).
 */
function decide(sampleValues, declaredCount) {
  if (!Array.isArray(sampleValues) || !Number.isSafeInteger(declaredCount) || declaredCount < 3 || sampleValues.length !== declaredCount)
    return {mode:'BLOCK',reason:'INVALID_RECORD_COUNT'};
  const nums=sampleValues.filter(Number.isFinite);
  if (nums.length === 0) return {mode:'REPAIR',reason:'RECORD_HR_ABSENT',samples:0,records:declaredCount};
  if (nums.length !== declaredCount)
    return {mode:'BLOCK',reason:'PARTIAL_HR_PROTECT',samples:nums.length,records:declaredCount};
  const avg=nums.reduce((s,x)=>s+x,0)/declaredCount;
  let max=-Infinity,min=Infinity;
  for (const value of nums) { if (value>max) max=value; if (value<min) min=value; }
  const lowCount=nums.filter(x=>x < 65).length;
  if (avg < 65 && lowCount/declaredCount >= .90)
    return {mode:'REPAIR',reason:'IMPLAUSIBLY_LOW_HR',samples:nums.length,records:declaredCount,avg,max};
  if (min < 35 || max > 240)
    return {mode:'BLOCK',reason:'HR_OUTLIER_PROTECT',samples:nums.length,records:declaredCount,avg,max};
  return {mode:'PRESERVE',reason:'RECORD_HR_PLAUSIBLE',samples:nums.length,records:declaredCount,avg,max};
}
function assess(buffer, parsed, reader) {
  if (!Buffer.isBuffer(buffer) || !parsed?.rows || typeof reader!=='function')
    return {mode:'BLOCK',reason:'INVALID_FIT_AUDIT_INPUT'};
  const records=parsed.rows.filter(r=>!r.definition&&r.global===20);
  // An existing HR field with an unknown encoding is NOT equivalent to absent HR.
  for (const r of records) {
    const field=r.fields?.find(f=>f.num===3);
    if(field && (field.size!==1 || (field.type&31)!==2))
      return {mode:'BLOCK',reason:'UNSUPPORTED_HR_FIELD_TYPE',records:records.length};
  }
  return decide(records.map(r=>reader(buffer,r,3)),records.length);
}
module.exports={decide,assess};
