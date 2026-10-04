# CGWEB123 FIX3 FIX2

## LEASE_SELF_HEAL001
Le lease du lot est renouvelé ou réacquis par le même runner lorsqu'il a simplement
expiré pendant une mise en veille/throttling du navigateur. Un lease réellement
détenu par un autre onglet reste bloquant.

## GHOST_RUNNING_REPAIR001
Un état persistant RUNNING/READY sans runner JavaScript actif est détecté.
Le lot existant est repris à son curseur, sans reconstruction de file.

## WAKE_AUTORESUME001
Retour de visibilité, focus, pageshow, retour réseau et watchdog visible déclenchent
une tentative de reprise sûre.

## TRANSIENT_BACKOFF001
Les erreurs réseau/API transitoires de PLAN/EXECUTE sont retentées avec backoff
exponentiel (2 s -> 60 s, jusqu'à 20 tentatives) avant d'être rendues au moteur.

## USER_PAUSE_RESPECT001
Une pause explicitement demandée par l'utilisateur est persistée séparément et
interdit toute auto-reprise. Le bouton Reprendre lève explicitement ce verrou.

## Compatibilité
- stockage FIX3 FIX1 conservé : le lot en cours reprend au curseur existant ;
- aucune reconstruction Firestore forcée ;
- aucune modification de FIT_JOIN_REPLACE001 ;
- aucune Firebase Function redéployée ;
- CGWEB124 reste inchangé.
