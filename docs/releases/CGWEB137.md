# CGWEB137

## STRAVA_CANONICAL_METRICS001

Toute activité réconciliée conserve les valeurs brutes Strava dans :

- strava_canonical_distance_m
- strava_canonical_moving_time_s
- strava_canonical_elapsed_time_s
- strava_canonical_elevation_gain_m
- strava_canonical_calories

Les champs SPORT principaux restent eux aussi réconciliés avec Strava.

Les champs canoniques constituent une copie d'audit indépendante de l'affichage.

## RAW_VALUE_PRESERVE001

Aucune valeur canonique n'est transformée en kilomètres ni arrondie avant stockage.

Exemple :

`12384.6 m`

reste :

`12384.6`

et n'est jamais remplacé par :

`12.38 km`

dans les données de calcul.

## AGGREGATE_FROM_RAW001

Les agrégations navigateur utilisent les valeurs canoniques brutes lorsqu'elles
existent.

Aucun total n'est construit à partir de chaînes affichées ou de valeurs déjà
arrondies.

Le total Firestore historique continue de sommer les champs SPORT principaux,
qui sont eux-mêmes remplacés par les valeurs Strava brutes au moment de la
réconciliation.

## DISPLAY_ROUNDING_PARITY001

Les conventions d'affichage principales sont centralisées :

- distance : 2 décimales en km ;
- D+ : mètre entier affiché ;
- temps : seconde entière.

Ces arrondis sont strictement visuels.

Ils ne sont jamais réinjectés dans les données ni utilisés dans une somme.

## STRAVA_TOTALS_AUDIT001

Dans Plus → Strava, un panneau :

`Parité annuelle SPORT ↔ Strava`

permet de choisir une année.

L'audit récupère directement les activités avec :

`GET /athlete/activities`

et additionne les valeurs SummaryActivity brutes :

- distance ;
- moving_time ;
- elapsed_time ;
- total_elevation_gain.

L'endpoint Athlete Stats n'est volontairement PAS utilisé car Strava précise
qu'il ne comptabilise que les activités en visibilité Everyone.

L'audit distingue :

1. parité des activités appariées ;
2. couverture annuelle ;
3. parité annuelle complète.

Une activité est contrôlée individuellement afin que deux erreurs opposées
ne puissent pas s'annuler dans une somme.

## Calories

SummaryActivity ne contient pas les calories.

Les calories restent donc contrôlées activité par activité depuis
DetailedActivity lors de la réconciliation.

Le total SPORT des calories canoniques est affiché à titre informatif,
sans prétendre constituer un second total live Strava.

## Critère final

`FULL_PERIOD_PARITY`

signifie simultanément :

- même univers d'activités SPORT / Strava pour l'année ;
- aucune activité SPORT non liée ;
- aucune activité Strava sans correspondance ;
- aucun doublon de liaison ;
- aucune différence activité par activité ;
- mêmes sommes brutes distance / temps / temps écoulé / D+.
