# CGWEB113 FIX1

Modules :

- DIRECT_STORAGE_PARITY_AUDIT001
- SIGN_URL_INDEPENDENCE001
- FIT_INTERNAL_TIMESTAMP_READ001
- NO_FIT_WRITE001
- ROLLBACK_READY001

## Symptôme

CGWEB113 pouvait retourner FIT_NOT_DOWNLOADABLE pour des activités dont
l'icône FIT était pourtant disponible dans le Répertoire.

## Cause

L'audit appelait c096ResolveActivity(). Cette fonction tente aussi de produire
une URL signée V4. Une erreur de signature pouvait donc arrêter l'audit avant
la lecture du fichier, même lorsque l'objet Storage était correctement résolu.

## Correction

CGWEB113 FIX1 utilise directement :

- c096LinkedRows(uid)
- c096StorageIndex()
- c096ResolvePreferred(...)

Puis l'objet résolu est lu directement depuis Storage et décodé avec
fitStartTimeMsFromBuffer().

Aucune URL signée n'est nécessaire à l'audit.

## Sécurité

- aucune écriture dans Storage ;
- aucun FIT renommé ;
- aucun FIT réécrit ;
- aucune activité modifiée ;
- aucune métadonnée FIT modifiée ;
- seule la Function fitVault est redéployée.

Base rollback : 5fb12175d4bac567ab45d56eb4a3af0f91d11bbd
