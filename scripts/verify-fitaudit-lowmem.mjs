import fs from "node:fs";

const src = fs.readFileSync("functions/fitvault.js", "utf8");
const start = src.indexOf("CGWEB087_FITAUDIT001_BACKEND_START");
const end = src.indexOf("CGWEB087_FITAUDIT001_BACKEND_END", start);

if (start < 0 || end < 0) {
  console.error("❌ bloc FITAUDIT001 introuvable");
  process.exit(40);
}

const block = src.slice(start, end);

const required = [
  "CGWEB087_FIX2_LOWMEM_AUDIT001",
  "activityQuery.stream()",
  "fitQuery.stream()",
  '"DISABLED_FOR_MEMORY_SAFETY"'
];

for (const token of required) {
  if (!block.includes(token)) {
    console.error("❌ token requis absent :", token);
    process.exit(41);
  }
}

const forbidden = [
  "/activity_routes",
  "activity_routes/",
  "routeIdsToCheck",
  "const fitRows =",
  "const [activitySnap, fitSnap]"
];

for (const token of forbidden) {
  if (block.includes(token)) {
    console.error("❌ token mémoire interdit :", token);
    process.exit(42);
  }
}

console.log("✅ FITAUDIT LOWMEM : contrat valide");
