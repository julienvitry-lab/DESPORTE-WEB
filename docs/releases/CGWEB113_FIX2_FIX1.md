# CGWEB113 FIX2 FIX1

Modules :

- LEGACY_CANONICAL_ROLE_INFERENCE001
- RESOLVER_ROLE_FALLBACK001
- NO_FILENAME_ONLY_TRUST001
- DRY_RUN_ROLE_DIAGNOSTIC001

Le rôle est désormais recherché dans l'ordre suivant :

1. role / fit_role explicite ;
2. c096RoleLabel() / CGWEB090 ;
3. inférence legacy gardée si le rôle reste UNKNOWN.

L'inférence legacy exige simultanément le code C, un activity_id, le lien réel
avec l'activité, un objet Storage résolu et la sélection exacte du document
par c096ResolvePreferred().

Le nom seul n'est jamais suffisant.

Le contrôle du timestamp interne du FIT à ±1 seconde reste obligatoire avant
repairable=true.

Aucune réparation historique n'est exécutée automatiquement.

Base rollback : 73fbae0a87a0943290e09bb44e369b813e6f1a73
