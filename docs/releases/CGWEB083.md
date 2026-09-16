# CGWEB083 · FIX6 · ACTIVITYHEADER002

## Reprise propre après la régression FIX5

FIX5 est supprimé.

La correction ne dépend plus de `body.ux-activities-page`.

## Barre de titre

La barre réelle `#activityDirectoryHeaderWeb059` est restaurée :

- hauteur : 34 px ;
- fond opaque ;
- bord supérieur et inférieur ;
- `position: sticky` ;
- offset : `--web059-sticky-top`.

## Décalages horizontaux

Appliqués après chaque reconstruction du header avec `style.setProperty(..., "important")` :

- Date : +2 mm ;
- Temps : -1 mm ;
- Matériel : +2,5 cm ;
- Repères : -1 cm ;
- Charge : +1 cm.

Le moteur historique `v083NudgeDirectoryHeaders` délègue maintenant à FIX6 et ne peut plus annuler ces positions.

## Espacement vertical

`#activityDirectorySection` devient une pile verticale explicite avec `gap: 2 mm`.

Les marges historiques des enfants directs sont neutralisées.

Le bandeau replié « Tri des activités » reçoit une hauteur compacte de 34 px afin de supprimer toute zone vide fantôme.

## Conservé

- 100 activités au démarrage ;
- « Afficher 20 de plus » sans saut de scroll ;
- pictogramme FIT FIX4 ;
- pipeline FIT ;
- backend et Firestore inchangés.
