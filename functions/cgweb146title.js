"use strict";
/* CGWEB146 · ONE_ACTIVITY_TITLE_SYNC001
 * User-initiated synchronization only. No bulk scans, no FIT, metrics,
 * description, route, or CGWEB/Firestore mutations.
 */
const VALID_KEY = /^[A-Za-z0-9_.:-]{1,180}$/;
const VALID_ID = /^\d{1,24}$/;
const CANONICAL = /^\d{4}_\d{2}_\d{2}_\d{2}_\d{2}(?:_\d{2})?_[CVHTMS]$/i;
const MINUTE = /^\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_[CVHTMS]$/;
const normalize = value => String(value == null ? "" : value).trim();
function createTitleSync({readActivity,readIntegration,readRemote,putRemoteTitle,canonicalTitle}) {
  for(const value of [readActivity,readIntegration,readRemote,putRemoteTitle,canonicalTitle])
    if(typeof value!=="function")throw new TypeError("CGWEB146: missing dependency");
  async function sync(uid,activityKey) {
    const key=normalize(activityKey);
    if(!VALID_KEY.test(key))return {status:"INVALID_ACTIVITY_KEY",updated:false};
    const activity=await readActivity(uid,key);
    if(!activity || activity.deleted_at_ms!=null)
      return {status:"ACTIVITY_NOT_AVAILABLE",updated:false};
    const id=normalize(activity.strava_activity_id);
    if(!VALID_ID.test(id))return {status:"NOT_LINKED",updated:false};
    const title=normalize(canonicalTitle(activity));
    if(!MINUTE.test(title))return {status:"NO_CANONICAL_MINUTE_TITLE",updated:false};
    const integration=await readIntegration(uid);
    const scopes=new Set(normalize(integration?.scope).split(/[\s,]+/));
    if(!integration?.refresh_token || !scopes.has("activity:write"))
      return {status:"STRAVA_WRITE_SCOPE_MISSING",updated:false};
    const detail=await readRemote(uid,id);
    if(String(detail?.id||"")!==id)
      return {status:"REMOTE_ID_MISMATCH",updated:false};
    const oldName=normalize(detail.name);
    if(oldName===title)return {status:"TITLE_ALREADY_CORRECT",updated:false,strava_activity_id:id,title};
    if(!CANONICAL.test(oldName))
      return {status:"CUSTOM_TITLE_PRESERVED",updated:false,strava_activity_id:id};
    await putRemoteTitle(uid,id,title);
    const after=await readRemote(uid,id);
    if(String(after?.id||"")!==id || normalize(after?.name)!==title)
      return {status:"TITLE_NOT_CONFIRMED",updated:false,strava_activity_id:id};
    return {status:"TITLE_UPDATED",updated:true,strava_activity_id:id,old_title:oldName,title};
  }
  return {sync};
}
module.exports={createTitleSync,CANONICAL,MINUTE};
