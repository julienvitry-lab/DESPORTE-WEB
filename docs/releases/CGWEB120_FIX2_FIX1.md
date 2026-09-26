# CGWEB120 FIX2 FIX1

## FILTER_GROUP_SHIFT_05MM001

Les filtres situés après Année sont décalés ensemble de 0,5 mm vers la droite.

Aucune largeur de champ n'est modifiée.

## DETAIL_HEADER_MIRROR001

Le détail d'une activité reprend le bandeau de titres du répertoire.

Le runtime recherche d'abord le vrai bandeau présent dans la rubrique Activités.

Si celui-ci n'est pas disponible, un bandeau de repli est construit depuis la structure exacte de la ligne d'activité clonée.

## OLD_DETAIL_STATS_REMOVE002

L'ancien bandeau de statistiques du détail reste hors rendu et ne réserve plus d'espace.

## DETAIL_EXACT_ROW_MIRROR002

La ligne affichée sous le bandeau de titres reste la vraie carte du répertoire déjà clonée par CGWEB120 FIX1.

Aucune seconde reconstruction manuelle des colonnes n'est introduite.

## DETAIL_GAP_2MM004

Navigation vers bandeau du répertoire : 2 mm.

La ligne d'activité conserve ensuite 2 mm avant les contrôles Matériel / Repères.

## CSS_RULE_MIRROR_ONLY001

Le rendu est obtenu par lecture ponctuelle des règles CSS et remplacement de leur portée vers le détail.

Aucune mesure dynamique des dimensions de chaque cellule n'est nécessaire.

## PERFORMANCE_GUARD003

- aucun nouvel observateur DOM permanent ;
- aucun polling permanent ;
- aucune boucle déclenchée à chaque mutation ;
- une seule ligne d'activité clonée ;
- recherche du bandeau réel mise en cache après le premier succès ;
- Functions inchangées ;
- Firestore inchangé ;
- Storage inchangé ;
- Hosting uniquement.

Base :

272af874bd84adb8ebec47fdfd06818646b40d2c
