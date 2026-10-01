# CGWEB121 FIX8 FIX5

Modules :

- TARGET_TIME_SINGLE_AUTHORITY001
- ACTIVE_FIT_DOWNLOAD001
- FIT_ACTIVITY_FILENAME_TRIPLE_SYNC001

## Problème constaté

Après `Modifier réellement le FIT`, trois références pouvaient diverger :

1. heure cible annoncée par la boîte de confirmation ;
2. `start_time_ms` affiché dans le répertoire SPORT Web ;
3. FIT téléchargé par l'icône, qui pouvait encore être l'ancien fichier.

## Cause

Le backend FITVERSION/FITEDITOR reconstruit une version canonique depuis
l'activité SPORT courante puis applique `start_offset_s`.

FIX3 calculait pourtant cet offset depuis l'heure du FIT parent.

Exemple :

- FIT parent : 02:10 ;
- SPORT Web : 09:10 ;
- cible : 09:11.

L'offset destiné au backend doit être +60 s (09:10 -> 09:11), et non
+25 260 s (02:10 -> 09:11).

## Correction

L'heure saisie devient l'autorité unique.

Lors d'une modification :

- l'offset backend est calculé depuis `activity.start_time_ms` ;
- la version FIT générée est contrôlée contre la cible ;
- l'activité est explicitement sauvegardée avec la cible ;
- le SHA de la nouvelle version ACTIVE est enregistré dans l'activité ;
- l'icône du répertoire télécharge prioritairement ce SHA ACTIVE ;
- le nom téléchargé est reconstruit depuis la même heure cible,
  en fuseau Europe/Paris.

Ainsi les trois références doivent converger :

- heure SPORT Web ;
- heure interne du nouveau FIT ;
- nom du FIT téléchargé.

Le FIT source original reste conservé.

Base :

1dde7f59d81dcdbbcd78a83f5944d884e6872cc8
