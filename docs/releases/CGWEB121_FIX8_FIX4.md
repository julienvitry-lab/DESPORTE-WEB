# CGWEB121 FIX8 FIX4

Modules :

- HAS_FIT_PLAN_SHA_RECOVERY001
- FIT_BLOB_TIME_DECODE001
- EDITOR_UNLOCK_FROM_BACKEND001

## Problème

FIX8 FIX3 pouvait afficher `FIT existant à récupérer` lorsque le backend
MISSING_FIT répondait `HAS_FIT`, mais le frontend ne retrouvait pas le même
fichier dans ses listes de coffre.

Or le backend `missing_fit_plan` renvoie déjà, pour un `HAS_FIT`, le SHA exact
et le nom du FIT lié.

## Correction

FIX8 FIX4 utilise directement cette référence backend comme autorité :

1. appel du plan MISSING_FIT ;
2. si `HAS_FIT`, récupération de `sha256` / `file_name` ;
3. téléchargement du FIT exact par SHA ;
4. décodage du vrai `start_time_ms` depuis le contenu FIT si nécessaire ;
5. déverrouillage de `Modifier réellement le FIT` ;
6. FITEDITOR001 crée ensuite une nouvelle version depuis ce parent exact.

Aucune heuristique de date ou de sport n'est utilisée pour cette voie.

## Sécurité

- aucun FIT inventé ;
- SHA fourni par le backend comme lien exact ;
- heure source décodée depuis le vrai fichier lorsque nécessaire ;
- FIT parent conservé ;
- aucune Functions nouvelle.

Base :

ca5d88055a9a6aa3e0fd6e2d5991871762ef6f96
