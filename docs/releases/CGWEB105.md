# CGWEB105 · SAME_DAY_SAME_SPORT_JOIN001 / JOIN_CANDIDATE_DISCOVERY001 / NON_SPLIT_GUARD001 / JOIN_PREVIEW001 / JOIN_LINEAGE001

## Objet

Depuis la fiche d'une activité, proposer les autres activités :

- du même sport strict ;
- du même jour local ;
- actives ;
- non issues de WEBSPLIT ;
- non parentes d'une découpe WEBSPLIT.

Les activités analogues sont affichées avec cases à cocher.

## CHECKBOX_SELECTION001

L'activité ouverte constitue la base de la jonction.

Chaque activité candidate peut être incluse ou exclue au moyen d'une case à
cocher indépendante.

Aucune candidate n'est cochée automatiquement.

## NON_SPLIT_GUARD001

Une activité est exclue si un marqueur de découpe est détecté :

- `split_parent_activity_id`
- `split_children_ids`
- `split_status`
- `split_part`
- `split_total`
- `import_source === WEB_SPLIT`

La même garde s'applique à l'activité ouverte.

## JOIN_PREVIEW001

La prévisualisation calcule :

- nombre d'activités sélectionnées ;
- ordre chronologique ;
- distance cumulée ;
- D+ cumulé ;
- durée active cumulée ;
- amplitude entre le premier départ et la dernière fin ;
- GAP entre activités ;
- éventuels chevauchements temporels ;
- matériels rencontrés ;
- provenance FIT de chaque activité.

## JOIN_LINEAGE001

CGWEB105 prépare une lignée de jonction non destructive :

- `join_status = JOIN_PARENT`
- `join_source_activity_ids = [...]`
- `join_version = CGWEB105`

Aucune écriture n'est effectuée par CGWEB105.

L'exécution réelle de la jonction sera ajoutée après validation visuelle du
sélecteur et de la prévisualisation, afin de ne pas créer d'activité sans FIT
canonique correctement reconstruit.

## Données

Lecture seule.
Aucune activité modifiée.
Aucun FIT modifié.
Aucune route modifiée.

## Base de rollback

`152c420bbbd8473394310bb5d330b08a98fc858f`
