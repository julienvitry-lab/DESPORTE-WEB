# CGWEB118 FIX9 FIX2

## TRIANGLE_REAL_NODE001
Le triangle n'est plus un pseudo-élément CSS.
Un SPAN réel est inséré dans le SUMMARY :
- fermé : ▸
- ouvert : ▾
- couleur blanche forcée.

## RESET_REFRESH_REMOVE001
Suppression visuelle et DOM des boutons :
- Réinitialiser
- Actualiser la base

Leur logique métier n'est pas modifiée.

## EMPTY_STATUSBAR_REMOVE001
Si la barre d'état ne contient plus d'élément utile,
elle est masquée afin de ne conserver aucun espace vide.

## Sécurité
- FIX9 conservé ;
- FIX9 FIX1 conservé ;
- FIX7 conservé ;
- aucun panneau avancé ciblé ;
- aucun MutationObserver ;
- Firestore / Storage inchangés ;
- Hosting uniquement.

Base rollback : 78533fb0f091bb91c2ac512f0e5c5d05762d11ea
