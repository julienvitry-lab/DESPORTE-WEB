const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret, defineString} = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

const STRAVA_CLIENT_ID = defineString("STRAVA_CLIENT_ID");
const STRAVA_CLIENT_SECRET = defineSecret("STRAVA_CLIENT_SECRET");
const STRAVA_REDIRECT_URI = defineString("STRAVA_REDIRECT_URI");
const REGION = "europe-west1";
const ROOT = "sport_users";

function cors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

async function requireUser(req) {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) throw Object.assign(new Error("Firebase bearer token manquant."), {status:401});
  return admin.auth().verifyIdToken(auth.slice(7));
}

function integrationRef(uid) {
  return admin.firestore().doc(`${ROOT}/${uid}/integrations/strava`);
}

async function tokenDocument(uid) {
  const snap=await integrationRef(uid).get();
  return snap.exists ? snap.data() : null;
}

async function exchangeCode(code) {
  const response=await fetch("https://www.strava.com/oauth/token",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      client_id:STRAVA_CLIENT_ID.value(),
      client_secret:STRAVA_CLIENT_SECRET.value(),
      code,
      grant_type:"authorization_code"
    })
  });
  const payload=await response.json();
  if (!response.ok) throw new Error(payload?.message || `Strava token ${response.status}`);
  return payload;
}

async function refreshTokenIfNeeded(uid,data) {
  if (!data?.refresh_token) throw Object.assign(new Error("Strava non connecté."),{status:409});
  const now=Math.floor(Date.now()/1000);
  if (Number(data.expires_at) > now+120 && data.access_token) return data;

  const response=await fetch("https://www.strava.com/oauth/token",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      client_id:STRAVA_CLIENT_ID.value(),
      client_secret:STRAVA_CLIENT_SECRET.value(),
      grant_type:"refresh_token",
      refresh_token:data.refresh_token
    })
  });
  const payload=await response.json();
  if (!response.ok) throw new Error(payload?.message || `Strava refresh ${response.status}`);

  const updated={
    ...data,
    access_token:payload.access_token,
    refresh_token:payload.refresh_token,
    expires_at:payload.expires_at,
    updated_at_ms:Date.now()
  };
  await integrationRef(uid).set(updated,{merge:true});
  return updated;
}

async function stravaGet(uid,path) {
  const current=await tokenDocument(uid);
  const token=await refreshTokenIfNeeded(uid,current);
  const response=await fetch(`https://www.strava.com/api/v3${path}`,{
    headers:{Authorization:`Bearer ${token.access_token}`}
  });
  const payload=await response.json();
  if (!response.ok) throw Object.assign(new Error(payload?.message || `Strava API ${response.status}`),{status:response.status});
  return payload;
}

