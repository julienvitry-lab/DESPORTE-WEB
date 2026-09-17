# CGWEB090 · HISTORICAL_FIT_TRANSFER001 / FIT_RECONCILE001

## But

Après CGWEB088, toutes les activités disposent d'un FIT, mais certains de ces
fichiers sont des reconstructions canoniques SPORT et non les originaux
historiques.

CGWEB090 transfère les archives FIT historiques tout en conservant les
canoniques déjà présents.

## HISTORICAL_FIT_TRANSFER001

Le nouvel écran `Plus > Fichiers > Transfert FIT historiques` permet :

- sélection d'un dossier entier de FIT ;
- sélection de fichiers FIT individuels ;
- calcul SHA-256 local ;
- préflight Cloud par paquets de 100 ;
- non-envoi des originaux déjà archivés ;
- envoi uniquement des fichiers nouveaux ou des doublons canoniques qui doivent
  recevoir la provenance `ORIGINAL_HISTORICAL` ;
- deux transferts simultanés maximum ;
- arrêt propre après les requêtes en cours ;
- reprise après interruption en resélectionnant le même dossier.

La reprise est idempotente : le préflight SHA-256 reconnaît les fichiers déjà
transférés et ne les renvoie pas.

## Provenance multi-rôles

Un même binaire SHA-256 peut représenter plusieurs observations de provenance.

Si un original historique est bit-à-bit identique au FIT canonique déjà présent,
le fichier n'est pas dupliqué dans Storage. Son document
`activity_files/{sha256}` conserve néanmoins les deux rôles.

Le champ historique `source` n'est plus écrasé lors d'une déduplication.
Les champs suivants conservent l'historique de provenance :

- `archive_roles`
- `observed_sources`
- `observed_modes`
- `historical_original_names`
- `has_original_archive`
- `has_canonical_archive`

## FIT_RECONCILE001

La réconciliation est en lecture seule.

Elle calcule notamment :

- activités actives ;
- activités avec au moins un FIT ;
- activités avec au moins un original ;
- activités original + canonique ;
- activités uniquement canoniques ;
- activités uniquement originales ;
- activités sans FIT ;
- FIT originaux ;
- canoniques issus du backfill ;
- canoniques générés ;
- versions éditées ;
- originaux non liés ;
- originaux ambigus ;
- liens vers des activités absentes.

## Garde-fous

- 0 activité créée ;
- 0 activité modifiée ;
- aucun FIT canonique supprimé ;
- aucun FIT canonique remplacé ;
- déduplication exacte par SHA-256 ;
- Storage privé conservé ;
- CGWEB089 reste l'organisation de l'interface Fichiers.
