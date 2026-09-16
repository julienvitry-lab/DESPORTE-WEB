# CGWEB083 · FIX5 · ACTIVITYHEADER001

## Barre de titre Activités

La barre `activityDirectoryHeaderWeb059` est maintenant ciblée directement.

Décalages :
- Date : +2 mm ;
- Temps : -1 mm ;
- Matériel : +2,5 cm ;
- Repères : -1 cm ;
- Charge : +1 cm.

Les anciens `left` / `transform` injectés par les correctifs précédents sont neutralisés par CSS `!important`.

## Ancrage

La barre de titre est `position: sticky` et utilise `--web059-sticky-top`, déjà calculé à partir des navigations visibles.

## Espacement vertical

Les rubriques directes du Répertoire Activités sont séparées uniformément de 2 mm (7,559 px).

Les lignes d'activités elles-mêmes ne sont pas concernées par ce nouvel espacement.

## Conservé

- 100 dernières activités au départ ;
- ancrage de scroll sur « Afficher 20 de plus » ;
- pictogramme FIT FIX4 ;
- pipeline FIT ;
- backend ;
- données Firestore.
