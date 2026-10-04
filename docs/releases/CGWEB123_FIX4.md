# CGWEB123 FIX4

- SERVER_BATCH_ORCHESTRATOR001
- FIRESTORE_QUEUE001
- SERVER_AUTORESUME001
- CRASH_SAFE_CURSOR001
- CLIENT_PROGRESS_ONLY001

Le lot FIX3 existant est transféré à un worker Cloud Tasks, avec une file
Firestore persistante. Le curseur et les compteurs existants sont conservés.

Un groupe ambigu après EXECUTE n'est plus une cause d'arrêt global :
il est placé dans la sous-collection `reviews`, aucune nouvelle mutation n'est
effectuée sur ce groupe, puis la file continue.

Le navigateur ne fusionne plus rien après activation FIX4 ; il ne sert qu'à
transférer le lot, afficher sa progression et envoyer pause/reprise.
