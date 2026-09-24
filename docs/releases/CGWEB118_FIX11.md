# CGWEB118 FIX11

## EQUIPMENT_TYPE_TOGGLE001
Deux boutons supérieurs :
- Chaussures
- Vélo

Chaussures est sélectionné par défaut.
Le bouton Vélo regroupe les catégories BIKE et HOME_TRAINER.

## ACTIVE_ONLY001
Seuls les matériels ACTIVE sont rendus dans Gestion.
Le menu de statut historique est masqué et forcé sur ACTIVE.

## EQUIPMENT_SINGLE_ROW001
Chaque matériel tient sur une seule ligne :
Nom | Distance | Temps | D+ | Modifier

La mention catégorie / statut / nombre d'activités est masquée.

## STATUS_ACTIONS_IN_EDITOR001
Les boutons Réserve / Archiver / Activer sont retirés des cartes.
Le changement de statut reste disponible dans Modifier via
le champ equipmentStatusInput déjà existant :
ACTIVE / STORED / RETIRED.

## EQUIPMENT_COMPACT001
Hauteur et espacements des cartes réduits.
Statistiques aplaties sans sous-cartes verticales.

## Sécurité
- données et logique d'édition existantes conservées ;
- + Nouveau matériel conservé ;
- FIX10 conservé ;
- FIX9 FIX2 conservé ;
- FIX7 dédoublonnage conservé ;
- aucune migration Firestore ;
- Storage inchangé ;
- Hosting uniquement.

Base rollback : 7bb4840c08296ca6e98047156ef44966526f10d5
