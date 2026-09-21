# CGWEB110 · DIRECTORY_BULK_DOWNLOADABILITY_REWIRE001

Modules :

- PAGE_SCOPED_FIT_TRUTH001
- ICON_TRUTH_RENDER001
- LEGACY_V081_BYPASS001
- HISTORICAL_DOWNLOAD_RESTORE001
- HOSTING_ONLY001
- ROLLBACK_READY001

## Diagnostic de départ

CGWEB109 a démontré :

- 6339 activités actives ;
- 6336 activités avec FIT réellement résolu ;
- 3 vrais FIT absents ;
- 988 activités seulement visibles par V081 ;
- 5348 faux négatifs d'icône ;
- liste V081 chargée = 1000 / plafond 1000.

Le Répertoire utilisait historiquement la disponibilité de
FITQUICKDOWNLOAD001, elle-même basée sur :

```js
request("list", {query: {limit: 1000}})
```

## Nouveau chemin du Répertoire

```
lignes actuellement affichées
        ↓
activity_id des .web081-fit-quick
        ↓
CGWEB109 BULK_DOWNLOADABILITY001
        ↓
vérité activity_files + Storage
        ↓
v081SetQuickState()
        ↓
icône visible uniquement si downloadable=true
```

Le téléchargement est également débranché du cache V081 :

```
clic icône
   ↓
CGWEB107 SPORT_DIRECTORY_FIT.directDownload(activity_id)
   ↓
Storage stream direct
```

## Portée

Le mécanisme V081 historique reste présent pour les anciennes fonctions qui
en dépendent encore (éditeur/export). Le Répertoire, lui, ne l'utilise plus
pour déterminer la présence du FIT ni pour télécharger celui-ci.

Aucune activité, aucun FIT, aucun document Storage, aucune route et aucune
Function backend ne sont modifiés par CGWEB110.

Base rollback : `cd3862c5f930f52aeb95f1ba1496bba419bb86cf`
