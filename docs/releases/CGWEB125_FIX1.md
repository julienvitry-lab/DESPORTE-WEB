# CGWEB125 FIX1

## AUTH_BADGE_CORRECTION001
Le badge principal représente désormais la connexion SPORT Web :
Google + Firestore + réseau.

Strava reste une intégration optionnelle et ne rend plus le badge principal
« Non connecté ». La branche authentifiée affiche explicitement « Connecté ».

## COMPLETED_BATCH_FREEZE001
Lorsqu'un lot FIX4 atteint `COMPLETE` avec `cursor >= total` :
- le dernier snapshot serveur est conservé en mémoire ;
- le polling périodique FIX4 est arrêté ;
- les boutons serveur sont figés ;
- le cadre devient « Fusion en masse · serveur · TERMINÉE » ;
- le statut serveur reste exposé aux autres modules sans nouvelles lectures périodiques.

## GPS_INDEX_UNLOCK001
CGWEB124 lit explicitement l'état du lot serveur FIX4 :
- RUNNING / RETRYING / PAUSING / PAUSED / IMPORTING => index GPS verrouillé ;
- COMPLETE => index GPS déverrouillé ;
- handoff connu mais état serveur non encore reçu => verrou de précaution.

Avec le lot actuel `1419 / 1419 COMPLETE`, l'indexation historique GPS devient disponible.
