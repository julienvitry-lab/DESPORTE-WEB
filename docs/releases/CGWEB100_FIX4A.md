# CGWEB100 FIX4 · STRICT_AUTOSPLIT_POLICY001 / SPLIT_REASON_FORENSICS001 / SESSION_BOUNDARY_TRUTH001 / SEGMENT_LAP_GUARD001 / IMPORT_ABORT_GUARD001 / FIT_IMPORT_ATOMICITY001

## Cause structurelle identifiée

Le pipeline WEBIMPORT appelle `automaticSplitPartsFromRawRoute()` :

- pendant `prepareWebImportCandidate()` pour la prévisualisation ;
- puis dans `commitOneWebImport()` avant l'écriture.

Le premier appel est en lecture seule : il ne crée pas d'activité.

Le découpage réel provient de `detectAutomaticSplitBoundariesFromPoints()`.

Avant FIX4, cette fonction autorisait notamment :

- `PAUSE_OVER_THRESHOLD / TIMESTAMP_JUMP` ;
- `PAUSE_OVER_THRESHOLD / INACTIVE_SIGNAL` ;
- `PAUSE_OVER_THRESHOLD / DISTANCE_PLATEAU` ;
- `SPORT_CHANGED` ;
- `SUB_SPORT_CHANGED` ;
- `EQUIPMENT_CHANGED`.

L'interface présentait d'ailleurs explicitement :
« GAP > 15 min et/ou changement de sport, sous-sport ou matériel ».

Ce comportement est plus large que la règle souhaitée.

## STRICT_AUTOSPLIT_POLICY001

À partir de FIX4, une coupure automatique n'est conservée que pour :

1. `SPORT_CHANGED` ;
2. `PAUSE_OVER_THRESHOLD` uniquement si `gap_kind === "TIMESTAMP_JUMP"`
   et si `gap_ms > WEB_SPLIT_AUTO_GAP_MS`.

Sont donc refusés comme raisons autonomes :

- immobilité détectée par vitesse / moving ;
- plateau de distance ;
- changement de sous-sport ;
- changement de matériel ;
- lap / segment_lap / auto_lap ;
- tout autre signal non explicitement autorisé.

Un arrêt long pendant lequel le FIT continue à fournir des points n'est plus
assimilé à un « GAP FIT ».

## SESSION_BOUNDARY_TRUTH001

Les métadonnées `sessions` restent exploitées pour identifier un vrai
`SPORT_CHANGED`.

Un simple changement de sous-sport ou de matériel entre sessions ne crée plus
une nouvelle activité.

## SPLIT_REASON_FORENSICS001

L'algorithme historique est conservé sous le nom interne :

`detectAutomaticSplitBoundariesLegacyFromPoints`

Il sert seulement à calculer toutes les ruptures candidates.

Le wrapper FIX4 classe ensuite les ruptures en :

- `accepted`
- `rejected`

Le dernier diagnostic est disponible dans :

`window.CGWEB100_LAST_SPLIT_FORENSICS`

Aucune rupture rejetée ne peut atteindre `automaticSplitPartsFromRawRoute()`.

## SEGMENT_LAP_GUARD001

La politique est en liste blanche.

Même si un lap, segment_lap, sous-sport, matériel ou autre métadonnée finissait
par produire une rupture candidate dans le moteur historique, elle est rejetée
sauf si elle correspond finalement à `SPORT_CHANGED` ou à un vrai
`TIMESTAMP_JUMP > 15 min`.

## IMPORT_ABORT_GUARD001

`commitOneWebImport()` valide le plan complet avant la première
`commitWebMutation()`.

Si une activité dérivée possède une raison non autorisée, l'import est
interrompu avant toute création d'activité.

## FIT_IMPORT_ATOMICITY001

FIX4 garantit l'atomicité de la **décision de découpage** :

- construction complète du plan ;
- validation complète ;
- première écriture seulement ensuite.

Les écritures réseau existantes de `commitWebMutation()` restent séquentielles ;
FIX4 ne remplace pas l'infrastructure Firestore par une transaction globale.

## Non-régression attendue

Le FIT problématique du 19/09/2026 ne doit plus être découpé pour :

- immobilité ;
- plateau de distance ;
- sous-sport ;
- matériel ;
- lap / segment_lap.

S'il n'existe ni vrai `TIMESTAMP_JUMP > 15 min` ni changement réel de sport,
il doit être importé comme une seule activité avec sa route complète.

## Sécurité

- aucune activité historique modifiée ;
- aucune suppression automatique ;
- aucun FIT remplacé ;
- aucune Function backend modifiée ;
- Hosting uniquement.
