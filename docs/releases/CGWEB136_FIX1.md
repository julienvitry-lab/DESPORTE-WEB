# CGWEB136 FIX1

## POST_EXPORT_STATE001

Après réconciliation réussie :

`strava_export_state = RECONCILED`

Le statut devient explicite et persistant.

Les activités exportées avant FIX1 sont backfillées lors du premier audit
post-export, sans modifier leurs statistiques sportives.

## CALORIES_RECONCILE_AUDIT001

L'audit relit l'activité détaillée Strava et compare :

- calories avant export ;
- calories Strava actuelles ;
- calories CGWEB actuelles.

L'audit est valide uniquement si :

`Strava calories = CGWEB calories`

## LOAD_IMMUTABILITY_AUDIT001

La Charge ne fait PAS partie des cinq statistiques autoritaires Strava.

SPORT Web privilégie d'abord les éventuels champs de charge persistés.

À défaut, la Charge est dérivée par la formule existante :

`(minutes + 2 × km + D+/100) × facteur FC`

avec facteur FC borné à `0,75..1,50`.

Par conséquent, si Strava modifie distance, temps ou D+, la Charge dérivée
peut changer d'arrondi sans qu'un champ de charge soit écrasé.

FIX1 vérifie :

- les champs persistés de charge avant/après ;
- les champs effectivement touchés par le patch CGWEB136 ;
- la Charge calculée avant ;
- la Charge calculée après.

## SYNCHRONIZED_BUTTON001

Dès que `strava_activity_id` existe, l'état final prévaut sur les anciens états :

- plus de `Strava · FIT ✓` après export ;
- affichage `Strava · synchronisé`.

Le clic sur le bouton permet un audit post-export sans aucun nouvel upload.

## Premier cas réel

Activité 31/07/2012 :

- D+ CGWEB avant : 135 m ;
- D+ Strava : 78 m ;
- CGWEB réconcilié : 78 m.

La Charge affichée 69 → 68 est compatible avec la formule dérivée et doit être
auditée comme conséquence du changement de D+, et non comme mutation de Charge.
