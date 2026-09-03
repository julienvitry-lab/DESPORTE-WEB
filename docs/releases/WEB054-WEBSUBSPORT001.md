# WEB054 · WEBSUBSPORT001

Ajout d'un filtre `Sous-sport` dans `Activités > Tri des activités`.

Objectif : identifier précisément les activités appartenant à chaque valeur
`sub_sport` avant de finaliser la table de correspondance des matériels.

Fonctionnement :
- valeurs brutes `sub_sport` conservées ;
- `-1` affiché comme `non renseigné` ;
- compte d'activités par valeur ;
- filtre compatible avec les filtres existants ;
- lorsque nécessaire, `Charger tout` est déclenché pour ne pas limiter
  le diagnostic aux 20 premières lignes affichées ;
- aucun changement de données ni de matériel : filtre de consultation uniquement.

Aucune modification du mécanisme d'authentification.
WEB053, TDZFIX001, badge connexion, Apparence et C1/V1 exacts conservés.
