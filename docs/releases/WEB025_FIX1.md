# WEB025-FIX1 · cartographie / profil

Correctif ciblé de WEB025.

Cause :
- `escapeHtml(...)` était utilisé par WEB023/WEB024/WEB025 sans définition dans `web/app.js`.
- WEB024 l'appelle au démarrage de `renderCartography()`, ce qui interrompait le rendu avant
  la carte et le profil altimétrique.

Correctif :
- ajout d'une fonction `escapeHtml` commune et sûre ;
- aucune modification Firebase ;
- aucune modification Android ;
- aucune modification du format `activity_routes`.
