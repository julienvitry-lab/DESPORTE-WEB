# CGWEB123 FIX4 FIX1

- LIGHTWEIGHT_HANDOFF001 : page `/fix4-handoff.html` indépendante de `app.js`.
- APP_BOOT_BYPASS001 : aucun catalogue d'activités, Leaflet, dashboard ou watcher général.
- CRASH_SAFE_TRANSFER001 : pause FIX3 locale avant import, import serveur idempotent, `SERVER_HANDOFF` seulement après confirmation ; en cas de réponse perdue, `Actualiser` retrouve le lot Firestore.
- SERVER_PROGRESS_STANDALONE001 : progression, pause/reprise serveur et éléments à revoir depuis la page légère.
