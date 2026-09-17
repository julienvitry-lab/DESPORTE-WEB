# CGWEB088 · FITRECOVERY001 / FITBACKFILL001

- Dry-run avant toute écriture.
- Les activités ayant déjà un FIT sont ignorées.
- Lots de 10 / 25 / 50.
- `activity_routes` est utilisé si >=2 points GPS.
- Sinon, un FIT canonique de synthèse est produit sans inventer de GPS.
- Chaque FIT est généré par FITWRITER001 puis relu/validé.
- Structure, date, sport, sous-sport, durée, distance, D+ et FC sont contrôlés.
- Aucun document `activities` n'est modifié.
- Aucun FIT lié existant n'est remplacé.
- Un conflit SHA avec une autre activité est refusé.
- Les fichiers reconstruits sont marqués `WEB_FITRECOVERY / BACKFILL_CANONICAL`.
- `lossless_source_reconstruction=false` : ils ne sont jamais présentés comme originaux.


## FIX1 · FITSIGNATURE001

Les FIT canoniques générés par SPORT Web reçoivent désormais une signature
déterministe dérivée de l'identifiant de l'activité.

Propriétés :
- même activité -> même signature d'identité ;
- deux activités différentes -> signature différente ;
- la signature complète SHA-256 est conservée dans `activity_files` ;
- une partie de la signature alimente `FILE_ID.serialNumber` et
  `DEVICE_INFO.serialNumber` ;
- aucune date, durée, distance, trace GPS, altitude, D+ ou FC n'est modifiée ;
- les FIT originaux importés manuellement ne sont jamais réécrits ;
- les FIT déjà présents dans le coffre ne sont pas modifiés ;
- CGWEB088 FITBACKFILL001 bénéficie de la signature pour tous les nouveaux lots ;
- les futurs FIT canoniques créés par le pipeline Strava en bénéficient aussi.

La signature sert d'identité technique et prépare un futur rattachement robuste
d'un FIT à son activité sans dépendre uniquement du nom du fichier ou de la date.


## FIX2 · FITBACKFILL_AUTO001

Le rattrapage FIT peut maintenant être exécuté automatiquement depuis
`Plus > Fichiers > Rattrapage des fichiers FIT`.

Fonctionnement :
- un bouton `Tout rattraper automatiquement` lance la migration ;
- le navigateur enchaîne des appels `recovery_batch` de 50 fichiers maximum ;
- chaque lot est terminé et vérifié avant de lancer le suivant ;
- le dry-run `recovery_plan` est relu après chaque lot ;
- une absence de progression déclenche la protection anti-boucle ;
- la première erreur arrête immédiatement la séquence ;
- le bouton `Arrêter après le lot en cours` permet un arrêt propre ;
- une interruption ou un rechargement de page n'annule rien :
  le traitement peut être repris à partir des FIT encore manquants ;
- une barre de progression indique l'avancement de la session ;
- un journal conserve les derniers lots traités ;
- aucune activité n'est modifiée ;
- aucun FIT existant n'est remplacé ;
- FITSIGNATURE001 reste appliqué à tous les nouveaux FIT produits.

Le traitement automatique est piloté côté navigateur afin d'éviter une
Cloud Function monolithique très longue et de conserver un point de contrôle
entre chaque lot de 50.


## FIX3 · FITBACKFILL_ERROR_DIAGNOSTIC001

Ajout d'un diagnostic **strictement sans écriture** pour les FIT qui ne passent
pas FITBACKFILL001.

Le bouton `Diagnostiquer les prochains 50` :
- prend les 50 prochaines activités qui n'ont toujours pas de FIT ;
- reconstruit chaque FIT en mémoire avec FITWRITER001 + FITSIGNATURE001 ;
- exécute le contrôle d'intégrité Garmin ;
- relit le FIT avec `decodeCanonicalFitSummary` ;
- exécute les comparaisons de FITRECOVERY001 ;
- contrôle les conflits SHA-256 avec une autre activité ;
- ne sauvegarde aucun objet Storage ;
- n'écrit aucun document Firestore ;
- ne modifie aucune activité ;
- ne crée aucun FIT.

Pour chaque échec, l'interface affiche :
- `activity_id` ;
- `status` backend ;
- mode `ROUTE_PREVIEW` ou `SUMMARY_ONLY` ;
- message d'erreur éventuel ;
- SHA-256 ;
- signature FITSIGNATURE001 et serial FIT ;
- intégrité et structure ;
- métriques précises en échec ;
- résumé du FIT réellement décodé ;
- identifiant de l'autre activité en cas de conflit SHA.

Le diagnostic peut être copié directement dans le presse-papiers.
