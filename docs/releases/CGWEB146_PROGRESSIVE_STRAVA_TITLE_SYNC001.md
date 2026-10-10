# CGWEB146 · PROGRESSIVE_STRAVA_TITLE_SYNC001

## Objet

Sur les activités déjà liées à Strava, une action individuelle `export_preflight` (statut ALREADY_LINKED) ou `export_post_audit` peut désormais régulariser **uniquement le titre** Strava au format `AAAA_MM_DD_HH_MM_CODE`.

- Le moteur canonique CGWEB145 (`houseTitle`) reste la seule source de la date, de l'heure et de l'abréviation sportive.
- Seuls les titres Strava possédant déjà la structure d'un horodatage maison (`avec` ou `sans` secondes) peuvent être remplacés. Les titres libres sont préservés.
- Une activité non liée, supprimée, sans périmètre d'autorisation Strava en écriture ou associée à un identifiant distant discordant n'est jamais modifiée.
- Un PUT Strava n'utilise que `{name: title}`. Il est vérifié par une nouvelle lecture distante.
- Aucune mutation de FIT, de route, de statistiques, de description Strava, de Firestore ou de verrou n'est effectuée par ce module.
- Échec de mise à jour de texte = statut pending, sans remettre en cause les exports ou les réconciliations déjà réalisés.
- Aucun balayage, aucun backfill massif ni nouveau POST d'upload Strava.

## Déploiement

`functions:strava:stravaBridge` seulement, sur `sport-505813`, après confirmation et simulation (`--dry-run`).

La mise à jour des noms existants n'est pas rétroactive : chaque activité doit passer par une action individuelle de synchronisation après publication.
