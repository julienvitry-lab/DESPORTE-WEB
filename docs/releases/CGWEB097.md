# CGWEB097 FIX2 · SCOPED_TEMPLATE_GUARD001 / FIT_ORIGIN_VISUAL001 / CANONICAL_ACTIVITY_AUDIT001 / DOWNLOAD_STATE_TRUTH001

## SCOPED_TEMPLATE_GUARD001

FIX1 corrigeait bien le template literal imbriqué du nouveau bloc CGWEB097,
mais son garde de validation recherchait ensuite la chaîne

`${ROOT}/${uid}/activities`

dans l'intégralité de `functions/fitvault.js`.

Cette chaîne existe déjà légitimement dans d'anciens blocs de FIT Vault.
Le garde produisait donc un faux positif et interrompait le script avant commit.

FIX2 limite désormais ce contrôle au seul bloc :

`CGWEB097_FIT_ORIGIN_HELPERS_START` → `CGWEB097_FIT_ORIGIN_HELPERS_END`

La construction CGWEB097 attendue reste :

`ROOT + "/" + uid + "/activities"`

Les usages historiques extérieurs à CGWEB097 ne sont pas modifiés.

## Objectif

CGWEB096 a démontré que les 6339 activités actives sont physiquement
téléchargeables :

- 6270 via un FIT ORIGINAL ;
- 69 via un FIT CANONICAL ;
- 0 absent ;
- 0 ambigu.

CGWEB097 rend cette provenance visible et audite la période
26/08/2026 → 14/09/2026, correspondant à la période où les originaux
n'avaient pas pu être récupérés depuis le téléphone alors que les statistiques
d'activité étaient présentes.

## CANONICAL_ACTIVITY_AUDIT001

Endpoint lecture seule `fit_origin_audit` :

- liste les activités dont le resolver CGWEB096 choisit CANONICAL ;
- retourne date, titre, nom de fichier et méthode de résolution ;
- calcule le nombre de canoniques du 26/08 au 14/09.

## DOWNLOAD_STATE_TRUTH001

Endpoint lecture seule `directory_fit_states` :

- reçoit jusqu'à 250 activity_id ;
- retourne ORIGINAL / CANONICAL / ABSENT selon le resolver physique CGWEB096 ;
- aucune écriture Firestore / Storage.

## FIT_ORIGIN_VISUAL001

Dans Activités > Répertoire :

- ORIGINAL : bouton actif normal ;
- CANONICAL : bouton actif avec liseré pointillé + badge C ;
- ABSENT : bouton grisé/inactif.

Le tooltip indique :
- Télécharger le FIT original
- Télécharger le FIT canonique reconstruit
- FIT non résolvable

Le clic reste celui du resolver CGWEB096.

## Important

Un FIT CANONICAL n'est pas un FIT manquant.

Il s'agit d'un FIT déjà reconstruit à partir des données d'activité conservées
par SPORT Web et stocké physiquement dans le Cloud. CGWEB096 l'a vérifié comme
téléchargeable.

CGWEB097 n'essaie pas de recréer l'original Garmin/Strava octet pour octet :
sans le fichier source brut, cela n'est pas possible. Il identifie précisément
les activités pour lesquelles l'original a disparu mais pour lesquelles un FIT
canonique exploitable existe.
