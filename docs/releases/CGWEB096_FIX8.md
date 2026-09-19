# CGWEB096 FIX8

## LOAD_ORDER_ONLY001

FIX7 atteignait correctement le handler exact, puis s'arrêtait dans une étape devenue inutile qui tentait de remplacer textuellement un bloc interne de `cgweb096DirectoryDownload`.

Erreur observée :

`Bloc historique cgweb096DirectoryDownload inattendu`

FIX8 supprime entièrement cette réécriture fragile. La disponibilité de l'API est assurée par l'ordre de chargement `fitcloud.js` puis `app.js`, et le nouveau handler exact attend `SPORT_DIRECTORY_FIT` avant de déléguer au resolver existant.

## DOWNLOAD_HANDLER_EXACT001

FIX4 avait injecté le resolver au début de `v081SetQuickState`, une fonction
d'état UI appelée hors clic utilisateur. Cela pouvait déclencher le nouveau
resolver simplement en entrant dans Fichiers.

FIX5 retire cette greffe.

Le nouveau branchement se fait sur les contrôles DOM du Répertoire :

- uniquement dans `#activityDirectorySection` ;
- uniquement sur `button`, `a` ou `[role=button]` présentant un signal
  téléchargement/FIT ;
- uniquement si un `activity_id` est effectivement résolu ;
- interception en phase capture afin de neutraliser l'ancien handler ;
- MutationObserver afin de couvrir les lignes ajoutées par pagination.

Aucun téléchargement n'est lancé au boot.

## FITCLOUD_LOAD_GUARD001

- une seule balise `fitcloud.js` ;
- `fitcloud.js` est placée avant `app.js` ;
- cache-busting FIX5 ;
- attente active de `window.SPORT_DIRECTORY_FIT` jusqu'à 8 secondes dans le nouveau handler Télécharger ;
- aucune réécriture textuelle de `cgweb096DirectoryDownload` ou `cgweb096RunAudit` ;
- l'audit bénéficie de l'ordre de chargement garanti `fitcloud.js` puis `app.js`.

## WRONG_REWIRE_ROLLBACK001

Le bloc `CGWEB096_DOWNLOAD_BUTTON_REWIRE001` de FIX4 est supprimé avant
installation du nouveau handler.

## Périmètre

FIX5 est un correctif client uniquement :

- aucune Function modifiée ;
- aucun document Firestore modifié ;
- aucun FIT créé, remplacé ou supprimé ;
- déploiement Hosting uniquement.
