from pathlib import Path
root=Path(__file__).resolve().parent
f=(root/'functions/index.js').read_text(encoding='utf-8')
a=(root/'web/app.js').read_text(encoding='utf-8')
i=(root/'web/index.html').read_text(encoding='utf-8')
d=(root/'scripts/deploy_strava_backend.sh').read_text(encoding='utf-8')
for token in [
    'exports.stravaWebhook = onRequest',
    'exports.stravaWebhookProcessor = onDocumentCreated',
    'strava_webhook_events',
    'ensureWebhookSubscription',
    'push_subscriptions',
    'WEBSTRAVA003_SERVER',
    'normalizeStravaDetailServer',
    'KINOMAP_STRAVA_WEB',
    'WEBSTRAVA003-TREADMILL12',
    'equipment_mappings',
    'activity_routes',
    'strava_athletes',
]:
    assert token in f, token
for token in [
    'webStravaServerAutomatic',
    'synchronisation serveur automatique active',
    'webStravaServerSubscriptionId',
    'WEBSTRAVA003 browser fallback',
]:
    assert token in a, token
assert 'WEB042 · WEBSTRAVA003' in i
assert 'functions:stravaWebhook' in d
assert 'functions:stravaWebhookProcessor' in d
print('WEBSTRAVA003 contract OK')
