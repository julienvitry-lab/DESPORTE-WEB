# CGWEB124 FIX1

## MAP_PICKER001
Ajout du bouton « Choisir sur la carte » dans l’éditeur de repères GPS.
Le sélecteur réutilise Leaflet et OpenTopoMap déjà utilisés par SPORT Web.

## CLICK_TO_COORDINATES001
Un clic positionne le repère. « Utiliser ce point » remplit latitude/longitude.
L’écriture Firestore n’a lieu qu’après « Enregistrer le GPS ».

## DRAGGABLE_MARKER001
Le marqueur est déplaçable. Deux cercles matérialisent le rayon d’entrée et
le rayon de réarmement.

## ACTIVITY_TRACE_PICKER_PREP001
Préparation du contrat pour la future sélection depuis une trace :
`window.CGWEB124_MAP_PICKER.applyActivityTracePoint(...)`
et événement `sport-activity-trace-point-picked`.

Cette version ne modifie pas encore l’écran détail d’une activité.
