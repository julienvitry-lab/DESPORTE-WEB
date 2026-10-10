# CGWEB147 · POST_EXPORT_TITLE_FINALIZE001

Les titres de FIT publiés à Strava peuvent rester au format à secondes même si la règle de titre CGWEB145 est corrigée. CGWEB146 normalise les titres en synchronisation individuelle mais ne s'exécutait pas systématiquement à la fin du premier export.

- Lors de la réconciliation du FIT exporté, lancer la normalisation CGWEB146 après la mise à jour des statistiques, sans rouvrir de téléversement.
- Sur les appels ultérieurs à `export_status` pour un verrou `RECONCILED`, vérifier à nouveau le titre, ce qui couvre le retard de propagation de Strava.
- Les erreurs sont signalées `TITLE_SYNC_PENDING`, sans prétendre que le titre a changé.
- Seul le champ Strava `name` peut changer. Aucune écriture FIT, parcours, statistique, description, activité sans lien, ni mise à jour massive.
- Conserver les titres libres grâce au garde-fou CGWEB146.

Déployer seulement `stravaBridge` sur `sport-505813` après approbation explicite.
