# CGWEB108 · STRAVA_FIT_ORPHAN_AUDIT001

Modules :
- STORAGE_ACTIVITY_RECONCILIATION001
- EXACT_FIT_RELINK_PREVIEW001
- STRAVA_IMPORT_LINEAGE001
- NO_FIT_TRUTH001
- READ_ONLY001
- ROLLBACK_READY001

CGWEB108 réutilise les moteurs CGWEB091/092/093 pour rapprocher les FIT
ORIGINAL non liés avec les activités sans FIT téléchargeable, puis vérifie
leur présence physique avec l'index Storage CGWEB096.

Aucune activité, aucun document FIT, aucun objet Storage et aucune route
ne sont modifiés.

Base rollback : `369c7e7785aa105b606aebc36d13b317a9d7509e`
