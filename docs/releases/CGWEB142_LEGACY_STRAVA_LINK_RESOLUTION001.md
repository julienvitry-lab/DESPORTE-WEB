# CGWEB142 · LEGACY_STRAVA_LINK_RESOLUTION001

## Constat

Des activites anciennes (ex. CGWEB 5187, lien Strava #20502985541) portent un `strava_activity_id` mais pas necessairement de document `strava_outbound_exports/{activityId}` complet. CGWEB139 rejetait la consultation de suppression **avant** d'interroger Strava.

## Politique

- Sans verrou d'export ou avec verrou terminal `RECONCILED` incomplet : lecture Strava autorisee. Aucun delien automatique.
- Activite Strava **presente** : `STILL_EXISTS`, ancien lien conserve, pas de nouvel upload. Utiliser *Verifier la synchronisation*.
- Activite Strava **absente** : seul `404` + meme athlete + scopes requis + verification exhaustive de la fenetre chronologique + absence de doublon peuvent autoriser une preuve HMAC valable 5 minutes.
- Une **confirmation explicite** puis une **seconde verification Strava** sont obligatoires, avec transaction Firestore protegeant le lien et le verrou contre tout changement concurrent.
- Tout ancien lien est archive avant sa liberation. Aucun FIT, compteur, parcours ou statistique ne sera detruit ou recalcule par cette procedure. Aucune suppression dans Strava, aucun POST/upload automatique.
- Verrou en cours, verrou lie a un autre identifiant, permissions insuffisantes, echec reseau, doublon possible : BLOCAGE.
- La mise a jour du FIT d'une activite Strava existante n'est pas prise en charge par l'API : ne jamais promettre le remplacement du FIT en conservant l'ID Strava.

## Livraison

Correctif backend `functions/cgweb139fix1.js` seulement, API `stravaBridge`, codebase `strava`, region `europe-west1`, projet `sport-505813`.

Pas de modification Hosting ni des fonctions `fitVault` / `stravaWebhookProcessor`.
