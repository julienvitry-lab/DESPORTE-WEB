# CGWEB116 · SPORT_CODE_CANONICAL001 / FILES_MINIMAL001

## Noms d'activité et de FIT

Le placeholder « (sport) » ne signifie pas un libellé long.

Le contrat strict est :

- C : course à pied
- V : vélo
- H : vélo d'intérieur / home trainer
- T : tapis de course / virtual run

Format :

    AAAA_MM_JJ_HH_MM_SS_C
    AAAA_MM_JJ_HH_MM_SS_V
    AAAA_MM_JJ_HH_MM_SS_H
    AAAA_MM_JJ_HH_MM_SS_T

Aucun autre code n'est autorisé.

Le Web et le FIT Writer backend appliquent la même règle.
La branche historique M a été supprimée.

## Fichiers

L'interface visible est réduite à :

- Exports
- Google Drive

Les outils suivants disparaissent de l'interface quotidienne :

- Coffre local
- Audit FIT
- Rattrapage FIT
- FIT Cloud
- Autre / couverture globale
- Résolution FIT historiques
- Transfert FIT historiques

Ils ne sont pas détruits dans cette version : leur code et leurs panneaux restent
présents mais invisibles, afin de conserver une possibilité de diagnostic /
rollback sans encombrer l'interface.

## Raison

Le téléchargement quotidien se fait désormais depuis Activités.
Le provisionnement FIT est automatique.
Les fonctions de rattrapage, migration et résolution historique sont des outils
de chantier, pas des fonctions utilisateur permanentes.

CGWEB113 FIX3 reste présent.

Base rollback : 308a265a17381fb2201d26475db11fc6aaa3ba09
