# CGWEB085A · FITEDITOR001

- Corrige la date/heure de départ d'une activité et de son FIT.
- Tous les timestamps FIT sont régénérés avec le même décalage.
- Peut générer une FC synthétique cohérente à partir d'une moyenne et d'un maximum cibles.
- La provenance est marquée `SYNTHETIC / FITEDITOR001`.
- Le FIT parent reste conservé.
- La nouvelle version devient `is_active_version=true`.
- Le téléchargement rapide privilégie explicitement la version active.
- La mutation activité est aussi publiée dans la file Web de synchronisation.
- Le nom du FIT édité reste canonique, sans suffixe artificiel de version.
- SAFEEDIT conserve un instantané avant modification FIT.
