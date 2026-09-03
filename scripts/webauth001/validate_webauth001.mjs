import fs from "node:fs";

const app = fs.readFileSync("web/app.js","utf8");
const html = fs.readFileSync("web/index.html","utf8");

function req(token, label) {
  if (!app.includes(token) && !html.includes(token)) {
    console.error("ECHEC :", label);
    process.exit(20);
  }
}

req('signInWithRedirect,', "import signInWithRedirect");
req('getRedirectResult,', "import getRedirectResult");
req('authDomain: "sport-505813.web.app"', "authDomain web.app");
req('await signInWithRedirect(auth, provider);', "login redirect");
req('function completeGoogleRedirectWebAuth001()', "traitement retour redirect");
req('await getRedirectResult(auth);', "getRedirectResult");
req('sport_web_auth_redirect_pending', "état session redirect");
req('app.js?v=WEB049-HOSTING002-WEBAUTH001', "cache-bust");

if (!app.includes("signInWithPopup(auth,driveProvider)")) {
  console.error("ECHEC : popup Google Drive supprimé");
  process.exit(21);
}

const wireStart = app.indexOf("function wireEvents()");
const driveStart = app.indexOf("signInWithPopup(auth,driveProvider)");
const wireBlock = app.slice(wireStart, driveStart > wireStart ? driveStart : wireStart + 2500);

if (wireBlock.includes("signInWithPopup(auth, provider)")) {
  console.error("ECHEC : login principal utilise encore signInWithPopup");
  process.exit(22);
}

console.log("WEBAUTH001 : contrat Auth redirect validé.");
