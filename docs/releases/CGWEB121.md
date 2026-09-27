# CGWEB121

## CARTO_DEFACTO001

La cartographie n'est plus une étape optionnelle de publication.

Pour toute activité disposant de données GPS exploitables :

GPS
→ activity_routes
→ carte
→ profil altimétrique.

## ROUTE_INVARIANT001

Invariant :

gps_point_count > 1
OU activité liée à Strava

implique :

activity_routes valide.

Une activité GPS sans route est désormais considérée comme
une anomalie à réparer automatiquement.

## ROUTE_PERSIST_VERIFY001

La persistance d'une route devient stricte :

1. validation de la route avant écriture ;
2. setDoc dans activity_routes ;
3. relecture Firestore ;
4. normalisation ;
5. vérification d'au moins deux points GPS ;
6. seulement ensuite, succès.

Les erreurs ne sont plus avalées silencieusement.

## MAP_PROFILE_ALWAYS_ON001

La rubrique Carte + Profil est exposée automatiquement dès
l'ouverture du détail.

Le renderer cartographique est déclenché après restauration
de l'invariant.

## RECENT_ROUTE_AUDIT001

SPORT Web audite automatiquement un petit lot d'activités GPS
récentes :

- au démarrage ;
- au retour sur l'onglet ;
- périodiquement.

Les routes manquantes sont réparées sans action utilisateur.

Les activités historiques sont réparées à l'ouverture de leur détail.

## Sources de récupération

Le pipeline existant de FIX10 reste la source canonique :

1. activity_routes ;
2. route/archives déjà disponibles ;
3. Strava déjà lié ;
4. matching Strava ;
5. FIT ;
6. FIT Cloud.

CGWEB121 impose ensuite la persistance vérifiée.

## Principe UX

« Tracé Web non publié » n'est plus un état normal.

Une activité GPS doit soit afficher sa carte et son profil,
soit être explicitement identifiée comme anomalie cartographique.

Base :
7d1a41d10ad71dd4faef85c4f533759e84babd3a
