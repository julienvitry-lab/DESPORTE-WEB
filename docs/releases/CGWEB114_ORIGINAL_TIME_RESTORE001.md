# CGWEB114 · ORIGINAL_TIME_RESTORE001

Modules :

- ORIGINAL_TIME_RESTORE001
- MOVING_CACHE_BYPASS001
- MOVING_PERSIST_DISABLE001
- ROUTE_MOVING_AUDIT_DISABLE001
- ORIGINAL_PACE_RESTORE001
- CGWEB113_RESUME_COMPAT001
- HOSTING_ONLY001

## Objet

Revenir aux durées importées d'origine et neutraliser le mécanisme WEB060 /
WEB063 de moving time calculé qui a pu produire des durées incohérentes
(exemple observé : 13,75 km affichés en 3 secondes).

## Nouvelle règle d'affichage

Ordre de lecture :

1. timer_time_ms
2. moving_time_ms
3. moving_time * 1000
4. elapsed_time_ms

Le champ moving_time_computed_ms n'est plus utilisé pour l'affichage.

Les allures et vitesses qui dépendent de web060MovingTimeMs utilisent donc
automatiquement cette durée restaurée.

## Sécurité

- Aucun champ historique n'est supprimé.
- Aucun document Firestore n'est modifié par le déploiement.
- Les anciens moving_time_computed_* restent présents mais sont ignorés.
- WEB063 ne persiste plus de nouveaux audits de moving time.
- Les audits automatiques de tracé servant à recalculer la durée sont neutralisés.
- Aucun backend n'est modifié.
- Hosting uniquement.

## CGWEB113 FIX3

Le code CGWEB113 FIX3 est conservé.
Son état localStorage n'est pas effacé par CGWEB114.

La reprise reste :

    await window.CGWEB113_FIX3_MASS_SWEEP("APPLY_ALL_LEGACY_UTC_NAMES")

## Diagnostic

Sur une fiche activité :

    window.ORIGINAL_TIME_RESTORE001.inspect()

Audit des activités déjà chargées :

    window.ORIGINAL_TIME_RESTORE001.auditLoaded()

Base rollback : 1e72884291b96e7b7fa3ca7d244e52e80ca5a2aa
