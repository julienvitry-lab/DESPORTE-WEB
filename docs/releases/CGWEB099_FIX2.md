# CGWEB099 FIX2 · SINGLE_DIRECTORY_RENDER001 / GLOBAL_ROW_SCHEMA_PARITY001 / LOCAL_TIME_PARITY001 / ROW_CLICK_RESTORE001 / LEGACY_DIRECTORY_REMOVE001

## Incident

CGWEB099 avait créé un deuxième renderer complet dans
`#activityDirectorySection`.

Le résultat était visible simultanément avec le renderer historique :

- le renderer global affichait les filtres toutes années ;
- il affichait aussi sa propre table de lignes ;
- la table historique continuait à être rendue dessous.

Le renderer global utilisait en outre un schéma réduit qui ne correspondait pas
à toutes les générations d'activités :

- `ascent_m` non lu ;
- `elapsed_time_ms` non converti ;
- `charge` / `relative_effort` / `suffer_score` partiellement ignorés ;
- heure issue d'un ISO UTC affichée par simple découpe de chaîne.

Conséquences : D+ / Temps / Charge à zéro, heures décalées, clic détail non
équivalent au renderer historique.

## SINGLE_DIRECTORY_RENDER001

FIX2 conserve le **moteur global CGWEB099** pour :

- toutes les années ;
- filtres serveur ;
- pagination globale ;
- audit des doublons.

Mais il supprime la seconde table CGWEB099.

Le résultat de la requête globale est injecté dans le tableau `activities`
historique puis affiché exclusivement avec `applyFiltersAndRender()`.

Il n'existe donc plus qu'un seul renderer de lignes.

## GLOBAL_ROW_SCHEMA_PARITY001

Le backend transmet pour chaque ligne :

- les champs normalisés nécessaires aux filtres globaux ;
- `raw_activity`, copie JSON sûre du document activité original.

Les alias globaux couvrent notamment :

- `distance_m` / `distance` ;
- `ascent_m` / `total_ascent_m` / `elevation_gain_m` ;
- `duration_s` / `elapsed_time_s` / `moving_time_s` ;
- `elapsed_time_ms` / `timer_time_ms` / `moving_time_ms` convertis en secondes ;
- `charge` / `load` / `training_load` / `relative_effort` / `suffer_score` ;
- `landmark_codes` / `landmarks` / `markers`.

Le rendu final reste celui du code historique, afin de ne pas dupliquer à
nouveau la logique métier.

## LOCAL_TIME_PARITY001

Les helpers CGWEB099 date/heure utilisent désormais `Date` +
`toLocaleDateString` / `toLocaleTimeString` au lieu de découper l'ISO UTC.

Le renderer historique reçoit `start_time_ms` d'origine et conserve son propre
formatage local.

## ROW_CLICK_RESTORE001

FIX2 ne tente plus de deviner le nom du handler de détail.

Les lignes sont construites par le renderer historique, donc leur clic,
sélection, détail, icônes et comportement restent ceux déjà validés avant
CGWEB099.

## LEGACY_DIRECTORY_REMOVE001

Le terme « legacy remove » signifie ici :

- suppression du **double rendu** ;
- conservation du renderer historique unique ;
- masquage uniquement de l'ancien panneau de filtres local et de ses anciens
  boutons de chargement/pagination.

Le conteneur historique des activités n'est plus masqué.

## Données

Aucune activité n'est modifiée.
Aucun FIT n'est modifié.
Aucune suppression de doublon n'est exécutée.
