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
