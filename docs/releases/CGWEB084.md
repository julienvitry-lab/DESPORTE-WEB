# CGWEB084

## SAFEEDIT001 — édition réversible

Les modifications existantes de la fiche activité deviennent réversibles.

Avant :
- titre / description / note ;
- matériel ;
- ressenti ;
- difficulté ;
- confidentialité ;
- repères ;

SPORT Web écrit un instantané complet dans `activity_revisions`.

Chaque instantané contient :
- activité avant modification ;
- repères avant modification ;
- motif ;
- patch envisagé ;
- horodatage.

Dans le détail d'une activité, **Historique des modifications** permet de
restaurer une version. Avant restauration, l'état actuel est lui-même
sauvegardé.

Aucun FIT source, aucun `activity_routes` et aucun fichier Cloud n'est écrasé.

## MAPTHUMB001 — miniatures cartographiques

Les listes :
- Accueil → Dernières activités ;
- Accueil → Records ;

affichent une miniature du tracé lorsque `activity_routes` existe.

La miniature est un SVG léger :
- pas de tuiles réseau ;
- chargement asynchrone ;
- cache par activité ;
- départ et arrivée matérialisés.

Le Répertoire Activités n'est pas modifié.

## PERIODZIP001 — export période

Dans **Plus → Fichiers** :
- mode Mois ;
- mode Année ;
- FIT Cloud facultatifs.

Le ZIP contient :
- `activities.csv`
- `activities.json`
- `manifest.json`
- `FIT/*.fit` pour les FIT Cloud disponibles.

Le manifest indique les activités dont le FIT n'est pas encore dans le Cloud.

Les noms FIT sont conservés exactement tels qu'ils sont dans le Coffre Cloud.
Aucun suffixe n'est ajouté par l'export.

## Invariants

- CGWEB083/header : inchangé ;
- activités historiques : aucun backfill ;
- pipeline FIT : inchangé ;
- Drive : inchangé ;
- Android : aucune dépendance nouvelle.
