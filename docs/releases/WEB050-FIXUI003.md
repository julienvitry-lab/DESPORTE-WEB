# WEB050-FIXUI003

Correctif visuel robuste + statut global de connexion.

- un seul badge Auth : Connecté / Non connecté
- Connecté seulement si Google/Firebase + Firestore + Strava sont opérationnels
- vert si connecté, rouge sinon
- résumé "Tri des activités" forcé sans texte parasite
- ciblage générique des SVG du répertoire
- icône 54×54 dans un conteneur 68×68
- carte activité limitée à 92 px de haut
- authentification Google popup inchangée
- validation JavaScript avec Acorn en mode module
