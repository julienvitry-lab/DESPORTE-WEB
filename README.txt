WEB042 · WEBSTRAVA003 — correctif workflow GitHub Actions

Le code WEBSTRAVA003 est déjà dans functions/index.js + web/app.js + web/index.html.
Le run #50 échoue uniquement parce que .github/workflows/web.yml valide encore le marqueur WEB041 · WEBSTRAVA002.

À faire dans GitHub :
1. Ouvrir DESPORTE-WEB/.github/workflows/
2. Remplacer le fichier web.yml existant par le web.yml fourni ici.
3. Commit suggéré : WEB042 corrige workflow WEBSTRAVA003

Le nouveau workflow doit s'appeler : Publier SPORT Web · WEB042
L'étape doit s'appeler : Valider WEB042
