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

## FIX3 · VAULT_COUNTER_RECONCILE001

Tous les compteurs du Coffre local utilisent désormais une seule source
de vérité : `cgweb094cCounters()`.

Les cartes affichent :
- Originaux locaux ;
- Stockage local ;
- FIT disponibles ;
- FIT à générer ;
- Non générables.

Un dérivé sans `activity_id` exploitable est compté comme non générable et
n'est jamais assimilé à un FIT à générer.

Le message du dry-run, la ligne de synthèse et les cartes utilisent les mêmes
valeurs, ce qui supprime la divergence observée (`70` affiché alors que le
dry-run annonçait `1` FIT réellement éligible).

Aucun changement backend. Aucun FIT généré par l'installation.

## FIX4 · VAULT_COUNTER_LAYOUT001

Correction purement visuelle :

- la carte `Non générables` est déplacée à l'intérieur du même
  `.web-files-overview` que les quatre autres compteurs ;
- desktop : 5 cartes sur une ligne ;
- tablette : 3 colonnes ;
- téléphone : 2 colonnes ;
- garde runtime : si un futur patch déplace cette carte hors du grid,
  elle est automatiquement replacée.

Aucun changement de calcul, backend ou génération FIT.

## FIX5 · BATCH_ARMING_GUARD001

La génération en masse est désormais réellement verrouillée tant qu'un
dry-run explicite n'a pas été exécuté avec succès dans la session courante.

Contrat :
- le chargement/rafraîchissement silencieux calcule les compteurs mais
  n'arme jamais le batch ;
- `Analyser les FIT manquants` arme exactement la révision du plan obtenue ;
- toute nouvelle analyse silencieuse invalide cet armement ;
- une génération FIT individuelle invalide un dry-run batch antérieur ;
- `Générer en masse` possède une double garde : état DOM désactivé +
  contrôle JavaScript interne ;
- l'armement est consommé au lancement du batch et ne peut pas être réutilisé ;
- le bouton désarmé est visuellement grisé et non cliquable.

Aucun changement backend. Aucun FIT généré par l'installation.

## FIX6 · VAULT_AUTOREFRESH001

Le Coffre local s'actualise désormais automatiquement à l'entrée dans le
sous-sous-onglet, y compris après un rechargement complet de la page.

Contrat :
- détection par visibilité réelle de `webFilesSection` ;
- refresh automatique au premier affichage et à chaque retour dans le Coffre ;
- anti-boucle sur les mutations DOM ;
- `renderWebFileVault(true)` est utilisé pour reconstruire immédiatement
  la liste et les compteurs ;
- toute actualisation automatique désarme explicitement le batch ;
- `Analyser les FIT manquants` reste obligatoire avant toute génération
  en masse ;
- le bouton Actualiser manuel reste disponible.

Aucun changement backend. Aucun FIT généré par l'installation.
