import fs from "node:fs";

const app =
  fs.readFileSync("web/app.js", "utf8");
const html =
  fs.readFileSync("web/index.html", "utf8");
const auto =
  fs.readFileSync("functions/autoequip.js", "utf8");
const index =
  fs.readFileSync("functions/index.js", "utf8");

function requireToken(text, token, label) {
  if (!text.includes(token)) {
    console.error("❌ " + label);
    console.error("Token absent :", token);
    process.exit(60);
  }
  console.log("✓ " + label);
}

const dirCount =
  (
    html.match(
      /<[A-Za-z][^>]*\bid\s*=\s*["']activityDirectorySection["'][^>]*>/gis
    ) || []
  ).length;

if (dirCount !== 1) {
  console.error(
    "❌ balises DOM activityDirectorySection :",
    dirCount
  );
  process.exit(61);
}

console.log("✓ une seule BALISE DOM Répertoire HTML");

requireToken(
  app,
  "function cgweb094bDirectoryGuard(",
  "garde runtime Répertoire"
);

requireToken(
  app,
  "const __cgweb094bGuardPage = page;",
  "hook navigateUx posé dans le vrai corps de fonction"
);

requireToken(
  app,
  "cgweb094bDirectoryGuard(",
  "garde Répertoire appelé après navigation"
);

requireToken(
  html,
  "cgweb094b-directory-singleton-css",
  "verrou CSS Répertoire"
);

requireToken(
  auto,
  "onDocumentWritten",
  "AutoEquip écoute CREATE + UPDATE"
);

requireToken(
  auto,
  'return "RUN";',
  "profil RUN disponible"
);

requireToken(
  auto,
  "KINOMAPVIRTUALRUN",
  "Kinomap explicitement reconnu"
);

requireToken(
  auto,
  "WEBEQUIPMAP005",
  "mapping métier prioritaire"
);

requireToken(
  auto,
  "equipment_manual",
  "choix manuel protégé"
);

requireToken(
  auto,
  "if (text(fresh.equipment_name)) return;",
  "matériel existant protégé"
);

requireToken(
  index,
  "exports.autoEquipActivity",
  "trigger AutoEquip exporté"
);

console.log(
  "✅ DIRECTORY_SINGLETON002 / AUTOEQUIP_WRITEWATCH001 : contrat valide"
);
