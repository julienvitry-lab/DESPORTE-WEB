# CGWEB129

## DAILY_AGGREGATE001

CGWEB129 travaille uniquement sur les activités de course (`sport = 1`).

Toutes les activités actives de course d'une même date locale sont
agrégées selon le fuseau `Europe/Paris`.

Exemple :

- 7 km le matin
- 6 km le soir

donnent une journée de 13 km.

## DAILY_DISTANCE_THRESHOLD_RANK001

Seuils :

5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200 km.

La comparaison est strictement `>`.

Une journée exactement égale à 10 km ne valide pas le seuil >10 km.

## DAILY_ASCENT_THRESHOLD_RANK001

Seuils :

500, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 7000, 8000,
9000, 10000 m D+.

La comparaison est strictement `>`.

## MULTI_THRESHOLD_CASCADE001

Une journée à 21 km appartient simultanément aux séries :

- >5 km
- >10 km
- >15 km
- >20 km

Même principe pour le D+.

## YEARLY_DAILY_RANK001

Chaque série possède :

- un rang historique global ;
- un rang annuel.

Exemple :

`Jour à plus de 10 km #123 (2026 #17)`

## Persistance

Les résultats sont enregistrés dans les activités de course de la journée :

- `daily_milestone_generated`
- `daily_milestone_lines`
- `daily_milestone_version`
- `daily_milestone_day_key`
- `daily_milestone_distance_m`
- `daily_milestone_ascent_m`
- `daily_milestone_source_hash`

Toutes les activités de course d'une même journée partagent le même
classement quotidien.

## Interface

Un panneau de maintenance est ajouté dans :

`Plus > Repères avancés`

avec :

- Prévisualiser
- Reconstruire les jalons
- Reprendre

La fiche activité dispose d'un panneau `Jalons quotidiens`.

Aucun MutationObserver global n'est ajouté au détail activité.
