#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${FIREBASE_PROJECT_ID:-sport-505813}"
REGION="europe-west1"

command -v firebase >/dev/null 2>&1 || {
  echo "firebase-tools absent."
  echo "Installer avec : npm install -g firebase-tools"
  exit 1
}

echo "=== WEB040 · backend Strava ==="
echo "Projet Firebase : $PROJECT_ID"

firebase use "$PROJECT_ID"

echo
read -r -p "STRAVA_CLIENT_ID : " STRAVA_CLIENT_ID_VALUE
if [[ -z "$STRAVA_CLIENT_ID_VALUE" ]]; then
  echo "ERREUR : Client ID vide."
  exit 1
fi

CALLBACK="https://${REGION}-${PROJECT_ID}.cloudfunctions.net/stravaBridge?action=oauth_callback"
CALLBACK_DOMAIN="${REGION}-${PROJECT_ID}.cloudfunctions.net"

echo
echo "=== Configuration Strava à vérifier ==="
echo "Authorization Callback Domain :"
echo "  $CALLBACK_DOMAIN"
echo
echo "Redirect URI utilisé par SPORT :"
echo "  $CALLBACK"
echo

mkdir -p functions
cat > "functions/.env.${PROJECT_ID}" <<EOF
STRAVA_CLIENT_ID=${STRAVA_CLIENT_ID_VALUE}
STRAVA_REDIRECT_URI=${CALLBACK}
EOF

echo "Paramètres publics écrits dans functions/.env.${PROJECT_ID}"
echo
echo "Le CLIENT SECRET va maintenant être saisi dans Google Secret Manager."
echo "Il ne sera ni écrit dans le dépôt ni envoyé à GitHub."
firebase functions:secrets:set STRAVA_CLIENT_SECRET --project "$PROJECT_ID"

cat > /tmp/firebase-strava.json <<JSON
{
  "functions": [
    {
      "source": "functions",
      "codebase": "strava"
    }
  ]
}
JSON

echo
echo "=== Installation des dépendances ==="
(
  cd functions
  npm install
)

echo
echo "=== Déploiement stravaBridge ==="
firebase deploy \
  --project "$PROJECT_ID" \
  --config /tmp/firebase-strava.json \
  --only functions:stravaBridge

echo
echo "=== BACKEND STRAVA DEPLOYE ==="
echo "Backend :"
echo "  https://${REGION}-${PROJECT_ID}.cloudfunctions.net/stravaBridge"
echo
echo "Callback domain Strava :"
echo "  $CALLBACK_DOMAIN"
