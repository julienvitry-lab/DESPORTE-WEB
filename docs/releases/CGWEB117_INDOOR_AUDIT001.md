# CGWEB117 · INDOOR_AUDIT001

Audit strictement en lecture seule.

Objectif :
identifier les activités Course / Vélo que WEB071 affiche comme indoor
alors que leurs métadonnées présentent des signaux outdoor contradictoires.

L'audit détaille la cause de classification indoor :

- flags indoor / trainer / virtual
- profil matériel
- règle de mapping
- matériel associé à un profil indoor unique
- sub_sport
- métadonnées textuelles

Il recherche aussi les signaux outdoor :

- gps_point_count
- sub_sport explicitement outdoor
- profil RUN / TRAIL / BIKE / MTB
- présence d'une vraie activity_routes

Aucune correction automatique.
Aucune écriture Firestore.
Aucune écriture Storage.

Commande :

    await window.CGWEB117_INDOOR_AUDIT()

Résultat :

    window.CGWEB117_LAST_AUDIT

Export CSV des cas contradictoires :

    window.CGWEB117_EXPORT_CSV()

Base rollback : ec381c69a597a34100fa849a037fec2c2eebaa10
