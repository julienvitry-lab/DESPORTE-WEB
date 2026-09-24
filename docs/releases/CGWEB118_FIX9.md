# CGWEB118 FIX9

## CGWEB099_FILTER_GRID_TARGET001
Cible DOM confirmée :
DIV.cgweb099-filter-grid, parent direct DETAILS,
8 enfants directs LABEL.

Ordre source :
Année / Date / Sport / Matériel / FIT / Repère / Recherche / Ordre.

## SEARCH_REMOVE_FINAL002
Recherche est vidée puis masquée.

## EQUIPMENT_LAST_FINAL002
Ordre final :
Année / Date / Sport / FIT / Repère / Ordre / Matériel.

## TRIANGLE_INLINE_FINAL002
Le SUMMARY du DETAILS parent est aligné sur la même ligne,
à 2 mm du premier champ.

## NO_ADVANCED_FILTER_TOUCH001
FIX9 ne sélectionne jamais ".filters",
ne cible jamais activity-filters-disclosure
et n'utilise aucun MutationObserver.

FIX3/FIX4/FIX5 retirés.
FIX7 conservé.

Aucune écriture Firestore.
Aucune écriture Storage.
Base rollback : b09c06ecad981b5571db12a95b7fd0b4fa7c1efa
