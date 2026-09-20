# CGWEB107 · FIT_DIRECT_DOWNLOAD001

- SIGNED_URL_BYPASS001
- STORAGE_STREAM_DOWNLOAD001
- AUTH_DOWNLOAD_GUARD001
- DOWNLOAD_ERROR_TRUTH001

Le Répertoire transmet uniquement activity_id.
fitVault vérifie l'utilisateur, l'activité et son FIT lié, puis diffuse l'objet
Storage directement au navigateur. Aucun getSignedUrl n'est utilisé dans ce
nouveau chemin.

Aucune activité, aucun FIT, aucun lien de provenance et aucune route ne sont
modifiés.

Base rollback : `3224fe35b38dfb1f118d4da35e7ac53a502792a0`
