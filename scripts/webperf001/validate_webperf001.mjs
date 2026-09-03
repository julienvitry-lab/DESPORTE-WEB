import fs from "node:fs";

const app = fs.readFileSync("web/app.js","utf8");
const html = fs.readFileSync("web/index.html","utf8");

const mutationCount = (app.match(/new MutationObserver/g) || []).length;

if (mutationCount !== 0) {
  console.error("ECHEC : MutationObserver restants =", mutationCount);
  process.exit(20);
}

if (app.includes("queueMicrotask(() => restoreInterfaceWeb048());")) {
  console.error("ECHEC : restoreInterfaceWeb048 encore appelé dans la navigation");
  process.exit(21);
}

if (!app.includes("installWeb049UiContract();")) {
  console.error("ECHEC : installWeb049UiContract absent");
  process.exit(22);
}

if (!app.includes("queueMicrotask(() => applyWeb049UiContract());")) {
  console.error("ECHEC : appels déterministes WEB049 absents");
  process.exit(23);
}

if (!app.includes('await signInWithRedirect(auth, provider);')) {
  console.error("ECHEC : WEBAUTH001 perdu");
  process.exit(24);
}

if (!app.includes('authDomain: "sport-505813.web.app"')) {
  console.error("ECHEC : authDomain web.app perdu");
  process.exit(25);
}

if (!html.includes("app.js?v=WEB049-HOSTING003-WEBPERF001")) {
  console.error("ECHEC : cache bust WEBPERF001 absent");
  process.exit(26);
}

console.log("WEBPERF001 : 0 MutationObserver et WEBAUTH001 conservé.");
