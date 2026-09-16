# CGWEB083 · FIX10 · HEADERVALUECENTER001

## Diagnostic

Les lignes d'activités sont organisées par grille, mais le contenu
des `.datum` est aligné à gauche.

Les versions précédentes centraient donc correctement le titre dans
la case CSS complète, ce qui produisait un décalage visuel par rapport
aux valeurs affichées.

## Correction

Le header `#cgweb083MeasuredActivityHeader` et son ancrage sont conservés.

Pour chacune des huit colonnes :

- Date
- Heure
- Distance
- D+
- Temps
- Matériel
- Repères
- Charge

FIX10 récupère le `<strong>` réellement visible dans la première activité,
mesure son rectangle à l'écran et calcule :

`centreX = left + width / 2`

Le titre correspondant est positionné exactement sur ce centre avec :

`translate(-50%, -50%)`

## Correction de coordonnées

La piste du header étant absolue dans son host, son `left` est maintenant
calculé en coordonnées locales :

`card.left - host.left`

et non plus directement avec une coordonnée viewport.

## Nettoyage

L'ancien `HEADERCENTER001`, qui ciblait un host FIX8 désormais supprimé,
est retiré.

WEB072 FIX11 appelle directement le moteur mesuré unique.

## Inchangé

- ancrage sticky ;
- écart 2 mm ;
- lignes d'activités ;
- Tri des activités ;
- 100 activités au démarrage ;
- Afficher 20 de plus ;
- pictogramme FIT ;
- pipeline FIT ;
- backend.
