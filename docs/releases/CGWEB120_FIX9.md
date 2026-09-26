# CGWEB120 FIX9

## AUTOROUTE_DIRECT_STREAM001

Correction du chemin de récupération FIT utilisé par FIX8.

CGWEB107 avait abandonné les signed URLs au profit du téléchargement
direct authentifié `directory_fit_direct_download`.

FIX8 utilisait encore l'ancien resolver URL.

FIX9 utilise directement le flux binaire CGWEB107 :

1. ouverture détail activité ;
2. recherche activity_routes ;
3. secours Strava / FIT local existant ;
4. téléchargement direct du FIT Cloud ;
5. décodage FIT en mémoire ;
6. extraction GPS / altitude ;
7. matérialisation activity_routes ;
8. rendu automatique carte ;
9. rendu automatique profil altimétrique.

Aucun téléchargement visible n'est déclenché.
Aucune action CARTOWEB001 n'est nécessaire.

## DETAIL_CARTO_AUTO001 / PROFILE_AUTO001

La rubrique Carte et profil reste exposée dès le rendu du détail.

Le moteur historique renderDetail continue à déclencher renderCartography :
FIX9 évite donc volontairement un deuxième rendu concurrent.

## Limite réelle

Si aucune route, aucun flux Strava et aucun FIT Cloud/local n'existe,
le nombre gps_point_count seul ne permet pas de reconstruire les
coordonnées géographiques.

Base :
11195a602818fb6848466f2918c6584b85de45f2
