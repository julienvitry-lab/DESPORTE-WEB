# CGWEB136

## STRAVA_SINGLE_EXPORT001

Premier export réel SPORT Web → Strava.

Un seul fichier est envoyé à la fois.

L'envoi nécessite :

1. préflight CGWEB134 valide ;
2. absence de doublon Strava ;
3. FIT CGWEB135 avec parité validée ;
4. verrou actif ;
5. confirmation explicite dans le navigateur.

## EXACT_BINARY_UPLOAD001

CGWEB136 ne régénère jamais le FIT.

Il télécharge depuis Cloud Storage exactement le candidat CGWEB135,
recalcule son SHA-256 et exige l'identité avec le SHA-256 validé.

Le fichier est envoyé en multipart/form-data avec :

- data_type = fit
- external_id = CGWEB_<activity_id>
- file = binaire CGWEB135 exact

Aucun retry automatique du POST n'est autorisé après une erreur réseau ambiguë.

## UPLOAD_STATUS_POLL001

Après acceptation du fichier :

- le strava_upload_id est stocké ;
- le navigateur interroge le backend toutes les 2 secondes ;
- le backend consulte /uploads/{upload_id} ;
- aucun second upload n'est créé.

Le contrôle peut être repris après rechargement de la page.

## STRAVA_POSTCHECK001

Lorsque Strava fournit l'activity_id, SPORT relit l'activité détaillée.

Les cinq statistiques contrôlées sont :

- distance ;
- moving_time ;
- elapsed_time ;
- total_elevation_gain ;
- calories.

## STRAVA_WINS_RECONCILE001

Après création Strava, Strava devient l'autorité sur ces cinq statistiques.

CGWEB adopte :

- distance_m = Strava distance ;
- timer_time_ms = Strava moving_time ;
- elapsed_time_ms = Strava elapsed_time ;
- ascent_m = Strava total_elevation_gain ;
- calories = Strava calories.

Les anciennes valeurs sont conservées dans :

- pre_strava_export_distance_m
- pre_strava_export_timer_time_ms
- pre_strava_export_elapsed_time_ms
- pre_strava_export_ascent_m
- pre_strava_export_calories

## OUTBOUND_WEBHOOK_GUARD001

Le webhook Strava reconnaît les activités créées par SPORT via external_id.

Il ne crée jamais une seconde activité SPORT.

Le webhook peut terminer la réconciliation même si le navigateur est fermé.

## EXPORT_AUDIT_TRAIL001

Collection :

strava_export_audit

Étapes journalisées notamment :

- EXACT_BINARY_VERIFIED
- STRAVA_UPLOAD_ACCEPTED
- STRAVA_PROCESSING_ERROR
- POSTCHECK_INCOMPLETE
- RECONCILED
- DUPLICATE_BLOCKED_BEFORE_UPLOAD
- UPLOAD_UNKNOWN

## Sécurité

Une coupure réseau après un POST dont l'issue est inconnue donne :

UPLOAD_UNKNOWN

Dans cet état, SPORT refuse tout nouvel envoi automatique afin d'éviter
un doublon Strava.
