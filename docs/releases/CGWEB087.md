# CGWEB087 · FITAUDIT001 / FITGAP001

## But

Diagnostiquer le patrimoine FIT avant toute importation massive.

Le lot est strictement en lecture seule.

## Sources comparées

- `activities`
- `activity_routes`
- `activity_files` / Coffre FIT Cloud

## Indicateurs

- activités actives ;
- FIT Cloud actifs ;
- FIT racines ;
- versions actives ;
- activités avec au moins un FIT lié ;
- activités sans FIT ;
- FIT orphelins ;
- FIT sans `activity_id` ;
- FIT pointant vers une activité inexistante ;
- couverture par année ;
- situation depuis une date choisie.

## FITGAP001

Pour chaque activité sans FIT lié, l'audit recherche sans rien modifier un
FIT orphelin compatible :

- heure de départ dans une fenêtre de ±3 minutes ;
- sport compatible ;
- meilleur candidat = écart temporel minimal.

Le statut devient :

- `LINKED`
- `ORPHAN_CANDIDATE`
- `ABSENT`

## Interface

Dans `Plus > Fichiers > Audit des fichiers FIT` :

- date de départ, par défaut 26/08/2026 ;
- audit ;
- détail récent ;
- activités sans FIT ;
- couverture annuelle ;
- export CSV du rapport affiché.

## Garantie lecture seule

CGWEB087 ne contient :

- aucune écriture dans `activities` ;
- aucun `set`, `update`, `delete` ou `add` dans son bloc backend ;
- aucun backfill ;
- aucun rattachement automatique ;
- aucune régénération FIT.

Le diagnostic précède volontairement toute stratégie de rattrapage des milliers
d'activités historiques.

## Point à surveiller

FITQUICKDOWNLOAD001 charge historiquement jusqu'à 1000 lignes du Coffre pour
son cache rapide. FITAUDIT001 travaille sur l'ensemble du Coffre et signale
`quick_download_limit_risk=true` si le nombre de FIT dépasse 1000.
