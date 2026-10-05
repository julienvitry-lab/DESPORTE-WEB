# CGWEB127 FIX1

## DETAIL_OBSERVER_SELF_LOOP_GUARD001

CGWEB120 FIX7 modifie volontairement plusieurs propriétés DOM du détail :

- `hidden`
- `aria-hidden`
- `style`
- `dataset`

Son ancien `MutationObserver` surveillait simultanément les attributs de
l'intégralité de `document.body`.

Cette configuration pouvait créer une chaîne auto-entretenue :

mutation attributaire
→ MutationObserver
→ `cgweb120Fix7Apply()`
→ nouvelle mutation attributaire
→ MutationObserver
→ etc.

Le nouvel observer est déconnecté pendant l'exécution de
`cgweb120Fix7Apply()` puis réarmé après celle-ci.

Les appels successifs sont également fusionnés dans un seul
`requestAnimationFrame`.

## DETAIL_OBSERVER_SCOPE001

La surveillance n'est plus installée sur `document.body`.

Elle est limitée à :

`#detailView`

Options conservées :

- `childList: true`
- `subtree: true`

Option supprimée :

- `attributes: true`

Aucune donnée SPORT, Firestore, FIT, repère ou jonction n'est modifiée.

CGWEB127 reste intégralement conservé :

- CGWEB124 uniquement dans Plus > Repères avancés ;
- Jonctions dans Plus > Jonctions ;
- chargement Firestore à la demande ;
- bridge détail CGWEB126 toujours suspendu.
