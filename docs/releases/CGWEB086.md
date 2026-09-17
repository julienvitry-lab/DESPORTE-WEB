# CGWEB086 · AUTOEQUIP_PERMANENCE001

Objectif : empêcher la disparition silencieuse de l'affectation automatique
de matériel lors de futurs lots CGWEB.

## Contrat

- L'affectation automatique est branchée au point central `commitWebMutation`.
- Elle s'exécute uniquement lors d'une création d'activité identifiée par
  `metaIncrements.activityCount > 0`.
- Elle couvre donc les nouvelles créations Web qui suivent ce contrat
  (Strava Web, import FIT, ajout manuel, découpes).
- Une édition, restauration ou autre mutation historique ne déclenche pas
  AUTOEQUIP.
- `equipment_manual = 1` est souverain.
- Un `equipment_name` déjà fourni par la source/session n'est jamais écrasé.
- Le resolver existant est réutilisé : profils `WEBEQUIPMAP005`, puis règles
  source/sport/sous-sport exactes et générales.
- La mutation du payload intervient avant `normalizePendingMutation`, donc
  l'affectation est identique en ligne et dans la file hors-ligne.
- Les règles `equipment_mappings` disposent d'un cache local par UID comme
  filet de sécurité.
- Aucun balayage ni remplissage rétroactif automatique n'est ajouté.
- Le bouton explicite « Appliquer à l’historique » reste séparé.

## Pérennité

Le script `scripts/verify-autoequip-permanence.mjs` contrôle le contrat.
Le workflow GitHub Actions `CGWEB086 AutoEquip permanence` échoue si un futur
patch retire le hook, le classifieur WEBEQUIPMAP005, la protection des choix
manuels, ou réintroduit un balayage historique dans ce module.
