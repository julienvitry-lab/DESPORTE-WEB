# CGWEB120 FIX10

## STRAVA_DUPLICATE_ENRICH001

Une activité Strava reconnue comme doublon n'est plus simplement
ignorée.

Avant :
- détection activité SPORT existante ;
- skipped++ ;
- continue ;
- aucun strava_activity_id ;
- aucun activity_routes.

Après :
- détection activité SPORT existante ;
- récupération du détail et des streams Strava ;
- ajout du strava_activity_id à l'activité existante ;
- création / réparation de activity_routes ;
- aucune nouvelle activité créée ;
- puis skip normal du doublon.

## ROUTE_SELF_REPAIR001

À l'ouverture d'un détail sans route :

1. activity_routes existant ;
2. récupération historique ;
3. recherche Strava exacte ;
4. recherche Strava par le moteur anti-doublon existant ;
5. enrichissement de l'activité SPORT ;
6. persistance activity_routes ;
7. FIT Cloud en dernier secours ;
8. rendu immédiat carte + profil.

Une correspondance Strava ambiguë n'est jamais liée automatiquement.

## FIT_MODULE_BRIDGE001

app.js n'accède plus directement à VAULT_URL.

fitcloud.js expose désormais :

SPORT_DIRECTORY_FIT.fetchBlob(activityId)

Cette API utilise le même endpoint sécurisé
directory_fit_direct_download que le téléchargement FIT existant,
mais retourne le Blob en mémoire au moteur cartographique.

Aucun téléchargement visible n'est déclenché.

Base :
26156ab394d16c1ad87f33b076b81e1a20f9e0ee
