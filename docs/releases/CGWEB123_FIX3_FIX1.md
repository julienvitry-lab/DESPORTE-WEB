# CGWEB123 FIX3 FIX1

MASS_PLAN_NO_ABORT001 / FRESH_QUEUE_SNAPSHOT001 / SINGLE_BATCH_LEASE001 / STALE_RUN_WRITE_GUARD001 / TIMEOUT_FAILURE_REQUEUE001

- Le PLAN manuel conserve son timeout navigateur de 20 s.
- Le gestionnaire de masse utilise `SPORT_FIT_JOIN_REPLACE.massPlan()`, sans AbortController navigateur.
- Toute nouvelle file de masse est construite depuis une lecture Firestore fraîche, puis regroupée avec les mêmes garde-fous Jonctions.
- Le stockage FIX3 FIX1 utilise un namespace distinct de FIX3 afin qu'un ancien runner ne puisse pas écraser le nouvel état.
- Un lease inter-onglets à TTL + heartbeat empêche deux runners FIX3 FIX1 d'exécuter le même lot simultanément.
- Chaque sauvegarde de lot est protégée par `batch_id`, `revision`, `writer_owner_id` et vérification du lease.
- L'ancien lot FIX3 est migré en `REBUILD_REQUIRED`; `Reprendre` reconstruit une file fraîche.
- Les anciens échecs `JOIN_REQUEST_TIMEOUT001` au stade PLANNING redeviennent éligibles automatiquement si leurs activités existent encore.
- Les fusions déjà réussies ne sont pas remises en file puisque leurs sources ont disparu.
- En cas d'état ambigu après EXECUTE, le lot est mis en pause au lieu de poursuivre aveuglément.
- `SOURCE_FIT_PURGE_AFTER_VALIDATE001` et le backend CGWEB122 restent inchangés.
