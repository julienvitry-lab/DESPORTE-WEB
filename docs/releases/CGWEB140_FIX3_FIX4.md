# CGWEB140 FIX3 FIX4 · PARTIAL_CLEANUP_TRUTH001

## Problem
A FIT edit could return `HTTP 200 / ok:true` after successful activation and archive verification but failed removal of some obsolete operational GCS objects (`fit_replacement_cleanup_ok:false`). This is misleading and invites unsafe retries.

## Fix
- Both `version` API code paths return HTTP 409, `ok:false`, `status:FIT_PARTIAL_CLEANUP` when an active edit finishes with incomplete cleanup.
- The active SHA and verified archive counts are retained for recovery; do not retry a completed switch blindly.
- The activation result now includes cleanup errors, archive count, deleted-object count and explicit `PARTIAL_CLEANUP` or `COMPLETED` status.
- Other versions, complete cleanup and inactive edits retain their existing behavior.
- Existing unit and simulated integration tests remain mandatory, plus FIX4 regression tests.

## Scope
No automatic recovery or destructive retries. No Firebase deployment, Git push or `main` merge by the installer. The existing two-phase archive and cleanup cannot claim full transaction atomicity and still requires staged production validation.
