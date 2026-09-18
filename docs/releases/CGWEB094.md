# CGWEB094 · SAFE_MATCH_APPLY001 / DUPLICATE_ACTIVITY_MERGE_PREVIEW001 / ORPHAN_HOLD001

## SAFE_MATCH_APPLY001

Première écriture volontaire du chantier de réconciliation.

Garde-fous :
- applique uniquement `SAFE_EXACT` ;
- prévisualisation obligatoire ;
- la liste SHA -> activité vue par l'utilisateur est renvoyée au serveur ;
- le serveur recalcule intégralement le plan avant écriture ;
- si le plan a changé, écriture refusée ;
- si une activité cible dispose déjà d'un original, écriture refusée ;
- si deux SAFE ciblent la même activité, écriture refusée ;
- préflight de tous les FIT et activités avant commit ;
- un seul batch Firestore ;
- aucun document `activities` n'est modifié.

Écrit uniquement dans `activity_files/{sha256}` les métadonnées de rattachement.

## ORPHAN_HOLD001

Pour les `NO_COMPATIBLE_CANDIDATE` :
- aucun rattachement ;
- aucun changement d'activité ;
- ajoute seulement des métadonnées `orphan_hold*` au FIT original ;
- opération idempotente.

Les FIT restent volontairement non liés.

## DUPLICATE_ACTIVITY_MERGE_PREVIEW001

Lecture seule.

Compare les activités jumelles et propose uniquement une base technique à partir
de la richesse de provenance (ID externe), route et FIT liés.

Affiche les champs :
- identiques ;
- transférables vers la base si la base est vide ;
- en conflit si les deux documents portent des valeurs différentes.

Aucune fusion, suppression ou modification d'activité n'est effectuée.

## Invariants

- la prévisualisation ne modifie rien ;
- SAFE_MATCH_APPLY001 ne modifie aucun document activité ;
- ORPHAN_HOLD001 ne lie aucun FIT ;
- DUPLICATE_ACTIVITY_MERGE_PREVIEW001 est strictement READ-ONLY.
