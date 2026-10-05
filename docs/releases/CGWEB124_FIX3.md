# CGWEB124 FIX3

## GPS_TO_ACTIVITY_BACKFILL001
Réinjecte les hits de `gps_marker_activity_index` dans `activity_landmarks`.
Workflow : Prévisualiser → contrôler → Réinjecter.

## LANDMARK_PROVENANCE001
Deux couches sont conservées : `manual_occurrences` et `gps_occurrences`.
La valeur SPORT reste : `occurrences = max(manuel, GPS)`.

## MULTIPASS_OCCURRENCE_SYNC001
Un hit GPS à 2 passages devient `gps_occurrences: 2` dans l'activité.

## IDEMPOTENT_LANDMARK_UPSERT001
Une seconde prévisualisation après succès doit produire 0 mutation.
Après interruption, relancer est sûr : les lignes déjà conformes sont ignorées.

## STALE_GPS_LINK_CLEANUP001
Détection disparue : lien GPS pur supprimé ; lien mixte ramené à sa couche manuelle.
Les liens manuels/legacy sans provenance GPS ne sont jamais supprimés.

## INCREMENTAL_ACTIVITY_REINJECT001
Les nouvelles activités indexées sont automatiquement réinjectées dans `activity_landmarks`.

Chaque mutation publie aussi un événement `changes` pour l'interop Web/Android.
Aucune Firebase Function n'est modifiée.
