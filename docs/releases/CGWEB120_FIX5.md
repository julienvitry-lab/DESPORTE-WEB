# CGWEB120 FIX5

## HARD_DETAIL_REMOVE001
La ligne historique `detail-summary-row` est masquée directement
dans le HTML source avec verrouillage inline important.

Les IDs historiques sont conservés afin de ne pas casser le renderer.

## EXACT_HEADER_GRID001
Le détail n'essaie plus de rechercher ou de deviner le bandeau
du Répertoire.

Le bandeau est déterministe :

- Date
- Heure
- Distance
- D+
- Temps
- Matériel
- Repères
- Charge

Il utilise exactement la même grille à 10 colonnes que la ligne
d'activité située dessous.

## HEADER_ROW_GAP_2MM001
L'espacement bandeau -> ligne d'activité est fixé à 2 mm.

## YEAR_DATE_HARD_GAP_1MM001
Le vrai `cgweb099-filter-grid` est ciblé directement.

Les deux premiers LABEL sont verrouillés comme Année et Date.

Année = 27 mm.
Date = 40 mm.
Gap réel = 1 mm.
Tous les anciens translations / offsets sont neutralisés.

## PAGES_RECOVERY001
La validation GitHub Pages obsolète est remplacée par une validation
du SPORT Web courant :

- fichiers essentiels ;
- syntaxe JS ;
- fonctions socle ;
- présence CGWEB120 FIX5 ;
- cache-bust.

Le déploiement Pages existant est conservé.

Base :
a1a80fb89337d0b214cac1854123a8cad36b8fd7
