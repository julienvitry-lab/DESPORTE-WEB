# CGWEB109 · DIRECTORY_FIT_TRUTH_PARITY001

Modules :

- ICON_FALSE_NEGATIVE_AUDIT001
- BULK_DOWNLOADABILITY001
- HISTORICAL_FIT_VISIBILITY001
- QUICK_LIST_LIMIT_FORENSICS001
- READ_ONLY001
- ROLLBACK_READY001

## Objectif

Comparer deux vérités différentes :

1. la disponibilité réelle du FIT dans `activity_files` + Firebase Storage,
   via le resolver CGWEB096 ;
2. la disponibilité déclarée par `FITQUICKDOWNLOAD001`, utilisée
   historiquement pour afficher ou masquer l'icône de téléchargement.

Le mécanisme V081 charge actuellement :

```js
request("list", {query: {limit: 1000}})
```

CGWEB109 recharge volontairement cette liste historique, puis compare son
résultat avec la vérité backend sur toutes les activités.

## Résultats

L'audit fournit :

- activités actives ;
- FIT réellement téléchargeables ;
- vrais FIT absents ;
- icônes positives V081 ;
- faux négatifs d'icône ;
- faux positifs ;
- historique par année ;
- exemples de faux négatifs.

## BULK_DOWNLOADABILITY001

Un endpoint en lecture seule permet également de résoudre jusqu'à 1000
activity_id par appel sans dépendre de la liste V081.

## Sécurité

Aucune activité, aucun document FIT, aucun objet Storage et aucune route
ne sont modifiés.

Base rollback : `4fce673350f9da5e967f1e0ca0841c2b53c66c23`
