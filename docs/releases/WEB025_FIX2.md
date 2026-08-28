# WEB025-FIX2 · restauration robuste carte / profil

- Restaure un chemin prioritaire carte + profil basé sur le socle validé WEB019.
- Les analyses WEB020 à WEB025 sont exécutées ensuite et isolées : une erreur d'analyse
  ne peut plus faire disparaître la carte ou le profil.
- Recherche `activity_routes` sous `id`, `__docId` puis la clé métier habituelle.
- Ne bloque plus la lecture d'un `activity_routes` existant à cause de `gps_point_count`.
- Ajoute des messages d'erreur visibles et précis en cas de route réellement absente.
- Aucun changement Firebase, Android ou données.
