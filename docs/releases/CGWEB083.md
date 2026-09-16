# CGWEB083 · ACTIVITYDIRECTORYUX003 · FIX3

## Répertoire Activités

### Affichage initial
100 dernières activités.

### Afficher 20 de plus
La position verticale du navigateur est conservée exactement :
- mémorisation de `window.scrollY` ;
- suppression du focus du bouton avant rerender ;
- aucun `scrollIntoView` ;
- restauration immédiate puis sur deux frames supplémentaires.

L'utilisateur reste donc exactement à l'endroit où il était avant de demander 20 activités supplémentaires.

### Titres
- Date : +2 mm ;
- Temps : -1 mm ;
- Matériel : +2,5 cm ;
- Repères : -1 cm ;
- Charge : +1 cm.

### FIT
- bureau : 13 × 13 px ;
- petit écran : 12 × 12 px ;
- disponible : couleur d'origine ;
- indisponible : gris discret ;
- aucune barre.

## Données
Backend, activités et pipeline FIT inchangés.
