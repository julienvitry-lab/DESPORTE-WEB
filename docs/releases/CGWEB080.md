# CGWEB080 · FITDRIVE001

## Objectif

Ajouter une deuxième copie Google Drive au **Coffre FIT Cloud**, sans remplacer Firebase Storage.

## Architecture

- Firebase Storage reste le coffre opérationnel des FIT ;
- Google Drive reçoit une copie de sauvegarde ;
- l'intégration Google Drive existante `WEBDRIVE001` est réutilisée ;
- scope conservé : `drive.file` ;
- aucun jeton Drive n'est stocké durablement par FITDRIVE001.

## Organisation Drive

Les nouveaux FIT Cloud sont rangés sous :

`SPORT/FIT/AAAA/MM/`

Le SHA-256 est enregistré dans les `appProperties` Google Drive et sert de clé de déduplication.

## Automatique

Pour les **nouveaux imports Strava**, les **nouveaux imports FIT** et les **nouvelles versions CGWEB078** :

- si Google Drive est déjà connecté dans la session Web, la copie Drive est créée automatiquement ;
- si Drive n'est pas connecté, le pipeline FIT Cloud continue normalement et aucune popup Google n'est forcée automatiquement ;
- l'utilisateur peut ensuite déclencher explicitement la sauvegarde des FIT Cloud manquants.

## Historique

Aucun backfill Drive n'est lancé pendant l'installation ou au chargement de la page.
Le bouton `Sauvegarder Drive (N)` constitue l'action explicite pour sauvegarder les FIT Cloud déjà présents.

## Métadonnées

Le manifeste `activity_files/{sha256}` reçoit uniquement des champs `drive_*` :

- `drive_file_id` ;
- `drive_file_name` ;
- `drive_folder_id` ;
- `drive_path` ;
- `drive_web_view_link` ;
- `drive_sha256` ;
- `drive_backup_state` ;
- `drive_backup_version` ;
- `drive_uploaded_at_ms`.

Aucune activité Firestore n'est créée, modifiée ou supprimée par FITDRIVE001.
