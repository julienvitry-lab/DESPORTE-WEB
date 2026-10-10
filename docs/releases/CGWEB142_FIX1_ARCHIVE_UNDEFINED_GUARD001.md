# CGWEB142 FIX1 · ARCHIVE_UNDEFINED_GUARD001

## Incident corrige

Lors de la confirmation d'une reinsertion d'un lien Strava historique, `tx.create(archiveRef, ...)` rejetait `undefined` dans `old_activity_link.strava_export_state` ou `strava_upload_id`. Sur les liens les plus anciens, ces champs n'existent pas.

## Correctif

- Enregistrer `null` pour les champs facultatifs absents dans le document d'archive, sans masquer une valeur renseignee.
- Conserver la preuve HMAC, les verifications d'identite, d'existence distante, de doublons et la revérification juste avant transaction.
- Les tests simulent maintenant le refus Firestore des valeurs `undefined` imbriquees, et controlent le cas sans ancien statut ainsi que la preservation d'un statut present.
- Aucun FIT modifie, aucun nouvel upload Strava, aucune suppression distante, aucune modification de l'interface Web.
- Deploiement cible de `stravaBridge` seulement.
