"use strict";
/* CGWEB149: explicit simulated-HR editing only. Never invoked for SOURCE HR.
 * The FIT source is immutable; every input Record and timestamp is retained.
 * Session/Lap HR summaries are aligned to the generated Record HR samples.
 */
const fit=require('./cgweb140');
const base=require('./cgweb140fix3');
function fail(code){throw Object.assign(new Error('CGWEB149: '+code),{status:422});}
function readNumber(bytes,row,num){
  const f=row.fields?.find(x=>x.num===num); if(!f)return null;
  const type=f.type&31,be=row.architecture===1;let n;
  if(f.size===1&&[0,2,10].includes(type))n=bytes[f.offset];
  else if(f.size===2&&[4,11].includes(type))n=be?bytes.readUInt16BE(f.offset):bytes.readUInt16LE(f.offset);
  else if(f.size===4&&[6,12].includes(type))n=be?bytes.readUInt32BE(f.offset):bytes.readUInt32LE(f.offset);
  else return null;
  if(n===(f.size===1?255:f.size===2?65535:4294967295))return null;
  return n;
}
function buildHeartSeries(buffer,rows,avg,max){
  if(!Number.isInteger(avg)||!Number.isInteger(max)||avg<40||max>220||max<=avg||rows.length<3)
    fail('HR_TARGETS_OR_RECORD_COUNT_INVALID');
  const n=rows.length;
  const speeds=[],grades=[];let prevDist=null,prevAlt=null,prevSpeed=0;
  for(const row of rows){
    const distance=readNumber(buffer,row,5);
    const altitude=readNumber(buffer,row,78)??readNumber(buffer,row,2);
    const rawSpeed=readNumber(buffer,row,73)??readNumber(buffer,row,6);
    const speed=rawSpeed==null?null:rawSpeed/1000;
    const dist=distance==null?null:distance/100;
    const alt=altitude==null?null:altitude/5-500;
    const dx=dist!=null&&prevDist!=null?dist-prevDist:null;
    const dz=alt!=null&&prevAlt!=null?alt-prevAlt:null;
    const slope=dx!=null&&dx>3&&dx<100&&dz!=null?Math.max(-0.20,Math.min(0.25,dz/dx)):0;
    const goodSpeed=speed!=null&&speed>=0&&speed<12?speed:prevSpeed;
    speeds.push(goodSpeed);grades.push(slope);
    if(dist!=null)prevDist=dist;if(alt!=null)prevAlt=alt;
    prevSpeed=goodSpeed;
  }
  const finiteSpeeds=speeds.filter(x=>x>0);const sorted=[...finiteSpeeds].sort((a,b)=>a-b);
  const typical=sorted.length?sorted[Math.floor(sorted.length/2)]:0;
  let smoothSpeed=typical,smoothGrade=0;
  const effort=[];
  for(let i=0;i<n;i++){
    smoothSpeed=0.94*smoothSpeed+0.06*(speeds[i]||typical);
    smoothGrade=0.92*smoothGrade+0.08*grades[i];
    const relativeSpeed=typical>0?Math.max(-1,Math.min(1,(smoothSpeed-typical)/Math.max(typical,0.5))):0;
    const gradeLoad=Math.max(-1,Math.min(1,smoothGrade*9));
    const progress=i/(n-1);
    const warmup=-0.55*Math.exp(-progress*24);
    const drift=0.25*progress;
    const smallWave=0.12*Math.sin(progress*Math.PI*7)+0.08*Math.sin(progress*Math.PI*19);
    effort.push(0.66*relativeSpeed+0.55*gradeLoad+warmup+drift+smallWave);
  }
  const meanEffort=effort.reduce((a,b)=>a+b,0)/n;
  const spread=Math.min(17,Math.max(8,max-avg));
  const min=Math.max(40,avg-25);
  let values=effort.map(e=>Math.min(max-1,Math.max(min,Math.round(avg+(e-meanEffort)*spread))));
  const peak=effort.reduce((index,v,i)=>v>effort[index]?i:index,0);
  // Rounded hill near the peak, not a lone artificial 170 bpm spike.
  const halfWidth=Math.max(2,Math.min(12,Math.floor(n/100)));
  for(let d=-halfWidth;d<=halfWidth;d++){
    const i=peak+d;if(i<0||i>=n||i===peak)continue;
    const shaped=max-1-Math.round(Math.abs(d)*Math.min(5, (max-avg)/Math.max(1,halfWidth)));
    values[i]=Math.max(values[i],Math.max(min,shaped));
  }
  values[peak]=max;
  let delta=n*avg-values.reduce((a,b)=>a+b,0);
  // Deterministic exact mean, preserving a 170 bpm peak.
  for(let pass=0;delta!==0&&pass<250;pass++){
    let changed=false;
    for(let k=0;k<n&&delta!==0;k++){
      const i=(k+pass*73)%n;if(i===peak)continue;
      if(delta>0&&values[i]<max-1){values[i]++;delta--;changed=true;}
      else if(delta<0&&values[i]>min){values[i]--;delta++;changed=true;}
    }
    if(!changed)break;
  }
  if(delta!==0||values.reduce((a,b)=>a+b,0)!==n*avg||values.reduce((m,v)=>v>m?v:m,0)!==max)
    fail('EXACT_HR_MEAN_MAX_UNATTAINABLE');
  return values;
}
function writeByte(bytes,row,num,value){
  const f=row.fields.find(x=>x.num===num);
  if(!f)return false;
  if(f.size!==1||(f.type&31)!==2)fail('UNSAFE_EXISTING_HR_SUMMARY_FIELD');
  bytes[f.offset]=value;return true;
}
function updateSummaries(original,avg,max,lapSummaries=null){
  const parsed=fit.scan(original), defs=new Map(), parts=[];
  let sessions=0,laps=0;
  for(const row of parsed.rows){
    const raw=original.subarray(row.start,row.end);
    if(row.definition){defs.set(original[row.start]&15,row);parts.push(raw);continue;}
    if(row.global!==18&&row.global!==19){parts.push(raw);continue;}
    if(row.compressed||original[row.start]&0xc0)fail('UNSUPPORTED_SUMMARY_MESSAGE_HEADER');
    const fields=row.global===18?[16,17]:[15,16];
    const lapTarget=row.global===19 && Array.isArray(lapSummaries)?lapSummaries[laps]:null;
    const targets=lapTarget||{avg,max};
    if(!Number.isInteger(targets.avg)||!Number.isInteger(targets.max)||targets.avg<35||targets.max>254||targets.max<targets.avg)
      fail('UNSAFE_LAP_HR_SUMMARY');
    const local=row.local,def=defs.get(local);
    if(!def||def.global!==row.global)fail('SUMMARY_DEFINITION_NOT_FOUND');
    const summary=Buffer.from(raw),originalDef=original.subarray(def.start,def.end);
    const missing=[];
    for(const [n,value] of [[fields[0],targets.avg],[fields[1],targets.max]]){
      const f=row.fields.find(x=>x.num===n);
      if(f){if(f.size!==1||(f.type&31)!==2)fail('UNSAFE_SUMMARY_HR_TYPE');summary[f.offset-row.start]=value;}
      else missing.push({n,value});
    }
    if(missing.length){
      const count=originalDef[5],fixedEnd=6+3*count;
      if(count+missing.length>255||fixedEnd>originalDef.length)fail('SUMMARY_DEFINITION_OVERFLOW');
      const standard=row.fields.reduce((s,x)=>s+x.size,0),dev=row.dev.reduce((s,x)=>s+x.size,0);
      if(summary.length!==1+standard+dev)fail('SUMMARY_DEVELOPER_LAYOUT_CHANGED');
      const newDef=Buffer.concat([
        originalDef.subarray(0,5),Buffer.from([count+missing.length]),
        originalDef.subarray(6,fixedEnd),
        ...missing.map(x=>Buffer.from([x.n,1,2])),originalDef.subarray(fixedEnd)
      ]);
      const at=1+standard;
      const newSummary=Buffer.concat([summary.subarray(0,at),Buffer.from(missing.map(x=>x.value)),summary.subarray(at)]);
      parts.push(newDef,newSummary,originalDef);
    }else parts.push(summary);
    if(row.global===18)sessions++;else laps++;
  }
  if(sessions!==1||(Array.isArray(lapSummaries)&&laps!==lapSummaries.length))fail('SESSION_LAP_COUNT_MISMATCH');
  const data=Buffer.concat(parts),header=Buffer.from(original.subarray(0,parsed.header));
  header.writeUInt32LE(data.length,4);
  if(parsed.header>=14)header.writeUInt16LE(fit.crc(header.subarray(0,parsed.header-2)),parsed.header-2);
  const withoutTail=Buffer.concat([header,data]),tail=Buffer.alloc(2);tail.writeUInt16LE(fit.crc(withoutTail));
  const result=Buffer.concat([withoutTail,tail]);fit.scan(result);
  return result;
}
function lapHeartSummaries(buffer,series) {
  const audit=fit.forInspection(buffer),parsed=fit.scan(audit);
  const records=parsed.rows.filter(r=>!r.definition&&r.global===20);
  const laps=parsed.rows.filter(r=>!r.definition&&r.global===19);
  if(records.length!==series.length)fail('LAP_RECORDS_DO_NOT_MATCH');
  if(laps.length<=1)return laps.length?[{avg:Math.round(series.reduce((a,b)=>a+b,0)/series.length),max:series.reduce((a,b)=>Math.max(a,b),0)}]:[];
  const times=records.map(r=>readNumber(audit,r,253));
  if(times.some(x=>!Number.isInteger(x)))fail('MULTILAP_RECORD_TIMESTAMPS_MISSING');
  const group=[],starts=laps.map(r=>readNumber(audit,r,2)),ends=laps.map(r=>readNumber(audit,r,253));
  if(starts.some(x=>!Number.isInteger(x))||ends.some(x=>!Number.isInteger(x)))
    fail('MULTILAP_BOUNDARY_TIMESTAMPS_MISSING');
  for(let k=0;k<laps.length;k++){
    const vals=[];
    for(let i=0;i<times.length;i++){
      if(times[i]>=starts[k] && (times[i]<ends[k] || (k===laps.length-1&&times[i]===ends[k])))vals.push(series[i]);
    }
    if(!vals.length)fail('MULTILAP_EMPTY_LAP');
    group.push({avg:Math.round(vals.reduce((a,b)=>a+b,0)/vals.length),max:vals.reduce((m,v)=>Math.max(m,v),0)});
  }
  return group;
}
async function augmentSyntheticHeartRate(source,avg=150,max=170){
  if(!Buffer.isBuffer(source))fail('INVALID_SOURCE_BUFFER');
  const before=fit.scan(source),inputRows=before.rows.filter(r=>!r.definition&&r.global===20);
  const records=inputRows.length;if(!records)fail('NO_SOURCE_RECORDS');
  // The editor action explicitly authorizes synthetic HR. No other FIT is touched.
  const baseResult=base.augmentHeartRate(source,avg,max);
  const intermediate=Buffer.from(baseResult.buffer),after=fit.scan(intermediate);
  const recordRows=after.rows.filter(r=>!r.definition&&r.global===20);
  if(recordRows.length!==records)fail('LOSS_OF_SOURCE_RECORDS');
  const series=buildHeartSeries(source,inputRows,avg,max);
  for(let i=0;i<recordRows.length;i++){
    if(!writeByte(intermediate,recordRows[i],3,series[i]))fail('RECORD_HR_FIELD_NOT_INSTALLED');
  }
  intermediate.writeUInt16LE(fit.crc(intermediate.subarray(0,after.end)),after.end);
  const lapTargets=lapHeartSummaries(intermediate,series);
  const result=updateSummaries(intermediate,avg,max,lapTargets),checked=fit.scan(result);
  const destRecords=checked.rows.filter(r=>!r.definition&&r.global===20);
  if(destRecords.length!==records)fail('RECORD_COUNT_CHANGED');
  const outputHR=destRecords.map(r=>readNumber(result,r,3));
  if(outputHR.some(x=>x==null)||outputHR.reduce((a,b)=>a+b,0)!==avg*records||outputHR.reduce((m,v)=>v>m?v:m,0)!==max)
    fail('HR_RECORD_VALUES_DID_NOT_SURVIVE');
  const summaries=checked.rows.filter(r=>!r.definition&&(r.global===18||r.global===19));
  let lapIndex=0;
  if(summaries.some(row=>{
    const pair=row.global===18?[16,17]:[15,16];
    const target=row.global===18?{avg,max}:lapTargets[lapIndex++];
    return !target||readNumber(result,row,pair[0])!==target.avg||readNumber(result,row,pair[1])!==target.max;
  }))fail('FIT_SUMMARY_HR_MISMATCH');
  // Confirm no unrelated binary Record changes relative to base lossless engine.
  for(let i=0;i<recordRows.length;i++){
    const a=recordRows[i],b=destRecords[i];
    for(const f of a.fields){const next=b.fields.find(x=>x.num===f.num);if(!next||f.size!==next.size||f.type!==next.type)fail('RECORD_SCHEMA_CHANGED');
      if(f.num!==3&&!intermediate.subarray(f.offset,f.offset+f.size).equals(result.subarray(next.offset,next.offset+next.size)))
        fail('OTHER_RECORD_FIELD_CHANGED');}
  }
  const decoded=await fit.inspect(result);
  const session=decoded.sessionMesgs?.[0];
  if(!session||Number(session.avgHeartRate)!==avg||Number(session.maxHeartRate)!==max)
    fail('SDK_SESSION_HR_MISMATCH');
  if(decoded.recordMesgs?.length!==records)fail('SDK_RECORD_COUNT_CHANGED');
  if((decoded.lapMesgs||[]).length!==lapTargets.length)fail('SDK_LAP_COUNT_CHANGED');
  for(let k=0;k<lapTargets.length;k++){
    if(Number(decoded.lapMesgs[k].avgHeartRate)!==lapTargets[k].avg||
       Number(decoded.lapMesgs[k].maxHeartRate)!==lapTargets[k].max)fail('SDK_LAP_HR_MISMATCH');
  }
  return {buffer:result,report:{mode:'SIMULATED_HR_EXPLICIT',record_count:records,target_avg_hr:avg,target_max_hr:max,
    speed_and_grade_used:true,session_and_lap_hr_corrected:true,source_immutable:true}};
}
module.exports={augmentSyntheticHeartRate,buildHeartSeries,lapHeartSummaries,updateSummaries,readNumber};
