# WEB050 · BASELINELOCK001

Baseline de non-régression.

Le JavaScript est restauré depuis `e49efef`, dernier état constaté avec
authentification opérationnelle avant FIXUI003.

Contrats désormais figés :
- authDomain `sport-505813.firebaseapp.com`
- Google via `signInWithPopup`
- aucun `signInWithRedirect`
- aucun `getRedirectResult`
- aucun `MutationObserver`
- aucun `async async`
- WEBEQUIPMAP002 conservé
- WEBSTRAVA003 conservé
- WEBSPLIT003 conservé

Les futures évolutions UI doivent passer ce contrat avant commit et déploiement.
