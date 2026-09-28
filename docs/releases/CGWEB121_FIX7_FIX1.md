# CGWEB121 FIX7 FIX1

Modules :

- ZERO_STATS_RECOUNT_ONLY001
- EXISTING_USAGE_PRESERVE001
- PARTIAL_HISTORY_GUARD002

## Regle

Le recomptage canonique FIX7 n'est desormais autorise que pour une fiche
materiel dont TOUS les compteurs persistants sont strictement a zero :

- activity_count = 0 ;
- total_distance_m = 0 ;
- total_duration_ms = 0 ;
- total_ascent_m = 0.

Des qu'un historique persistant non nul existe, SPORT Web le conserve
integralement et ne le remplace jamais par un recomptage base sur la memoire
courante.

## Effet attendu

- SALOMON Ultra Glide 2 (blanc) : historique existant conserve ;
- SALOMON Ultra Glide 3 (noir) : historique existant conserve ;
- SALOMON Ultra Glide 4 (NBR) : recount autorise car fiche persistante a zero.

## Securite

- aucune ecriture Firestore ;
- aucun FIT modifie ;
- aucune activite modifiee ;
- correctif d'affichage/recomptage uniquement.

Base :

630cbd55ad90fc1cd08854b06ed5881ab4037d06
