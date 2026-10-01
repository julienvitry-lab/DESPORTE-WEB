# CGWEB121 FIX8 FIX3

Modules :

- FIT_ONLY_EDITOR001
- SOURCE_TIME_AUTHORITY001
- NO_ACTIVITY_ONLY_EDIT001

## Principe

La rubrique `Modifier le fichier FIT` ne propose plus de modification de
l'heure limitée à SPORT Web.

Toute validation dans cette rubrique doit désormais aboutir à un vrai FIT :

1. FIT lié direct : nouvelle version FIT ;
2. ancien FIT lié retrouvé dans le coffre complet : nouvelle version FIT ;
3. FIT non lié unique récupéré : nouvelle version FIT ;
4. aucun FIT mais activité reconstructible : création du FIT parent puis
   nouvelle version si un décalage est nécessaire ;
5. données insuffisantes : aucune fausse modification SPORT Web n'est proposée.

## SOURCE_TIME_AUTHORITY001

Le décalage horaire est calculé par rapport à l'heure du FIT source réel,
et non plus uniquement par rapport à `activity.start_time_ms`.

Ceci répare notamment les activités qui avaient auparavant été corrigées via
`Modifier SPORT Web seulement` : le FIT peut encore recevoir le décalage
correct même si l'heure affichée dans SPORT Web a déjà changé.

## Synchronisation

Après création de la version FIT :

- la version devient ACTIVE ;
- `start_time_ms` de l'activité est aligné sur la cible ;
- l'ancienne version FIT est conservée ;
- le téléchargement rapide est invalidé puis recalculé.

## Interface

Le bouton `Modifier SPORT Web seulement` est supprimé de l'éditeur FIT.

Le bouton principal devient selon le cas :

- `Modifier réellement le FIT` ;
- `Créer puis modifier le FIT` ;
- ou un état bloqué explicite si aucun FIT fiable ne peut être produit.

Base :

89c03dccc8b31d37557a50230704f1ed471cf9d1
