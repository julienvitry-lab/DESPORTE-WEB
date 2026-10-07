# CGWEB133

## ELEVATION_AUDIT001
Audit passif du D+ et du flux d'altitude à l'ouverture d'une fiche.

## ORIGINAL_ASCENT_PRESERVE001
Le D+ montre/FIT n'est jamais remplacé automatiquement. Lors d'une correction
manuelle, sa valeur est conservée dans `ascent_m_original`.

## OBVIOUS_ANOMALY_FLAG001
Signalement limité aux anomalies manifestes : altitude absente, altitude
quasi intégralement à zéro, profil artificiellement plat, ou D+ nul alors
qu'un relief mesurable existe.

## ON_DEMAND_ELEVATION_RECALC001
Aucun recalcul automatique et aucun backfill historique. Le recalcul est lancé
uniquement par le bouton de la fiche.

Priorité :
1. altitude native montre/FIT si elle est exploitable ;
2. sinon reconstruction DEM via l'API d'altitude Open-Meteo / Copernicus GLO-90.

Le calcul applique un lissage robuste puis une hystérésis :
- seuil 2 m pour l'altitude native ;
- seuil 10 m pour le DEM.

## MANUAL_CORRECTION_APPLY001
La proposition est affichée avant toute modification. Une confirmation explicite
est requise avant d'écrire `ascent_m`.

## ORIGINAL_VALUE_RESTORE001
Toute correction CGWEB133 reste réversible par restauration de
`ascent_m_original`.

## Correctif associé
`normalizeRoute()` ne convertit plus une altitude absente (`null`) en `0 m`
via `Number(null)`.
