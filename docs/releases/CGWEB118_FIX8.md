# CGWEB118 FIX8

## LEGACY_FILTER_PATCH_REMOVE001
- suppression des rustines runtime CGWEB118 FIX3, FIX4 et FIX5 ;
- aucun MutationObserver ajouté ;
- FIX7 de dédoublonnage mémoire conservé ;
- FIX2 conservé pour ses autres fonctions (Objectifs / Matériel / Export).

## FILTERBAR_SOURCE_REWRITE001
Le bandeau historique WEB049 est créé dynamiquement dans `applyWeb049UiContract`.
FIX8 corrige donc sa source réelle dans `web/app.js`, au lieu de chercher
un `<details>` inexistant dans le HTML statique.

Ordre physique :
Année / Date / Sport / FIT / Repère / Ordre / Matériel.

## SEARCH_REMOVE_FINAL001
Recherche est vidée et masquée.

## EQUIPMENT_LAST_FINAL001
Matériel est physiquement dernier et occupe la largeur restante.

## TRIANGLE_INLINE_FINAL001
Triangle seul, immédiatement à gauche des champs, écart de 2 mm.

Compteurs et boutons restent conservés sous la ligne de filtres.

Aucune écriture Firestore ou Storage.
Base rollback : 8f6bea2e6d407ea8e3a55539c87d0428a8b6a034
