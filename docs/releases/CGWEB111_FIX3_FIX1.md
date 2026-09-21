# CGWEB111 FIX3 FIX1

Modules :

- OBSERVER_SELF_LOOP_GUARD001
- IDEMPOTENT_REHOME001
- BOTTOM_STACK_STABILITY001
- HOSTING_ONLY001
- ROLLBACK_READY001

## Cause corrigée

CGWEB111 FIX3 surveillait `#detailView` avec un `MutationObserver`.

À chaque passage, `cgweb111Fix3Rehome()` exécutait `appendChild()` sur les menus
même lorsqu'ils étaient déjà dans le bon conteneur. Ce déplacement DOM pouvait
déclencher à nouveau l'observer et entretenir une boucle de microtâches.

## Correction

1. Un menu n'est déplacé que si son parent ou sa position est incorrect.
2. Le `MutationObserver` est suspendu pendant les déplacements effectués par
   CGWEB111 lui-même, puis réarmé immédiatement.
3. L'ordre et les fonctions des sept menus de FIX3 sont conservés.
4. Aucun changement de données, FIT, Storage, route ou backend.

Base rollback : `92a6775fe48bf2304651951c8262216d17916f61`
