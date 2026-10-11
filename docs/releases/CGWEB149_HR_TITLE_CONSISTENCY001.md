# CGWEB149 · SYNTHETIC_HR_CONSISTENCY001 / STRAVA_MINUTE_FILENAME_PARITY001

## Objectif

1. Sur l'édition **explicitement** déclenchée avec `heart_rate_mode = SIMULATED`, remplacer la FC des `Record` en conservant les autres données. L'effort synthétique varie selon les vitesses, gradients altimétriques (lorsque présents), échauffement et dérive, et atteint la moyenne et le maximum requis. Les champs `Session.avg_heart_rate` (16), `Session.max_heart_rate` (17), `Lap.avg_heart_rate` (15), `Lap.max_heart_rate` (16) sont mis en cohérence, y compris s'ils sont absents dans les définitions FIT initiales. Vérification CRC, points, champs Record, résumé FIT après décodage SDK.
2. La synchronisation Strava ne doit plus réintroduire les secondes : le `name` envoyé et le nom du fichier dans le multipart (`AAAA_MM_DD_HH_MM_CODE.fit`) sont identiques, même si la version opérationnelle archivée garde son nom original à secondes.

## Garanties / périmètre

- Aucun ancien FIT n'est écrasé par l'installation ; seul l'éditeur FIT **lorsqu'il est activé explicitement** produit de nouveaux octets.
- Pour une FC existante non modifiée par l'éditeur, le chemin `SOURCE` est inchangé : aucune création ni correction automatique.
- Les FIT source, la correspondance SHA, les  Record GPS/vitesse/altitude/horodatage/champs développeurs, le nombre de Records, les parcours, distances, temps et dénivelés restent protégés par les garde-fous existants.
- Les cas risqués (format non supporté, horodatage ou résumé de Lap ambigu, incohérence de l'export FIT, moyenne non atteignable) sont bloqués sans activation.
- Le schéma des sorties de `FITEDITOR001` pour l'édition est conservé ; pas de mutation automatique de données existantes.
- Les titres personnalisés de Strava ne sont pas forcés lors de la régularisation progressive des anciennes activités ; mécanisme CGWEB146/147 inchangé.
- Les activités Strava déjà publiées ne verront pas leurs courbes FC corrigées par un simple changement de métadonnées. Une opération de remplacement distincte nécessiterait un consentement spécifique.
- Aucune publication Hosting, aucun reimport massif, aucune suppression d'activités Strava.

## Caution

Les valeurs de FC générées sont des **estimations synthétiques**, non des mesures physiologiques. Après un premier export neuf, vérifier la moyenne et la courbe réellement interprétées par Strava avant tout import massif.

## Déploiement

Termux sur `sport-505813`, depuis la branche `cgweb148-canonical-minute-title-20261010`.
Une branche isolée `cgweb149-hr-summary-title-minute-20261010` est créée. Après tous les tests, publication ciblée et confirmée (`DEPLOYER`) des fonctions `fitVault` et `stravaBridge`.
