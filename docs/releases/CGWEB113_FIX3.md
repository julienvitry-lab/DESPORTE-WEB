# CGWEB113 FIX3

Modules :

- MASS_SAFE_SWEEP001
- RESUMABLE_CURSOR001
- STOP_ON_ANOMALY001
- PAGE_VERIFY001
- ONE_COMMAND001
- HOSTING_ONLY001

Objectif : automatiser le traitement de plusieurs milliers de fichiers tout en
réutilisant exactement le backend sécurisé de CGWEB113 FIX2 / FIX2 FIX1.

Le navigateur parcourt automatiquement le catalogue par lots de 25.
Les corrections sont envoyées par lots de 10 maximum.

Avant toute écriture sur un lot, seuls les statuts suivants sont acceptés :

- ALREADY_LOCAL
- LEGACY_UTC_FILENAME
- SKIP_NOT_CANONICAL
- SKIP_NONBASE_CANONICAL_CODE

Tout autre statut arrête immédiatement le sweep avant écriture sur le lot.

Chaque candidat réparable doit être CANONICAL avec un delta interne <= 1000 ms.
Chaque écriture doit revenir REPAIRED_AND_VERIFIED, reaudit_status=OK.
Après écriture, le même lot est relu avant tout avancement de curseur.

L'état est sauvegardé dans localStorage après chaque lot validé.
En cas de coupure/rechargement, relancer la même commande reprend au dernier
lot validé.

Commande :

    await window.CGWEB113_FIX3_MASS_SWEEP("APPLY_ALL_LEGACY_UTC_NAMES")

État :

    window.CGWEB113_FIX3_STATUS()

Arrêt volontaire :

    window.CGWEB113_FIX3_REQUEST_STOP()

Backend inchangé. Hosting uniquement.

Base rollback : 554c083ed4eeec3c879a44ed19ca6e08b04063fd
