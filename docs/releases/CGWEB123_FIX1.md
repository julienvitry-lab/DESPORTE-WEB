# CGWEB123 FIX1

## JOIN_WORKSPACE_TAB001

Nouvel onglet principal :

Accueil | Activités | Jonctions | Analyse | Matériel | Plus

Le chantier des jonctions n'est plus affiché sous le répertoire Activités.

## ANALOG_ONLY_DIRECTORY001

L'onglet Jonctions n'affiche que les groupes comportant au moins deux
activités analogues.

Critères stricts :

- même jour local Europe/Paris ;
- même sport ;
- même sous-sport ;
- même matériel exact.

Une activité isolée n'apparaît pas dans le workspace.

Les lignées WEBSPLIT restent exclues conformément aux garde-fous existants
du moteur CGWEB122.

## SHARED_ACTIVITY_TRUTH001

Aucune collection d'activités propre à Jonctions n'est créée.

Jonctions utilise directement :

sport_users/{uid}/activities

Les opérations de fusion passent exclusivement par :

CGWEB122 / FIT_JOIN_REPLACE001

Il n'existe donc aucun traitement différencié entre Activités et Jonctions.

Une activité fusionnée dans Jonctions est la même activité que celle visible
dans le répertoire principal.

## LIVE_JOIN_RECONCILE001

Après une fusion :

1. le moteur CGWEB122 valide et applique la fusion ;
2. SPORT Web recharge ses activités normales ;
3. le répertoire Activités est recalculé ;
4. le workspace Jonctions est recalculé ;
5. un groupe devenu isolé disparaît automatiquement.

Les changements d'activités reçus par l'écoute temps réel existante déclenchent
également un recalcul du workspace lorsqu'il est ouvert.

## Chaînes automatiques

Le module CGWEB123 initial :

BULK_COMMUTE_JOIN001 / ENDPOINT_200M_CHAIN001 / JOIN_PREVIEW001

est déplacé dans le nouvel onglet Jonctions, sous le répertoire des groupes
analogues. Il n'est ni copié ni maintenu sous Activités.
