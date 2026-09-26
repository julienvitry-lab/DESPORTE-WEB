# CGWEB120 FIX1

## FILTER_SHIFT_05MM001
Tous les champs du bandeau de tri sauf Année sont déplacés de 0,5 mm vers la droite.
La translation est identique pour chaque champ, et non cumulative.

## DETAIL_EXACT_ROW_MIRROR001
La ligne du détail reprend la vraie structure DOM de la carte du répertoire.
Les règles CSS #activityList déjà présentes sont recopiées une seule fois avec
une portée limitée au détail.
Aucun getComputedStyle.

## OLD_DETAIL_STATS_REMOVE001
La detail-summary-row contenant #detailHeroMetrics est identifiée explicitement
et supprimée visuellement. Plus de doublon.

## DETAIL_GAP_2MM003
La pile sticky historique est neutralisée avec display:contents.
Navigation -> ligne de stats : 2 mm.

## EQUIPMENT_STATUS_ACTIONS001
WEB018 conserve equipmentStatusInput et les valeurs historiques :
ACTIVE / STORED / RETIRED.

Trois boutons sont disponibles dans Modifier :
- Actif
- Réserve
- Archiver

Ils pilotent le select existant et déclenchent son événement change.
Le moteur WEB009 existant effectue donc l'enregistrement immédiat.

## PERFORMANCE_GUARD002
- aucun MutationObserver ajouté ;
- aucun getComputedStyle ;
- aucune boucle sur toutes les cartes à chaque mutation ;
- une seule carte d'activité clonée.

## Sécurité
Functions inchangées.
Firestore / Storage : aucune nouvelle logique d'écriture.
Le changement de statut réutilise l'écriture WEB009 existante.
Hosting uniquement.

Base rollback :
bdc20bc0f6808c0cfe952dce409068db7caccd8b
