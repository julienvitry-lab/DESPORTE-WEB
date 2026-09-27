# CGWEB120 FIX10 FIX1

## SETDOC_IMPORT001

Diagnostic navigateur confirmé :

WEBSPLIT003 persist recovered route
ReferenceError: setDoc is not defined

La fonction persistRecoveredSplitRoute() utilisait déjà :

setDoc(
  doc(..., "activity_routes", key),
  materialized,
  { merge:true }
)

mais setDoc n'était pas importé depuis Firebase Firestore.

## ROUTE_PERSISTENCE_REPAIR001

Ajout de setDoc dans l'import :

firebase-firestore.js

Aucune modification du pipeline métier.

Après correction :

Strava
→ streams GPS
→ persistRecoveredSplitRoute()
→ setDoc()
→ activity_routes
→ carte
→ profil altimétrique.

Base :
11d66d5cd6619c259998d1deffedfb2eb8bbc832
