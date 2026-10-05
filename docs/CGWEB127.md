# CGWEB127

## DETAIL_FREEZE_RECOVERY001

Le bridge UI CGWEB126 est retiré temporairement du chemin synchrone
`renderDetail(activity)` afin de restaurer l'ouverture fiable des activités.

Le moteur CGWEB126, les données de classement et la reconstruction historique
restent conservés.

Seul le champ éditable CGWEB126 injecté dynamiquement dans la fiche activité
est temporairement suspendu.

## CGWEB124_SINGLE_SCOPE001

`cgweb124GpsMarkerSection` est désormais enfant de
`advancedLandmarksSection`.

CGWEB124 est donc visible uniquement dans :

**Plus > Repères avancés**

CGWEB126 suit automatiquement ce déplacement puisque son panneau de
reconstruction est enfant de CGWEB124.

## JOINS_REHOME001

L'onglet principal **Jonctions** est supprimé.

Le workspace est désormais accessible par :

**Plus > Jonctions**

Les rafraîchissements Firestore, événements temps réel et états des lots
continuent de fonctionner sur ce nouvel emplacement.

## LAZY_LOAD_PRESERVE001

CGWEB125 reste le moteur du démarrage léger.

Le message :

`SPORT Web prêt · données chargées à la demande.`

et le chargement différé des collections restent conservés.
