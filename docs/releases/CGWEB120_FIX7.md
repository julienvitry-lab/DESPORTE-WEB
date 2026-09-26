# CGWEB120 FIX7

## DETAIL_TOP_GAP_2MM001
Après suppression du bandeau historique par FIX6, un espace
résiduel restait réservé dans le haut du détail.

FIX7 force désormais l'écart entre le bandeau d'actions
du détail et le bandeau texte à 2 mm, de façon stable.

## DETAIL_TOOLBAR_TOP_PAD_1MM001
Le bandeau supérieur du détail reçoit 1 mm d'espace entre
son bord haut et les boutons.

## HEADER_LABEL_SHIFT_5MM001
Les libellés suivants du bandeau texte sont décalés de 5 mm
vers la droite :

- Date
- Heure
- Distance
- D+
- Temps
- Repères
- Charge

Le libellé Matériel n'est pas déplacé.

## NAVIGATION_STABILITY001
Un rappel JS + MutationObserver réapplique les règles
pendant l'affichage et les changements de navigation,
afin d'ancrer durablement le rendu.

Base :
f002a5431d7dab96c00b9edc0bedc961cbe945c7
