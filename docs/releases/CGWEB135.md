# CGWEB135

## FIT_STRAVA_PARITY001

Avant tout futur upload Strava :

1. photographie CGWEB ;
2. génération du FIT candidat ;
3. redécodage du FIT ;
4. comparaison des valeurs ;
5. blocage si la parité n'est pas obtenue.

Aucun upload Strava n'existe dans CGWEB135.

## TOTAL_CALORIES_FIT001

`totalCalories` est maintenant écrit dans les messages FIT :

- Lap ;
- Session.

Les calories sont également redécodées pendant le contrôle Round Trip.

## TIMER_EVENTS001

Le FIT contient les événements Timer.

Si temps chrono = temps écoulé :

- START ;
- STOP_ALL.

Si temps chrono < temps écoulé et si les anciens événements originaux ne sont
plus disponibles, une pause synthétique unique est encodée afin de préserver
exactement les deux durées.

Cette méthode est explicitement identifiée par :

`SYNTHETIC_SINGLE_PAUSE`

Elle n'est jamais présentée comme une pause historique authentique.

## PREUPLOAD_ROUNDTRIP001

Le FIT candidat est redécodé côté serveur puis comparé sur :

- distance ;
- temps chrono ;
- temps écoulé ;
- D+ ;
- calories.

Le verrou CGWEB134 est obligatoire et doit toujours être valide.

Si les statistiques CGWEB ont changé depuis le préflight, le candidat est refusé
et un nouveau préflight est exigé.

## EXPORT_PREVIEW001

Après un préflight `READY_LOCKED`, le dialogue Strava propose :

`Préparer le FIT candidat`

Le résultat affiche :

- CGWEB ;
- FIT redécodé ;
- écart ;
- statut de chaque métrique ;
- mode Timer ;
- nombre d'événements ;
- SHA-256 du candidat.

Le FIT candidat est conservé dans Cloud Storage pour permettre à CGWEB136
d'envoyer exactement le fichier déjà contrôlé, sans le régénérer.

## Règle CGWEB135

`real_strava_upload = false`
