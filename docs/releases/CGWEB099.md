# CGWEB099 · GLOBAL_DIRECTORY_QUERY001 / ACTIVITY_DUPLICATE_AUDIT001 / FIT_DOWNLOAD_EXECUTE001

## GLOBAL_DIRECTORY_QUERY001

Le Répertoire historique ne doit plus filtrer uniquement les lignes déjà
chargées dans le navigateur.

CGWEB099 ajoute un Répertoire global dont les filtres interrogent les activités
actives complètes côté serveur.

Comportement :

- 100 lignes par défaut ;
- choix 50 / 100 / 200 ;
- Année disponible dès l'ouverture sur l'ensemble de la base ;
- sport ;
- matériel ;
- repère ;
- recherche textuelle ;
- ordre récent / ancien ;
- pagination Précédent / Suivant ;
- aucune nécessité de « Charger tout ».

Le backend conserve un cache mémoire de 60 secondes par utilisateur afin
d'éviter de rescanner Firestore à chaque clic.

Le bouton « Actualiser la base » force un nouveau scan.

## ACTIVITY_DUPLICATE_AUDIT001

Audit en lecture seule.

Les paires sont classées :

- `EXACT` :
  même ID externe, ou heure presque identique + distance/durée/D+ extrêmement
  proches ;
- `PROBABLE` :
  même sport, départ à moins de 90 secondes, distance/durée/D+ proches.

Aucune activité n'est supprimée, fusionnée ou modifiée.

Cet audit porte sur les doublons d'ACTIVITÉS et non sur les doublons de
fichiers FIT.

## FIT_DOWNLOAD_EXECUTE001

Le resolver CGWEB096 reste la source de vérité pour ORIGINAL / CANONICAL.

Le téléchargement est exécuté ainsi :

1. `activity_id` ;
2. `SPORT_DIRECTORY_FIT.resolve()` ;
3. signed URL CGWEB096 ;
4. tentative `fetch` → Blob → URL locale → attribut `download` ;
5. secours par navigation directe vers la signed URL déjà générée avec
   `Content-Disposition: attachment`.

Le secours n'utilise pas `target=_blank`, afin d'éviter le blocage par le
gestionnaire de fenêtres surgissantes.

Le handler exact CGWEB096 est recâblé vers `cgweb099Download`.

## Sécurité

- aucune suppression de doublon ;
- aucun backfill ;
- aucun FIT remplacé ;
- aucune activité modifiée ;
- l'audit doublons et les requêtes Répertoire sont en lecture seule.
