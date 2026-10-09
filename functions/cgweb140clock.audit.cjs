"use strict";
const fs=require("fs"),path=require("path"),fit=require("./cgweb140"),clock=require("./cgweb140clock");
(async()=>{
 const hash="6ed2becb2efbe2e4ffef161e4263c7379acf80b0c2c6fef9e66f452f5a3f1883";
 const original=fs.readFileSync(path.join(process.env.HOME,"CGWEB139_FIT_RECUPERES",hash+".fit"));
 if(fit.sha(original)!==hash)throw new Error("SHA original incorrect");
 const approval={state:"USER_CONFIRMED",original_sha256:hash,original_start_time_ms:1339797720000,target_start_time_ms:1339830120000,offset_seconds:32400};
 const aligned=await clock.align(original,approval,approval.target_start_time_ms);
 const messages=await fit.inspect(aligned.buffer),s=messages.sessionMesgs[0];
 const result=await fit.candidate(aligned.buffer,{distance_m:s.totalDistance,elapsed_time_ms:Math.round(s.totalElapsedTime*1000),timer_time_ms:Math.round(s.totalTimerTime*1000),calories:s.totalCalories,ascent_m:394},4510);
 if(result.report.FC_records!==4510||fit.sha(original)!==hash)throw new Error("Conservation de l'original ou FC non conforme");
 console.table({activite:6158,depart_UTC:s.startTime.toISOString(),depart_heure_francaise:"16/06/2012 09:02",records:4510,FC:4510,Dplus:394,original_intact:true,mesures_conservees:aligned.report.all_non_time_bytes_verified,intervalles_conserves:aligned.report.all_record_intervals_verified});
 console.log("CGWEB140 FIX2 AUDIT REEL OK — original local intact, candidat corrigé uniquement en mémoire.");
})().catch(e=>{console.error(e.message);process.exitCode=1;});
