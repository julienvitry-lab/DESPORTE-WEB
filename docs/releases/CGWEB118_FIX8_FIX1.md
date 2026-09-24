# CGWEB118 FIX8 FIX1

Diagnostic navigateur confirmé :

- filters_class = filters web056-original-filters
- panel_class = activity-filters-disclosure cgweb099-legacy-hidden
- panel_parent = activityDirectorySection

Le FIX8 initial ciblait uniquement details.activity-filters-web049.
FIX1 adopte le wrapper historique déjà présent, lui ajoute
activity-filters-web049 et retire cgweb099-legacy-hidden.

Aucun MutationObserver ajouté.
FIX7 de dédoublonnage conservé.
Aucune écriture Firestore / Storage.

Base rollback : 8b15d15cd36b8d1d85266ba0056197dfbd671170
