"use strict";
const fs=require("fs"),path=require("path"),m=require("./cgweb140");
const originals=[
 ["06/06/2012",1348,"25f4ff0eb8b1dc4876562c90d20cc3bd28446d99283b3f006bc6c879d9e1b566"],
 ["16/06/2012",4510,"6ed2becb2efbe2e4ffef161e4263c7379acf80b0c2c6fef9e66f452f5a3f1883"],
 ["28/06/2012",1604,"ea196f97842a570b9526720603bd2b194e63ed6ebe753ad433c2bd51f570655b"],
 ["27/07/2012",1017,"f7cf9616b8395c2f478e268ebaff783f9505d394be147ce9969e67709380ef81"],
 ["31/07/2012",1307,"7f56b5cf2a7afbfb509ddf0a02d069d003b869cb9b51f75c8d6e2c04bde510fb"]
];
(async()=>{
  const rows=[];let failed=false;
  for(const [date,count,hash] of originals){
    try{
      const filename=path.join(process.env.HOME,"CGWEB139_FIT_RECUPERES",hash+".fit");
      const original=fs.readFileSync(filename);
      if(m.sha(original)!==hash)throw new Error("SHA-256 non conforme");
      const messages=await m.inspect(original),session=messages.sessionMesgs?.[0];
      const expected={distance_m:session?.totalDistance,elapsed_time_ms:session?.totalElapsedTime*1000,
        timer_time_ms:session?.totalTimerTime*1000,calories:session?.totalCalories,ascent_m:session?.totalAscent};
      const result=await m.candidate(original,expected,count);
      if(date==="16/06/2012"&&result.report.FC_records===0)throw new Error("FC absente de l'original 4510");
      const {inspectFitBuffer,decodeCanonicalFitSummary}=require("./fitwriter");
      const auditBuffer=m.forInspection(result.buffer);
      const validation=await inspectFitBuffer(auditBuffer),decoded=await decodeCanonicalFitSummary(auditBuffer);
      if(!validation.ok||decoded.recordCount!==count||decoded.sessionCount!==1||decoded.activityCount!==1)
        throw new Error("Structure incompatible avec le préflight actuel");
      rows.push({date,records:count,FC_records:result.report.FC_records,SHA:"OK",tous_octets:"OK",
        appareil:result.report.device_profile,Dplus_original:session.totalAscent,resultat:"OK"});
    }catch(e){failed=true;rows.push({date,resultat:"BLOQUE",erreur:e.message});}
  }
  console.table(rows);
  if(failed)throw new Error("AUDIT ORIGINAL NON VALIDE : publication interdite.");
  console.log("CGWEB140 AUDIT ORIGINAL OK — aucun FIT source ni activité modifié.");
})().catch(e=>{console.error(e.message);process.exitCode=1;});
