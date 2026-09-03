import fs from "node:fs";

const app = fs.readFileSync("web/app.js","utf8");
const html = fs.readFileSync("web/index.html","utf8");

function req(source, token, label) {
  if (!source.includes(token)) {
    console.error("ECHEC :", label);
    process.exit(20);
  }
}

req(app, 'const EQUIPMENT_MAPPING_ALL_SOURCES = "*";', "wildcard sources");
req(app, "function equipmentMappingObservedActivities()", "activités observées");
req(app, "function equipmentMappingUnmatchedGroups()", "activités non couvertes");
req(app, "function editEquipmentMappingRuleWeb050", "édition règle");
req(app, "function installEquipmentMappingEditorWeb050", "éditeur");
req(app, "const generalKey = equipmentMappingKey(EQUIPMENT_MAPPING_ALL_SOURCES", "fallback général");
req(app, "if (exact) return exact;", "priorité exacte");
req(app, 'mapping_version: "WEBEQUIPMAP002"', "version mapping");

req(html, 'id="equipmentMappingSourceChoice"', "select source");
req(html, 'id="equipmentMappingActivityChoice"', "select activité");
req(html, 'id="equipmentMappingUnmatched"', "activités sans règle");
req(html, 'id="webequipmap002-css"', "CSS");
req(html, 'app.js?v=WEB050-WEBEQUIPMAP002', "cache bust");

if (!app.includes('await signInWithRedirect(auth, provider);')) {
  console.error("ECHEC : WEBAUTH001 perdu");
  process.exit(21);
}

if ((app.match(/new MutationObserver/g) || []).length !== 0) {
  console.error("ECHEC : MutationObserver réintroduit");
  process.exit(22);
}

console.log("WEBEQUIPMAP002 : contrat validé.");
