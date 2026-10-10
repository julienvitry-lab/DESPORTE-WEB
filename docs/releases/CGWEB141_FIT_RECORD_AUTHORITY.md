# CGWEB141 · FIT_RECORD_AUTHORITY001

**Demande** : le nombre de points pris en compte est exactement le nombre de `Record` réellement contenu dans le FIT selectionne et disponible dans CGWEB. Ni le compteur de l'activite, ni celui du parcours ne doit imposer un nombre plus eleve.

## Modifications limitees au backend
- Previsualisation export Strava : `recordDigest` du FIT source fournit le nombre de Record de reference. Une activite historique annoncant 1348 points ne bloque plus un FIT valide a 271 points.
- Edition active : meme autorite binaire, sans minimum issu des metadonnees. Aucun Record original ne peut etre omis dans la version produite.
- FIT vide, incoherent, CRC invalide, SHA non conforme, activite ambigue, perte de Record apres edition, et archivage incomplet restent bloquants.
- Aucune synthese artificielle des 1077 points absents ; aucune modification automatique de `record_count`, `source_point_count`, du FIT original ou des statistiques.
- Pas de changement Web, pas de retrait des controles des cinq metriques Strava.

Le deploiement ne concerne que la fonction `fitVault` du codebase `strava` sur `sport-505813`.
