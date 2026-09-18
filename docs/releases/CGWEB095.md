# CGWEB095 · GLOBAL_FIT_COVERAGE001 / ORIGINAL_FIRST_BACKFILL001 / MISSING_FIT_GLOBAL_BATCH001

## Objectif

Garantir une couverture FIT au niveau de **toutes les activités actives**,
et non plus uniquement des quelques entrées dérivées du Coffre local.

Ordre de priorité :

1. conserver les FIT déjà liés ;
2. rattacher les FIT originaux non liés uniquement lorsqu'un match
   `SAFE_EXACT` est disponible ;
3. pour les activités restant sans aucun FIT, générer un FIT canonique
   uniquement si les données nécessaires sont suffisantes ;
4. isoler les activités insuffisantes pour revue manuelle.

## GLOBAL_FIT_COVERAGE001

Le dry-run parcourt toutes les activités actives et tous les `activity_files`
actifs puis calcule la couverture globale.

## ORIGINAL_FIRST_BACKFILL001

Avant toute génération canonique, CGWEB095 réutilise le plan `SAFE_EXACT`
de CGWEB094 et n'écrit que dans les métadonnées `activity_files`.

## MISSING_FIT_GLOBAL_BATCH001

Après la phase originaux, la couverture est recalculée. Un FIT canonique est
généré uniquement pour les activités qui ne disposent toujours d'aucun FIT.
Le traitement se fait par lots de 25, avec recheck et nouveau `plan_token`
après chaque lot.

## Sécurité

- aucun document activité créé/modifié/supprimé ;
- aucun FIT existant remplacé ;
- `plan_token` obligatoire entre chaque lot ;
- opération idempotente.

## Interface

`Plus > Fichiers > Couverture FIT globale`
