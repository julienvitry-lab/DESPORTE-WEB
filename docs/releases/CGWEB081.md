# CGWEB081 · FITQUICKDOWNLOAD001

## Objectif

Télécharger directement le FIT associé à une activité depuis le répertoire **Activités**, sans ouvrir le détail et sans passer par **Plus > Fichiers**.

## Interface

Chaque bandeau activité reçoit un petit pictogramme de téléchargement, placé tout à droite.

- pictogramme vert : un FIT Cloud est associé ;
- pictogramme discret : aucun FIT Cloud connu pour l'activité ;
- le clic sur le pictogramme ne déclenche pas l'ouverture du détail ;
- le reste du bandeau conserve exactement son comportement normal.

## Choix du FIT

Si plusieurs FIT sont liés à la même activité, le téléchargement rapide privilégie :

1. le FIT racine / canonique ;
2. puis la version d'indice le plus faible si le racine n'est plus disponible.

Les versions `_02`, `_03`, etc. restent accessibles individuellement dans **Plus > Fichiers**.

## Technique

- source : Coffre FIT Cloud / `activity_files` ;
- téléchargement : action `download` existante de `fitVault` ;
- cache de disponibilité : 3 secondes ;
- aucun nouveau backend ;
- aucune écriture dans `activities` ;
- aucun backfill.
