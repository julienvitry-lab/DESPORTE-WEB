# CGWEB103 · FIT_RECOVERY_AUDIT001 / SPLIT_LINEAGE_AUDIT001 / PARENT_FIT_STATE001 / READ_ONLY_RECOVERY_QUEUE001

## Objet

Auditer en lecture seule les activités dont le FIT original est à restaurer,
avec un traitement spécifique des activités issues de WEBSPLIT.

## FIT_RECOVERY_AUDIT001

L'audit examine toutes les activités actives et réutilise le resolver physique
CGWEB096 pour déterminer la provenance réelle :

- ORIGINAL
- CANONICAL
- ABSENT

La file `À restaurer` contient uniquement CANONICAL + ABSENT.

## SPLIT_LINEAGE_AUDIT001

Pour chaque activité dérivée, l'audit recherche :

- `split_parent_activity_id` dans l'activité ;
- le même lien dans `activity_routes` en secours ;
- le document parent, y compris s'il est dans la corbeille ;
- `split_children_ids` du parent ;
- `split_status` / `split_profile` du parent ;
- le rôle FIT du parent ;
- le rôle FIT de l'enfant.

Statuts de lignée possibles :

- OK
- PARENT_DOCUMENT_MISSING
- PARENT_CHILD_LINK_MISMATCH
- PARENT_ID_MISSING

## PARENT_FIT_STATE001

Une activité dérivée CANONICAL/ABSENT est distinguée selon le FIT du parent :

- PARENT_ORIGINAL_AVAILABLE
- PARENT_CANONICAL_ONLY
- PARENT_FIT_ABSENT
- PARENT_DOCUMENT_MISSING

Aucune restauration n'est effectuée par CGWEB103.

## READ_ONLY_RECOVERY_QUEUE001

L'interface affiche deux listes :

1. `Activités à restaurer` : CANONICAL + ABSENT ;
2. `Lignées WEBSPLIT` : toutes les activités dérivées détectées.

L'objectif est de préparer le futur lot de réparation sans écrire une seule
activité ni un seul FIT.

## Données

Lecture seule.
Aucune activité modifiée.
Aucun FIT modifié.
Aucune suppression.
Aucune fusion.

## Base de rollback

`d2f915d88b123505d5672256bdc0e0f33a133a8c`
