# WEB049-HOSTING003 · WEBPERF001

Suppression des MutationObserver UI introduits par WEB047/048/049.

- aucun MutationObserver global
- appels WEB049 déterministes après navigation, rendu et ouverture détail
- ResizeObserver conservé uniquement pour recalculer les offsets sticky
- WEBAUTH001 conservé
- authDomain sport-505813.web.app conservé

Objectif : supprimer les boucles de rendu et la charge CPU anormale.
