# CGWEB099 FIX6 · DOWNLOAD_STATE_TRUTH_REWIRE001 / UNAVAILABLE_ICON_REMOVE001 / DOWNLOAD_ABSOLUTE_RIGHT001 / LEGACY_FLEX_LAYOUT_ROLLBACK001

## Diagnostic

Le contrôle historique du Répertoire est un `span.web081-fit-quick`, pas un
`button` ni un `a`.

FIX5 recherchait seulement :

`row.querySelectorAll("button,a")`

Le pictogramme principal échappait donc à la logique FIX5.

En parallèle, le projet possède déjà une source de vérité fiable :
`CGWEB097 DOWNLOAD_STATE_TRUTH001`.

`cgweb097ApplyState()` reçoit un état contenant `downloadable` et `role`.
Les rôles réellement téléchargeables sont `ORIGINAL` et `CANONICAL`.
`ABSENT` correspond à une activité sans FIT résolvable.

## DOWNLOAD_STATE_TRUTH_REWIRE001

La visibilité du pictogramme du Répertoire dépend désormais exclusivement de
l'état CGWEB097 :

- ORIGINAL => visible ;
- CANONICAL => visible ;
- ABSENT / UNKNOWN / état non encore résolu => caché.

Le contrôle V081 conserve son rôle de téléchargement mais ne décide plus seul
de sa visibilité.

## UNAVAILABLE_ICON_REMOVE001

Une activité sans FIT n'affiche plus de pictogramme grisé.
Le contrôle est `display:none`, `aria-hidden=true`, `tabindex=-1`.

La règle s'applique aussi pendant l'attente de résolution pour éviter le flash
d'une icône faussement disponible.

## DOWNLOAD_ABSOLUTE_RIGHT001

Le positionnement historique de `web081-fit-quick` est restauré :

- `position:absolute`;
- `right:7px`;
- `top:50%`;
- `transform:translateY(-50%)`.

Le bouton reste donc à droite de la carte et ne participe jamais au flux de la
ligne.

## LEGACY_FLEX_LAYOUT_ROLLBACK001

FIX4/FIX5 avaient ajouté des classes de type :

- `cgweb099-fix4-one-line`
- `cgweb099-fix5-row`
- `cgweb099-fix5-download-cell`

FIX6 les retire des lignes du Répertoire.

Le rendu historique redevient maître de la disposition des colonnes ; seul le
bouton FIT reste en position absolue.

## Données

Aucune activité modifiée.
Aucun FIT modifié.
Aucune Function backend modifiée.

## Base de rollback

`0ffdc32d785871a66144139dcf1a83d16c0b0b7d`
