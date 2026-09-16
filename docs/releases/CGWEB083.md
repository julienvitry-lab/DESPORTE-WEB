# CGWEB083 · FIX9 · HEADERMEASURE001

## Cause identifiée

Les correctifs précédents modifiaient le header CGWEB083 alors que
`WEB072 FIX11` continuait, après chaque rendu, à :

- remettre `#activityDirectoryHeaderWeb059` en `display:grid !important` ;
- imposer sa propre grille aux lignes ;
- retravailler l'ancien header.

Cela expliquait le double header et les écarts persistants.

## Nouvelle architecture

### 1. Ancien header supprimé

`#activityDirectoryHeaderWeb059` n'est plus créé par WEB059.

`WEB072 FIX11` conserve son rôle utile sur les lignes d'activités
mais ne peut plus créer ou afficher un header.

### 2. Header indépendant

Création de :

`#cgweb083MeasuredActivityHeader`

Il est inséré directement après `#uxSecondaryNav`
(Répertoire / Corbeille), donc avant `<main>`.

### 3. Ancrage sans mouvement initial

Le header possède naturellement 2 mm de marge sous
Répertoire / Corbeille.

Son `top` sticky est calculé sur :

`bottom(Répertoire / Corbeille) + 2 mm`

La position naturelle et le seuil sticky sont donc identiques :
le header n'a aucun déplacement à effectuer au premier scroll.

### 4. Alignement par mesure réelle

Aucune grille théorique n'est utilisée pour les titres.

Après rendu, FIX9 mesure les rectangles des huit `.datum`
de la première `.activity-card` :

- Date
- Heure
- Distance
- D+
- Temps
- Matériel
- Repères
- Charge

Chaque titre reçoit exactement le même `left` et la même `width`
que sa cellule correspondante, puis `text-align:center`.

## Conservé

- espacement vertical 2 mm ;
- Tri des activités sous le header ;
- 100 activités au démarrage ;
- ancre « Afficher 20 de plus » ;
- pictogramme FIT FIX4 ;
- pipeline FIT ;
- backend et Firestore inchangés.
