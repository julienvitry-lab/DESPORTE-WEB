# CGWEB096 FIX9

## DOWNLOAD_ICON_STATE_SYNC001

L'audit CGWEB096 a établi :

- 6339 activités actives ;
- 6339 métadonnées FIT liées ;
- 6339 objets physiques Cloud résolvables ;
- 6270 originaux ;
- 69 canoniques ;
- 0 objet introuvable ;
- 0 ambiguïté.

Malgré cette couverture physique de 100 %, certains pictogrammes Télécharger
restaient gris car leur état visuel provenait encore de l'ancien mécanisme
« FIT Cloud ».

FIX9 synchronise l'état visuel sur le nouveau handler CGWEB096.

Pour chaque vrai contrôle Télécharger du Répertoire disposant d'un
`activity_id` :

- `disabled` est neutralisé ;
- `aria-disabled=false` ;
- attribut `data-cgweb096-fit-download-ready=1` ;
- tooltip obsolète remplacé par « Télécharger le FIT » ;
- classes génériques d'indisponibilité retirées.

## DIRECTORY_FIT_VISUAL_REWIRE001

CSS dédié :

- opacité 1 ;
- pointer-events actifs ;
- curseur cliquable ;
- filtre gris neutralisé ;
- couleur d'accent ;
- SVG / image internes remis à pleine opacité.

Le CSS utilise `!important` pour gagner contre les anciens styles de
disponibilité.

## LEGACY_AVAILABILITY_BYPASS001

FIX9 ne supprime pas l'ancien code de disponibilité.

Il le contourne uniquement pour les contrôles reconnus par :

- `cgweb096IsExactDownloadControl`
- `cgweb096ExactActivityId`

Le clic reste géré par le resolver CGWEB096. Si un futur objet n'est
réellement pas résolvable, le téléchargement échoue proprement côté resolver :
l'état visuel n'autorise aucune écriture ni création de FIT.

Un MutationObserver réapplique l'état après pagination/rendu ou après une
tentative de l'ancien code de griser à nouveau le bouton.

## Périmètre

- client uniquement ;
- Hosting uniquement ;
- aucune Function modifiée ;
- aucune activité modifiée ;
- aucun FIT créé, remplacé ou supprimé.
