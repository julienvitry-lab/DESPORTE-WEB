# CGWEB121 FIX8 FIX2

Modules :

- LINKED_FIT_LISTALL_RECOVERY001
- HAS_FIT_FRONTEND_RECONCILE001
- OLD_FIT_EDITOR_UNLOCK001

## Problème

Certaines anciennes activités affichent simultanément :

- `Aucun FIT Cloud` dans FITEDITOR001 ;
- `HAS_FIT` dans le diagnostic de reconstruction.

Le backend retrouve un FIT explicitement lié à l'activité, tandis que la
liste rapide utilisée par l'éditeur peut ne pas contenir ce vieux FIT.

## Correction

Lorsque `SPORT_FIT_EDITOR.currentRow()` ne voit aucun FIT, SPORT Web interroge
le coffre complet via `SPORT_FIT_EXPORT.allRows()`.

Les lignes sont recherchées par `activity_id` exact.

Si une ou plusieurs versions explicitement liées existent :

1. priorité à la version marquée ACTIVE ;
2. sinon priorité au plus grand `version_index` ;
3. sinon priorité à la ligne la plus récente ;
4. le FIT choisi devient la source réelle de FITEDITOR001 ;
5. le bouton est déverrouillé sous le libellé `Corriger le FIT associé`.

Aucune correspondance par date ou sport n'est nécessaire ici, car le lien
`activity_id` est déjà explicite.

## Sécurité

- aucun FIT inventé ;
- aucune réassociation heuristique ;
- aucune Functions nouvelle ;
- aucun FIT supprimé ;
- la version source reste conservée.

Base :

352f12ed13825da6b7570927664189f1cf1b0378
