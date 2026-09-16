# CGWEB085C · MAPTHUMB002

Correction des miniatures cartographiques de CGWEB084.

MAPTHUMB002 n'utilise plus son propre parseur.

Il reprend exactement le socle de la cartographie détaillée :
- `normalizeRoute()`
- document `activity_routes`
- recherche avec `id`
- recherche avec `__docId`
- recherche avec `activityKey()`

La miniature SVG reste légère et sans tuiles réseau.

Périmètre :
- Accueil → Dernières activités
- Accueil → Records

Le Répertoire Activités et son header CGWEB083 ne sont pas modifiés.
