# CGWEB096 · DIRECTORY_FIT_DOWNLOAD_AUDIT001 / CLOUD_OBJECT_RESOLVE001 / DOWNLOAD_BUTTON_REWIRE001

## Problème

CGWEB095 démontre une couverture logique de 100 % :
toutes les activités actives ont au moins un document FIT lié.

Le bouton Télécharger du Répertoire utilisait encore un ancien indicateur
« FIT Cloud » et pouvait afficher à tort :

`Aucun FIT Cloud associé à cette activité`

## DIRECTORY_FIT_DOWNLOAD_AUDIT001

Audit en lecture seule de la chaîne complète :

activité
→ activity_files
→ rôle ORIGINAL/CANONICAL/EDITED
→ objet physique dans Firebase/Google Cloud Storage.

Le backend indexe le bucket Storage et tente une résolution :

1. chemin objet exact présent dans les métadonnées ;
2. basename unique ;
3. SHA-256 unique.

## CLOUD_OBJECT_RESOLVE001

Pour une activité donnée :

1. recherche tous ses FIT liés ;
2. priorité ORIGINAL ;
3. sinon CANONICAL ;
4. sinon EDITED ;
5. résolution de l'objet Storage ;
6. génération d'une URL V4 signée, lecture seule, valable 10 minutes.

Aucun objet n'est modifié.

## DOWNLOAD_BUTTON_REWIRE001

La fonction historique du bouton Télécharger est détectée automatiquement
par le message « Aucun FIT Cloud associé à cette activité ».

CGWEB096 injecte en tête de cette fonction le nouveau resolver
`SPORT_DIRECTORY_FIT.resolve(activity_id)`.

L'ancien code reste présent comme fallback si aucun activity_id ne peut être
déduit de l'appel.
