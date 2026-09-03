# WEB051 · UIONLY001B

Évolution d'interface sans modification du mécanisme d'authentification.

- empreinte SHA-256 Auth avant/après strictement identique
- aucun fichier temporaire `/tmp` utilisé
- un seul badge `Connecté` / `Non connecté`
- `Connecté` si Google/Firebase + Strava + réseau sont opérationnels
- vert si connecté, rouge sinon
- sélecteur Apparence déplacé dans `Plus > Apparence`
- même `#appearanceSelect`, logique de thème inchangée
- TDZFIX001 conservé
- WEBEQUIPMAP002 conservé
- WEBPERF001 conservé
