# CGWEB113

Modules :

- FIT_LOCAL_TIME_CANONICAL_NAME001
- EUROPE_PARIS_TIMEZONE001
- FIT_TIMESTAMP_PARITY_AUDIT001
- NO_HISTORICAL_RENAME001
- ROLLBACK_READY001

## Correction des futurs noms canoniques

Les noms FIT canoniques ne dépendent plus du fuseau du runtime Cloud Functions.
Ils sont formatés explicitement avec le fuseau IANA Europe/Paris.

Exemple observé :

- start_time_ms = 18/09/2026 10:01:29 UTC
- affichage France = 18/09/2026 12:01:29
- ancien nom = 2026_09_18_10_01_29_C.fit
- nouveau nom = 2026_09_18_12_01_29_C.fit

Le passage CET/CEST est géré automatiquement par Intl.

## Audit de parité

L'action backend fit_timestamp_parity_audit compare, pour jusqu'à 25 activités :

1. start_time_ms de l'activité ;
2. startTime/timestamp réellement décodé à l'intérieur du FIT ;
3. nom réel du fichier ;
4. nom canonique attendu en Europe/Paris ;
5. ancien schéma de nom UTC éventuel.

Statuts principaux :

- OK
- LEGACY_UTC_FILENAME
- CANONICAL_FILENAME_MISMATCH
- INTERNAL_TIMESTAMP_MISMATCH
- FIT_INTERNAL_TIME_UNVERIFIED
- ORIGINAL_FILENAME_NOT_CANONICAL

## Sécurité

CGWEB113 ne renomme, ne remplace et ne réécrit AUCUN ancien FIT.
Les futurs FIT canoniques utilisent le nouveau format de nom.

Le helper navigateur suivant audite les 25 premières activités visibles :

    await window.CGWEB113_AUDIT_VISIBLE()

Le résultat complet reste disponible dans :

    window.CGWEB113_LAST_AUDIT

Base rollback : 9cfedc605b9b7e7cabbb8b59d42b89116c273501
