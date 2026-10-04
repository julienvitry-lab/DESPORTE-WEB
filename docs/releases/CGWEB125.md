# CGWEB125

## APP_STARTUP_PROFILING001
Mesure de la durée d'évaluation du module, des étapes de boot/lazy-load et des Long Tasks Chromium quand disponibles.

## LISTENER_DEDUP001
Les listeners Firestore récurrents ne sont plus stop/start à chaque demande : un listener déjà actif est conservé.

## TIMER_CLEANUP001
- suppression du polling cartographique toutes les 1,2 s ;
- MutationObserver cartographique limité à la branche détail ;
- arrêt des watchers/heartbeats/polling Strava après 30 s en arrière-plan ou pagehide.

## LAZY_TAB_LOAD001
Les collections lourdes sont chargées au premier accès à l'onglet concerné, après rendu de l'interface.

## FIRESTORE_BOOT_REDUCTION001
Le chemin bloquant après authentification ne lit plus que `meta/state`. Les données de l'onglet actif sont chargées ensuite en idle.

CGWEB125 est Hosting-only : aucun changement de `fitVault`, `joinBatchWorker` ou Cloud Tasks FIX4.
