# CGWEB120

Réimplémentation légère des demandes initialement visées par CGWEB119,
après rollback de CGWEB119 pour régression de performances.

## DETAIL_ROW_LIGHT001
Le détail affiche une seule copie DOM légère de la ligne de l'activité.

## DETAIL_GAP_2MM002
Les anciens offsets sticky du détail sont neutralisés par CSS.
Navigation -> ligne stats : 2 mm.

## FILTER_WIDTHS_FINAL002
- Année : 27 mm
- Matériel : 104 mm

## SORT_PROXY_FIX001
Le comparateur métier n'est pas modifié.
Le menu visible "Ordre" synchronise #sortFilter en capture AVANT le listener historique.
"Plus anciennes" -> date_asc -> start_time_ms croissant.

## HISTORICAL_LABEL_REMOVE002
Suppression visuelle de "· affectation historique".

## FILTER_BUTTONS_REMOVE002
Suppression de :
- Réinitialiser
- Actualiser la base

## TRIANGLE_LEFT_CSS_LOCK001
Triangle FIX12 conservé et verrouillé dans la colonne gauche.

## PERFORMANCE_GUARD001
CGWEB120 n'ajoute aucun MutationObserver,
aucun getComputedStyle et aucun réordonnancement massif du répertoire.

## Sécurité
Hosting uniquement.
Functions inchangées.
Firestore / Storage inchangés.

Base rollback :
96d1dbed57e1fd733ca27f2702ee1896b1515213
