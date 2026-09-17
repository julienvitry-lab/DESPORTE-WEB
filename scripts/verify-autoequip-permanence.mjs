import fs from "node:fs";

const app = fs.readFileSync("web/app.js", "utf8");

function requireToken(token, label) {
  if (!app.includes(token)) {
    console.error("❌ " + label);
    console.error("Token absent : " + token);
    process.exit(40);
  }
  console.log("✓ " + label);
}

requireToken(
  "CGWEB086_AUTOEQUIP_PERMANENCE001_START",
  "module permanence présent"
);

requireToken(
  "CGWEB086_AUTOEQUIP_CREATION_HOOK",
  "hook central présent"
);

requireToken(
  "Number(args?.metaIncrements?.activityCount || 0) > 0",
  "créations futures uniquement"
);

requireToken(
  'String(args.table || "").toLowerCase() !== "activities"',
  "hook limité aux activités"
);

requireToken(
  "Number(candidate.equipment_manual) === 1",
  "choix manuel souverain"
);

requireToken(
  'String(candidate.equipment_name || "").trim()',
  "matériel existant protégé"
);

requireToken(
  "resolveAutomaticEquipmentMapping(candidate)",
  "resolver unique utilisé"
);

requireToken(
  '"CGWEB086-AUTOEQUIP_PERMANENCE001"',
  "version AUTOEQUIP présente"
);

requireToken(
  '"CGWEB086_AUTOEQUIP"',
  "source AUTOEQUIP présente"
);

requireToken(
  "WEBEQUIPMAP005",
  "WEBEQUIPMAP005 conservé"
);

requireToken(
  "function equipmentProfileKeyFromActivityWeb058(activity)",
  "classifieur 6 profils conservé"
);

const commitStart = app.indexOf("async function commitWebMutation(args)");
if (commitStart < 0) {
  console.error("❌ commitWebMutation(args) absent");
  process.exit(41);
}

const hookPos = app.indexOf(
  "CGWEB086_AUTOEQUIP_CREATION_HOOK",
  commitStart
);
const normalizePos = app.indexOf(
  "const payload = normalizePendingMutation(args);",
  commitStart
);

if (
  hookPos < 0 ||
  normalizePos < 0 ||
  hookPos > normalizePos
) {
  console.error(
    "❌ le hook AUTOEQUIP doit précéder normalizePendingMutation"
  );
  process.exit(42);
}

console.log("✓ hook placé avant la file hors-ligne");

const moduleStart = app.indexOf(
  "CGWEB086_AUTOEQUIP_PERMANENCE001_START"
);
const moduleEnd = app.indexOf(
  "CGWEB086_AUTOEQUIP_PERMANENCE001_END"
);

if (moduleStart < 0 || moduleEnd < moduleStart) {
  console.error("❌ bornes du module AUTOEQUIP invalides");
  process.exit(43);
}

const moduleText = app.slice(moduleStart, moduleEnd);

if (moduleText.includes("loadAllActivities(")) {
  console.error(
    "❌ AUTOEQUIP ne doit jamais balayer l'historique"
  );
  process.exit(44);
}

console.log("✓ aucun balayage historique dans AUTOEQUIP");
console.log("✅ AUTOEQUIP_PERMANENCE001 : contrat valide");
