# CGWEB093 · SAFE_MATCH_PREVIEW001 / ORPHAN_FINGERPRINT_SEARCH001 / DUPLICATE_ACTIVITY_DIAGNOSTIC001

CGWEB093 est intégralement READ-ONLY.

## SAFE_MATCH_PREVIEW001

Classe les originaux non liés en :
- SAFE_EXACT
- SAFE_STRONG
- DUPLICATE_ACTIVITY_TIE
- NO_COMPATIBLE_CANDIDATE
- REVIEW

Aucune catégorie SAFE ne déclenche d'écriture.

## ORPHAN_FINGERPRINT_SEARCH001

Pour les NO_COMPATIBLE_CANDIDATE, recherche dans tout le répertoire via :
sport, sous-sport, distance, durée, D+, FC moyenne et FC maximale,
sans imposer la proximité horaire.

## DUPLICATE_ACTIVITY_DIAGNOSTIC001

Pour les ex æquo métriques, affiche :
source d'import, IDs externes, route, état original/canonique et FIT liés.

## Invariants

- activities_modified = 0
- fit_files_modified = 0
- aucune suppression
- aucun rattachement
- aucune réparation automatique
