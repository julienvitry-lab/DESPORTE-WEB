# CGWEB134

## STRAVA_EXPORT_FOUNDATION001

Fondation de l'export historique SPORT Web vers Strava.

Le bouton `Strava` est présent dans le bandeau de chaque fiche activité,
immédiatement après `Découper`.

CGWEB134 n'effectue encore aucun upload.

## ACTIVITY_WRITE_SCOPE001

OAuth Strava demande désormais :

- read
- activity:read_all
- activity:write

Le scope effectivement accordé par Strava est enregistré depuis la réponse
OAuth et non plus seulement déduit de la demande.

## OUTBOUND_EXPORT_LOCK001

Une activité historique validée par le préflight reçoit un verrou serveur
`PREPARED` dans :

`strava_outbound_exports/{activity_key}`

Durée du verrou : 30 minutes.

Le verrou contient notamment :

- snapshot des statistiques SPORT ;
- hash du snapshot ;
- external_id futur ;
- token de verrou ;
- résultat du duplicate guard.

Aucun upload n'est effectué par CGWEB134.

## STRAVA_DUPLICATE_GUARD001

Avant création d'un verrou, le serveur interroge les activités Strava dans
une fenêtre autour de la date SPORT.

Un candidat est bloquant lorsqu'il présente une concordance forte sur :

- sport ;
- date / heure ;
- distance ;
- durée.

Un filet complémentaire gère les activités Strava dont l'heure de départ
est masquée : même journée + distance et durée quasi identiques.

Le pipeline historique est limité strictement aux activités antérieures
à 2026.
