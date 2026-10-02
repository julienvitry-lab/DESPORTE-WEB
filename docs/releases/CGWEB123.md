# CGWEB123

## BULK_COMMUTE_JOIN001
Détection automatique de chaînes d'activités susceptibles d'être des trajets morcelés.

## SAME_DAY_SAME_EQUIPMENT001
Une chaîne exige simultanément :
- même date locale Europe/Paris ;
- même sport ;
- même sous-sport ;
- même matériel exact ;
- activités actives ;
- activités hors lignées WEBSPLIT.

## ENDPOINT_200M_CHAIN001
Les activités sont ordonnées chronologiquement.

A peut être reliée à B uniquement si la distance géographique entre :
- le dernier point GPS valide de A ;
- le premier point GPS valide de B

est inférieure ou égale à 200 mètres.

La règle s'applique successivement à A → B → C → D.

## JOIN_PREVIEW001
Aucune fusion n'est appliquée pendant la détection.

Chaque chaîne :
1. est détectée ;
2. est revalidée par le dry-run FIT_JOIN_REPLACE001 de CGWEB122 ;
3. est affichée avec une case cochable ;
4. n'est exécutée qu'après confirmation utilisateur.

L'exécution réutilise FIT_JOIN_REPLACE001 :
- FIT destination construit et validé d'abord ;
- sources supprimées uniquement après validation.
