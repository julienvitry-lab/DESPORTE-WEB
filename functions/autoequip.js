"use strict";

const {
  onDocumentWritten
} = require("firebase-functions/v2/firestore");

const {
  getApps,
  initializeApp
} = require("firebase-admin/app");
const {
  getFirestore
} = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();

const db = getFirestore();
const ROOT = "sport_users";
const REGION = "europe-west1";

const VERSION =
  "CGWEB094B-AUTOEQUIP-WRITEWATCH001";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function activityMetadata(activity) {
  return [
    activity?.import_source,
    activity?.import_profile,
    activity?.source,
    activity?.origin,
    activity?.strava_type,
    activity?.strava_sport_type,
    activity?.strava_device_name,
    activity?.device_name,
    activity?.manufacturer,
    activity?.product,
    activity?.file_name,
    activity?.source_file_name,
    activity?.custom_title,
    activity?.name,
    activity?.title
  ]
    .map(text)
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

function profileKey(activity) {
  if (!activity || activity.deleted_at_ms != null) {
    return "";
  }

  const sport = Number(activity.sport) || 0;
  const subSport = Number(activity.sub_sport) || 0;
  const meta = activityMetadata(activity);

  /*
   * Les signatures textuelles sont volontairement utilisables
   * même avant la finalisation sport/sub_sport d'un import.
   * C'est précisément ce qui rend le watcher convergent.
   */

  if (
    subSport === 21 ||
    /KINOMAP|KINOMAPVIRTUALRUN|VIRTUALRUN|VIRTUAL RUN/.test(meta)
  ) {
    return "KINOMAP";
  }

  if (
    [3, 6].includes(subSport) ||
    /TRAILRUN|TRAIL RUN|\bTRAIL\b/.test(meta)
  ) {
    return "TRAIL";
  }

  if (
    sport === 1 ||
    /\bRUN\b|RUNNING|COURSE A PIED|COURSE À PIED/.test(meta)
  ) {
    return "RUN";
  }

  if (
    [5, 6, 58].includes(subSport) ||
    /HOME.?TRAINER|\bTRAINER\b|TACX|ZWIFT|INDOOR|VIRTUALRIDE|VIRTUAL RIDE/.test(meta)
  ) {
    return "TRAINER";
  }

  if (
    [7, 8, 47].includes(subSport) ||
    /MOUNTAINBIKERIDE|MOUNTAIN BIKE|\bVTT\b|\bMTB\b/.test(meta)
  ) {
    return "MTB";
  }

  if (
    sport === 2 ||
    /\bBIKE\b|\bRIDE\b|CYCLING|CYCLISME|\bVELO\b|\bVÉLO\b/.test(meta)
  ) {
    return "BIKE";
  }

  return "";
}

function chooseRule(rows, key) {
  const wanted = upper(key);
  if (!wanted) return null;

  const enabled = (rows || []).filter((row) =>
    row &&
    row.enabled !== false &&
    text(row.equipment_name)
  );

  return (
    enabled.find((row) =>
      upper(row.profile_key) === wanted &&
      text(row.mapping_version) === "WEBEQUIPMAP005"
    ) ||
    enabled.find((row) =>
      upper(row.profile_key) === wanted
    ) ||
    null
  );
}

function relevantFingerprint(activity) {
  return JSON.stringify({
    deleted_at_ms: activity?.deleted_at_ms ?? null,
    equipment_manual:
      Number(activity?.equipment_manual || 0),
    equipment_name:
      text(activity?.equipment_name),
    sport:
      Number(activity?.sport || 0),
    sub_sport:
      Number(activity?.sub_sport || 0),
    import_source:
      text(activity?.import_source),
    import_profile:
      text(activity?.import_profile),
    source:
      text(activity?.source),
    origin:
      text(activity?.origin),
    strava_type:
      text(activity?.strava_type),
    strava_sport_type:
      text(activity?.strava_sport_type),
    title:
      text(
        activity?.custom_title ||
        activity?.title ||
        activity?.name
      )
  });
}

function makeEventId(activityId) {
  const rnd =
    Math.random().toString(36).slice(2, 10);

  return (
    `CGWEB094B_${activityId}_` +
    `${Date.now()}_${rnd}`
  );
}

function createAutoEquipActivityWriteWatch() {

  return onDocumentWritten(
    {
      document:
        `${ROOT}/{uid}/activities/{activityId}`,
      region: REGION,
      timeoutSeconds: 60,
      memory: "256MiB"
    },
    async (event) => {
      const beforeSnap = event.data?.before;
      const afterSnap = event.data?.after;

      if (!afterSnap?.exists) return;

      const uid =
        text(event.params?.uid);
      const activityId =
        text(event.params?.activityId);

      if (!uid || !activityId) return;

      const before =
        beforeSnap?.exists
          ? beforeSnap.data() || {}
          : {};

      const after =
        afterSnap.data() || {};

      if (after.deleted_at_ms != null) return;
      if (Number(after.equipment_manual) === 1) return;
      if (text(after.equipment_name)) return;

      /*
       * Sur une mise à jour sans aucun changement de signature
       * pertinente, inutile de relire les mappings.
       * Sur CREATE, before n'existe pas : on tente toujours.
       */
      if (
        beforeSnap?.exists &&
        relevantFingerprint(before) ===
          relevantFingerprint(after)
      ) {
        return;
      }

      const initialKey = profileKey(after);
      if (!initialKey) return;

      const mappingsSnap =
        await db
          .collection(
            `${ROOT}/${uid}/equipment_mappings`
          )
          .get();

      const mappings = [];
      mappingsSnap.forEach((docSnap) => {
        mappings.push({
          __docId: docSnap.id,
          ...(docSnap.data() || {})
        });
      });

      const activityRef =
        db.doc(
          `${ROOT}/${uid}/activities/${activityId}`
        );

      let assigned = null;

      await db.runTransaction(async (tx) => {
        const freshSnap =
          await tx.get(activityRef);

        if (!freshSnap.exists) return;

        const fresh =
          freshSnap.data() || {};

        if (fresh.deleted_at_ms != null) return;
        if (Number(fresh.equipment_manual) === 1) return;
        if (text(fresh.equipment_name)) return;

        /*
         * IMPORTANT :
         * on reclassifie la version FRAÎCHE, car un import
         * peut être enrichi entre CREATE et UPDATE.
         */
        const key = profileKey(fresh);
        if (!key) return;

        const rule = chooseRule(mappings, key);
        const equipmentName =
          text(rule?.equipment_name);

        if (!rule || !equipmentName) return;

        const now = Date.now();
        const mappingId =
          text(
            rule.__docId ||
            rule.profile_key
          ) || null;

        const patch = {
          equipment_name: equipmentName,
          equipment_manual: 0,
          equipment_mapping_id: mappingId,
          equipment_assignment_source:
            "CGWEB094B_AUTOEQUIP_WRITEWATCH",
          equipment_assignment_version:
            VERSION,
          equipment_assignment_profile:
            key,
          equipment_assignment_at_ms:
            now,
          __updatedAtMs: now
        };

        tx.set(
          activityRef,
          patch,
          {merge: true}
        );

        const eventId =
          makeEventId(activityId);

        tx.set(
          db.doc(
            `${ROOT}/${uid}/changes/${eventId}`
          ),
          {
            eventId,
            deviceId:
              "CGWEB094B_SERVER",
            firebaseSeq: now,
            sourceChangeSeq: 0,
            table: "activities",
            rowKey: activityId,
            operation: "UPSERT",
            changedAtMs: now,
            androidVersion: 0,
            webVersion: "CGWEB094B",
            row: {
              id:
                Number(
                  fresh.id ??
                  activityId
                ) ||
                fresh.id ||
                activityId,
              ...patch
            }
          }
        );

        tx.set(
          db.doc(
            `${ROOT}/${uid}/meta/state`
          ),
          {
            updatedAtMs: now,
            sourceDeviceId:
              "CGWEB094B_SERVER",
            webVersion:
              "CGWEB094B"
          },
          {merge: true}
        );

        assigned = {
          key,
          equipmentName
        };
      });

      if (assigned) {
        console.info(
          VERSION,
          activityId,
          "profil=" + assigned.key,
          "->",
          assigned.equipmentName
        );
      }
    }
  );
}

module.exports = {
  createAutoEquipActivityWriteWatch,
  profileKey,
  chooseRule,
  relevantFingerprint,
  VERSION
};
