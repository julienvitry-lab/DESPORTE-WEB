# CGWEB121 FIX8 FIX9

Modules :

- VERSION_EDITOR_MODE_SCOPE001
- FITEDITOR_RUNTIME_UNBLOCK001

## Défaut identifié

Le handler backend `action === "version"` utilisait plusieurs fois la variable
`editorMode` :

- choix du nom du FIT ;
- activation de la version ;
- appel de `v085aActivateVersion`.

Mais `editorMode` n'était pas déclaré dans la portée de ce bloc.

Une déclaration existait dans le bloc séparé `action === "roundtrip"`, mais
elle est limitée à ce bloc JavaScript et n'est donc pas accessible au handler
`version`.

En mode strict, l'appel FITEDITOR atteignait ainsi un `ReferenceError` avant
la création/activation effective du nouveau FIT.

Cela explique le symptôme observé :

- boîte de confirmation affichée ;
- aucune modification durable de l'activité ;
- téléchargement toujours sur le FIT original ;
- suppression FIX8 FIX8 jamais exécutée.

## Correction

Le handler `version` déclare maintenant explicitement :

`const editorMode = String(body.fit_editor_mode || "").toUpperCase() === "FITEDITOR001";`

Aucune autre logique FIX7/FIX8 n'est modifiée.

Base :

356d4688800a9eee76e1a85b2818cdf5dd855687
