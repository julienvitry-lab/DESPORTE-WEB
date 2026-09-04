#!/usr/bin/env bash
set -euo pipefail

echo "=== WEB055 · FIREBASE HOSTING ==="

git fetch origin
git checkout main
git reset --hard origin/main

node --check web/app.js
grep -Fq 'WEB055-WEBHOME003-WEBSTATUS002-WEBUX009' web/index.html
grep -Fq 'function renderUnifiedConnectionBadgeWeb055()' web/app.js
grep -Fq 'function installWeb055HomeLayout()' web/app.js
! grep -Fq 'Firebase connecté' web/app.js web/index.html

npx --yes firebase-tools@15.28.2 deploy             --only hosting             --project sport-505813             --config firebase.hosting.web055.json

STAMP="$(date +%s)"

curl -fsSL "https://sport-505813.web.app/app.js?web055=$STAMP" > /tmp/web055-live-app.js
curl -fsSL "https://sport-505813.web.app/?web055=$STAMP" > /tmp/web055-live-index.html

grep -Fq 'function renderUnifiedConnectionBadgeWeb055()' /tmp/web055-live-app.js
grep -Fq 'function installWeb055HomeLayout()' /tmp/web055-live-app.js
grep -Fq 'renderWeb055Regularity' /tmp/web055-live-app.js
grep -Fq 'renderWeb055Comparison' /tmp/web055-live-app.js
! grep -Fq 'Firebase connecté' /tmp/web055-live-app.js /tmp/web055-live-index.html

echo
echo "✅ WEB055 DEPLOYE SUR FIREBASE HOSTING"
echo "https://sport-505813.web.app"
