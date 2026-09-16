# CGWEB078 · FITVERSION001

## But

Créer des **versions dérivées non destructives** d'un FIT déjà lié à une activité SPORT.

## Edition disponible

- décalage de l'heure de départ de -24 h à +24 h ;
- FC moyenne cible optionnelle ;
- FC maximale cible optionnelle ;
- si une FC cible est fournie, une courbe de FC déterministe est simulée dans les records ;
- si aucune FC cible n'est fournie, les valeurs de FC de la source sont conservées.

## Versionnement

Chaque version :

- reçoit un nouveau SHA-256 ;
- conserve `parent_sha256` ;
- conserve un `version_family_id` ;
- reçoit un `version_index` ;
- utilise un nom canonique suffixé `_02`, `_03`, etc. ;
- est stockée comme `VERSIONED_CANONICAL` dans le Coffre FIT Cloud.

## Garde-fous

- le FIT parent n'est jamais remplacé ;
- l'activité Firestore n'est jamais modifiée ;
- aucun backfill historique ;
- aucune création d'activité ;
- aucune suppression automatique ;
- FITWRITER001 valide l'intégrité du nouveau fichier avant stockage.

## Interface

Dans **Plus > Fichiers**, chaque FIT lié à une activité dispose du bouton **Créer version**.
