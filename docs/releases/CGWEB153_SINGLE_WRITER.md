# CGWEB153 · STRAVA_TITLE_SINGLE_WRITER001 / WEBHOOK_VERSION_ALIGNMENT001

Termux. Fix focused only on `functions/index.js`, `functions/cgweb138.js`, new `functions/cgweb153titlepolicy.js` and test. **No FIT/Firestore/Strava write during installation.**

* Webhook reconcilers keep updating CGWEB data and stats, never remote Strava title/description.
* CGWEB138 remains description-only; CGWEB146 retains exclusive PUT `name` from explicit Strava bridge flows.
* CGWEB138 manual backfill action runs description write first, then CGWEB146 name write.
* Re-deploy `stravaBridge` and `stravaWebhookProcessor` from the **same source revision**. Other functions and Hosting remain intact.
* Runtime is Node20 as currently deployed; this patch does not upgrade Node runtime or firebase-functions dependencies.
* Existing FIT and remote titles are never changed by the deploy. A previously wrong title is corrected on the next *individual authorized sync* using CGWEB146.

## Execution

```bash
unzip -o "$HOME/storage/downloads/CGWEB153_STRAVA_TITLE_SINGLE_WRITER_TERMUX.zip" -d "$HOME"
bash "$HOME/CGWEB153/install.sh" DEPLOYER
```

Installer refuses unexpected source anchors, local edits to targeted source files, or missing local release dependencies. It creates a new branch, backs up targeted files, performs tests, commits, then simulates deployment. Firebase deployment targets only `functions:strava:stravaBridge,functions:strava:stravaWebhookProcessor`. `LD_PRELOAD` shim is forwarded to Firebase's node subprocess in Termux. On deploy failures after commit, no automatic rollback is claimed; use `deploy.sh` to resume.

**Important**: Confirm true persistence by opening a specific activity in Strava, waiting for any webhook delivery/processing, then refreshing. This patch removes a confirmed remote title-write path from the webhook; it does not guarantee Strava itself will not independently rewrite a title. Logs can be inspected before further changes.
