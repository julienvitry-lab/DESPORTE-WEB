# CGWEB139 · Altitude + record fidelity (Google Cloud Shell)

- FIT_ALTITUDE_NOISE_GUARD001: generated FIT ONLY; detect short-band reversals on zero-ascent activities and replace candidate altitude points with their median. Raw route data remain unchanged. Audit explicitly notes this transformation.
- CANONICAL_ASCENT_PRESERVE001: the persisted CGWEB ascent, including explicit `0`, overrides any raw altitude integration. Missing ascent is a blocking error.
- FULL_RECORD_EXPORT_PARITY001: compare generated Record count against route source count (or activity record count as fallback). If a route declares 1,058 source points but only 266 records are available, block export; *never* interpolate 792 fictitious records to pass.
- STRAVA_ALTITUDE_AUDIT001: after export Strava activity is read; audit is written to existing audit collection. Exposed browser API only reads and never rewrites already-exported Strava activities.

Constraints: no automatic alteration of Strava historical uploads, no backfill of raw FITs, no automatic deletion or Firestore rewrites. A stored, full-resolution source must be recovered separately where the route was already reduced.
