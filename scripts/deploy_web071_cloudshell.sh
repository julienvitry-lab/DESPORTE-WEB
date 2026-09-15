#!/usr/bin/env bash
set -euo pipefail

echo "======================================================"
echo "WEB071 - DEPLOIEMENT FIREBASE"
echo "======================================================"

git fetch origin
git checkout main
git reset --hard origin/main

node --check web/app.js

grep -Fq 'WEB071 · ICON_INDOOR001' web/app.js
grep -Fq 'function web071IsIndoorActivity(activity)' web/app.js
grep -Fq 'WEB071_DETAIL_INDOOR' web/app.js
grep -Fq 'WEB071-ICON-INDOOR001' web/index.html

cat > firebase.hosting.web071.json <<'JSON'
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
  --config firebase.hosting.web071.json

echo
echo "======================================================"
echo "✅ WEB071 DEPLOYE"
echo "https://sport-505813.web.app"
echo "======================================================"
