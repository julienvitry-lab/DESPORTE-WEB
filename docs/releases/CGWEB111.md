# CGWEB111

Modules :

- DETAIL_LIGHTNING_REMOVE001
- METRIC_CHART_STROKE_FIX001
- HR_CHART_VISIBILITY002
- PACE_CHART_VISIBILITY002
- DETAIL_DISCLOSURE_COMPACT001
- DETAIL_DISCLOSURE_RESET001
- HOSTING_ONLY001
- ROLLBACK_READY001

## Éclair FC

Le badge indoor WEB071 est supprimé uniquement de la fiche détaillée.
Le Répertoire n'est pas modifié.

## Graphiques FC / Allure

Le renderer CGWEB101 produit bien le SVG, sa grille et sa polyline.

La feuille de style imposait cependant :

```css
.metric-chart-line {
  stroke: var(--accent);
}
```

alors qu'aucune variable CSS `--accent` n'est définie dans le thème actif.
La déclaration CSS pouvait donc neutraliser le `stroke` ajouté directement
sur la polyline par CGWEB101.

CGWEB111 donne maintenant explicitement à la courbe :

```css
stroke: var(--green,#b6ff3b)
```

et force la polyline CGWEB101 visible.

## Fiche activité compacte

Ces six blocs sont fermés par défaut à l'ouverture d'une activité :

1. Ascensions et descentes
2. Analyse par kilomètre
3. Analyse performance et terrain
4. Édition réversible de l’activité
5. Historique des modifications
6. Modifier le fichier FIT

L'ouverture d'un menu ne change aucune donnée. Lorsqu'une autre activité est
ouverte, ces menus repartent fermés.

Aucune activité, aucun FIT, aucun objet Storage, aucune route et aucune
Function backend ne sont modifiés.

Base rollback : `62b556387807ff74bfc5b2b773d5df38889c9dc3`
