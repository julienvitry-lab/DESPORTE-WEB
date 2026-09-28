# CGWEB121 FIX7

Modules :
- EQUIPMENT_USAGE_CANONICAL_MATCH001
- ACTIVITY_EQUIPMENT_AUDIT001
- USAGE_RECOUNT001

Objet :
Recalculer l'usage du matériel à partir des activités réellement affectées.

Correspondance :
1. identifiant matériel exact ;
2. sinon equipment_name normalisé exact et unique ;
3. aucun fuzzy matching.

Sécurité :
- aucune écriture Firestore ;
- aucune modification FIT ;
- aucune modification des activités ;
- dédoublonnage en mémoire ;
- protection contre un historique partiellement chargé.

Base :
ca88bbcc57840ba6ecde8b8e9aed6de050fdd0d3
