# CGWEB089 · FILES_REORGANIZE001 / DIRECTORY_CLEANUP001

## Objectif

Réduire fortement la longueur verticale de `Plus > Fichiers` et supprimer les
copies du Répertoire des activités présentes hors de `Activités`.

## FILES_REORGANIZE001

`Plus > Fichiers` dispose désormais de sous-sous-onglets.

Fonctions reconnues :
- Coffre local ;
- Audit FIT ;
- Rattrapage FIT ;
- Exports ;
- FIT Cloud ;
- Google Drive.

Toute autre section Fichiers déjà présente obtient automatiquement son propre
sous-sous-onglet au lieu d'être empilée verticalement.

Les noeuds DOM existants sont déplacés, pas recréés : IDs, listeners et états
existants restent donc disponibles.

## DIRECTORY_CLEANUP001

Le seul Répertoire des activités autorisé est celui de l'onglet `Activités`.

Le nettoyage conserve `#activityDirectorySection` hors de `Plus > Fichiers` et
son unique `#activityList`, retire d'éventuelles copies portant les mêmes IDs,
et retire dans `Plus > Fichiers` les blocs explicitement intitulés
`Répertoire des activités`.

Le Coffre local, le Coffre FIT Cloud et les listes de fichiers ne sont pas
confondus avec le Répertoire des activités.

Aucune donnée Firestore, aucun FIT et aucune activité ne sont modifiés.

## Invariants

- WEB070 `DIRECTORY_PAGING001` reste actif dans Activités ;
- CGWEB087 Audit FIT conservé ;
- CGWEB088 Rattrapage / diagnostic conservé ;
- CGWEB084 / CGWEB085 Export conservé ;
- WEB074 FIT Cloud conservé ;
- Google Drive conservé ;
- aucune Cloud Function modifiée ;
- déploiement Hosting uniquement.
