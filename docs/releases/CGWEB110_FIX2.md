# CGWEB110 FIX2 · IMMEDIATE_ICON_TRUTH001

Modules :

- IMMEDIATE_ICON_TRUTH001
- BULK_TRUTH_VISIBILITY001
- CGWEB097_FALLBACK001
- DOWNLOADABLE_ICON_PRIORITY001
- HOSTING_ONLY001
- ROLLBACK_READY001

## Symptôme

Après CGWEB110 FIX1, les FIT historiques sont bien résolus par
BULK_DOWNLOADABILITY001 mais leurs icônes peuvent apparaître avec retard.

Cause : CGWEB099 FIX6 continuait à commander la visibilité uniquement depuis
`cgweb097FitOrigin` (ORIGINAL/CANONICAL). CGWEB097 étant asynchrone, il pouvait
retarder visuellement une vérité déjà connue par CGWEB110.

## Règle FIX2

```
cgweb110Truth = AVAILABLE
        -> icône visible immédiatement

cgweb110Truth = ABSENT
        -> icône masquée immédiatement

cgweb110Truth inconnu
        -> fallback CGWEB097 ORIGINAL/CANONICAL
```

CGWEB097 respecte aussi cette priorité pour `disabled` et `aria-disabled`,
afin d'éviter une icône visible mais momentanément non cliquable.

Aucune activité, aucun FIT, aucun objet Storage, aucune route et aucune
Function backend ne sont modifiés.

Base rollback : `5aa86ffc7eb52a75b114cbf5e83b49b5fb33324e`
