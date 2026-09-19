# CGWEB102 FIX1 · DIRECTORY_FIT_PROVENANCE_FILTER001 / CANONICAL_ABSENT_FILTER001 / RESTORE_QUEUE001 / FIT_RESOLVER_PARITY001

## Objectif

Ajouter au menu `Tri des activités` un filtre global de provenance FIT.

Valeurs :

- Tous
- Original
- Canonique
- Sans FIT
- À restaurer = Canonique + Sans FIT

Le filtre agit sur l'ensemble du Répertoire côté backend, et non uniquement sur
les lignes déjà affichées.

## FIT_RESOLVER_PARITY001

CGWEB102 ne crée pas une nouvelle heuristique de provenance.

Il réutilise exactement le resolver physique déjà en place :

- `c096LinkedRows(uid)`
- `c096StorageIndex()`
- `c096ResolvePreferred(rows, index)`

La classification est donc identique à CGWEB097 / DOWNLOAD_STATE_TRUTH001 :

- ORIGINAL
- CANONICAL
- ABSENT

ABSENT signifie ici : aucun fichier physiquement résolvable par le resolver.

## RESTORE_QUEUE001

`À restaurer` sélectionne :

- tous les CANONICAL ;
- tous les ABSENT.

Cela constitue une file de travail pour la future restauration d'originaux à
partir des archives FIT, sans modifier les activités.

## Performance

La résolution physique globale n'est exécutée que si le filtre FIT n'est pas
`Tous`.

Les autres filtres (année, date, sport, matériel, repère, recherche) sont
appliqués avant la résolution FIT afin de limiter le nombre de lignes à tester.

## Données

Lecture seule.
Aucune activité modifiée.
Aucun FIT modifié.
Aucune suppression.

## Base de rollback

`b6885e16605c75f2b9ff3ec8c06e1f62d370b4cc`
