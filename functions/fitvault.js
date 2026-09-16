"use strict";

/* WEB074_FIX6_SELFCONTAINED_DEPS_START */
const {onRequest} = require("firebase-functions/v2/https");
const {getApps, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
const crypto = require("crypto");

if (!getApps().length) initializeApp();

const db = getFirestore();
const ROOT = "sport_users";
const REGION = "europe-west1";

async function requireUser(req) {
  const auth = String(req.headers.authorization || "");

  if (!auth.startsWith("Bearer ")) {
    throw Object.assign(
      new Error("Firebase bearer token manquant."),
      {status: 401}
    );
  }

  return getAuth().verifyIdToken(auth.slice(7));
}
/* WEB074_FIX6_SELFCONTAINED_DEPS_END */


const SPORT_FIT_BUCKET = "sport-505813.firebasestorage.app";
const SPORT_FIT_MAX_BYTES = 25 * 1024 * 1024;

function createFitVault() {
  function cors(res) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set(
      "Access-Control-Allow-Headers",
      [
        "Authorization",
        "Content-Type",
        "X-Sport-Filename",
        "X-Sport-Source",
        "X-Sport-Mode",
        "X-Sport-Activity-Id",
        "X-Sport-Start-Ms",
        "X-Sport-Sport",
        "X-Sport-Sub-Sport"
      ].join(", ")
    );
    res.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  }

  function safeName(value) {
    const raw = String(value || "activity.fit").trim() || "activity.fit";
    const cleaned = raw
      .replace(/[\\/]+/g, "_")
      .replace(/[\u0000-\u001f\u007f]+/g, "_")
      .slice(0, 180);
    return cleaned.toLowerCase().endsWith(".fit") ? cleaned : `${cleaned}.fit`;
  }

  function sha256(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  function files(uid) {
    return db.collection(`${ROOT}/${uid}/activity_files`);
  }

  function fileDoc(uid, hash) {
    return files(uid).doc(String(hash));
  }

  function bucket() {
    return getStorage().bucket(SPORT_FIT_BUCKET);
  }

  function objectPath(uid, hash, startMs) {
    let year = "unknown";
    const n = Number(startMs);
    if (Number.isFinite(n) && n > 0) {
      const y = new Date(n).getUTCFullYear();
      if (Number.isInteger(y) && y >= 1980 && y <= 2200) year = String(y);
    }
    return `sport_users/${uid}/fit_vault/${year}/${hash}.fit`;
  }

  async function resolveActivity(uid, explicitActivityId, startMs, sport) {
    const explicit = String(explicitActivityId || "").trim();
    if (explicit) {
      const snap = await db.doc(`${ROOT}/${uid}/activities/${explicit}`).get();
      if (snap.exists) return {activity_id: explicit, link_status: "LINKED_EXPLICIT"};
    }

    const start = Number(startMs);
    if (!Number.isFinite(start) || start <= 0) {
      return {activity_id: null, link_status: "UNLINKED_NO_TIME"};
    }

    const snap = await db.collection(`${ROOT}/${uid}/activities`)
      .where("start_time_ms", ">=", start - 180000)
      .where("start_time_ms", "<=", start + 180000)
      .limit(30)
      .get();

    const wantedSport = Number(sport);
    const candidates = [];

    for (const docSnap of snap.docs) {
      const row = docSnap.data() || {};
      if (row.deleted_at_ms != null) continue;
      if (Number.isFinite(wantedSport) && wantedSport > 0 && Number(row.sport) !== wantedSport) continue;
      candidates.push({
        id: docSnap.id,
        delta: Math.abs(Number(row.start_time_ms || 0) - start)
      });
    }

    candidates.sort((a, b) => a.delta - b.delta);

    if (candidates.length === 1) {
      return {activity_id: candidates[0].id, link_status: "LINKED_AUTO"};
    }
    if (candidates.length > 1 && candidates[0].delta + 1000 < candidates[1].delta) {
      return {activity_id: candidates[0].id, link_status: "LINKED_AUTO_NEAREST"};
    }
    return {
      activity_id: null,
      link_status: candidates.length ? "UNLINKED_AMBIGUOUS" : "UNLINKED_NO_MATCH"
    };
  }

  return onRequest(
    {region: REGION, timeoutSeconds: 300, memory: "512MiB", cors: false},
    async (req, res) => {
      cors(res);
      if (req.method === "OPTIONS") return res.status(204).send("");

      try {
        const decoded = await requireUser(req);
        const uid = decoded.uid;
        const action = String(req.query.action || "health").trim();

        if (action === "health") {
          return res.json({
            ok: true,
            service: "FITCLOUD001",
            bucket: SPORT_FIT_BUCKET,
            max_bytes: SPORT_FIT_MAX_BYTES,
            historical_mode_creates_activities: false
          });
        }

        if (action === "upload") {
          if (req.method !== "POST") return res.status(405).json({error: "POST requis."});

          const body = Buffer.isBuffer(req.rawBody)
            ? req.rawBody
            : Buffer.from(req.rawBody || []);

          if (!body.length) return res.status(400).json({error: "FIT vide."});
          if (body.length > SPORT_FIT_MAX_BYTES) {
            return res.status(413).json({error: "FIT supérieur à 25 Mo."});
          }
          if (body.length < 12 || body.subarray(8, 12).toString("ascii") !== ".FIT") {
            return res.status(400).json({error: "Signature FIT absente."});
          }

          const fileName = safeName(req.headers["x-sport-filename"]);
          const source = String(req.headers["x-sport-source"] || "WEB_UPLOAD").slice(0, 80);
          const mode = String(req.headers["x-sport-mode"] || "STANDARD").slice(0, 80);
          const explicitActivityId = String(req.headers["x-sport-activity-id"] || "").trim();
          const startMs = Number(req.headers["x-sport-start-ms"] || 0) || null;
          const sport = Number(req.headers["x-sport-sport"] || 0) || null;
          const subSport = Number(req.headers["x-sport-sub-sport"] || 0) || 0;
          const hash = sha256(body);
          const ref = fileDoc(uid, hash);
          const existing = await ref.get();
          const previous = existing.exists ? existing.data() || {} : {};

          const link = await resolveActivity(
            uid,
            explicitActivityId || previous.activity_id,
            startMs,
            sport
          );

          const path = previous.object_path || objectPath(uid, hash, startMs);
          const object = bucket().file(path);
          const [exists] = await object.exists();

          if (!exists) {
            await object.save(body, {
              resumable: false,
              validation: "crc32c",
              contentType: "application/vnd.ant.fit",
              metadata: {
                cacheControl: "private, no-store",
                metadata: {sha256: hash, owner_uid: uid, source, mode}
              }
            });
          }

          const now = Date.now();
          const metadata = {
            file_id: hash,
            sha256: hash,
            object_path: path,
            file_name: fileName,
            original_name: previous.original_name || fileName,
            size_bytes: body.length,
            mime_type: "application/vnd.ant.fit",
            source,
            upload_mode: mode,
            start_time_ms: startMs,
            sport,
            sub_sport: subSport,
            activity_id: link.activity_id || previous.activity_id || null,
            link_status: link.activity_id ? link.link_status : (previous.link_status || link.link_status),
            first_uploaded_at_ms: Number(previous.first_uploaded_at_ms || now),
            uploaded_at_ms: now,
            last_seen_at_ms: now,
            deleted_at_ms: null,
            storage_version: "FITCLOUD001"
          };

          await ref.set(metadata, {merge: true});

          return res.json({
            ok: true,
            deduplicated: Boolean(existing.exists || exists),
            file: metadata,
            activities_created: 0
          });
        }

        if (action === "list") {
          const requested = Math.max(1, Math.min(1000, Number(req.query.limit || 250)));
          const snap = await files(uid).orderBy("uploaded_at_ms", "desc").limit(requested).get();
          const rows = snap.docs
            .map((docSnap) => ({id: docSnap.id, ...(docSnap.data() || {})}))
            .filter((row) => row.deleted_at_ms == null);
          return res.json({ok: true, files: rows});
        }

        if (action === "delete") {
          if (req.method !== "POST" && req.method !== "DELETE") {
            return res.status(405).json({error: "POST/DELETE requis."});
          }
          const hash = String(req.query.sha256 || "").trim().toLowerCase();
          if (!/^[a-f0-9]{64}$/.test(hash)) {
            return res.status(400).json({error: "SHA-256 invalide."});
          }
          const ref = fileDoc(uid, hash);
          const snap = await ref.get();
          if (!snap.exists) return res.status(404).json({error: "FIT inconnu."});
          const row = snap.data() || {};
          if (row.object_path) {
            try {
              await bucket().file(String(row.object_path)).delete({ignoreNotFound: true});
            } catch (error) {
              console.warn("FITCLOUD001 delete", error.message);
            }
          }
          await ref.set({
            deleted_at_ms: Date.now(),
            updated_at_ms: Date.now(),
            link_status: "DELETED"
          }, {merge: true});
          return res.json({ok: true, sha256: hash, activities_deleted: 0});
        }

        if (action === "download") {
          const hash = String(req.query.sha256 || "").trim().toLowerCase();
          if (!/^[a-f0-9]{64}$/.test(hash)) {
            return res.status(400).json({error: "SHA-256 invalide."});
          }
          const snap = await fileDoc(uid, hash).get();
          if (!snap.exists) return res.status(404).json({error: "FIT inconnu."});
          const row = snap.data() || {};
          if (row.deleted_at_ms != null) return res.status(404).json({error: "FIT supprimé."});
          if (!row.object_path) return res.status(404).json({error: "Objet Storage absent."});
          const [buffer] = await bucket().file(String(row.object_path)).download();
          const fileName = safeName(row.file_name || `${hash}.fit`);
          res.set("Content-Type", "application/vnd.ant.fit");
          res.set("Content-Disposition", `attachment; filename="${fileName.replace(/"/g, "")}"`);
          res.set("Cache-Control", "private, no-store");
          return res.status(200).send(buffer);
        }

        return res.status(404).json({error: "Action FITCLOUD001 inconnue."});
      } catch (error) {
        console.error("FITCLOUD001", error);
        return res.status(Number(error.status) || 500).json({error: error.message || String(error)});
      }
    }
  );
}

module.exports = {createFitVault};
