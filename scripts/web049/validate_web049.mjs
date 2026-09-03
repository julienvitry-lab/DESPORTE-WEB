import fs from "node:fs";

const app = fs.readFileSync("web/app.js","utf8");
const html = fs.readFileSync("web/index.html","utf8");

function requireToken(source, token, label) {
  if (!source.includes(token)) {
    console.error("ECHEC WEB049 :", label, "absent");
    process.exit(20);
  }
}

function forbidToken(source, token, label) {
  if (source.includes(token)) {
    console.error("ECHEC WEB049 :", label, "encore présent");
    process.exit(21);
  }
}

requireToken(app, '["equipment-map","Matériel auto"]', "Plus > Matériel auto");
requireToken(app, '["maps","Cartes"]', "Plus > Cartes");
forbidToken(app, '["data","Données"]', "Plus > Données");

requireToken(app, "function activitySportIconMarkupWeb049", "SVG sport");
requireToken(app, 'datum("Date", formatActivityDateWeb049(activity.start_time_ms)', "Date");
requireToken(app, 'datum("Départ", formatActivityTimeWeb049(activity.start_time_ms)', "Départ");
requireToken(app, "function applyWeb049UiContract()", "garde-fou UI");
requireToken(app, "detail-start-stat-web049", "Date/Départ détail");
requireToken(app, "detail-sport-svg-web049", "SVG détail");

requireToken(html, 'id="web049-ui-contract"', "CSS WEB049");
requireToken(html, 'id="web049InteropStatus"', "Interop unique");
requireToken(html, 'app.js?v=WEB049-WEBUI001', "cache-bust");
forbidToken(html, 'data-ux-page="maps">Cartes</button>', "Cartes navigation principale");

if (/function activityMain\(activity\)[\s\S]{0,700}custom_title/.test(app)) {
  console.error("ECHEC WEB049 : titre activité encore utilisé dans activityMain");
  process.exit(22);
}

console.log("WEB049 : contrat interface validé.");
