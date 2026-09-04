#!/usr/bin/env bash

web056_deploy() {
  set +e

  echo "======================================================"
  echo "WEB056 - DEPLOIEMENT FIREBASE DEPUIS TERMUX"
  echo "======================================================"
  echo

  git fetch origin || return 10
  git checkout main || return 11
  git reset --hard origin/main || return 12

  node --check web/app.js || return 20

  grep -Fq 'WEB056-ACTIVITYUX012-GOAL007-FILTERUX006-GAP005' web/index.html || {
    echo "❌ marqueur WEB056 absent"
    return 21
  }

  grep -Fq 'const WEB056_FILTER_DEFS' web/app.js || {
    echo "❌ filtres progressifs absents"
    return 22
  }

  cat > firebase.hosting.web056.json <<'JSON'
{
  "hosting": {
    "site": "sport-505813",
    "public": "web",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "headers": [
      {
        "source": "**",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "no-cache, no-store, must-revalidate"
          }
        ]
      }
    ]
  }
}
JSON

  npx --yes firebase-tools@15.28.2 deploy \
    --only hosting \
    --project sport-505813 \
    --config firebase.hosting.web056.json

  CODE=$?

  echo
  if [ "$CODE" -eq 0 ]; then
    echo "======================================================"
    echo "✅ WEB056 DEPLOYE"
    echo "https://sport-505813.web.app"
    echo "======================================================"
  else
    echo "❌ Firebase a renvoyé le code $CODE"
  fi

  return "$CODE"
}

web056_deploy
