# CGWEB107 · FIT_SIGN_URL_FORENSICS001 / SIGN_ERROR_DETAIL001 / STORAGE_OBJECT_VERIFY001

Diagnostic strictement en lecture seule des erreurs SIGN_URL_ERROR.

- vérifie l'objet Cloud Storage ;
- lit ses métadonnées techniques ;
- teste une signature V4 minimale ;
- teste une signature V4 avec Content-Disposition attachment ;
- classe l'erreur de signature ;
- affiche automatiquement le détail dans le bandeau du Répertoire ;
- expose le dernier diagnostic dans window.CGWEB107_LAST_SIGN_FORENSICS ;
- ne renvoie jamais l'URL signée du test forensic ;
- ne modifie aucune activité, aucun FIT et aucune route.

Base rollback : d36bf46ce70e2098f9a2769b7808920bf623de56
