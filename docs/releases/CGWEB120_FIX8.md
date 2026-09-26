# CGWEB120 FIX8

## DETAIL_STRUCTURAL_RESET001

Diagnostic définitif du grand gap :

WEB072 FIX13 utilisait encore l'ancien bandeau de statistiques
comme référence géométrique.

Il calculait :

desiredStatsTop - naturalStatsTop

puis injectait le résultat dans `detailView.style.paddingTop`.

Depuis CGWEB120 FIX6, ce bandeau est masqué. Sa position n'était
donc plus une référence exploitable et pouvait produire un grand
padding artificiel.

FIX8 supprime définitivement ce mécanisme.

## TOOLBAR_STICKY_FLOW001

Le bandeau d'activité n'est plus `fixed`.

Il devient `sticky` et reste dans le flux normal.

Conséquences :

- aucun placeholder ;
- aucun padding compensatoire ;
- écart stable pendant le défilement ;
- navigation principale -> bandeau activité : 2 mm ;
- bord supérieur du bandeau -> boutons : 1 mm ;
- bandeau activité -> bandeau titres : 2 mm.

## HEADER_HARD_SHIFT_5MM001

Décalage CSS direct de 5 mm vers la droite :

- Date ;
- Heure ;
- Distance ;
- D+ ;
- Temps ;
- Repères ;
- Charge.

Matériel reste inchangé.

Le déplacement ne dépend plus d'un attribut ajouté par JavaScript.

## AUTOROUTE_FIT_CLOUD001

Si une activité possède des points GPS mais aucun `activity_routes`,
SPORT Web tente automatiquement, dans cet ordre :

1. activity_routes déjà existant ;
2. reconstruction Strava / FIT local via WEBSPLIT003 ;
3. résolution du FIT Cloud déjà utilisé par le bouton Télécharger ;
4. lecture du FIT ;
5. génération du tracé Web ;
6. persistance de `activity_routes` ;
7. affichage normal de la carte et du profil.

Aucune action CARTOWEB001 n'est requise.

## CARTOWEB_RETIRE001

L'ancien message demandant « Publier les tracés Web · CARTOWEB001 »
est retiré.

Base :
30658d8ab45584cfa43d1c795080ae81225953d0
