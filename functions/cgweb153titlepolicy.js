"use strict";

/* CGWEB153 · STRAVA_TITLE_SINGLE_WRITER001
 * A Strava webhook is a signal to reconcile CGWEB data, not permission to
 * mutate Strava. The only allowed automatic title PUT is in cgweb146TitleSync,
 * invoked from an explicit stravaBridge export/sync operation.
 */
const VERSION = "CGWEB153";
function isWebhookReconciliation(source) {
  return /^WEBHOOK_/i.test(String(source == null ? "" : source));
}
function allowRemoteTextMutation(source) {
  return !isWebhookReconciliation(source);
}
module.exports = {VERSION, isWebhookReconciliation, allowRemoteTextMutation};
