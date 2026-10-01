# CGWEB121 FIX8 FIX7

Modules :

- ABSOLUTE_TARGET_TIME001
- ACTIVE_FIT_DIRECT_DOWNLOAD001
- TRIPLE_POSTCONDITION001

## Diagnostic après FIX6

Deux défauts structurels restaient présents.

### 1. Heure cible

Le navigateur transmettait un décalage relatif alors que le backend
reconstruit le FIT depuis l'activité réellement lue dans Firestore.

FIX7 transmet désormais `target_start_time_ms`, c'est-à-dire l'heure cible
absolue saisie par l'utilisateur. Le backend calcule lui-même le delta depuis
l'heure Firestore qu'il utilise pour construire le nouveau FIT.

### 2. Téléchargement du répertoire

Le téléchargement direct historique donnait priorité aux rôles :

ORIGINAL > CANONICAL > EDITED.

Une activité pouvait donc posséder un FIT édité actif tout en continuant à
télécharger son FIT original.

FIX7 donne désormais priorité, pour le téléchargement direct :

1. au SHA `fit_active_sha256` de l'activité ;
2. à `is_active_version=true` ;
3. seulement ensuite à la hiérarchie historique des rôles.

### 3. Postconditions

SPORT Web ne doit plus annoncer un succès si le backend ne confirme pas
la même heure cible pour :

- le FIT nouvellement actif ;
- l'activité persistée.

Base :

0578c6d24b056f58b996cbe13770ad92c86ee275
