# CGWEB083 · FIX9 · HEADERCENTER001

## Objectif

Conserver l'ancrage de la barre de titre, désormais satisfaisant,
et corriger uniquement le centrage horizontal des libellés.

## Principe

Les activités sont déjà correctement disposées dans leurs
« colonnes invisibles ».

FIX9 ne reconstruit donc plus cette grille.

Il mesure directement les huit cellules `.datum` de la première
activité visible :

1. Date
2. Heure / Départ
3. Distance
4. D+
5. Temps / Durée
6. Matériel
7. Repères
8. Charge

Pour chaque cellule :

`centre = left réel + width réelle / 2`

Le titre correspondant est placé exactement sur ce centre avec :

`transform: translate(-50%, -50%)`

## Synchronisation

WEB072 FIX11 réapplique sa grille après le rendu.

FIX9 se recale :
- immédiatement ;
- après 40 ms ;
- après 150 ms ;
- après 320 ms ;
- et juste après `web072Fix11AlignDirectoryHeader()`.

Ainsi le calcul utilise la géométrie définitive des lignes.

## Inchangé

- ancrage de la barre ;
- espacement vertical 2 mm ;
- Tri des activités ;
- 100 activités au démarrage ;
- « Afficher 20 de plus » ;
- pictogramme FIT ;
- pipeline FIT ;
- backend.
