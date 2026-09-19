# CGWEB099 FIX3 · DIRECTORY_COMPACT_UI001 / DUPLICATE_AUDIT_TO_PLUS001 / SUMMARY_SINGLE_MARKER001 / ROLLBACK_READY001

## Objectif

Finaliser l'interface après CGWEB099 FIX2, sans toucher au moteur global ni aux
activités.

## DIRECTORY_COMPACT_UI001

Le conteneur global du Répertoire ne réserve plus de hauteur vide entre la
pagination globale et le tableau historique.

Les marges / paddings / min-height hérités de l'ancienne double-table sont
neutralisés uniquement dans le bloc CGWEB099.

## DUPLICATE_AUDIT_TO_PLUS001

Le panneau `Audit des doublons d’activités` est retiré du Répertoire.

Il est déplacé dans :

`Plus > Fichiers`

Le moteur d'audit et son bouton sont inchangés. Il s'agit uniquement d'un
déplacement DOM / UI.

Si le panneau Fichiers n'est pas encore résolu au premier rendu, un
MutationObserver le rattache dès que le panneau apparaît.

## SUMMARY_SINGLE_MARKER001

Pour le menu déroulant restant dans le Répertoire :

- le triangle natif plein de gauche est conservé ;
- le chevron / triangle généré à droite par `summary::after` est supprimé.

## ROLLBACK_READY001

Le commit de base est enregistré dans le document de release et le package est
livré avec un script de rollback dédié.

Aucune activité, aucun FIT et aucune Function backend ne sont modifiés.

## Base de rollback

`139cc7ea4043129d9ffb7cd648c624df766b3c34`
