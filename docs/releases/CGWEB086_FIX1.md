# CGWEB086 FIX1 · AUTOEQUIP_FINALIZE001

## Cause corrigée

AUTOEQUIP_PERMANENCE001 dépendait trop directement du resolver général
au moment de l'écriture. Une activité déjà reconnue comme Trail pouvait donc
être créée sans matériel si la règle de profil n'était pas retrouvée par ce
chemin précis.

## Nouveau contrat

La création d'une activité passe par une finalisation juste avant la
persistance :

1. classification sport / sous-sport déjà normalisée ;
2. détermination du profil matériel ;
3. recherche DIRECTE de la règle de profil WEBEQUIPMAP005 ;
4. fallback sur les anciennes règles exactes/générales ;
5. application du matériel ;
6. seulement ensuite création du payload Firestore / changes.

Le profil TRAIL garde en plus un filet de sécurité explicite pour la signature
confirmée `sport=1 / sub_sport=3` (et compatibilité sub_sport 6 / métadonnée
Trail).

## Priorités

- `equipment_manual=1` : jamais écrasé ;
- matériel déjà fourni : jamais écrasé ;
- règle de profil WEBEQUIPMAP005 ;
- règle legacy ;
- sinon aucun matériel.

## Historique

Aucun `loadAllActivities()` et aucun backfill automatique ne sont ajoutés.
Le bouton explicite d'application à l'historique reste séparé.

## Non-régression

Le workflow GitHub Actions exécute désormais un test fonctionnel synthétique :

`Trail (sport 1 / sub_sport 3) -> règle PROFILE_WEB058_TRAIL -> matériel`

Le workflow échoue si ce contrat disparaît.
