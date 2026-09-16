# CGWEB077 · FITPIPELINE001

## But

Brancher le Coffre FIT Cloud sur les **futurs imports Web uniquement**.

## Flux Strava

`Strava -> WEBSPLIT003 -> activité(s) créée(s) -> FITWRITER001 -> FIT Cloud`

- les streams Strava servent à reconstruire un FIT Garmin canonique ;
- si WEBSPLIT003 crée plusieurs activités, chaque activité enfant reçoit son propre FIT canonique ;
- les coordonnées GPS sont conservées quand elles existent ;
- les activités indoor sans GPS restent supportées sans inventer de coordonnées ;
- la déduplication du coffre reste basée sur SHA-256.

## Flux import FIT manuel

`FIT original -> WEBSPLIT003 -> activité(s) SPORT Web -> FIT original inchangé -> FIT Cloud`

- le fichier fourni par l'utilisateur est conservé tel quel ;
- il est stocké une seule fois et lié à la première activité créée ; les enfants issus du split conservent tous le même `source_sha256` ;
- aucune régénération ne remplace l'original.

## Garde-fous

- aucun scan de l'historique ;
- aucun backfill automatique ;
- aucune modification rétroactive des activités existantes ;
- aucune création d'activité par FIT Cloud ;
- CGWEB075 FITWRITER001 et CGWEB076 FITROUNDTRIP001 sont conservés ;
- en cas d'échec du coffre, l'activité Web déjà créée n'est pas supprimée ni recréée.

## Périmètre

CGWEB077 ne branche pas encore l'**Ajout manuel sans fichier** sur le Writer.
