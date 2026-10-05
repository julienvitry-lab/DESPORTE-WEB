# CGWEB127 FIX2

## LEGACY_JOIN_OBSERVER_SCOPE001

Plusieurs anciens moteurs de jonction surveillaient encore tout le DOM.

Les observers CGWEB122, CGWEB122 FIX1 et CGWEB123/124 sont désormais
limités à `#detailView`.

Ils ne sont donc plus réveillés par :

- le rendu du répertoire des activités ;
- les boutons FIT ;
- les changements d'onglets sans rapport ;
- les panneaux Analyse / Matériel / Plus ;
- les autres reconstructions globales du DOM.

## FULL_DOM_SCAN_REMOVE001

CGWEB122 FIX1 utilisait auparavant :

`document.querySelectorAll('*')`

à chaque tentative de localisation du panneau de jonction.

Cette recherche globale est supprimée.

Le code utilise d'abord :

`#detailView #cgweb105JoinPanel`

puis, uniquement en secours, recherche quelques titres ciblés à
l'intérieur de `#detailView`.

## ACTION_BAR_IDEMPOTENT001

Les boutons :

- Repères
- Joindre
- Ajout manuel
- Découper

ne sont plus déplacés dans le DOM lorsqu'ils se trouvent déjà au bon
emplacement.

Cela évite de créer des mutations childList artificielles capables de
réveiller les autres MutationObserver de la fiche.

## Héritage préservé

CGWEB127 et CGWEB127 FIX1 restent actifs :

- chargement Firestore à la demande ;
- CGWEB124 dans Plus > Repères avancés ;
- Jonctions dans Plus > Jonctions ;
- bridge détail CGWEB126 suspendu ;
- observer CGWEB120 FIX7 limité à #detailView et sans attributes:true.
