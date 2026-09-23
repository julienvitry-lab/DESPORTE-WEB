# CGWEB117 FIX1 · PHASE 1/2

Audit affiné uniquement.

Règle historique :
- avant le 26/12/2019, toute activité vélo = OUTDOOR.

Le nom du vélo, son profil matériel actuel et son mapping ne sont jamais
utilisés comme preuve décisive.

Commande :
    await window.CGWEB117_FIX1_PHASE1_AUDIT()

Résumé :
    window.CGWEB117_FIX1_LAST_AUDIT.summary

Faux indoor proposés :
    window.CGWEB117_FIX1_LAST_AUDIT.false_indoor.slice(0,50)

Cas ambigus :
    window.CGWEB117_FIX1_LAST_AUDIT.ambiguous_current_indoor.slice(0,50)

Export :
    window.CGWEB117_FIX1_EXPORT_CSV("false_indoor")

PHASE 2 non incluse : elle modifiera le classifieur uniquement après validation.

Firestore writes : 0
Storage writes : 0

Base rollback : 31d9ba37d70c5f156d49790808cbecdd48d00a01
