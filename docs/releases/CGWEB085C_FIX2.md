# CGWEB085C FIX2 · SYNTAXFIX001

Correction de trois doublons `async async` dans `web/app.js`.

Fonctions corrigées :
- `cgweb084FetchPeriodActivities`
- `cgweb084ExportPeriod`
- `cgweb084LoadRouteThumbnail`

Origine :
le helper de remplacement ciblait la sous-chaîne `function nom(` d'une fonction déjà déclarée `async function`.
Le remplacement réinjectait ensuite `async function`, laissant le premier `async` en place.

Conséquence :
Chrome arrêtait le parsing de `app.js` avec `Unexpected token 'async'`.
L'application restait sur l'écran non connecté et aucun module métier ne s'initialisait.

Le correctif ne modifie aucune logique métier de :
- CGWEB085A · FITEDITOR001
- CGWEB085B · FULLARCHIVE001
- CGWEB085C · MAPTHUMB002
- Header083
