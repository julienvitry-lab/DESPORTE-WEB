# CGWEB121 FIX1

## ROUTE_QUALITY_INVARIANT001

CGWEB121 acceptait encore une route dès lors qu'elle contenait
au moins deux points.

Ce critère était insuffisant.

Exemple observé :

- activité : 18,34 km ;
- D+ : 967 m ;
- gps_point_count : 8190 ;
- route matérialisée : 2 points ;
- profil : 0 m.

Cette route est désormais explicitement invalide.

Le contrôle porte sur :

- nombre de points ;
- nombre de coordonnées GPS valides ;
- nombre de coordonnées distinctes ;
- cohérence avec la distance de l'activité ;
- présence et dispersion des altitudes si le D+ est significatif.

## CORRUPT_ROUTE_REBUILD001

Une route existante mais invalide ne bloque plus la récupération.

Ordre :

1. contrôle de activity_routes ;
2. rejet si qualité insuffisante ;
3. récupération du stream Strava complet ;
4. validation ;
5. remplacement complet de activity_routes ;
6. fallback FIT si Strava est insuffisant ;
7. relecture et validation Firestore ;
8. affichage carte + profil.

## FULL_STREAM_PRESERVE001

La récupération Strava exploite directement la route construite
depuis les streams complets renvoyés par le bridge Strava.

Aucune réduction à deux extrémités n'est effectuée par FIX1.

Le nombre réel de points reçu est conservé dans les métadonnées
de activity_routes.

## PROFILE_REALITY_CHECK001

Une activité présentant un D+ significatif ne peut plus être
considérée comme valide si :

- le stream altitude est quasi absent ;
- ou l'amplitude altimétrique est quasi nulle.

Cela empêche notamment un profil artificiellement plat à 0 m.

## ROUTE_REPLACE_ATOMIC001

La reconstruction remplace totalement le document dérivé
activity_routes.

Aucun tableau résiduel provenant d'une ancienne route corrompue
n'est conservé par merge.

Base :
f3b8d7120aaa87875f645abb83174cb2f68241a1
