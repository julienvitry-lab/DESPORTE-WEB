# CGWEB124

## MANUAL_FIT_SPLIT001
Découpe manuelle d'une activité en deux activités.

Les deux nouvelles activités reçoivent chacune un FIT canonique généré et validé par FITWRITER001.

## MAP_SPLIT_POINT001
Le point de séparation peut être choisi :
- sur la carte ;
- sur le profil altimétrique ;
- sur le profil de découpe ;
- avec un curseur précis à 0,01 %.

## SPLIT_REPLACE001
Ordre des opérations :
1. création temporaire des deux enfants ;
2. création de leurs routes ;
3. génération du FIT A ;
4. validation du FIT A ;
5. génération du FIT B ;
6. validation du FIT B ;
7. seulement ensuite : activité source placée dans la corbeille.

En cas d'échec avant l'étape 7 :
- la source reste active ;
- les enfants temporaires sont supprimés ;
- les FIT nouvellement créés sont supprimés lorsque cela est sûr.

Le matériel, le sport et le sous-sport de la source sont conservés sur les deux parties.
