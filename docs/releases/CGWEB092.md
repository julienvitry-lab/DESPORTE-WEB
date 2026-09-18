# CGWEB092 · ORIGINAL_MATCH_DEEP_ANALYSIS001

CGWEB092 analyse les FIT originaux non liés sans aucune écriture.

Pour chaque FIT original, le serveur lit le binaire réel dans Firebase Storage,
le décode puis compare chaque activité candidate sur :

- heure / résidu temporel ;
- sport ;
- sous-sport ;
- distance ;
- durée ;
- D+ ;
- FC moyenne ;
- FC maximale.

Le contexte affiche aussi le titre, le matériel, les repères et la source
d'import lorsqu'ils existent.

Le classement technique favorise :
1. moins de contradictions ;
2. plus de concordances fortes ;
3. plus de concordances compatibles ;
4. moins d'éléments faibles ;
5. moins d'écart métrique ;
6. moins de résidu horaire.

Les qualificatifs `CLEAR_METRIC_LEAD`, `SLIGHT_METRIC_LEAD`,
`SINGLE_CANDIDATE`, `INDETERMINATE` et `DECODE_FAILED` sont uniquement des aides
de comparaison.

Invariants :
- 0 activité modifiée ;
- 0 activity_files modifié ;
- 0 FIT modifié ou supprimé ;
- 0 rattachement automatique.
