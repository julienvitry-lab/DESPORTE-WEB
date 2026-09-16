# CGWEB083 · FIX8 · CUSTOMHEADER001

## Objectif

Les décalages successifs sur la barre historique n'étant pas satisfaisants,
la solution est remplacée par une nouvelle barre de titre dédiée.

## Nouveau header

Création de `#cgweb083CustomActivityHeader`, placé juste avant
`#activityDirectorySection`.

Ce nouveau header :

- est `sticky` ;
- possède son propre fond, ses bordures et son ombre ;
- masque complètement l'ancien `#activityDirectoryHeaderWeb059` ;
- centre les textes horizontalement dans les colonnes correspondantes.

## Alignement aux colonnes

La grille du nouveau header reprend dynamiquement le
`grid-template-columns` de la première `.activity-card` visible.

Ainsi les libellés :
- Date
- Heure
- Distance
- D+
- Temps
- Matériel
- Repères
- Charge

s'alignent directement avec les vraies colonnes des activités.

## Conservé

- Tri des activités sous le header ;
- espacement vertical de 2 mm ;
- 100 activités au démarrage ;
- ancre « Afficher 20 de plus » ;
- pictogramme FIT FIX4 ;
- pipeline FIT ;
- backend et Firestore inchangés.
