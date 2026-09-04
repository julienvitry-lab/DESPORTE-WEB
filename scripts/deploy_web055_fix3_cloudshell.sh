#!/usr/bin/env bash
set -euo pipefail

git fetch origin
git checkout main
git reset --hard origin/main

node --check web/app.js
grep -Fq 'WEB055-FIX3-GOAL004-PERF003-GAP003' web/index.html
grep -Fq 'WEB055-FIX3 · PERF003' web/app.js
grep -Fq 'WEB055_FIX3_GAP_CACHE · GAP003' web/app.js
grep -Fq 'web055-fix3-goal-ahead' web/index.html

cat > firebase.hosting.web055fix3.json <<'JSON'
{
  "hosting": {
    "site": "sport-505813",
    "public": "web",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
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
  --config firebase.hosting.web055fix3.json

echo
echo "✅ WEB055-FIX3 DEPLOYE"
echo "https://sport-505813.web.app"
