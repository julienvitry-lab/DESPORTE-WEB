# CGWEB111 FIX3

- PERFORMANCE_DISCLOSURE_PARITY001
- SAME_DAY_JOIN_DISCLOSURE001
- CARTOGRAPHY_DISCLOSURE_EXTRACT001
- BOTTOM_DETAIL_STACK001
- DISCLOSURE_ORDER001
- DISCLOSURE_RESET002
- HOSTING_ONLY001
- ROLLBACK_READY001

Ordre du bas de fiche :

1. Ascensions et descentes
2. Analyse par kilomètre
3. Analyse performance et terrain
4. Édition réversible de l’activité
5. Historique des modifications
6. Modifier le fichier FIT
7. Joindre des activités du même jour

Les trois analyses sont déplacées hors du cadre Carte et profil altimétrique.
Le panneau CGWEB105 reste fonctionnel mais devient un menu déroulant fermé par défaut.
Les nœuds DOM existants sont déplacés, pas recréés : IDs et écouteurs sont conservés.
À chaque changement d'activité, les sept menus repartent fermés.

Aucune activité, aucun FIT, aucun objet Storage, aucune route et aucune Function backend ne sont modifiés.

Base rollback : `3d9b04601d3005e0d231e23a14fb8e15714eab26`
