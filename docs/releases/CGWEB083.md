# CGWEB083 · FIX7 · ACTIVITYHEADER003

## Barre de titre

La barre `#activityDirectoryHeaderWeb059` est désormais placée **avant**
`#activityDirectorySection`, et non plus à l'intérieur.

Objectif : empêcher les anciennes règles d'`overflow` du Répertoire de
neutraliser `position: sticky`.

La barre reste ancrée sous les navigations via :

`top: var(--web059-sticky-top, 0px)`.

## Tri des activités

La barre **Tri des activités** reste dans `#activityDirectorySection`.
Puisque le header est maintenant juste avant cette section, le Tri est
physiquement placé sous la barre de titre.

Au défilement, le Tri et les activités passent derrière la barre de titre.

## Déplacements supplémentaires

Le mot « encore » est interprété comme un déplacement additionnel par rapport
à FIX6.

Positions cumulées :

- Date : +2 mm ;
- Temps : -4 mm ;
- Matériel : +48 mm ;
- Repères : -20 mm ;
- Charge : +12 mm.

## Conservé

- espacement vertical de 2 mm ;
- 100 activités au démarrage ;
- ancre « Afficher 20 de plus » ;
- pictogramme FIT FIX4 ;
- pipeline FIT ;
- backend et Firestore inchangés.
