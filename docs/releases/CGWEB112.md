# CGWEB112

Modules :

- FIRST_DISPLAY_FIT_ENSURE001
- LAZY_CANONICAL_PROVISIONING001
- FIT_IDEMPOTENCE001
- STORAGE_RECHECK001
- NO_PERPETUAL_BACKFILL001
- ROLLBACK_READY001

Lors du premier affichage d'une activité dans le Répertoire :

1. CGWEB110 vérifie la vérité de téléchargement FIT.
2. Si le FIT est disponible : aucune écriture.
3. Si le statut est strictement NO_LINKED_FILE, CGWEB112 appelle ensure_activity_fit.
4. Le backend acquiert un lease transactionnel par activité.
5. Sous lease, il recontrôle l'absence de FIT.
6. Si les données sont suffisantes, le writer canonique existant génère le FIT.
7. Storage est recontrôlé avant d'annoncer le succès.
8. L'icône de téléchargement devient disponible sans rattrapage manuel.

Sécurité :

- aucune génération si une métadonnée FIT existe mais que Storage est non résolu ;
- une seule tentative automatique par activité et par session de page ;
- maximum 4 assurances lancées par passage de rendu ;
- aucune activité modifiée ;
- aucun FIT existant remplacé ;
- idempotence inter-onglets/appareils via lease Firestore ;
- aucune campagne globale de rattrapage automatique.

Base rollback : 61773fc75082aeca5a90c67d76bb163aabf4a486
