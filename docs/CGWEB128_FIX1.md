# CGWEB128 FIX1

## VISIBLE_SEQUENCE_SECTION001

Le bloc `Suivi des repères` devient une section autonome visible de la
fiche activité.

Il n'est plus créé à côté de `#detailPersonalGrid`, car ce dernier
appartient à l'ancienne section :

`.detail-edit-panel.hidden`

qui est volontairement masquée.

## HIDDEN_PARENT_ESCAPE001

Le panneau vérifie ses ancêtres après son placement.

S'il se retrouve sous un conteneur portant :

- `hidden`
- la classe `.hidden`
- `aria-hidden="true"`

il est immédiatement déplacé directement dans `#detailView`.

## DETAIL_PANEL_STABLE_ANCHOR001

Ancrage prioritaire :

`Historique des modifications`

Le code tient compte des wrappers historiques CGWEB111.

Fallback :

1. avant `.detail-bottom-nav`
2. fin de `#detailView`

## Préservation de CGWEB128

Aucune modification du moteur de classement.

Sont conservés :

- `DETAIL_SEQUENCE_ASYNC001`
- `SEQUENCE_PANEL_IDEMPOTENT001`
- `OBSERVER_SAFE_INTEGRATION001`
- aucun MutationObserver sur le détail pour CGWEB126
- le chargement asynchrone
- les garde-fous de performance CGWEB127 FIX1/FIX2.
