# CGWEB126

## LANDMARK_SEQUENCE_RANK001
Chaque occurrence d'un repère consomme un rang chronologique.

Exemple :
- Y #428 (2019 #37)
- Y #429 (2019 #38)
- Y #430 (2019 #39)

Une activité Y×3 reçoit donc trois lignes, jamais une seule ligne « ×3 ».

## SPORT_SCOPED_RANK001
Les séquences sont indépendantes :
- sport FIT 1 => RUN ;
- sport FIT 2 => BIKE ;
- autres sports => OTHER.

Ainsi Y #1 en course et Y #1 à vélo sont deux séries distinctes.

## YEARLY_LANDMARK_RANK001
Chaque passage reçoit :
- un rang global dans son couple repère/sport ;
- un rang annuel dans ce même couple repère/sport.

L'année est déterminée avec le fuseau `Europe/Paris`, cohérent avec
la datation actuellement utilisée par SPORT Web.

## MULTIPASS_SEQUENCE_LABEL001
Une ligne de texte par passage :
`Y #428 (2019 #37)`

Jamais de suffixe `×3` pour le champ de séquence.

## EDITABLE_SEQUENCE_OVERRIDE001
Chaque activité conserve :
- `landmark_sequence_generated` : valeur calculée ;
- `landmark_sequence_override` : personnalisation utilisateur éventuelle ;
- `landmark_sequence_lines` : données structurées des rangs.

Le détail d'activité affiche un champ multiligne modifiable.
« Revenir au calcul automatique » remet uniquement l'override à `null`.

Un rebuild ne détruit jamais l'override utilisateur.

## HISTORICAL_SEQUENCE_REBUILD001
Analyse toutes les activités + `activity_landmarks`, calcule les rangs,
prévisualise les mutations, puis écrit par lots de 80.

Le traitement est idempotent. En cas d'interruption, « Reprendre »
recalcule l'état Firestore et n'écrit que ce qui reste.

## INCREMENTAL_SEQUENCE_REFRESH001
Après :
- une modification manuelle de repère ;
- une réinjection GPS future ;

CGWEB126 recalcule automatiquement les séquences si un rebuild historique
a déjà été validé.

Le recalcul reste global et déterministe afin de traiter correctement
l'ajout tardif d'une ancienne activité, mais seules les activités dont
la séquence change sont réécrites.
