'use strict';
/* CGWEB140 FIX3 FIX4 · PARTIAL_CLEANUP_TRUTH001
 * Pure response builder. Never touches Firebase or GCS.
 * A partial cleanup is a committed active FIT switch, not a failed edit to retry.
 */
function partialCleanupResponse(activityId, generatedSha, activityPatch) {
  if (!activityPatch || activityPatch.fit_replacement_cleanup_ok !== false) return null;
  const errors = Array.isArray(activityPatch.fit_replacement_cleanup_errors)
    ? activityPatch.fit_replacement_cleanup_errors.slice(0,20) : [];
  return {
    ok: false,
    status: 'FIT_PARTIAL_CLEANUP',
    error: 'CGWEB140 FIX3 FIX4 : nouveau FIT actif mais nettoyage GCS incomplet. Ne pas relancer Modifier réellement le FIT. Vérifier les archives et le rapport de nettoyage.',
    activity_id: String(activityId),
    active_fit_sha256: String(activityPatch.fit_active_sha256 || generatedSha),
    replacement_committed: true,
    old_fit_archived_count: Number(activityPatch.fit_replacement_archived_count || 0),
    old_fit_deleted_object_count: Number(activityPatch.fit_replaced_object_count || 0),
    cleanup_errors: errors,
    retry_safe: false,
    manual_review_required: true
  };
}
module.exports={partialCleanupResponse};
