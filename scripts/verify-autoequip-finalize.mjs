import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync("web/app.js", "utf8");

function fail(message, code = 40) {
  console.error("❌ " + message);
  process.exit(code);
}

function req(token, label) {
  if (!app.includes(token)) {
    fail(label + " · token absent : " + token);
  }
  console.log("✓ " + label);
}

req(
  "CGWEB086_FIX1_AUTOEQUIP_FINALIZE001_START",
  "module FINALIZE001"
);

req(
  "CGWEB086_FIX1_FINALIZE_HOOK",
  "hook finalisation"
);

req(
  "cgweb086ResolveFinalEquipment(candidate)",
  "résolution finale"
);

req(
  "cgweb086FindProfileRule(profileKey)",
  "résolution profil directe"
);

req(
  "[3, 6].includes(subSport)",
  "fallback Trail"
);

req(
  'return "TRAIL";',
  "profil Trail"
);

req(
  '"CGWEB086_FIX1_FINALIZE"',
  "marqueur d'affectation"
);

req(
  "Number(candidate.equipment_manual) === 1",
  "choix manuel protégé"
);

req(
  'String(candidate.equipment_name || "").trim()',
  "matériel existant protégé"
);

req(
  "WEBEQUIPMAP005",
  "WEBEQUIPMAP005 conservé"
);

const commitStart =
  app.indexOf("async function commitWebMutation(args)");

if (commitStart < 0) {
  fail("commitWebMutation absent", 41);
}

const hookPos =
  app.indexOf("CGWEB086_FIX1_FINALIZE_HOOK", commitStart);

const normalizePos =
  app.indexOf(
    "const payload = normalizePendingMutation(args);",
    commitStart
  );

if (
  hookPos < 0 ||
  normalizePos < 0 ||
  hookPos > normalizePos
) {
  fail(
    "le hook FINALIZE001 doit précéder normalizePendingMutation",
    42
  );
}

console.log("✓ finalisation avant persistance/file hors-ligne");

const moduleStart =
  app.indexOf("CGWEB086_FIX1_AUTOEQUIP_FINALIZE001_START");

const moduleEnd =
  app.indexOf("CGWEB086_FIX1_AUTOEQUIP_FINALIZE001_END");

if (moduleStart < 0 || moduleEnd <= moduleStart) {
  fail("bornes du module invalides", 43);
}

const moduleText = app.slice(moduleStart, moduleEnd);

if (moduleText.includes("loadAllActivities(")) {
  fail(
    "FINALIZE001 ne doit jamais balayer l'historique",
    44
  );
}

console.log("✓ aucun backfill automatique");

function extractFunction(name) {
  const re = new RegExp(
    "(?:async\\s+)?function\\s+" +
      name +
      "\\s*\\([^)]*\\)\\s*\\{"
  );

  const match = re.exec(app);
  if (!match) fail("fonction test introuvable : " + name, 45);

  const start = match.index;
  const brace = app.indexOf("{", start);

  let depth = 0;
  let quote = null;
  let escape = false;

  for (let i = brace; i < app.length; i += 1) {
    const ch = app[i];

    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return app.slice(start, i + 1);
      }
    }
  }

  fail("fin fonction test introuvable : " + name, 46);
}

const sandbox = {
  equipmentMappingRows: [
    {
      __docId: "PROFILE_WEB058_TRAIL",
      profile_key: "TRAIL",
      mapping_version: "WEBEQUIPMAP005",
      equipment_name: "CHAUSSURE_TEST_TRAIL",
      enabled: true
    }
  ],
  equipmentProfileKeyFromActivityWeb058(activity) {
    const sport = Number(activity?.sport) || 0;
    const subSport = Number(activity?.sub_sport) || 0;
    if (sport === 1 && subSport === 3) return "TRAIL";
    return "";
  },
  resolveAutomaticEquipmentMapping() {
    return null;
  }
};

vm.createContext(sandbox);

for (const name of [
  "cgweb086Fix1Metadata",
  "cgweb086FinalProfileKey",
  "cgweb086FindProfileRule",
  "cgweb086ResolveFinalEquipment"
]) {
  vm.runInContext(
    extractFunction(name) + "\nthis." + name + " = " + name + ";",
    sandbox
  );
}

const trail = {
  sport: 1,
  sub_sport: 3,
  equipment_name: "",
  equipment_manual: 0,
  deleted_at_ms: null
};

const resolved =
  sandbox.cgweb086ResolveFinalEquipment(trail);

if (resolved.profileKey !== "TRAIL") {
  fail(
    "test Trail : profil obtenu = " + resolved.profileKey,
    47
  );
}

if (resolved.equipmentName !== "CHAUSSURE_TEST_TRAIL") {
  fail(
    "test Trail : matériel non résolu",
    48
  );
}

console.log(
  "✓ TEST FONCTIONNEL : Trail → CHAUSSURE_TEST_TRAIL"
);

/*
 * Contrat des quatre chemins de création actuellement connus.
 */
for (const fn of [
  "commitOneWebStravaActivity",
  "commitOneWebImport",
  "commitWebManualActivity",
  "commitSplitActivity"
]) {
  if (!app.includes("function " + fn + "(") &&
      !app.includes("function " + fn + " (") &&
      !app.includes("async function " + fn + "(")) {
    fail("chemin de création absent : " + fn, 49);
  }
}

const activityCountSignals =
  (app.match(/activityCount\s*:\s*1/g) || []).length;

if (activityCountSignals < 3) {
  fail(
    "signaux de création activityCount insuffisants : " +
      activityCountSignals,
    50
  );
}

console.log(
  "✓ signaux activityCount de création : " +
    activityCountSignals
);

console.log(
  "✅ CGWEB086 FIX1 AUTOEQUIP_FINALIZE001 : contrat valide"
);
