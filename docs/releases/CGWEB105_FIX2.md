# CGWEB105 FIX2 · DETAIL_HOST_RECOVERY001 / JOIN_PANEL_MOUNT_RETRY001

## Cause

CGWEB105 FIX1 appelait correctement `cgweb105RenderJoinPanel(activity)`, mais
le montage dépendait d'un conteneur supposé `#activityDetail` / `ui.activityDetail`.

Sur le rendu historique courant, ce conteneur n'est pas garanti.

## Correction

- recherche de plusieurs conteneurs de détail connus ;
- récupération heuristique depuis les sections contenant FC / Allure / Matériel / Repères ;
- dernier recours via le bouton `Fermer` ;
- 20 tentatives espacées de 100 ms après `renderDetail()`.

Aucune donnée activité/FIT/route modifiée.

Base rollback : `ad12fda1c1618b5799c4dd9a52415a717b69e334`
