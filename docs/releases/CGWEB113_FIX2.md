# CGWEB113 FIX2

Modules :

- HISTORICAL_LOCAL_FILENAME_REPAIR001
- METADATA_ONLY_RENAME001
- INTERNAL_TIMESTAMP_GUARD001
- DRY_RUN_FIRST001
- POST_REPAIR_REAUDIT001
- ROLLBACK_READY001

Corrige les anciens noms canoniques construits en UTC sans toucher au contenu FIT.

Exemple :
- ancien : 2026_09_18_10_01_29_C.fit
- attendu Europe/Paris : 2026_09_18_12_01_29_C.fit

Le FIT Vault stocke physiquement les objets sous un chemin basé sur le hash.
FIX2 ne déplace donc aucun objet Storage : seule la métadonnée file_name est corrigée.

Conditions obligatoires :
1. rôle CANONICAL ;
2. nom au format canonique ;
3. ancien préfixe exactement UTC ;
4. objet Storage résolu ;
5. FIT lu et décodé ;
6. timestamp interne à ±1 seconde de l'activité.

Tout INTERNAL_TIMESTAMP_MISMATCH est bloqué.

Dry-run :
    await window.CGWEB113_FIX2_PREVIEW()

Page suivante :
    await window.CGWEB113_FIX2_PREVIEW_NEXT()

Application volontaire sur maximum 10 candidats du dernier aperçu :
    await window.CGWEB113_FIX2_APPLY_LAST("APPLY_LEGACY_UTC_NAMES")

Chaque écriture est suivie d'un réaudit complet.

Base rollback code : 9e83a81ad5def49dd79eefc6e2c000bc01f4dcdb
