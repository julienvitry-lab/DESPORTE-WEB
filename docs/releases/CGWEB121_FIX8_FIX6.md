# CGWEB121 FIX8 FIX6

Modules :

- RECOVERY_APPLY_ACTIVITY_CHANGES001
- ACTIVE_MANIFEST_PERSIST001
- FIT_TRIPLE_SYNC_REPAIR001

## Diagnostic

Le chemin natif FITEDITOR001 envoie au backend :

- `activate_version: true`
- `apply_activity_changes: true`

Le chemin ajouté par FIT_SOURCE_RECOVERY001 envoyait seulement :

- `activate_version: true`

Il manquait donc `apply_activity_changes: true`.

Conséquence : une nouvelle version pouvait être demandée sans garantir la
mise à jour canonique de l'activité et de son manifeste FIT actif.

## Correction

Le chemin Recovery envoie désormais exactement le même contrat de
synchronisation que FITEDITOR001 natif :

`apply_activity_changes: true`

Le backend peut ainsi persister ensemble :

- l'heure de départ de l'activité ;
- le SHA FIT actif ;
- le nom du FIT actif ;
- l'index de version actif.

FIX5 peut alors utiliser ces champs persistants pour télécharger le vrai FIT
ACTIVE et le nommer selon l'heure cible.

## Cas de test

Activité du 31/07/2012 :

- ancien FIT source : 02:10 ;
- heure SPORT Web avant correction : 09:10 ;
- heure cible à saisir après FIX6 : 09:11.

Attendu :

- SPORT Web : 09:11 ;
- FIT actif interne : 09:11 ;
- téléchargement : `2012_07_31_09_11_00_C.fit`.

Base :

163be0b8e334c635ca6643cc26be57b8f30621b0
