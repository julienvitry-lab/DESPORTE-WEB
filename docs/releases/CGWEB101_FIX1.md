# CGWEB101 FIX1 · ACTIVITY_SERIES_BINDING001 / METRIC_ROUTE_READY001 / HR_CHART_RESTORE001 / PACE_CHART_RESTORE001 / SVG_LINE_VISIBILITY001

## Diagnostic

Trois fragilités ont été confirmées dans le chemin des graphiques de détail.

### 1. Course entre ouverture du détail et chargement du tracé

`renderDetail()` lance `renderCartography(activity)` sans l'attendre.

`renderCartography()` charge ensuite `activity_routes` de façon asynchrone et
ne renseigne `activeRoute` qu'après le retour Firestore.

Les boutons Allure / FC sont cependant utilisables immédiatement.

`renderMetricChart()` lisait donc `activeRoute` de façon synchrone, ce qui
permettait un graphique vide si l'utilisateur cliquait avant la fin du
chargement cartographique.

### 2. Séries trop dépendantes des tableaux raw

`normalizeRoute()` produit déjà des points normalisés contenant :

- `timeMs`
- `heartRateBpm`
- `speedMps`
- `distanceMeters`

Mais `metricSeriesFromRoute()` privilégiait exclusivement les tableaux `raw`
pour FC / vitesse / temps.

FIX1 utilise maintenant les points normalisés comme source de secours à chaque
index.

### 3. Courbe SVG dépendante de la feuille de style

La grille et les libellés SVG étaient créés, puis la courbe sous la forme d'un
`polyline` uniquement classé `metric-chart-line`.

FIX1 rend le trait explicitement visible dans le SVG lui-même :

- `fill="none"`
- `stroke="#a7ff2a"`
- `stroke-width="2.4"`
- `stroke-linejoin="round"`
- `stroke-linecap="round"`
- `vector-effect="non-scaling-stroke"`

La courbe ne dépend donc plus d'une règle CSS historique pour être visible.

## METRIC_ROUTE_READY001

Si `activeRoute` n'est pas encore prêt lors du clic sur Allure / FC, le Web
charge directement le bon `activity_routes` à partir de :

1. `activity.id`
2. `activity.__docId`
3. `activityKey(activity)`

Aucune donnée n'est écrite.

## Données

Aucune activité modifiée.
Aucun FIT modifié.
Aucune Function backend modifiée.

## Base de rollback

`e718a57d84b280df282e4e98f7cd0ba1f756d28a`
