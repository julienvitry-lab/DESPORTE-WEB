# CGWEB094B · DIRECTORY_SINGLETON002 / AUTOEQUIP_WRITEWATCH001

## DIRECTORY_SINGLETON002

Cause :
des anciens styles du Répertoire utilisent `display:flex!important`.
Ils peuvent vaincre la classe `.hidden`, ce qui faisait apparaître LE MÊME
Répertoire sous Accueil, Analyse, Matériel ou Plus.

Correction :
- un seul `#activityDirectorySection` est autorisé dans le HTML ;
- `navigateUx` publie `uxPage` + `uxSubpage` ;
- garde runtime avec styles inline `!important` ;
- verrou CSS final ;
- visible exclusivement dans `Activités > Répertoire`.

Il ne s'agit pas de créer un nouveau Répertoire : on verrouille l'unique
Répertoire existant.

## AUTOEQUIP_WRITEWATCH001

Cause :
un trigger `onDocumentCreated` est trop tôt pour certains imports.
L'activité peut être créée avant que `sport`, `sub_sport` ou les métadonnées
Strava/Kinomap soient finalisées. Si le trigger sort à ce moment-là, il ne
revient jamais.

Correction :
- trigger Firestore `onDocumentWritten` ;
- tente au CREATE ;
- retente sur UPDATE uniquement si la signature pertinente a changé ;
- relecture transactionnelle de l'activité fraîche ;
- classification BIKE / MTB / TRAINER / RUN / TRAIL / KINOMAP ;
- KINOMAP prioritaire sur RUN ;
- `WEBEQUIPMAP005` prioritaire ;
- `equipment_manual=1` protégé ;
- tout `equipment_name` existant protégé ;
- publication `/changes` vers téléphone/tablette ;
- aucune boucle : l'écriture AutoEquip suivante voit `equipment_name` rempli
  et s'arrête immédiatement.

## Important

Aucun backfill historique automatique n'est réalisé.
Le correctif garantit les créations/imports futurs et leurs enrichissements
successifs.
