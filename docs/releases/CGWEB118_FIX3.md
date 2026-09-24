# CGWEB118 FIX3

Diagnostic :
CGWEB118 FIX2 était bien chargé et son style était présent.
Le problème venait du ciblage DOM de la barre de tri.

Correctif :
- détection depuis les vrais enfants directs de .filters
- fallback depuis input/select
- triangle + contrôles sur une ligne
- Recherche supprimée
- Matériel en dernière position
- largeurs compactes appliquées

Base rollback : cda2cd60470dd375210730bde3bf73a6d15b36d2
