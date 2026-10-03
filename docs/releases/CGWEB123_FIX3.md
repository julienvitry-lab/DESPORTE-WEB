# CGWEB123 FIX3

MASS_JOIN_MANAGER001 / HIGH_CONFIDENCE_AUTOJOIN001 / RESUMABLE_BATCH001 / FAILURE_CONTINUE001 / JOIN_AUDIT_LOG001

- Groupes strictement homogènes déjà produits par Jonctions, hors split, 2 à 12 activités.
- PLAN `FIT_JOIN_REPLACE001` obligatoire avant chaque fusion.
- File et curseur persistés par utilisateur dans `localStorage`.
- Échec isolé journalisé puis poursuite du lot.
- Reprise sûre après interruption, avec contrôle de l’état réel après un EXECUTE ambigu.
- Audit exportable en JSON.
- Backend CGWEB122 inchangé ; `SOURCE_FIT_PURGE_AFTER_VALIDATE001` conservé.
