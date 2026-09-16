# CGWEB079 · FITCUTOVER001

## Statut final du pipeline FIT

SPORT Web devient l'autorité unique pour l'acquisition et la production des FIT :

- imports Strava futurs → FIT canonique Web + Coffre FIT Cloud ;
- imports FIT futurs → original conservé dans le Coffre ;
- découpage Web pris en charge ;
- versions FIT non destructives disponibles ;
- Firebase Storage est le coffre de référence.

## Android

Le dépôt Android est audité en lecture seule pendant l'installation :

- `IMPORTWEB001_WEB_ONLY = true` doit être actif ;
- `WebFirstPolicy` doit neutraliser l'acquisition Android ;
- `FitImportJobService` et `StravaSyncJobService` doivent rester neutralisés ;
- `FirebaseChangeStore` doit rester présent ;
- la synchronisation Firebase Android reste fonctionnelle.

CGWEB079 ne supprime pas physiquement les anciennes classes FIT Android : elles restent du code dormant et ne sont pas réactivées. Cette stratégie évite une régression de compilation inutile.

## Garde-fous

- aucun backfill historique ;
- aucune activité existante modifiée ;
- aucune activité créée par le cutover ;
- CGWEB075/076/077/078 conservés ;
- Android reste consommateur/synchroniseur Firestore, pas point d'acquisition.
