# CGWEB117 FIX1 · PHASE 2/2

Nouvelle règle WEB071 :

- vélo avant le 26/12/2019 = OUTDOOR
- indoor seulement sur preuve intrinsèque de l'activité
- matériel / profil matériel / mapping matériel non décisifs
- sources virtuelles explicites conservées indoor
- sub_sport indoor conservé
- sans preuve indoor : outdoor

Aucune migration Firestore.
Aucune écriture Storage.

Validation :
    await window.CGWEB117_FIX1_PHASE2_VALIDATE()

Invariant attendu :
    pre_2019_12_26_bike_indoor = 0

Base rollback : a304570a7715a3fdc2457f34f01209b8dbe46676
