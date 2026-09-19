# CGWEB104 · FIT_RECOVERY_PLAN001 / SPLIT_PARENT_RESTORE001 / ORIGINAL_RELINK_GUARD001 / SAFE_RESTORE_PREPARE001

## Principe

CGWEB104 transforme l'audit CGWEB103 en plan d'action.

Aucune restauration n'est exécutée automatiquement.

La restauration d'un parent WEBSPLIT nécessite :

1. un parent `SOURCE_AUTO`;
2. un parent actuellement en corbeille;
3. une route parent encore présente;
4. une lignée cohérente;
5. un FIT exploitable :
   - ORIGINAL/CANONICAL déjà lié au parent, ou
   - exactement un ORIGINAL lié à un enfant, pouvant être relinké au parent.

## FIT_RECOVERY_PLAN001

Le plan regroupe les enfants par parent et classe chaque lignée :

- READY_PARENT_FIT
- READY_RELINK_CHILD_ORIGINAL
- BLOCKED_PARENT_NOT_AUTO
- BLOCKED_PARENT_ALREADY_ACTIVE
- BLOCKED_PARENT_ROUTE_MISSING
- BLOCKED_LINEAGE
- BLOCKED_ARCHIVE_REQUIRED

Le plan est en lecture seule.

## ORIGINAL_RELINK_GUARD001

Un FIT ORIGINAL enfant n'est proposé au relink que si :

- le parent n'a aucun FIT résolvable;
- un seul enfant possède un ORIGINAL résolvable;
- le document `activity_files` original est identifiable;
- l'enfant appartient bien à ce parent.

Le fichier physique n'est jamais copié ni réécrit.
Seule sa métadonnée `activity_id` peut être relinkée pendant la restauration.

## SPLIT_PARENT_RESTORE001

La restauration est explicitement déclenchée par l'utilisateur, parent par parent.

Elle passe par `commitWebMutation`, afin de conserver :

- le journal `changes`;
- les séquences Web;
- les métadonnées de synchronisation.

Ordre volontairement non destructif :

1. relink ORIGINAL enfant -> parent si nécessaire;
2. réactivation du parent;
3. placement des enfants dans la corbeille.

En cas d'interruption, le parent est privilégié : le pire cas transitoire est un
doublon visible, pas une disparition de l'activité.

Les enfants ne sont jamais supprimés définitivement.

## Données

- aucun traitement en masse automatique;
- aucune suppression physique de FIT;
- aucune suppression définitive d'activité;
- restauration uniquement sur confirmation explicite.

## Base de rollback

`2a5b02993c33f47d75136b183d4971b26ea32c74`
