# CGWEB123 FIX2 FIX1

## EQUIPMENT_STATE_PARITY001

Une jonction exige désormais une parité stricte de l'état matériel.

Cas autorisés :

- matériel X + matériel X ;
- aucun matériel + aucun matériel.

Cas interdits :

- matériel X + matériel Y ;
- matériel X + aucun matériel ;
- aucun matériel + matériel X.

## BOTH_MISSING_ALLOWED001

Deux activités dont le matériel est absent peuvent être proposées ensemble,
sous réserve de respecter les autres critères de jonction :

- même jour ;
- même sport ;
- même sous-sport ;
- absence de lignée split ;
- autres garde-fous CGWEB122.

L'absence de matériel n'est donc pas un joker.

Elle constitue une catégorie homogène à part entière.

## MIXED_EQUIPMENT_REJECT001

Une activité au matériel connu ne peut jamais être jointe à une activité
dont le matériel est absent.

Cela vaut :

- dans l'onglet Jonctions ;
- dans la jonction directe ;
- dans les chaînes automatiques ≤ 200 m ;
- dans le moteur backend CGWEB122.

## EQUIPMENT_MILEAGE_INTEGRITY001

Cette politique protège le kilométrage des matériels.

Une activité historique dont le matériel est inconnu ne peut pas voir sa
distance réaffectée indirectement à un matériel connu via une jonction.

Une fusion avec matériel connu conserve donc uniquement des activités ayant
ce même matériel connu.

Une fusion sans matériel reste sans matériel.

## FIT

La politique SOURCE_FIT_PURGE_AFTER_VALIDATE001 ne change pas :

1. nouveau FIT construit ;
2. nouveau FIT validé ;
3. destination écrite et vérifiée ;
4. anciens FIT concernés supprimés ;
5. FIT sources supprimés physiquement ;
6. métadonnées FIT sources supprimées ;
7. routes et activités sources supprimées définitivement.
