# WEB055-FIX6 · ACTIVITYOPEN001 / UX010

## Activités · ouverture de fiche
- Le rafraîchissement automatique `reloadAll()` ajouté par WEB055 n'est plus lancé à l'ouverture de tous les onglets.
- Il est désormais limité à `Accueil`.
- Cela évite que `reloadAll()` remette `currentDetailId` à zéro et rappelle `showCatalog(false)` pendant l'ouverture d'une activité.
- Le clic d'une carte activité continue d'appeler `showActivity(activity)`.
- La fiche conserve la carte, les statistiques, les performances et les données personnelles existantes.

## Tri des activités
- Le vrai texte `<span>Tri des activités</span>` est affiché horizontalement.
- Les anciens `summary::after` sont neutralisés.
- Le chevron est déplacé vers `summary::before` et lui seul pivote à l'ouverture.
