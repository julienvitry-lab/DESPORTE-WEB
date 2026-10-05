# CGWEB128

## DETAIL_SEQUENCE_ASYNC001

Le composant CGWEB126 « Suivi des repères » est réactivé dans la fiche
activité.

Il n'est plus appelé synchronement depuis le hot path de `renderDetail()`.

Le rendu principal se termine d'abord, puis SPORT utilise deux
`requestAnimationFrame` avant d'émettre l'événement
`sport-activity-detail-render`.

Les ouvertures successives rapides sont dédoublonnées par ticket.

## SEQUENCE_PANEL_IDEMPOTENT001

`#cgweb126SequenceField` est créé une seule fois.

S'il existe déjà :

- aucun nouveau panneau n'est créé ;
- aucun déplacement DOM n'a lieu s'il est déjà correctement placé ;
- texte, classes, valeur et nombre de lignes ne sont modifiés que si
  leur valeur doit réellement changer.

Les listeners Enregistrer / Réinitialiser sont installés uniquement à
la création du panneau.

## OBSERVER_SAFE_INTEGRATION001

Aucun MutationObserver n'est utilisé pour l'intégration du suivi des
repères dans la fiche activité.

Le petit observer nécessaire au panneau d'administration CGWEB126
n'observe plus `document.body`.

Il est limité à :

`#advancedLandmarksSection`

et se déconnecte dès que son panneau existe.

## Stabilité héritée

CGWEB127 FIX1 et FIX2 restent conservés :

- observer CGWEB120 protégé ;
- observers legacy de jonction limités à `#detailView` ;
- scan global `querySelectorAll('*')` supprimé ;
- barre d'actions idempotente ;
- chargement des données à la demande conservé.
