# CGWEB091 · FIT_RECONCILE_RESOLVE001 / ORIGINAL_MATCH_REPAIR001 / TRANSFER_AUDIT001

## FIT_RECONCILE_RESOLVE001

Analyse les FIT originaux non liés et propose des activités candidates.

Fenêtres :
- `STRICT_3MIN` : même sport, ±3 minutes ;
- `NEAR_15MIN` : même sport, ±15 minutes ;
- `TZ_SHIFT_±1H/±2H` : décalage de fuseau plausible avec résidu ≤3 minutes ;
- `WIDE_6H` : suggestion manuelle seulement.

Seuls les cas ayant exactement un candidat `STRICT_3MIN` peuvent être
réparés automatiquement.

## ORIGINAL_MATCH_REPAIR001

Le rattachement modifie uniquement `activity_files/{sha256}` :
- `activity_id`
- `link_status=LINKED_REPAIRED`
- stratégie et écart de rapprochement
- anciennes métadonnées de lien
- horodatage de réparation

Aucun document `activities` n'est modifié.

Un rattachement manuel est refusé si le candidat n'appartient pas à une
fenêtre de sécurité date/sport reconnue par CGWEB091.

## TRANSFER_AUDIT001

L'audit Cloud vérifie notamment :
- SHA originaux uniques ;
- SHA canoniques uniques ;
- SHA portant les deux rôles ;
- originaux liés / non liés / pendants ;
- identité comptable `originaux = liés + non liés + pendants` ;
- activités avec plusieurs originaux ;
- originaux supplémentaires sur des activités déjà couvertes ;
- sessions récentes estimées depuis `uploaded_at_ms`.

L'audit local permet de resélectionner le dossier source complet et calcule :
- nombre de fichiers ;
- nombre de SHA uniques ;
- occurrences dupliquées dans le dossier ;
- groupes de doublons SHA ;
- SHA déjà archivés comme originaux dans le Cloud ;
- SHA encore absents ou seulement canoniques.

## Correction du transfert CGWEB090

Avant tout nouveau transfert :
- la queue est dédupliquée localement par SHA-256 ;
- les compteurs d'analyse distinguent fichiers sélectionnés et SHA uniques ;
- le compteur `original_observation_added` s'appuie sur les rôles réellement
  inférés, et non uniquement sur la présence physique de `archive_roles`.

Cela élimine la course possible entre deux workers quand deux fichiers du même
dossier ont exactement le même SHA.

## Invariants

- 0 création d'activité ;
- 0 modification d'activité ;
- 0 suppression de FIT ;
- 0 remplacement de FIT canonique ;
- réparation limitée aux métadonnées de liaison des FIT originaux ;
- audit local sans upload ;
- audit Cloud en lecture seule.
