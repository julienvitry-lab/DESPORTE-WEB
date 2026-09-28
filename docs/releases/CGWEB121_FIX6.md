# CGWEB121 FIX6

## GAP_TRAIL_V2_001

SPORT Web utilise désormais un nouveau moteur GAP pour la course à pied
et le trail.

Le calcul utilise :

- vitesse réelle ;
- pente lissée sur environ 120 m ;
- pondération par distance ;
- exclusion des intervalles de pause ;
- bornage exact de chaque kilomètre.

La série GAP éventuellement stockée dans activity_routes n'est plus
prioritaire : elle n'est utilisée qu'en fallback si vitesse et temps
sont indisponibles.

## DESCENT_ASYMMETRIC_MODEL001

Le modèle historique était adapté aux montées mais produisait des
corrections disproportionnées dans les fortes descentes.

Nouveau modèle :

- 0 à -4 % : ratio 1,00 -> 0,97 ;
- -4 à -8 % : ratio 0,97 -> 1,00 ;
- -8 à -20 % : ratio 1,00 -> 1,12 ;
- -20 à -30 % : ratio 1,12 -> 1,25 ;
- sous -30 % : plafond 1,25.

Le comportement devient ainsi asymétrique :

une descente douce reste mécaniquement avantageuse, tandis qu'une
descente raide retrouve progressivement un coût technique.

## Montée

Le modèle énergétique historique est conservé pour les pentes
positives.

## DISTANCE_WEIGHTED_GAP001

La moyenne GAP n'est plus calculée selon le nombre de points GPS.

Chaque intervalle contribue proportionnellement à la distance
effectivement parcourue.

Cela évite qu'une zone comportant beaucoup de points GPS pèse
artificiellement davantage qu'une autre.

## KM_BOUNDARY_CLIP001

Les points de route Web peuvent chevaucher une borne kilométrique.

Exemple :

984 m -> 1011 m.

Le km 1 utilise uniquement les 16 m compris entre 984 et 1000 m.

Le km 2 utilise uniquement les 11 m compris entre 1000 et 1011 m.

Le calcul est donc indépendant de la décimation de la route Web.

## Données

Aucune activité et aucun fichier FIT ne sont modifiés.

FIX6 modifie uniquement le calcul analytique et l'affichage du GAP.

Base :

63529387163f22c86b0cadebc7fc32db321459a3
