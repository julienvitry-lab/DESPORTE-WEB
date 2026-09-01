WEB042 · WEBSTRAVA003 — Strava -> SPORT serveur
================================================

Fichiers à remplacer dans DESPORTE-WEB :
- functions/index.js
- web/app.js
- web/index.html
- scripts/deploy_strava_backend.sh

Architecture :
Strava webhook -> stravaWebhook -> strava_webhook_events -> stravaWebhookProcessor
-> sport_users/{uid}/activities + activity_routes + changes

Important : le commit GitHub met à jour SPORT Web, mais il ne redéploie pas à lui seul
les Firebase Functions dans le workflow WEB041 actuel.
Il faut ensuite exécuter une fois scripts/deploy_strava_backend.sh depuis un poste
ayant firebase-tools et l'accès au projet sport-505813.

Après le déploiement : ouvrir SPORT Web une fois. L'appel status crée/répare
automatiquement la subscription webhook Strava. Ensuite le navigateur peut être fermé.

Règles conservées :
- anti-doublon exact strava_activity_id + proximité heure/distance/durée ;
- Kinomap/tapis -> sport=1, sub_sport=21, pente 12 %, source KINOMAP_STRAVA_WEB ;
- table equipment_mappings appliquée côté serveur ;
- choix de matériel manuel non écrasé ;
- suppression Strava n'efface pas automatiquement l'archive SPORT ;
- polling navigateur WEBSTRAVA002 conservé uniquement comme filet de secours.
