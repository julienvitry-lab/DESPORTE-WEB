# CGWEB123 FIX2 FIX2

## FAST_JOIN_PREVIEW001

La prévisualisation d'une jonction ne construit plus le FIT final.

Elle utilise seulement les métadonnées nécessaires aux garde-fous.

## METADATA_ONLY_PLAN001

Le plan utilise :

- identifiant activité ;
- date / heure ;
- durée ;
- distance ;
- D+ ;
- fréquence cardiaque de synthèse du plan ;
- sport ;
- sous-sport ;
- matériel ;
- état de filiation split ;
- SHA FIT actif pour le plan_token.

## NO_ROUTE_ON_PREVIEW001

`join_replace_plan` ne lit plus `activity_routes`.

Les traces complètes ne sont chargées que pendant `join_replace`,
c'est-à-dire après validation explicite de la prévisualisation par
l'utilisateur.

## JOIN_REQUEST_TIMEOUT001

Le PLAN, qui est strictement non destructif, possède un timeout navigateur
de 20 secondes.

En cas de timeout :

- la requête de prévisualisation est interrompue ;
- aucune activité n'est modifiée ;
- aucun FIT n'est créé ;
- aucun FIT n'est supprimé.

L'EXECUTION destructive ne possède volontairement pas d'AbortController
côté navigateur. Une opération qui a commencé à produire puis valider le
nouveau FIT ne doit pas devenir ambiguë parce que le navigateur décide
localement d'abandonner la requête.

## Sécurité conservée

SOURCE_FIT_PURGE_AFTER_VALIDATE001 reste inchangé :

1. lecture des routes pendant EXECUTE ;
2. construction du nouveau FIT ;
3. validation du nouveau FIT ;
4. écriture / vérification destination ;
5. suppression physique FIT sources ;
6. suppression métadonnées FIT sources ;
7. suppression routes / activités sources.
