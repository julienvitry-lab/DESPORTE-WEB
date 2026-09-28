# CGWEB121 FIX3

## GAP_SPLIT_PAUSE001

Toutes les découpes automatiques liées à une pause ou à une
inactivité sont mises en pause.

Neutralisés :

- GAP temporel > 15 minutes ;
- moving=false prolongé ;
- vitesse nulle/faible ;
- plateau de distance.

Le moteur historique reste physiquement présent.

## EQUIPMENT_SPLIT_ONLY001

Le seul motif de découpe automatique conservé est :

EQUIPMENT_CHANGED

Les changements de sport et sous-sport ne déclenchent plus
automatiquement de découpe.

La découpe manuelle reste disponible.

## Backend Strava

detectServerPauseBoundaries() retourne une liste vide lorsque :

WEBSPLIT_GAP_SPLIT_ENABLED = false

Les imports Strava ne sont donc plus découpés côté serveur pour
un GAP > 15 minutes, même SPORT Web fermé.

## NO_RETROACTIVE_MERGE001

Aucune modification historique :

- aucune fusion ;
- aucune suppression d'enfant ;
- aucune restauration de parent ;
- aucune modification d'une ancienne activité WEBSPLIT.

Seules les futures décisions de découpe sont modifiées.

Base :

acb861c2793bda4d3d60a90f433629b747d977e0
