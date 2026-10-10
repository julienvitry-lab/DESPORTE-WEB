'use strict';
/* CGWEB141 · FIT_RECORD_AUTHORITY001
 * The FIT binary determines the number of Records used for export/edit.
 * Never use activity.record_count or route.source_point_count as a minimum.
 */
function fromFit(count) {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw Object.assign(new Error('CGWEB141 : FIT sans enregistrement valide ; operation bloquee.'), {status: 422});
  }
  return count;
}
module.exports = {fromFit};
