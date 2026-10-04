# CGWEB124

GPS_MARKER_CATALOG001 / MULTIPASS_DETECTOR001 / HYSTERESIS_REARM001 / SEGMENT_PROXIMITY001 / HISTORICAL_MARKER_INDEX001 / INCREMENTAL_MARKER_REFRESH001

- Les repères GPS réutilisent le catalogue de repères personnels existant et stockent leur configuration dans `landmark_references`.
- Coordonnées GPS, rayon d’entrée et rayon de réarmement sont modifiables repère par repère.
- Valeurs par défaut : 50 m d’entrée et 75 m de réarmement.
- MULTIPASS_DETECTOR001 compte plusieurs passages dans une même activité.
- HYSTERESIS_REARM001 impose une vraie sortie du rayon de réarmement avant de compter un nouveau passage.
- SEGMENT_PROXIMITY001 teste la distance minimale entre le repère et chaque segment GPS, et pas seulement les points enregistrés.
- Un départ à l’intérieur du rayon compte comme un passage.
- L’index dérivé `gps_marker_activity_index` est séparé de `activity_landmarks` : les repères manuels ne sont jamais écrasés.
- HISTORICAL_MARKER_INDEX001 est reprenable et écrit les agrégats exacts dans `landmark_references`.
- L’indexation historique est verrouillée tant que le lot CGWEB123 de jonctions est RUNNING / READY / PAUSED / REBUILD_REQUIRED.
- INCREMENTAL_MARKER_REFRESH001 surveille les activités récentes et réindexe automatiquement une activité nouvelle ou modifiée.
- Le module est isolé dans `web/cgweb124.js` afin de ne pas modifier le moteur de fusion CGWEB123 actuellement chargé.
