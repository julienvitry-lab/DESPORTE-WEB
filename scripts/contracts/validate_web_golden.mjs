import fs from "node:fs";

const app = fs.readFileSync("web/app.js", "utf8");

function must(token, label) {
  if (!app.includes(token)) {
    console.error("REGRESSION:", label);
    process.exit(20);
  }
}

function mustNot(token, label) {
  if (app.includes(token)) {
    console.error("REGRESSION:", label);
    process.exit(21);
  }
}

/* AUTHENTIFICATION FIGEE */
must('authDomain: "sport-505813.firebaseapp.com"', "authDomain Firebase");
must('await signInWithPopup(auth, provider);', "connexion Google popup");
mustNot('await signInWithRedirect(auth, provider);', "redirect Google interdit");
mustNot('getRedirectResult', "getRedirectResult interdit");

/* PERFORMANCE / SYNTAXE */
mustNot('async async function', "double async interdit");
mustNot('new MutationObserver', "MutationObserver UI interdit");

/* FONCTIONNALITES A PRESERVER */
must('const EQUIPMENT_MAPPING_ALL_SOURCES = "*";', "WEBEQUIPMAP002 perdu");
must('function resolveAutomaticEquipmentMapping(activity)', "mapping matériel perdu");
must('function renderEquipmentMappingPanel()', "éditeur matériel perdu");
must('WEBSTRAVA003', "WEBSTRAVA003 perdu");
must('WEBSPLIT003', "WEBSPLIT003 perdu");

console.log("GOLDEN CONTRACT : OK");
