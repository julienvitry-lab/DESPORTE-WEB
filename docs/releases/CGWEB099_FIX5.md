# CGWEB099 FIX5 · FILTER_ROW_COMPACT001 / DOWNLOAD_AVAILABLE_ONLY001 / DOWNLOAD_RIGHT_EDGE001 / ROW_NOWRAP002 / ROLLBACK_READY003

## FILTER_ROW_COMPACT001

Le filtre conserve les champs :

Année / Date / Sport / Matériel / Repère / Recherche / Ordre

sur une seule ligne en affichage desktop.

Les largeurs de `Sport` et `Repère` sont réduites à environ la moitié de leur
largeur observée sous FIX4.

## DOWNLOAD_AVAILABLE_ONLY001

Le pictogramme FIT n'est affiché que si le contrôle est réellement disponible.

Sont masqués :

- bouton `disabled` ;
- `aria-disabled=true` ;
- classes `disabled`, `unavailable`, `inactive` ;
- états / titres indiquant absence de FIT, indisponibilité ou lien non résolu.

Quand il est masqué, son emplacement est également supprimé.

## DOWNLOAD_RIGHT_EDGE001

Lorsqu'il est disponible, le contrôle Télécharger est déplacé en dernier enfant
de la ligne d'activité et réservé sur 42 px à droite.

## ROW_NOWRAP002

Les lignes restent en `nowrap`.
La colonne téléchargement n'est jamais autorisée à passer en deuxième ligne.

## ROLLBACK_READY003

Rollback dédié à FIX5.

Aucune activité, aucun FIT et aucune Function backend ne sont modifiés.

## Base de rollback

`61d11dbd5c689cc82ed94e908885ce55cbae1ebd`
