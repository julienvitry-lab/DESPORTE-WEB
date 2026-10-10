# CGWEB144 · STRAVA_TITLE_MINUTE001 / ANALYSIS_STATISTICS001

- Le titre d'activite Strava utilise `AAAA_MM_DD_HH_MM_SPORT`, a partir du timestamp de depart de l'activite en heure de Paris, sans secondes.
- Les FIT, leur nom de fichier et leurs timestamps internes restent inchanges.
- Nouveau sous-onglet `Analyse > Statistiques` : periode ISO/semaine, mois, annee, filtre tous les sports/course/velo.
- Comparaison des totaux independants Firestore et Strava, serveur authentifie en lecture.
- Les 5 statistiques sont distance, mouvement, ecoule, D+, calories ; comptage des activites fourni aussi.
- Affichage `—` pour toute metrique incomplete, plutot que zero ou egalite inventee.
- Strava n'inclut pas necessairement les calories dans la liste d'activites : pour <=15 activites, lecture detaillee quand necessaire.
- Les titres d'activites Strava deja publies ne sont PAS renommes automatiquement ; la passerelle texte existante offre un rattrapage separe.
- Nouvelles lectures Strava peuvent consommer les limites de l'API ; aucune ecriture d'activite Strava ou FIT.
- Publication backend stravaBridge + Firebase Hosting ; autres fonctions inchangees.
