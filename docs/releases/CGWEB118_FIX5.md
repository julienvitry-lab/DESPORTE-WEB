# CGWEB118 FIX5

Le test console a retrouvé le bon panneau via Réinitialiser.
Le défaut venait ensuite du ciblage des wrappers : plusieurs champs
pouvaient remonter au même ancêtre.

FIX5 détecte chaque champ depuis son libellé visible exact.

Ordre :
Année / Date / Sport / FIT / Repère / Ordre / Matériel

Recherche :
masquée.

Triangle :
sur la même ligne, à 2 mm des champs.

Les observers/styles FIX3 et FIX4 sont neutralisés au runtime
pour supprimer les conflits et les warnings.

Aucune donnée modifiée.

Base rollback : 839a65866f2d18e517cd3f8d81bac2e36c2d91f4
