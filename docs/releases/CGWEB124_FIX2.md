# CGWEB124 FIX2

## SPORT_SPLIT_AGGREGATE001
L'agrégat GPS historique conserve désormais :
- total passages / activités ;
- course passages / activités ;
- vélo passages / activités ;
- autres sports passages / activités.

## RUN_PASSAGE_COUNTER001
Toutes les activités FIT `sport = 1` sont regroupées en « Course » :
course sur route, trail, ultra, etc.

## BIKE_PASSAGE_COUNTER001
Toutes les activités FIT `sport = 2` sont regroupées en « Vélo » :
route, VTT et autres sous-sports cyclistes.

## OTHER_SPORT_FALLBACK001
Tout autre code sport est conservé dans « Autres » afin de ne perdre aucun passage.

## SPORT_SPLIT_UI001
Chaque repère GPS affiche Total, 🏃 Course, 🚲 Vélo et Autres, avec le nombre
de passages et le nombre d'activités distinctes.

Les badges de tête affichent aussi les totaux Course / Vélo / Autres.

## Indexation
Un ancien snapshot historique sans `sport_split_version = 1` n'est pas repris :
une indexation complète est demandée afin d'éviter des compteurs partiels.

Les occurrences manuelles historiques ne sont jamais modifiées.
