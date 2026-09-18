# CGWEB094C · LOCAL_VAULT_UI001 / MISSING_FIT_GENERATE001 / MISSING_FIT_BATCH001

- Coffre local condensé.
- Filtres FIT à générer / disponibles / insuffisants.
- Affichage 100 entrées puis "Afficher de plus".
- Génération individuelle d'un FIT canonique.
- Dry-run explicite obligatoire avant génération en masse.
- Lots client de 25, backend max 50, concurrence backend 2.
- Arrêt utilisateur après le lot en cours.
- Revalidation juste avant écriture.
- 0 activité créée.
- 0 activité modifiée.
- Aucun FIT existant remplacé.
- Génération via le moteur CGWEB088 / FITWRITER001 déjà validé.

## FIX2 · VAULT_BATCH_BAR_RESTORE001

- barre `Analyser / Générer en masse / Arrêter après le lot` replacée
  immédiatement avant `webFilesStatus` ;
- présence garantie à la fois par le HTML et par un garde runtime ;
- visibilité CSS forcée dans `webFilesSection` ;
- disposition mobile : trois boutons pleine largeur ;
- compteurs locaux renommés pour éviter la confusion :
  `Originaux locaux`, `Stockage local`, `Liens locaux`.

Aucune modification backend. Aucun FIT n'est généré par l'installation.
