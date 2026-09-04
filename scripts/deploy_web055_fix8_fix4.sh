#!/usr/bin/env bash
set -euo pipefail

git fetch origin
git checkout main
git reset --hard origin/main

node --check web/app.js

grep -Fq 'const EQUIPMENT_PROFILES_WEB058' web/app.js
grep -Fq 'WEB055-FIX8-FIX4-EQUIPPROFILE005' web/index.html
grep -Fq 'slot: "CHAUSSURES 3"' web/app.js

cat > firebase.hosting.web055fix8fix4.json <<'JSON'
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
  --config firebase.hosting.web055fix8fix4.json

echo
echo "✅ WEB055-FIX8-FIX4 DEPLOYE"
echo "https://sport-505813.web.app"
