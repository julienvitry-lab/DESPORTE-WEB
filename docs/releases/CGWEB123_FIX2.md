# CGWEB123 FIX2

## SPLIT_LINEAGE_DETECTION002

Les activités issues d'une découpe sont exclues de Jonctions.

Détection par :

- `split_parent_activity_id`
- `split_parent_id`
- `split_children_ids`
- `split_status`
- `split_part`
- `split_total`
- `import_source`
- `import_profile`
- `split_profile`
- `route_format`

## LEGACY_SPLIT_EXCLUDE001

Les anciennes découpes dépourvues de filiation structurée sont également
détectées par leur suffixe historique :

- `· 1/2`
- `· 2/2`
- etc.

Le nombre total est volontairement limité à 20 pour éviter les détections
trop larges.

## ANALOG_GROUP_SANITIZE001

Un groupe Jonctions doit respecter :

- même jour local ;
- même sport ;
- même sous-sport ;
- aucun membre de lignée split ;
- au moins deux activités.

## MISSING_EQUIPMENT_ALLOWED001

Le matériel n'est plus obligatoire sur les activités historiques.

Politique :

- matériel X + matériel X : compatible ;
- matériel X + matériel Y : incompatible ;
- matériel X + matériel absent : compatible ;
- matériel absent + matériel absent : compatible.

Le contrôle est pair-à-pair afin qu'une activité sans matériel ne puisse
jamais servir de pont entre deux matériels connus différents.

Lorsque plusieurs matériels connus sont présents le même jour et qu'une
activité sans matériel existe, celle-ci peut être proposée dans plusieurs
groupes possibles. Aucune affectation arbitraire de matériel n'est créée.

## SOURCE_FIT_PURGE_AFTER_VALIDATE001

La fusion conserve le pipeline sécurisé CGWEB122 :

1. construction du nouveau FIT ;
2. validation d'intégrité du nouveau FIT ;
3. écriture et vérification de la destination ;
4. suppression physique des anciens FIT de la destination ;
5. suppression physique de chaque FIT source dans Storage ;
6. suppression des métadonnées FIT sources ;
7. suppression définitive des routes sources ;
8. suppression définitive des activités sources.

Aucune source n'est supprimée avant validation du nouveau FIT.
