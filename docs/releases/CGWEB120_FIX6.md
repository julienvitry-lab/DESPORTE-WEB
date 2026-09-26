# CGWEB120 FIX6

## WEB061_BANNER_RETIRE001

Diagnostic confirmé :

le gros bandeau encore visible dans le détail n'était pas
`detail-summary-row`.

Il s'agissait de `#web061SingleMetricRow`, créé historiquement
par WEB061 / DETAILGRID017.

WEB061 fabriquait une ligne comprenant :

- icône sport ;
- Date ;
- Heure ;
- Distance ;
- Durée ;
- D+ ;
- Allure / vitesse ;
- FC moyenne.

CGWEB120 FIX6 neutralise directement les deux fonctions WEB061
responsables de sa création et de son rafraîchissement.

Le nœud résiduel est également supprimé au chargement.

## DETAIL_FINAL_LAYOUT_LOCK001

Le détail final conserve uniquement :

1. navigation ;
2. bandeau texte Date / Heure / Distance / D+ / Temps /
   Matériel / Repères / Charge ;
3. espacement fixe de 2 mm ;
4. vraie ligne de l'activité ;
5. contrôles Matériel / Repères.

Les corrections Année / Date de FIX5 ne sont pas modifiées.

Base :
79c804aabd39e87fb874acaaba0bd34c0969426d
