# CGWEB088 · FITRECOVERY001 / FITBACKFILL001

- Dry-run avant toute écriture.
- Les activités ayant déjà un FIT sont ignorées.
- Lots de 10 / 25 / 50.
- `activity_routes` est utilisé si >=2 points GPS.
- Sinon, un FIT canonique de synthèse est produit sans inventer de GPS.
- Chaque FIT est généré par FITWRITER001 puis relu/validé.
- Structure, date, sport, sous-sport, durée, distance, D+ et FC sont contrôlés.
- Aucun document `activities` n'est modifié.
- Aucun FIT lié existant n'est remplacé.
- Un conflit SHA avec une autre activité est refusé.
- Les fichiers reconstruits sont marqués `WEB_FITRECOVERY / BACKFILL_CANONICAL`.
- `lossless_source_reconstruction=false` : ils ne sont jamais présentés comme originaux.


## FIX1 · FITSIGNATURE001

Les FIT canoniques générés par SPORT Web reçoivent désormais une signature
déterministe dérivée de l'identifiant de l'activité.

Propriétés :
- même activité -> même signature d'identité ;
- deux activités différentes -> signature différente ;
- la signature complète SHA-256 est conservée dans `activity_files` ;
- une partie de la signature alimente `FILE_ID.serialNumber` et
  `DEVICE_INFO.serialNumber` ;
- aucune date, durée, distance, trace GPS, altitude, D+ ou FC n'est modifiée ;
- les FIT originaux importés manuellement ne sont jamais réécrits ;
- les FIT déjà présents dans le coffre ne sont pas modifiés ;
- CGWEB088 FITBACKFILL001 bénéficie de la signature pour tous les nouveaux lots ;
- les futurs FIT canoniques créés par le pipeline Strava en bénéficient aussi.

La signature sert d'identité technique et prépare un futur rattachement robuste
d'un FIT à son activité sans dépendre uniquement du nom du fichier ou de la date.
