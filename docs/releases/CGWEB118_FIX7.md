# CGWEB118 FIX7

Correctif du double affichage du catalogue Activités.

Diagnostic :
- 100 cartes DOM pour 50 activités uniques ;
- paires avec le même activity_id ;
- aucune duplication Firestore démontrée ;
- loadNextPage empilait les documents avec activities.push().

Correctif :
- invariant strict : 1 entrée mémoire par activityKey ;
- loadNextPage utilise un upsert Map ;
- garde-fou avant filteredActivities ;
- aucune écriture Firestore ;
- aucun changement Storage ;
- bandeau de tri volontairement non modifié.

Base rollback : b00d9782c14eaac222aa307e99f7c3c76c1c1ba5
