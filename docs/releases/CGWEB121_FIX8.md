# CGWEB121 FIX8

Modules :

- FIT_SOURCE_RECOVERY001
- INDEPENDENT_TIME_EDITOR001

## Constat

FITEDITOR001 désactivait entièrement l'édition lorsque l'activité ne possédait
aucun FIT Cloud directement associé.

Une activité peut pourtant conserver sa carte et ses données SPORT tout en
ayant perdu, ou n'ayant jamais eu, son lien avec le coffre FIT Cloud.

## FIT_SOURCE_RECOVERY001

Lorsqu'aucun FIT n'est directement lié à l'activité, SPORT Web inspecte les
FIT Cloud non liés.

Un candidat n'est retenu automatiquement que lorsque :

- le sport est compatible lorsqu'il est connu ;
- la date est identique ou l'écart temporel reste inférieur à 12 h ;
- un seul candidat fiable subsiste.

En cas de plusieurs candidats, aucune association automatique n'est réalisée.

Lorsqu'un candidat unique existe, le bouton de création de version FIT peut
utiliser ce FIT comme parent. Le parent reste conservé et la nouvelle version
est liée à l'activité.

## INDEPENDENT_TIME_EDITOR001

Un nouveau bouton :

`Enregistrer l'heure de l'activité`

reste disponible même lorsque aucun FIT source n'existe.

Il :

- sauvegarde une révision SAFEEDIT ;
- modifie `start_time_ms` de l'activité SPORT ;
- publie la mutation via `commitWebMutation` ;
- ne crée, ne modifie et ne supprime aucun fichier FIT.

Le bouton historique :

`Créer et activer la version`

reste réservé au cas où un FIT lié ou un FIT source unique récupérable existe.

## Sécurité

- aucun FIT inventé ;
- aucune association automatique en cas d'ambiguïté ;
- aucun FIT supprimé ;
- modification indépendante de l'heure explicitement confirmée.

Base :

360d93def256fbcec3b41aac2a3c5426be019340
