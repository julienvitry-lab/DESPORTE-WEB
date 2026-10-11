"use strict";
/* CGWEB152 FIX2: legacy active FIT with no old metadata certificate.
 * Treat verified binary FIT *currently in the vault* as the only available
 * Record-count authority, never the historical Firestore route or count.
 * This is used solely for auto-HR repair on an explicit Strava export click.
 */
const engine = require("./cgweb140");
function refuse(reason) {
  throw Object.assign(new Error("CGWEB152 FIX2 : " + reason), {status:409});
}
async function verifyCurrentBytes(bytes, expectedSha, reader=engine) {
  if (!Buffer.isBuffer(bytes) || !/^[a-f0-9]{64}$/.test(String(expectedSha||""))) refuse("SHA attendu invalide");
  if (reader.sha(bytes)!==expectedSha) refuse("SHA réel incorrect");
  // FIT header, body, file CRC, definitions and all data Record boundaries.
  const parsed=reader.scan(bytes);
  const recordCount=reader.recordDigest(bytes,parsed).count;
  const sessionCount=parsed.rows.filter(r=>!r.definition&&r.global===18).length;
  if(recordCount<3||sessionCount!==1) refuse("FIT non unitaire ou sans enregistrements suffisants");
  // Independent SDK inspection must see exactly the same Record stream.
  const decoded=await reader.inspect(bytes);
  if (!Array.isArray(decoded?.recordMesgs) || decoded.recordMesgs.length!==recordCount ||
      !Array.isArray(decoded?.sessionMesgs) || decoded.sessionMesgs.length!==1)
    refuse("décodage des Record ou de la Session incohérent");
  return Object.freeze({sha256:expectedSha,record_count:recordCount,
    provenance:"CGWEB152_FIX2_VERIFIED_CURRENT_FIT_BINARY"});
}
module.exports={verifyCurrentBytes};
