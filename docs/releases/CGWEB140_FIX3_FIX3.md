# CGWEB140 FIX3 FIX3 · INTEGRATION_VALIDATION001

## Périmètre

Tests sur le **code réellement présent dans la branche Git** (extraction des fonctions de `fitvault.js` et du bloc de réconciliation de `index.js`). Firestore et Google Cloud Storage sont remplacés par des doublures **en mémoire uniquement**. Aucun accès au coffre réel, aucune requête à Strava.

Les scénarios couvrent : archivage SHA avant suppression, unicité du FIT opérationnel, deux activations successives, refus en cas de SHA original incohérent ou d'archive corrompue, statut d'échec de nettoyage, sélection du FIT actif, écrasement des cinq statistiques par Strava (deux durées comprises), blocage d'une réduction de points, persistance de la certification FIT et non-redemande de confirmation lorsque l'heure est alignée.

## Limite importante / blocage pour production

Le scénario simulant une erreur de suppression GCS confirme que `v121ReplaceFitFamily` retourne `ok:false` et conserve une archive vérifiée **après** mise à jour du manifeste. `v085aActivateVersion` peut malgré cela retourner normalement un patch `fit_replacement_cleanup_ok:false`, tandis que l'action API de création peut retourner `ok:true`. Cela représente un succès apparent alors que le nettoyage opérationnel est incomplet. Une correction et un test de non-régression **doivent précéder** tout déploiement en production.

Les tests ne prouvent ni une transaction atomique réelle GCS/Firestore, ni le comportement effectif de l'API Strava après un export. Le FIT réel de 89 841 Records a fait l'objet d'un audit précédent en lecture seule, distinct de ce jeu de tests.

## Règles

- Ne pas pousser ni déployer automatiquement.
- Ne pas effacer les sauvegardes locales, les objets historiques ou les journaux.
- Ne jamais déclencher d'édition réelle ou de téléchargement Strava depuis ce banc.
