"use strict";
// CGWEB140 FIX2: authorised uniform time shift on a copy of the complete FIT.
const fit=require("./cgweb140");
function fail(reason){throw Object.assign(new Error("CGWEB140 FIX2 : "+reason),{status:422});}
function clockSeconds(approval,originalHash,sourceMs,targetMs){
  if(!Number.isSafeInteger(sourceMs)||!Number.isSafeInteger(targetMs))fail("Horodatage de référence absent.");
  const delta=(targetMs-sourceMs)/1000;
  if(delta===0)return 0;
  if(!approval || approval.state!=="USER_CONFIRMED" || approval.original_sha256!==originalHash ||
    approval.original_start_time_ms!==sourceMs || approval.target_start_time_ms!==targetMs || approval.offset_seconds!==delta)
    fail("Correction horaire non autorisée pour ce FIT et cette activité.");
  if(!Number.isSafeInteger(delta)||Math.abs(delta)>86400)fail("Décalage horaire hors limites.");
  return delta;
}
async function align(original,approval,targetMs){
  const source=await fit.inspect(original),start=source.sessionMesgs?.[0]?.startTime?.getTime();
  const hash=fit.sha(original),seconds=clockSeconds(approval,hash,start,targetMs);
  if(!seconds)return {buffer:Buffer.from(original),report:{offset_seconds:0,source_start_time_ms:start,target_start_time_ms:targetMs,all_non_time_bytes_verified:true}};
  const {Profile}=await import("@garmin/fitsdk");
  const parsed=fit.scan(original),buffer=Buffer.from(original),allowed=new Set();let changes=0;
  for(const row of parsed.rows){
    if(row.definition)continue;
    const profile=Profile.messages[row.global];
    if(!profile)fail(`Message ${row.global} inconnu : correction horaire bloquée.`);
    if(row.dev.length)fail("Champs développeur présents : correction horaire à analyser.");
    if(row.compressed){
      buffer[row.start]=(buffer[row.start]&0xe0)|(((buffer[row.start]&31)+seconds%32+32)%32);
      allowed.add(row.start);changes++;
    }
    for(const field of row.fields){
      const info=profile.fields[field.num];
      if(!info)continue; // Unknown field copied exactly, never guessed or reconstructed.
      if(!["dateTime","localDateTime"].includes(info.type)){
        if(info.subFields?.some(f=>["dateTime","localDateTime"].includes(f.type)))
          fail(`Sous-champ temporel ambigu ${row.global}/${field.num}.`);
        continue;
      }
      if((field.type&31)!==6||field.size%4)fail("Encodage temporel non pris en charge.");
      for(let offset=field.offset;offset<field.offset+field.size;offset+=4){
        const value=row.architecture?original.readUInt32BE(offset):original.readUInt32LE(offset);
        if(value===0xffffffff)continue;
        const next=value+seconds;
        if(value<0x10000000||next<0x10000000||next>=0xffffffff)fail("Horodatage relatif ou hors limites.");
        row.architecture?buffer.writeUInt32BE(next,offset):buffer.writeUInt32LE(next,offset);
        for(let i=0;i<4;i++)allowed.add(offset+i);
        changes++;
      }
    }
  }
  if(!changes)fail("Aucun horodatage corrigé.");
  for(let i=0;i<parsed.end;i++)if(buffer[i]!==original[i]&&!allowed.has(i))fail("Donnée non temporelle modifiée.");
  buffer.writeUInt16LE(fit.crc(buffer.subarray(0,parsed.end)),parsed.end);
  const after=fit.scan(buffer),decoded=await fit.inspect(buffer);
  if(decoded.sessionMesgs?.[0]?.startTime?.getTime()!==targetMs)fail("Départ corrigé non conforme.");
  const beforeRecords=source.recordMesgs||[],afterRecords=decoded.recordMesgs||[];
  if(beforeRecords.length!==afterRecords.length)fail("Nombre d'enregistrements modifié.");
  for(let i=0;i<beforeRecords.length;i++){
    const a=beforeRecords[i].timestamp?.getTime(),b=afterRecords[i].timestamp?.getTime();
    if((a==null)!==(b==null)||(a!=null&&b-a!==seconds*1000))fail("Intervalle d'enregistrement altéré.");
  }
  // Compare raw records again with time fields masked, including developer/unknown bytes.
  const mask=(input,rows)=>{
    const chunks=[];
    for(const row of rows)if(!row.definition&&row.global===20){
      const bytes=Buffer.from(input.subarray(row.start,row.end));
      if(row.compressed)bytes[0]&=0xe0;
      for(const field of row.fields){const info=Profile.messages[20].fields[field.num];
        if(["dateTime","localDateTime"].includes(info?.type))bytes.fill(0,field.offset-row.start,field.offset-row.start+field.size);}
      chunks.push(bytes);
    }
    return fit.sha(Buffer.concat(chunks));
  };
  const digest=mask(original,parsed.rows);
  if(digest!==mask(buffer,after.rows))fail("Mesures d'origine modifiées.");
  return {buffer,report:{offset_seconds:seconds,source_start_time_ms:start,target_start_time_ms:targetMs,
    timestamp_fields_shifted:changes,all_non_time_bytes_verified:true,all_record_intervals_verified:true,
    record_non_time_sha256:digest,original_sha256:hash,original_unchanged:true}};
}
module.exports={align,clockSeconds};
