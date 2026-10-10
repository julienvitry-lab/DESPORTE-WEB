# CGWEB143 · FIT_SESSION_SUMMARY_REPAIR001

Correctif des preflights Strava `MISSING_FIELD_18_11` (Session total_calories absent)
et `METRIC_NOT_REPRESENTABLE_IN_FIT` (une valeur decimale doit etre
arrondie a l'unite representable par le protocole FIT).

- Les champs de synthese Session manquants (elapsed, timer, distance,
  calories, ascent) sont ajoutes a une definition FIT locale temporaire.
- La definition locale precedente est restauree immediatement apres
  la Session ; les champs developpeur existants sont preserves.
- Les champs de Record (points GPS, heure, FC, altitude et developpeurs)
  ne sont jamais decodes/reecrits. La conservation byte-pour-byte est
  controlee par l'empreinte SHA des Record avant/apres et par leur nombre.
- Valeurs representables : milliseconde pour temps, centimetre pour
  distance, metre pour D+, kilocalorie pour calories. Les decimales
  de precision superieure restent dans CGWEB/Strava au retour de
  reconciliation (Strava fait autorite).
- Le FIT source reste inchange. Aucun export automatique vers Strava.
- Seule la fonction Firebase `fitVault` est redeployee, avec accord.
