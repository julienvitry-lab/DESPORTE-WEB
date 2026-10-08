# CGWEB139 FIX1 · Récupération des exports Strava supprimés

- STRAVA_DELETION_DETECT001 : GET détaillé sur l'API primaire avec scope `activity:read_all`, contrôle de l'athlète et pagination complète dans la fenêtre temporelle. Un `404` seul ne suffit pas.
- VERIFIED_UNLINK001 : preuve HMAC valide 5 minutes, confirmation manuelle spécifique à l'ID Strava, seconde lecture distante, transaction Firestore avec validation du verrou.
- EXPORT_LOCK_ARCHIVE001 : ancien verrou archivé dans `sport_users/{uid}/strava_export_history`, historique de synchronisation conservé. L'ancien document de verrou est supprimé uniquement dans la transaction approuvée.
- SAFE_REIMPORT001 : pas de POST automatique vers Strava. Préflight et contrôles CGWEB139 obligatoires avant tout nouveau FIT. Nouvel `external_id` pour une génération de réimportation, sans contourner la détection d'activités semblables.
- FETCH_ERROR_DIAGNOSTIC001 : un `404` suivi d'une panne réseau est déclaré indéterminé ; jamais utilisé pour déverrouiller.
- L'activité CGWEB, son FIT source, ses métriques et ses corrections ne sont pas supprimés ni réécrits.
- Une activité peut rester dans « Supprimés récemment » chez Strava : l'utilisateur doit confirmer lui-même la suppression souhaitée.
- Le nouveau workflow est disponible via le bouton contextuel « Réimporter une activité supprimée » et via `SPORT_STRAVA_RECOVERY.openByStravaId("...")`.
- Limites : l'API Strava peut refuser un nouvel upload malgré un nouvel `external_id`; vérifier dans Strava avant toute nouvelle tentative.
