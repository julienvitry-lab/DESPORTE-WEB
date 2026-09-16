# CGWEB082 · FITAVAILABILITY001

## Objectif

Rendre immédiatement visible, dans **Activités**, si le FIT associé peut être téléchargé.

## Règle visuelle

- FIT Cloud disponible : pictogramme de téléchargement normal et cliquable ;
- FIT non disponible : même pictogramme barré d'**une seule barre diagonale** ;
- erreur temporaire d'accès au FIT : pictogramme également barré ;
- recherche en cours : pictogramme non barré ;
- téléchargement en cours : pictogramme non barré.

Le pictogramme barré n'est pas une croix : une seule diagonale est dessinée.

## Cas historique

Les activités historiques dont le FIT n'a pas encore été transféré dans le Coffre FIT Cloud apparaissent automatiquement avec le pictogramme barré.

## Interaction

- un FIT disponible se télécharge comme avec CGWEB081 ;
- un pictogramme barré est non actif ;
- le clic sur le pictogramme ne doit jamais ouvrir le détail de l'activité.

## Nommage

CGWEB082 ne renomme aucun FIT.
La règle canonique reste :

`AAAA_MM_JJ_HH_MM_SS_<code>.fit`

Aucun suffixe n'est ajouté par FITAVAILABILITY001.

## Données

- aucune écriture dans `activities` ;
- aucun backfill ;
- aucun nouveau backend ;
- CGWEB080 et CGWEB081 conservés.
