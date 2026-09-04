# WEB055-FIX7 · SUBSPORT002

Correction du filtre `Sous-sport` dans Activités.

Cause :
- WEB054 appliquait le filtre au DOM et non à `filteredActivities`.
- le `data-sub-sport` avait été injecté après `return cell` dans `activityMain()`, donc ce code était inatteignable.
- le masquage aurait de toute façon concerné un enfant de la carte et non la carte complète.

Correction :
- `sub_sport` devient un critère natif de `applyFiltersAndRender()`.
- il se compose avec Sport, Année, Matériel, Repère, Source, Distance, D+, recherche et tri.
- le compteur de statut repose sur `filteredActivities`.
- les options Sous-sport sont construites depuis toutes les activités actives.
- `Charger tout` est réellement attendu lorsque nécessaire.
- `data-sub-sport-web054` est placé sur le vrai bouton `.activity-card`.
