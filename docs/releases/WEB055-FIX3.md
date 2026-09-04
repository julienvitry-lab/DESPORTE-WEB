# WEB055-FIX3 · GOAL004 / PERF003 / GAP003

## Objectifs
- Distance : barre verte = réalisé réel.
- Distance : barre rouge séparée = cible théorique cumulée du jour, calculée avec un objectif quotidien strictement constant.
- Avance : segment or sur la barre du réalisé au-delà de la cible théorique.
- Les valeurs Distance théoriques et avance/retard sont affichées au kilomètre près.
- Invariant : la cible théorique du jour ne peut pas dépasser l'objectif annuel.
- Un encart identique est ajouté pour le D+ à partir de annual_ascent_m.

## Charge
- La Charge est recalculée depuis les résumés d'activité avec la formule universelle SPORT Android :
  (minutes + 2 × km + D+/100) × facteur FC, borné à 0,75..1,50.
- La comparaison annuelle Charge n'appelle plus activityChargePresentation, absent du Web courant.

## GAP
- Aucun GAP artificiel n'est fabriqué.
- Si le résumé d'activité ne porte pas de GAP, le Web lit les séries gap_sec_per_km publiées dans activity_routes.
- Les activités de l'année courante sont traitées en priorité, puis l'historique pour le Total.
- Le résultat par activité est mis en cache localement dans le navigateur pour éviter de relire les tracés à chaque ouverture.
