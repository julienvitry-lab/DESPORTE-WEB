# CGWEB122

Modules :

- FIT_JOIN_REPLACE001
- DESTINATION_ACTIVITY_MERGE001
- SOURCE_DELETE_AFTER_VALIDATE001

## Principe

La fiche d'activité conserve le panneau `Joindre des activités du même jour`.
L'activité ouverte est la destination. Les autres activités compatibles du
même jour peuvent être sélectionnées comme sources.

## Plan

Avant toute écriture, le backend vérifie :

- 1 à 11 sources ;
- même date de départ en fuseau Europe/Paris ;
- même sport et même sous-sport ;
- absence de chevauchement temporel ;
- présence des activités et reconstruction possible de leurs données.

Le plan calcule l'ordre chronologique, les intervalles, la distance, le D+,
le temps actif et l'heure finale. Un `plan_token` protège contre les changements
entre la prévisualisation et l'exécution.

## Fusion

Le FIT final est construit à partir de tous les segments chronologiques :

- timestamps réels conservés ;
- pauses entre activités conservées comme intervalles temporels ;
- distance cumulée ;
- D+ cumulé ;
- temps actif cumulé ;
- FC moyenne pondérée par le temps actif ;
- FC maximale = maximum des segments.

Le FIT est validé avant toute suppression.

## Destination

L'ID de l'activité ouverte est conservé. Son activité, sa route et son FIT
courant sont remplacés par les données fusionnées.

## Suppression des sources

Les activités sources ne sont supprimées qu'après :

1. génération du FIT fusionné ;
2. validation structurelle du FIT ;
3. stockage du FIT destination ;
4. écriture de l'activité et de la route destination ;
5. vérification des postconditions destination.

Ensuite seulement les FIT, routes et documents activités sources sont supprimés.

## Limite initiale

CGWEB122 cible volontairement les activités du même jour, de même sport et de
même sous-sport, sans chevauchement temporel.

Base :

ae795b7e09085de2d1b884eee3818d3c9c09b73c
