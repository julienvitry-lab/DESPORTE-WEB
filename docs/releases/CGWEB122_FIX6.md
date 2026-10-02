# CGWEB122 FIX6

## SAME_DAY_STRICT001
Un candidat à la jonction doit avoir exactement la même date locale que l'activité ouverte.

## SAME_SPORT_STRICT001
Le sport principal ET le sous-sport doivent être identiques.

Exemple :
- Course à pied : sport 1 / sous-sport 0
- Tapis de course : sport 1 / sous-sport 21

Ces deux activités ne sont donc pas compatibles.

## SAME_EQUIPMENT_STRICT001
Le matériel doit être identique.

Priorité :
1. identifiant matériel exact lorsque les deux activités en possèdent un ;
2. sinon nom de matériel normalisé strictement identique.

Une absence de matériel ne constitue jamais une correspondance.

## JOIN_CANDIDATE_TRUTH001
Le compteur de candidats représente uniquement les autres activités respectant simultanément :

- même jour ;
- même sport/sous-sport ;
- même matériel ;
- activité active ;
- activité hors lignée WEBSPLIT.

L'activité ouverte reste la base de la jonction et n'est jamais comptée comme candidate.

## Sécurité backend
Les mêmes règles sport/sous-sport/matériel sont recontrôlées par `cg122BuildPlan`.

Une source injectée manuellement ne peut donc pas contourner les règles de compatibilité.
