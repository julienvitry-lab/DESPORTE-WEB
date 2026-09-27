# CGWEB121 FIX2

## ROUTE_RENDER_DECIMATION001

La source GPS complète n'est plus enregistrée telle quelle dans
activity_routes.

SPORT Web reconstruit d'abord la source complète depuis Strava
ou le FIT, puis produit une route Web de rendu.

Plafond actuel :

800 points de rendu.

Le départ, l'arrivée et les extrema altimétriques sont conservés.

Tous les streams sont décimés avec la même grille :

- latitude ;
- longitude ;
- altitude ;
- distance ;
- temps ;
- fréquence cardiaque ;
- vitesse ;
- cadence ;
- moving ;
- équipement ;
- GAP.

## FIRESTORE_INDEX_SAFE001

La route matérialisée respecte un budget maximal de valeurs
de tableaux.

Budget actuel :

12000 valeurs de tableaux par activity_routes.

Les gros objets et tableaux annexes qui ne servent pas au rendu
ne sont plus copiés dans activity_routes.

Cela évite notamment l'erreur observée :

FirebaseError: too many index entries for entity

## SOURCE_COUNT_PRESERVE001

La réduction Web ne modifie pas la vérité source.

Exemple :

source_point_count = 8190
render_point_count = ~800

Le profil peut donc indiquer correctement que la source possède
8190 points GPS, tout en utilisant une représentation Web optimisée.

## RENDER_ROUTE_CANONICAL001

activity_routes devient explicitement un format de rendu dérivé.

La source canonique complète reste :

- Strava ;
- ou FIT.

activity_routes contient uniquement ce qui est nécessaire à :

- Leaflet ;
- profil altimétrique ;
- synchronisation carte/profil ;
- métriques contextuelles de survol.

## Persistance

La source est contrôlée avant décimation.

La route décimée est contrôlée une seconde fois avant écriture.

Après écriture Firestore, le document est relu et validé avant
que SPORT Web considère carte et profil comme synchronisés.

Base :
a4fbc3fad2ca84c64e1594c8948213aa0b1aac94
