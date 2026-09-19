# CGWEB099 FIX4 · FILTER_CLOSED_DEFAULT001 / EXACT_DATE_FILTER001 / SINGLE_DISCLOSURE_MARKER001 / DIRECTORY_PAGER_REMOVE001 / ROW_SINGLE_LINE001 / DOWNLOAD_ICON_LAYOUT001 / ROLLBACK_READY002

## FILTER_CLOSED_DEFAULT001

Le panneau de filtres `Tri des activités` est fermé à l'ouverture.

## EXACT_DATE_FILTER001

Ajout d'un filtre `Date` au format natif HTML `date`.

Le navigateur calcule les bornes du jour en heure locale puis envoie :

- `date_from_ms`
- `date_to_ms`

au backend.

Le filtrage est donc effectué sur l'ensemble des activités et respecte le jour
local, y compris les changements heure d'été / heure d'hiver.

## SINGLE_DISCLOSURE_MARKER001

Le seul indicateur visuel du `<details>` est le triangle natif plein situé à
gauche.

Les pseudo-éléments `summary::before` et `summary::after` sont neutralisés.

## DIRECTORY_PAGER_REMOVE001

La barre visible :

- Précédent ;
- Suivant ;
- `1–100 / ...` ;
- `Par page`

est supprimée du Répertoire.

La requête globale reste active en interne avec sa page de sécurité. Pour
atteindre les activités anciennes, l'usage prévu est désormais le filtrage
global (année, date, sport, matériel, repère, recherche).

## ROW_SINGLE_LINE001

Les lignes du Répertoire historique sont forcées sur une seule ligne.

Les cellules textuelles peuvent être tronquées visuellement plutôt que de
passer sur deux lignes.

## DOWNLOAD_ICON_LAYOUT001

Le contrôle de téléchargement FIT est détecté par son title / aria-label /
classe / attribut download.

Sa cellule reçoit une largeur réservée fixe afin qu'elle ne descende plus sur
une deuxième ligne.

## ROLLBACK_READY002

Le package est accompagné d'un rollback dédié qui annule uniquement FIX4 si
FIX4 est toujours le dernier commit.

Aucune activité et aucun FIT ne sont modifiés.

## Base de rollback

`1b8b9c459d2d2403f2b72e626baeaf7092aa47d2`
