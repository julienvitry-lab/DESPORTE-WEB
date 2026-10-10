# CGWEB140 FIX3 · LOSSLESS EDITOR / STRAVA WINS

- `FIT_EDITOR_FULL_STREAM001`: edits operate on the SHA-verified complete FIT source, never the reduced activity_routes point array. Unproven provenance or reduced source blocks the edit.
- `CONFIRMED_CLOCK_REUSE001`: the explicit real-edit action authorizes exactly one bounded timestamp offset. The saved new FIT is itself the active reference. Export does not ask for the time again.
- `HR_RECORD_PRESERVE001`: synthetic heart rate is inserted into FIT Record definitions/values without dropping or resampling any original Record, event, lap, developer field, or other message. Per-field parity is checked before replacement.
- `ARCHIVE_BEFORE_REMOVE001`: all previous operational FIT objects must pass SHA-256 verification and be archived to `sport_users/<uid>/fit_superseded/<activity-id>/<sha>.fit` before the operational manifest switches. The old operational objects are removed only after that verification.
- `ACTIVE_FIT_EXPORT001`: outbound Strava preview chooses the active edited FIT when linked; a legacy original is only a fallback when no active hash exists.
- `STRAVA_WINS_ALL_FIVE001`: once Strava returns complete detailed metrics, overwrite distance, moving time, **elapsed time**, ascent and calories. Retain pre-Strava values in the audit and keep the persistent training-load fields unchanged.

## Safety boundaries
- All edits fail closed on missing source, wrong SHA, unverifiable provenance, missing Record data, incompatible timestamp encoding, decoded-file errors or archive problems.
- No existing Firestore/FIT storage data are modified by installing this code. Live operations only happen after explicit user actions.
- The raw source FIT is never changed in place.
- Deploy only after manual verification. Synthetic unit tests do not replace a live FIT/Strava round trip.
