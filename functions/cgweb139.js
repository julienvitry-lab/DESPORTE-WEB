"use strict";
/* CGWEB139 · FIT_ALTITUDE_NOISE_GUARD001 / CANONICAL_ASCENT_PRESERVE001
 * FULL_RECORD_EXPORT_PARITY001 / STRAVA_ALTITUDE_AUDIT001
 * Pure routines: source route is never mutated. No Strava write.
 */
const VERSION = "CGWEB139";
function numberOrNull(x) {
  if (x === null || x === undefined || x === "" || typeof x === "boolean") return null;
  const n = Number(x); return Number.isFinite(n) ? n : null;
}
function routeCount(route) {
  const keys = ["lat","lon","alt_m","distance_m","time_ms","hr_bpm","cadence","power","speed_mps"];
  return Math.max(0, ...keys.map(k => Array.isArray(route?.[k]) ? route[k].length : 0));
}
function altitudeProfile(points) {
  const a = (Array.isArray(points) ? points : [])
    .map(x => numberOrNull(x?.altitude_m)).filter(x => x !== null);
  if (!a.length) return {count:0, min_m:null,max_m:null,band_m:null,
    positive_gain_m:null,negative_gain_m:null,reversals:0,median_m:null};
  let positive = 0, negative = 0, reversals = 0, priorDirection = 0;
  for (let i=1;i<a.length;i++) {
    const d=a[i]-a[i-1];
    if (d>0) positive += d; else negative -= d;
    const dir = d > 0.3 ? 1 : d < -0.3 ? -1 : 0;
    if(dir) { if(priorDirection && dir!==priorDirection)reversals++; priorDirection=dir; }
  }
  const sorted=a.slice().sort((x,y)=>x-y), middle=Math.floor(sorted.length/2);
  const median=sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
  const min=sorted[0], max=sorted[sorted.length-1];
  return {count:a.length,min_m:min,max_m:max,band_m:max-min,
    positive_gain_m:positive,negative_gain_m:negative,reversals,median_m:median};
}
function likelyFlatAltitudeNoise(profile, canonical) {
  return canonical===0 && profile.count>=30 &&
    profile.band_m>0 && profile.band_m<=8 &&
    profile.positive_gain_m>=30 &&
    profile.positive_gain_m>=5*profile.band_m && profile.reversals>=8;
}
function prepare(activity, route, prepared) {
  if(!prepared?.payload || !Array.isArray(prepared.payload.points)) throw new Error("CGWEB139 : payload FIT absent.");
  const payload=prepared.payload;
  const canonical=numberOrNull(activity?.ascent_m);
  const count=payload.points.length;
  const declaredRouteCount=numberOrNull(route?.source_point_count);
  const declaredActivityCount=numberOrNull(activity?.record_count);
  const routeSamples=routeCount(route);
  const authoritativeCount=declaredRouteCount>0 ? declaredRouteCount
    : declaredActivityCount>0 ? declaredActivityCount : null;
  const blockers=[];
  // A declared original point count is not an invitation to interpolate records.
  if (authoritativeCount !== null && Math.round(authoritativeCount)!==count) {
    blockers.push("SOURCE_RECORD_COUNT_MISMATCH");
  }
  // Even without declared count, never silently drop route samples.
  if (routeSamples>0 && count<routeSamples) blockers.push("ROUTE_SAMPLE_LOSS");
  if (canonical===null || canonical<0) blockers.push("CANONICAL_ASCENT_UNAVAILABLE");
  const original=altitudeProfile(payload.points);
  const noise=likelyFlatAltitudeNoise(original,canonical);
  let mode="RAW_ALTITUDE_PRESERVED";
  if (noise) {
    // The raw Firestore route is untouched; only the candidate FIT records are
    // flattened when the trusted session D+ is exactly zero and a strong
    // short-band oscillatory pattern has been detected.
    const median=Math.round(original.median_m*5)/5;
    payload.points=payload.points.map(p=>numberOrNull(p.altitude_m)===null ? p : {...p,altitude_m:median});
    mode="ZERO_ASCENT_HIGH_CONFIDENCE_NOISE_FLATTENED";
  }
  // No recalculation from per-record noisy heights can supersede D+ = 0.
  payload.total_ascent_m=canonical;
  const exported=altitudeProfile(payload.points);
  return {
    blockers:[...new Set(blockers)],
    report:{version:VERSION,authoritative_ascent_m:canonical,
      source_declared_point_count:authoritativeCount,source_route_point_count:declaredRouteCount,
      source_activity_record_count:declaredActivityCount,
      stored_route_sample_count:routeSamples,candidate_fit_record_count:payload.points.length,
      full_record_parity_ok:blockers.filter(s=>s.includes("COUNT")||s.includes("LOSS")).length===0,
      original_altitude:original,candidate_altitude:exported,
      noise_detected:noise,altitude_mode:mode,source_mutated:false}
  };
}
function altitudeAudit({activity,route,preview,strava}={}) {
  const canonical=numberOrNull(activity?.ascent_m);
  const remote=numberOrNull(strava?.total_elevation_gain);
  const fit=numberOrNull(preview?.fit?.ascent_m);
  const nsource=numberOrNull(route?.source_point_count) ?? numberOrNull(preview?.cgweb139?.source_declared_point_count);
  const fitPoints=numberOrNull(preview?.fit?.record_count);
  const delta=canonical!==null && remote!==null ? remote-canonical : null;
  return {version:VERSION,status:remote===null?"STRAVA_NOT_LINKED_OR_NOT_AVAILABLE"
    : delta!==null && Math.abs(delta)<=0.5 ? "ASCENT_MATCH" : "ASCENT_MISMATCH",
    canonical_ascent_m:canonical,strava_ascent_m:remote,delta_strava_minus_cgweb_m:delta,
    candidate_fit_ascent_m:fit,candidate_fit_record_count:fitPoints,
    source_route_point_count:nsource,
    record_parity_ok:nsource!==null && fitPoints!==null ? nsource===fitPoints : null,
    preview_parity_ok:preview?.parity_ok===true,
    altitude_noise_mode:preview?.cgweb139?.altitude_mode||null,
    no_remote_mutation:true};
}
async function inspectFitBinary(buffer) {
  const {Decoder,Stream}=await import("@garmin/fitsdk");
  const b=Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if(!Decoder.isFIT(Stream.fromBuffer(b))) throw new Error("CGWEB139 : signature FIT invalide.");
  const decoder=new Decoder(Stream.fromBuffer(b));
  if(!decoder.checkIntegrity()) throw new Error("CGWEB139 : integrite FIT non valide.");
  const output=decoder.read({applyScaleAndOffset:true,expandSubFields:true,
    expandComponents:true,convertTypesToStrings:false,convertDateTimesToDates:true,
    includeUnknownData:false,mergeHeartRates:true,decodeMemoGlobs:false,
    skipHeader:false,dataOnly:false,legacyArrayMode:false});
  const mesgs=output?.messages||{};
  const records=Array.isArray(mesgs.recordMesgs)?mesgs.recordMesgs:[];
  const sessions=Array.isArray(mesgs.sessionMesgs)?mesgs.sessionMesgs:[];
  const recordPoints=records.map(r=>({altitude_m:
    numberOrNull(r?.enhancedAltitude)??numberOrNull(r?.altitude)}));
  const profile=altitudeProfile(recordPoints);
  const totalAscent=numberOrNull(sessions[0]?.totalAscent);
  return {fit_integrity_ok:true,fit_record_count:records.length,
    fit_session_ascent_m:totalAscent,
    record_altitude:profile,
    raw_record_ascent_minus_session_m:totalAscent===null||profile.positive_gain_m===null
      ?null:profile.positive_gain_m-totalAscent};
}
module.exports={VERSION,numberOrNull,routeCount,altitudeProfile,likelyFlatAltitudeNoise,prepare,altitudeAudit,inspectFitBinary};
