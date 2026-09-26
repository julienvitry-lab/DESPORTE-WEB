# CGWEB119

## DETAIL_ROW_PARITY001
Le détail d'une activité reprend une copie visuelle exacte de la ligne correspondante
du répertoire Activités. L'ancien bandeau de métriques est masqué.

## DETAIL_GAP_2MM001
Toutes les anciennes positions sticky du bandeau navigation / résumé sont neutralisées.
Espacement Navigation -> ligne stats : 2 mm.

## FILTER_WIDTHS_FINAL001
- Année : 22 mm -> 27 mm (+5 mm)
- Matériel : 84 mm -> 104 mm (+20 mm)

## DIRECTORY_ORDER_VISUAL_GUARD001
Le comparateur métier existant est conservé :
date_asc utilise déjà start_time_ms en ordre croissant.
CGWEB119 synchronise le menu Ordre visible avec #sortFilter et impose ensuite au DOM
l'ordre exact de filteredActivities.

## HISTORICAL_LABEL_REMOVE001
La valeur du matériel n'est pas modifiée.
Seule la mention visuelle "· affectation historique" est supprimée.

## FILTER_BUTTONS_REMOVE_FINAL001
Suppression ciblée dans le bandeau de tri :
- Réinitialiser
- Actualiser la base

## TRIANGLE_LEFT_LOCK001
Le vrai triangle FIX12 reste physiquement dans la colonne gauche,
séparé des champs par 2 mm.

## Sécurité
Hosting uniquement.
Functions inchangées.
Firestore / Storage inchangés.

Base rollback : 7ecec56be92f7c848699dc8effb2ea61c3199092
