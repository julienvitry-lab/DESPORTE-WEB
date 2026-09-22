# CGWEB115 · UI_SIMPLIFICATION001

Modules :

- UI_SIMPLIFICATION001
- ACTIVITIES_FLATTEN001
- TRASH_TO_PLUS001
- CANONICAL_ACTIVITY_TITLE001
- DETAIL_CHROME_CLEANUP001
- ANALYSIS_TITLE_CLEANUP001
- REVERSIBLE_EDITOR_REMOVE001
- WEB_POINTS_BADGE_REMOVE001
- HOSTING_ONLY001

## Activités

L'onglet Activités ouvre directement le Répertoire historique, désormais
présenté simplement comme « Activités ».

La barre secondaire Répertoire / Corbeille disparaît.

Corbeille est déplacée dans Plus, sans modification de son fonctionnement.

Les boutons de retour de fiche affichent « ← Activités ».

## Titre canonique

Le titre utilisateur d'une activité devient une référence calculée
automatiquement à partir de start_time_ms en Europe/Paris :

    AAAA_MM_JJ_HH_MM_SS_(Sport)

Exemple :

    2026_08_16_07_37_00_(Course_a_pied)

Cette référence :

- remplace visuellement le « Titre personnalisé » ;
- devient le titre de l'onglet navigateur ;
- est utilisée dans la Corbeille.

Aucune migration Firestore n'est réalisée : les anciens custom_title restent
stockés mais ne pilotent plus le titre visible de la fiche.

## Fiche activité

Suppression visuelle de :

- « Carte et profil altimétrique » ;
- badge « N points Web » ;
- bloc « Modifier · Réversible / Édition réversible de l’activité ».

Le bloc historique reste techniquement présent dans le DOM pour compatibilité
avec les anciennes références JS, mais il n'est plus rendu ni intégré à
l'empilement CGWEB111.

## Analyse

La grosse mention « Analyse » est masquée.
Les sous-onglets Objectifs / Poids / Repères / Records restent inchangés.

## Héritage conservé

CGWEB114 ORIGINAL_TIME_RESTORE001 reste actif.

CGWEB113 FIX3 reste présent et reprenable avec :

    await window.CGWEB113_FIX3_MASS_SWEEP("APPLY_ALL_LEGACY_UTC_NAMES")

Aucun backend ni aucune donnée Firestore n'est modifié par le déploiement.

Base rollback : e19967e04e68068288e8b3b2c74f343ac57a4ae0
