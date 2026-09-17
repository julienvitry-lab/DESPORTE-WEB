# CGWEB087 FIX2 · LOWMEM_AUDIT001

Cause confirmée dans les logs Cloud Functions :

- `FATAL ERROR: Ineffective mark-compacts near heap limit`
- `JavaScript heap out of memory`

Le heap V8 atteignait environ 402 MiB.

Correction :
- activities via `.stream()`
- activity_files via `.stream()`
- aucun QuerySnapshot global
- aucun `activity_routes`
- aucun tableau GPS
- seulement des métadonnées compactes
- une version FIT préférée conservée par activité

L'audit reste strictement en lecture seule.
Aucun rattachement, aucun backfill, aucune mutation.