function callbackHtml(ok,message) {
  const safe=String(message||"").replace(/[<>&"]/g,(c)=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));
  return `<!doctype html><meta charset="utf-8"><title>SPORT · Strava</title>
  <body style="font-family:system-ui;background:#0a0d0b;color:#eee;padding:40px">
  <h1>${ok?"Strava connecté":"Connexion impossible"}</h1><p>${safe}</p>
  <script>setTimeout(()=>window.close(),1200)</script></body>`;
}

exports.stravaBridge = onRequest(
  {region:REGION,secrets:[STRAVA_CLIENT_SECRET],timeoutSeconds:120,cors:false},
  async (req,res)=>{
    cors(res);
    if (req.method==="OPTIONS") return res.status(204).send("");

    try {
      const action=String(req.query.action || "");

      if (action==="oauth_callback") {
        const state=String(req.query.state || "");
        const code=String(req.query.code || "");
        if (!state || !code) return res.status(400).send(callbackHtml(false,"Code/state absent."));

        const stateRef=admin.firestore().doc(`strava_oauth_states/${state}`);
        const stateSnap=await stateRef.get();
        if (!stateSnap.exists) return res.status(400).send(callbackHtml(false,"État OAuth invalide ou expiré."));
        const stateData=stateSnap.data();
        await stateRef.delete();
        if (Date.now()-Number(stateData.created_at_ms||0)>10*60*1000) {
          return res.status(400).send(callbackHtml(false,"État OAuth expiré."));
        }

        const token=await exchangeCode(code);
        await integrationRef(stateData.uid).set({
          athlete:token.athlete || null,
          access_token:token.access_token,
          refresh_token:token.refresh_token,
          expires_at:token.expires_at,
          scope:stateData.scope,
          connected_at_ms:Date.now(),
          updated_at_ms:Date.now()
        },{merge:true});
        res.set("Content-Type","text/html; charset=utf-8");
        return res.status(200).send(callbackHtml(true,"Vous pouvez revenir dans SPORT Web."));
      }

      const decoded=await requireUser(req);
      const uid=decoded.uid;

      if (action==="health") {
        return res.json({
          ok:true,
          region:REGION,
          configured:Boolean(STRAVA_CLIENT_ID.value() && STRAVA_REDIRECT_URI.value())
        });
      }

      if (action==="status") {
        const data=await tokenDocument(uid);
        return res.json({
          connected:Boolean(data?.refresh_token),
          configured:Boolean(STRAVA_CLIENT_ID.value() && STRAVA_REDIRECT_URI.value()),
          athlete:data?.athlete || null,
          scope:data?.scope || null
        });
      }

      if (action==="oauth_start") {
        const clientId=STRAVA_CLIENT_ID.value();
        const redirectUri=STRAVA_REDIRECT_URI.value();
        if (!clientId || !redirectUri) throw Object.assign(new Error("Configuration Strava serveur incomplète."),{status:503});

        const state=crypto.randomBytes(24).toString("hex");
        const scope="read,activity:read_all";
        await admin.firestore().doc(`strava_oauth_states/${state}`).set({
          uid,
          scope,
          created_at_ms:Date.now()
        });

        const authorize=new URL("https://www.strava.com/oauth/authorize");
        authorize.searchParams.set("client_id",clientId);
        authorize.searchParams.set("response_type","code");
        authorize.searchParams.set("redirect_uri",redirectUri);
        authorize.searchParams.set("approval_prompt","auto");
        authorize.searchParams.set("scope",scope);
        authorize.searchParams.set("state",state);
        return res.json({authorize_url:authorize.toString()});
      }

      if (action==="activities") {
        const after=Math.max(0,Number(req.query.after || 0));
        const activities=[];
        for (let page=1;page<=5;page++) {
          const query=`/athlete/activities?after=${Math.floor(after)}&page=${page}&per_page=100`;
          const rows=await stravaGet(uid,query);
          if (!Array.isArray(rows) || !rows.length) break;
          activities.push(...rows);
          if (rows.length<100) break;
        }
        return res.json({activities});
      }

      if (action==="activity") {
        const id=String(req.query.id || "");
        if (!/^\d+$/.test(id)) throw Object.assign(new Error("ID Strava invalide."),{status:400});
        const activity=await stravaGet(uid,`/activities/${id}?include_all_efforts=false`);
        let streams={};
        try {
          streams=await stravaGet(
            uid,
            `/activities/${id}/streams?keys=time,distance,latlng,altitude,heartrate,velocity_smooth,cadence&key_by_type=true`
          );
        } catch (error) {
          console.warn("Strava streams unavailable",id,error.message);
        }
        return res.json({activity,streams});
      }

      if (action==="disconnect" && req.method==="POST") {
        const data=await tokenDocument(uid);
        if (data?.access_token) {
          try {
            await fetch("https://www.strava.com/oauth/deauthorize",{
              method:"POST",
              headers:{
                "Authorization":`Bearer ${data.access_token}`,
                "Content-Type":"application/x-www-form-urlencoded"
              }
            });
          } catch (error) {
            console.warn("Strava deauthorize",error);
          }
        }
        await integrationRef(uid).delete();
        return res.json({ok:true});
      }

      return res.status(404).json({error:"Action Strava inconnue."});
    } catch (error) {
      console.error(error);
      return res.status(Number(error.status)||500).json({error:error.message || String(error)});
    }
  }
);
