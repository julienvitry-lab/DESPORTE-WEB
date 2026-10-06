import {
  getApps,
  getApp,
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDocs,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";


/* ==========================================================================
   CGWEB129

   DAILY_DISTANCE_THRESHOLD_RANK001
   DAILY_ASCENT_THRESHOLD_RANK001
   MULTI_THRESHOLD_CASCADE001
   YEARLY_DAILY_RANK001
   DAILY_AGGREGATE001
   ========================================================================== */

const CGWEB129_BUILD =
  "CGWEB129";

const CGWEB129_ROOT =
  "sport_users";

const CGWEB129_TIMEZONE =
  "Europe/Paris";

const CGWEB129_VERSION =
  1;

const CGWEB129_CHUNK =
  80;

const CGWEB129_DISTANCE_THRESHOLDS_KM =
  Object.freeze([
    5,
    10,
    15,
    20,
    30,
    40,
    50,
    60,
    70,
    80,
    90,
    100,
    150,
    200
  ]);

const CGWEB129_ASCENT_THRESHOLDS_M =
  Object.freeze([
    500,
    1000,
    1500,
    2000,
    3000,
    4000,
    5000,
    6000,
    7000,
    8000,
    9000,
    10000
  ]);


const firebaseConfig = {
  apiKey:
    "AIzaSyDALtXWRoNHiD9oc4SqxH4tn7HY_08NI1A",

  authDomain:
    "sport-505813.firebaseapp.com",

  projectId:
    "sport-505813",

  storageBucket:
    "sport-505813.firebasestorage.app",

  messagingSenderId:
    "161388578171"
};


const app =
  getApps().length
    ? getApp()
    : initializeApp(
        firebaseConfig
      );

const auth =
  getAuth(app);

const db =
  getFirestore(app);


let cg129User = null;

let cg129Plan = null;

let cg129Running = false;

let cg129AdminObserver = null;

let cg129CurrentActivity = null;

let cg129DetailTicket = 0;

let cg129DetailRaf1 = 0;

let cg129DetailRaf2 = 0;

let cg129DetailMountCount = 0;

let cg129DetailMoveCount = 0;

let cg129DetailRenderCount = 0;

let cg129ActivityCache =
  new Map();


/* ==========================================================================
   FIRESTORE
   ========================================================================== */

function cg129Collection(name) {
  if (!cg129User) {
    throw new Error(
      "Connexion SPORT requise."
    );
  }

  return collection(
    db,
    CGWEB129_ROOT,
    cg129User.uid,
    name
  );
}


function cg129Doc(
  collectionName,
  id
) {
  if (!cg129User) {
    throw new Error(
      "Connexion SPORT requise."
    );
  }

  return doc(
    db,
    CGWEB129_ROOT,
    cg129User.uid,
    collectionName,
    String(id)
  );
}


/* ==========================================================================
   IDENTIFIANTS / ÉTAT
   ========================================================================== */

function cg129DeviceId() {
  const key =
    "sport_cgweb129_device_id";

  try {
    let value =
      localStorage.getItem(
        key
      );

    if (!value) {
      value =
        "web-cg129-" +
        Date.now()
          .toString(36) +
        "-" +
        Math.random()
          .toString(36)
          .slice(2, 9);

      localStorage.setItem(
        key,
        value
      );
    }

    return value;
  } catch (_) {
    return "web-cg129-session";
  }
}


function cg129NextSeq() {
  const key =
    "sport_cgweb129_seq";

  try {
    const next =
      (
        Number(
          localStorage.getItem(
            key
          )
        ) || 0
      ) + 1;

    localStorage.setItem(
      key,
      String(next)
    );

    return next;
  } catch (_) {
    return Date.now();
  }
}


function cg129StateKey() {
  return (
    "SPORT_CGWEB129_" +
    (
      cg129User?.uid ||
      "anonymous"
    ) +
    "_STATE"
  );
}


function cg129ReadState() {
  try {
    const raw =
      localStorage.getItem(
        cg129StateKey()
      );

    return raw
      ? JSON.parse(raw)
      : null;
  } catch (_) {
    return null;
  }
}


function cg129WriteState(
  state
) {
  try {
    localStorage.setItem(
      cg129StateKey(),
      JSON.stringify(
        state
      )
    );
  } catch (_) {}
}


/* ==========================================================================
   OUTILS
   ========================================================================== */

function cg129StableHash(
  value
) {
  let h =
    2166136261;

  const text =
    String(
      value ?? ""
    );

  for (
    let i = 0;
    i < text.length;
    i += 1
  ) {
    h ^=
      text.charCodeAt(i);

    h =
      Math.imul(
        h,
        16777619
      );
  }

  return (
    h >>> 0
  )
    .toString(16)
    .padStart(
      8,
      "0"
    );
}


function cg129FormatNumber(
  value
) {
  return (
    Number(value) || 0
  ).toLocaleString(
    "fr-FR"
  );
}


function cg129FormatDecimal(
  value,
  digits = 2
) {
  return (
    Number(value) || 0
  ).toLocaleString(
    "fr-FR",
    {
      minimumFractionDigits:
        digits,

      maximumFractionDigits:
        digits
    }
  );
}


function cg129IsRunning(
  activity
) {
  /*
   * SPORT = 1 :
   * course à pied, trail,
   * ultrafond et sous-sports
   * Garmin rattachés à RUNNING.
   */
  return (
    Number(
      activity?.sport
    ) === 1
  );
}


function cg129DistanceM(
  activity
) {
  for (
    const raw of [
      activity?.distance_m,
      activity?.total_distance_m
    ]
  ) {
    const value =
      Number(raw);

    if (
      Number.isFinite(value) &&
      value >= 0
    ) {
      return value;
    }
  }

  return 0;
}


function cg129AscentM(
  activity
) {
  for (
    const raw of [
      activity?.ascent_m,
      activity?.total_ascent_m,
      activity?.total_ascent,
      activity?.elevation_gain_m,
      activity?.total_elevation_gain
    ]
  ) {
    const value =
      Number(raw);

    if (
      Number.isFinite(value) &&
      value >= 0
    ) {
      return value;
    }
  }

  return 0;
}


function cg129ActivityKey(
  activity
) {
  return String(
    activity?.__docId ??
    activity?.id ??
    activity?.activity_id ??
    ""
  ).trim();
}


function cg129LocalDayKey(
  startMs
) {
  const ms =
    Number(startMs);

  if (
    !Number.isFinite(ms) ||
    ms <= 0
  ) {
    return null;
  }

  const parts =
    new Intl.DateTimeFormat(
      "fr-FR",
      {
        timeZone:
          CGWEB129_TIMEZONE,

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit"
      }
    ).formatToParts(
      new Date(ms)
    );

  const get =
    type =>
      parts.find(
        part =>
          part.type ===
          type
      )?.value || "";

  const year =
    get("year");

  const month =
    get("month");

  const day =
    get("day");

  if (
    !year ||
    !month ||
    !day
  ) {
    return null;
  }

  return (
    year +
    "-" +
    month +
    "-" +
    day
  );
}


function cg129YearFromDayKey(
  dayKey
) {
  const year =
    Number(
      String(
        dayKey || ""
      ).slice(
        0,
        4
      )
    );

  return (
    Number.isFinite(year) &&
    year >= 1900 &&
    year <= 2200
  )
    ? year
    : null;
}


function cg129DisplayDay(
  dayKey
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/
      .exec(
        String(
          dayKey || ""
        )
      );

  if (!match) {
    return String(
      dayKey || ""
    );
  }

  return (
    match[3] +
    "/" +
    match[2] +
    "/" +
    match[1]
  );
}


function cg129ThresholdLabel(
  value
) {
  return Number(
    value
  ).toLocaleString(
    "fr-FR"
  );
}


/* ==========================================================================
   LIGNES CANONIQUES
   ========================================================================== */

function cg129CanonicalLines(
  value
) {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return value.map(
    row => ({
      kind:
        String(
          row?.kind || ""
        ),

      threshold:
        Number(
          row?.threshold || 0
        ),

      global_rank:
        Number(
          row?.global_rank || 0
        ),

      year:
        Number(
          row?.year || 0
        ),

      year_rank:
        Number(
          row?.year_rank || 0
        ),

      day_key:
        String(
          row?.day_key || ""
        ),

      label:
        String(
          row?.label || ""
        )
    })
  );
}


function cg129SameLines(
  a,
  b
) {
  return (
    JSON.stringify(
      cg129CanonicalLines(a)
    ) ===
    JSON.stringify(
      cg129CanonicalLines(b)
    )
  );
}


/* ==========================================================================
   DAILY_AGGREGATE001
   ========================================================================== */

async function cg129BuildPlan(
  {
    reason = "manual"
  } = {}
) {
  if (!cg129User) {
    throw new Error(
      "Connexion SPORT requise."
    );
  }

  cg129SetStatus(
    "Lecture des activités de course…"
  );

  const snapshot =
    await getDocs(
      cg129Collection(
        "activities"
      )
    );

  const days =
    new Map();

  let runningActivityCount =
    0;

  for (
    const item of
    snapshot.docs
  ) {
    const row = {
      __docId:
        item.id,

      ...item.data()
    };

    if (
      row.deleted_at_ms != null
    ) {
      continue;
    }

    if (
      !cg129IsRunning(
        row
      )
    ) {
      continue;
    }

    const dayKey =
      cg129LocalDayKey(
        row.start_time_ms
      );

    if (!dayKey) {
      continue;
    }

    runningActivityCount += 1;

    const current =
      days.get(
        dayKey
      ) || {
        dayKey,
        year:
          cg129YearFromDayKey(
            dayKey
          ),
        distanceM: 0,
        ascentM: 0,
        activities: [],
        lines: []
      };

    current.distanceM +=
      cg129DistanceM(
        row
      );

    current.ascentM +=
      cg129AscentM(
        row
      );

    current.activities.push(
      row
    );

    days.set(
      dayKey,
      current
    );
  }


  const orderedDays =
    [...days.values()]
      .filter(
        day =>
          day.year
      )
      .sort(
        (a, b) =>
          a.dayKey.localeCompare(
            b.dayKey,
            "fr"
          )
      );


  /*
   * Chaque seuil est une série chronologique indépendante.
   *
   * Une journée >20 km appartient donc simultanément
   * aux séries >5, >10, >15 et >20 km.
   */

  const distanceGlobal =
    new Map();

  const distanceYearly =
    new Map();

  const ascentGlobal =
    new Map();

  const ascentYearly =
    new Map();


  let qualifyingDayCount =
    0;

  let dailyMilestoneLineCount =
    0;


  for (
    const day of
    orderedDays
  ) {
    const lines = [];


    /* ========================================================
       DAILY_DISTANCE_THRESHOLD_RANK001
       MULTI_THRESHOLD_CASCADE001
       ======================================================== */

    for (
      const threshold of
      CGWEB129_DISTANCE_THRESHOLDS_KM
    ) {
      /*
       * "plus de" = comparaison stricte.
       *
       * Exactement 10,000 km
       * ne valide PAS >10 km.
       */
      if (
        !(
          day.distanceM >
          threshold * 1000
        )
      ) {
        continue;
      }

      const globalRank =
        (
          distanceGlobal.get(
            threshold
          ) || 0
        ) + 1;

      distanceGlobal.set(
        threshold,
        globalRank
      );

      const yearKey =
        threshold +
        "::" +
        day.year;

      const yearRank =
        (
          distanceYearly.get(
            yearKey
          ) || 0
        ) + 1;

      distanceYearly.set(
        yearKey,
        yearRank
      );

      lines.push({
        kind:
          "distance",

        threshold,

        unit:
          "km",

        global_rank:
          globalRank,

        year:
          day.year,

        year_rank:
          yearRank,

        day_key:
          day.dayKey,

        label:
          "Jour à plus de " +
          cg129ThresholdLabel(
            threshold
          ) +
          " km #" +
          globalRank +
          " (" +
          day.year +
          " #" +
          yearRank +
          ")"
      });
    }


    /* ========================================================
       DAILY_ASCENT_THRESHOLD_RANK001
       MULTI_THRESHOLD_CASCADE001
       ======================================================== */

    for (
      const threshold of
      CGWEB129_ASCENT_THRESHOLDS_M
    ) {
      if (
        !(
          day.ascentM >
          threshold
        )
      ) {
        continue;
      }

      const globalRank =
        (
          ascentGlobal.get(
            threshold
          ) || 0
        ) + 1;

      ascentGlobal.set(
        threshold,
        globalRank
      );

      const yearKey =
        threshold +
        "::" +
        day.year;

      const yearRank =
        (
          ascentYearly.get(
            yearKey
          ) || 0
        ) + 1;

      ascentYearly.set(
        yearKey,
        yearRank
      );

      lines.push({
        kind:
          "ascent",

        threshold,

        unit:
          "m D+",

        global_rank:
          globalRank,

        year:
          day.year,

        year_rank:
          yearRank,

        day_key:
          day.dayKey,

        label:
          "Jour à plus de " +
          cg129ThresholdLabel(
            threshold
          ) +
          " m D+ #" +
          globalRank +
          " (" +
          day.year +
          " #" +
          yearRank +
          ")"
      });
    }


    day.lines =
      lines;

    if (
      lines.length
    ) {
      qualifyingDayCount +=
        1;

      dailyMilestoneLineCount +=
        lines.length;
    }
  }


  const operations = [];

  let unchangedCount =
    0;

  let activityWithMilestonesCount =
    0;

  const signatureRows =
    [];


  for (
    const day of
    orderedDays
  ) {
    const generated =
      day.lines.length
        ? day.lines
            .map(
              line =>
                line.label
            )
            .join("\n")
        : null;

    const sourceHash =
      cg129StableHash(
        [
          day.dayKey,
          day.distanceM
            .toFixed(3),
          day.ascentM
            .toFixed(3),
          generated || ""
        ].join("|")
      );


    for (
      const activity of
      day.activities
    ) {
      const docId =
        String(
          activity.__docId
        );

      if (!docId) {
        continue;
      }

      if (
        day.lines.length
      ) {
        activityWithMilestonesCount +=
          1;
      }

      signatureRows.push(
        docId +
        "|" +
        sourceHash
      );


      const hadFields =
        activity
          .daily_milestone_generated !=
          null ||
        Array.isArray(
          activity
            .daily_milestone_lines
        ) ||
        Number(
          activity
            .daily_milestone_version ||
          0
        ) > 0;


      /*
       * Pas d'écriture inutile sur les petites journées
       * qui n'ont jamais possédé de jalon.
       */
      if (
        !day.lines.length &&
        !hadFields
      ) {
        continue;
      }


      const expected = {
        daily_milestone_generated:
          generated,

        daily_milestone_lines:
          day.lines,

        daily_milestone_version:
          CGWEB129_VERSION,

        daily_milestone_day_key:
          day.dayKey,

        daily_milestone_distance_m:
          day.distanceM,

        daily_milestone_ascent_m:
          day.ascentM,

        daily_milestone_source_hash:
          sourceHash
      };


      const same =
        String(
          activity
            .daily_milestone_generated ??
          ""
        ) ===
          String(
            generated ??
            ""
          ) &&

        cg129SameLines(
          activity
            .daily_milestone_lines,
          day.lines
        ) &&

        Number(
          activity
            .daily_milestone_version ||
          0
        ) ===
          CGWEB129_VERSION &&

        String(
          activity
            .daily_milestone_day_key ||
          ""
        ) ===
          day.dayKey &&

        Math.abs(
          Number(
            activity
              .daily_milestone_distance_m ||
            0
          ) -
          day.distanceM
        ) < 0.001 &&

        Math.abs(
          Number(
            activity
              .daily_milestone_ascent_m ||
            0
          ) -
          day.ascentM
        ) < 0.001 &&

        String(
          activity
            .daily_milestone_source_hash ||
          ""
        ) ===
          sourceHash;


      if (same) {
        unchangedCount +=
          1;

        cg129ActivityCache.set(
          docId,
          expected
        );

        continue;
      }


      operations.push({
        activityDocId:
          docId,

        activityId:
          String(
            activity.id ??
            docId
          ),

        patch: {
          ...expected,

          daily_milestone_updated_at_ms:
            Date.now()
        }
      });
    }
  }


  signatureRows.sort();


  return {
    reason,

    built_at_ms:
      Date.now(),

    running_activity_count:
      runningActivityCount,

    running_day_count:
      orderedDays.length,

    qualifying_day_count:
      qualifyingDayCount,

    daily_milestone_line_count:
      dailyMilestoneLineCount,

    activity_with_milestones_count:
      activityWithMilestonesCount,

    distance_threshold_count:
      CGWEB129_DISTANCE_THRESHOLDS_KM
        .length,

    ascent_threshold_count:
      CGWEB129_ASCENT_THRESHOLDS_M
        .length,

    mutation_count:
      operations.length,

    unchanged_count:
      unchangedCount,

    sequence_signature:
      cg129StableHash(
        signatureRows.join(
          "||"
        )
      ),

    operations
  };
}


/* ==========================================================================
   ÉCRITURE FIRESTORE
   ========================================================================== */

async function cg129CommitChunk(
  operations
) {
  if (
    !Array.isArray(
      operations
    ) ||
    !operations.length
  ) {
    return;
  }


  const batch =
    writeBatch(db);

  const now =
    Date.now();


  for (
    const op of
    operations
  ) {
    const seq =
      cg129NextSeq();

    const eventId =
      "cgweb129_" +
      now +
      "_" +
      seq +
      "_" +
      Math.random()
        .toString(36)
        .slice(2, 7);


    batch.set(
      cg129Doc(
        "activities",
        op.activityDocId
      ),
      {
        ...op.patch,

        __updatedAtMs:
          now
      },
      {
        merge:
          true
      }
    );


    batch.set(
      cg129Doc(
        "changes",
        eventId
      ),
      {
        eventId,

        deviceId:
          cg129DeviceId(),

        firebaseSeq:
          seq,

        sourceChangeSeq:
          0,

        table:
          "activities",

        rowKey:
          String(
            op.activityDocId
          ),

        operation:
          "UPSERT",

        row:
          op.patch,

        changedAtMs:
          now,

        publishedAt:
          serverTimestamp(),

        androidVersion:
          0,

        webVersion:
          CGWEB129_BUILD
      }
    );
  }


  batch.set(
    cg129Doc(
      "meta",
      "state"
    ),
    {
      updatedAtMs:
        now,

      sourceDeviceId:
        cg129DeviceId(),

      webVersion:
        CGWEB129_BUILD
    },
    {
      merge:
        true
    }
  );


  await batch.commit();


  for (
    const op of
    operations
  ) {
    cg129ActivityCache.set(
      String(
        op.activityDocId
      ),
      op.patch
    );
  }
}


/* ==========================================================================
   PREVIEW / REBUILD / RESUME
   ========================================================================== */

async function cg129ApplyPlan(
  plan,
  {
    confirm = true
  } = {}
) {
  if (
    !plan ||
    cg129Running
  ) {
    return;
  }


  if (
    !plan.operations.length
  ) {
    cg129SetStatus(
      "Tous les jalons quotidiens sont déjà conformes."
    );

    cg129WriteState({
      status:
        "COMPLETE",

      completed_at_ms:
        Date.now(),

      sequence_signature:
        plan.sequence_signature,

      running_day_count:
        plan.running_day_count,

      qualifying_day_count:
        plan.qualifying_day_count,

      mutation_count:
        0
    });

    cg129RenderAdminPlan(
      plan
    );

    return;
  }


  if (confirm) {
    const ok =
      window.confirm(
        "Reconstruire les jalons quotidiens ?\n\n" +
        cg129FormatNumber(
          plan.running_day_count
        ) +
        " journée(s) de course\n" +
        cg129FormatNumber(
          plan.qualifying_day_count
        ) +
        " journée(s) atteignant au moins un seuil\n" +
        cg129FormatNumber(
          plan.daily_milestone_line_count
        ) +
        " jalon(s) quotidien(s)\n" +
        cg129FormatNumber(
          plan.mutation_count
        ) +
        " activité(s) à écrire\n\n" +
        "Chaque seuil est cumulatif : une journée >20 km " +
        "compte aussi pour >5, >10 et >15 km."
      );

    if (!ok) {
      return;
    }
  }


  cg129Running =
    true;

  cg129RenderAdminPlan(
    plan
  );


  const state = {
    status:
      "RUNNING",

    total:
      plan.operations.length,

    cursor:
      0,

    sequence_signature:
      plan.sequence_signature,

    started_at_ms:
      Date.now(),

    updated_at_ms:
      Date.now()
  };

  cg129WriteState(
    state
  );


  try {
    let cursor =
      0;

    while (
      cursor <
      plan.operations.length
    ) {
      const chunk =
        plan.operations.slice(
          cursor,
          cursor +
            CGWEB129_CHUNK
        );

      cg129SetStatus(
        "Reconstruction des jalons · " +
        cg129FormatNumber(
          cursor + 1
        ) +
        " à " +
        cg129FormatNumber(
          Math.min(
            cursor +
              chunk.length,
            plan.operations.length
          )
        ) +
        " / " +
        cg129FormatNumber(
          plan.operations.length
        )
      );


      await cg129CommitChunk(
        chunk
      );


      cursor +=
        chunk.length;

      state.cursor =
        cursor;

      state.updated_at_ms =
        Date.now();

      cg129WriteState(
        state
      );


      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            55
          )
      );
    }


    cg129Plan =
      await cg129BuildPlan({
        reason:
          "historical-verify"
      });


    state.status =
      cg129Plan
        .operations
        .length
        ? "PAUSED"
        : "COMPLETE";

    state.cursor =
      plan.operations.length;

    state.completed_at_ms =
      Date.now();

    state.updated_at_ms =
      Date.now();

    state.remaining_mutations =
      cg129Plan
        .operations
        .length;


    cg129WriteState(
      state
    );

    cg129RenderAdminPlan(
      cg129Plan
    );


    if (
      cg129Plan
        .operations
        .length
    ) {
      cg129SetStatus(
        cg129FormatNumber(
          cg129Plan
            .operations
            .length
        ) +
        " mutation(s) restent à appliquer · utilise Reprendre.",
        true
      );
    } else {
      cg129SetStatus(
        "Reconstruction terminée · état idempotent confirmé · 0 mutation restante."
      );
    }


    cg129RenderCurrentDetail();
  } catch (error) {
    console.error(
      "CGWEB129 rebuild",
      error
    );

    state.status =
      "PAUSED";

    state.last_error =
      error?.message ||
      String(error);

    state.updated_at_ms =
      Date.now();

    cg129WriteState(
      state
    );

    cg129SetStatus(
      "Reconstruction interrompue : " +
      state.last_error +
      " · Reprendre recalculera uniquement ce qui reste.",
      true
    );

    cg129Plan =
      null;
  } finally {
    cg129Running =
      false;

    cg129RenderAdminPlan(
      cg129Plan
    );
  }
}


async function cg129Preview() {
  if (
    cg129Running
  ) {
    return;
  }

  cg129Running =
    true;

  cg129RenderAdminPlan();


  try {
    cg129Plan =
      await cg129BuildPlan({
        reason:
          "preview"
      });

    cg129RenderAdminPlan(
      cg129Plan
    );

    cg129SetStatus(
      "Prévisualisation prête · " +
      cg129FormatNumber(
        cg129Plan
          .mutation_count
      ) +
      " activité(s) à mettre à jour."
    );
  } catch (error) {
    console.error(
      "CGWEB129 preview",
      error
    );

    cg129Plan =
      null;

    cg129SetStatus(
      error?.message ||
      String(error),
      true
    );
  } finally {
    cg129Running =
      false;

    cg129RenderAdminPlan(
      cg129Plan
    );
  }
}


async function cg129Rebuild() {
  if (
    cg129Running
  ) {
    return;
  }

  if (!cg129Plan) {
    await cg129Preview();
  }

  if (!cg129Plan) {
    return;
  }

  await cg129ApplyPlan(
    cg129Plan,
    {
      confirm:
        true
    }
  );
}


async function cg129Resume() {
  if (
    cg129Running
  ) {
    return;
  }

  try {
    cg129SetStatus(
      "Recalcul de l’état courant avant reprise…"
    );

    cg129Plan =
      await cg129BuildPlan({
        reason:
          "resume"
      });

    cg129RenderAdminPlan(
      cg129Plan
    );

    await cg129ApplyPlan(
      cg129Plan,
      {
        confirm:
          false
      }
    );
  } catch (error) {
    cg129SetStatus(
      error?.message ||
      String(error),
      true
    );
  }
}


/* ==========================================================================
   PANNEAU PLUS > REPÈRES AVANCÉS
   ========================================================================== */

function cg129EnsureAdminPanel() {
  const scope =
    document.getElementById(
      "advancedLandmarksSection"
    );

  if (!scope) {
    return null;
  }


  let host =
    document.getElementById(
      "cgweb129DailyMilestonePanel"
    );

  if (host) {
    return host;
  }


  host =
    document.createElement(
      "div"
    );

  host.id =
    "cgweb129DailyMilestonePanel";

  host.className =
    "cg124-index";


  host.innerHTML = `
    <div class="cg124-head">
      <div>
        <strong>Jalons quotidiens distance / D+</strong>

        <div
          id="cgweb129Meta"
          class="muted"
        >
          Course uniquement · cumul de toutes les activités d’une même journée · seuils strictement dépassés.
        </div>
      </div>

      <div class="cg124-actions">
        <button
          id="cgweb129Preview"
          class="secondary"
          type="button"
        >Prévisualiser</button>

        <button
          id="cgweb129Rebuild"
          class="primary"
          type="button"
          disabled
        >Reconstruire les jalons</button>

        <button
          id="cgweb129Resume"
          class="secondary"
          type="button"
          disabled
        >Reprendre</button>
      </div>
    </div>

    <div
      id="cgweb129Status"
      class="muted"
    >
      Distance : 5 à 200 km · D+ : 500 à 10 000 m · rang global + rang annuel.
    </div>
  `;


  const anchor =
    document.getElementById(
      "cgweb126SequenceRebuildPanel"
    ) ||
    document.getElementById(
      "cg124ReinjectPanel"
    ) ||
    document.getElementById(
      "cgweb124GpsMarkerSection"
    );


  if (
    anchor &&
    anchor.parentElement
  ) {
    anchor.insertAdjacentElement(
      "afterend",
      host
    );
  } else {
    scope.appendChild(
      host
    );
  }


  host
    .querySelector(
      "#cgweb129Preview"
    )
    ?.addEventListener(
      "click",
      () =>
        void cg129Preview()
    );


  host
    .querySelector(
      "#cgweb129Rebuild"
    )
    ?.addEventListener(
      "click",
      () =>
        void cg129Rebuild()
    );


  host
    .querySelector(
      "#cgweb129Resume"
    )
    ?.addEventListener(
      "click",
      () =>
        void cg129Resume()
    );


  return host;
}


function cg129SetStatus(
  text,
  error = false
) {
  const node =
    document.getElementById(
      "cgweb129Status"
    );

  if (!node) {
    return;
  }

  node.textContent =
    String(
      text || ""
    );

  node.classList.toggle(
    "cg129-error",
    Boolean(error)
  );
}


function cg129RenderAdminPlan(
  plan = cg129Plan
) {
  cg129EnsureAdminPanel();


  const meta =
    document.getElementById(
      "cgweb129Meta"
    );

  const preview =
    document.getElementById(
      "cgweb129Preview"
    );

  const rebuild =
    document.getElementById(
      "cgweb129Rebuild"
    );

  const resume =
    document.getElementById(
      "cgweb129Resume"
    );


  if (preview) {
    preview.disabled =
      cg129Running;
  }


  if (rebuild) {
    rebuild.disabled =
      cg129Running ||
      !plan ||
      Number(
        plan.mutation_count ||
        0
      ) === 0;
  }


  const state =
    cg129ReadState();


  if (resume) {
    resume.disabled =
      cg129Running ||
      !state ||
      state.status !==
        "PAUSED";
  }


  if (
    meta &&
    plan
  ) {
    meta.textContent =
      cg129FormatNumber(
        plan.running_day_count
      ) +
      " jour(s) de course · " +

      cg129FormatNumber(
        plan.qualifying_day_count
      ) +
      " jour(s) avec ≥1 jalon · " +

      cg129FormatNumber(
        plan.daily_milestone_line_count
      ) +
      " jalon(s) · " +

      cg129FormatNumber(
        plan.activity_with_milestones_count
      ) +
      " activité(s) concernée(s) · " +

      cg129FormatNumber(
        plan.mutation_count
      ) +
      " activité(s) à écrire · " +

      cg129FormatNumber(
        plan.unchanged_count
      ) +
      " déjà conforme(s).";
  }
}


function cg129WatchAdminPanel() {
  const scope =
    document.getElementById(
      "advancedLandmarksSection"
    );

  window
    .__cgweb129AdminObserverRoot =
    scope?.id || null;


  if (
    cg129EnsureAdminPanel()
  ) {
    if (
      cg129AdminObserver
    ) {
      cg129AdminObserver
        .disconnect();

      cg129AdminObserver =
        null;
    }

    return;
  }


  if (
    !scope ||
    cg129AdminObserver
  ) {
    return;
  }


  cg129AdminObserver =
    new MutationObserver(
      () => {
        if (
          cg129EnsureAdminPanel()
        ) {
          cg129AdminObserver
            ?.disconnect();

          cg129AdminObserver =
            null;
        }
      }
    );


  cg129AdminObserver.observe(
    scope,
    {
      childList:
        true,

      subtree:
        true
    }
  );
}


/* ==========================================================================
   PANNEAU FICHE ACTIVITÉ
   ========================================================================== */

function cg129EnsureStyle() {
  if (
    document.getElementById(
      "cgweb129Style"
    )
  ) {
    return;
  }


  const style =
    document.createElement(
      "style"
    );

  style.id =
    "cgweb129Style";


  style.textContent = `
    #cgweb129DailyDetailPanel{
      display:grid;
      gap:10px;
    }

    .cg129-detail-head{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
      flex-wrap:wrap;
    }

    .cg129-day-meta{
      font-variant-numeric:tabular-nums;
    }

    .cg129-groups{
      display:grid;
      grid-template-columns:
        repeat(
          2,
          minmax(0,1fr)
        );
      gap:12px;
    }

    .cg129-group{
      display:grid;
      gap:6px;
      min-width:0;
    }

    .cg129-group-title{
      font-weight:700;
    }

    .cg129-lines{
      display:grid;
      gap:5px;
    }

    .cg129-line{
      padding:7px 10px;
      border:
        1px solid
        rgba(190,255,55,.14);
      border-radius:9px;
      background:
        rgba(156,255,34,.025);
      line-height:1.35;
    }

    .cg129-error{
      color:#ff8d8d!important;
    }

    @media(max-width:800px){
      .cg129-groups{
        grid-template-columns:1fr;
      }
    }
  `;


  document.head.appendChild(
    style
  );
}


function cg129HasHiddenAncestor(
  node,
  stop
) {
  let current =
    node?.parentElement ||
    null;

  while (
    current &&
    current !== stop
  ) {
    if (
      current.hidden ||
      current.classList
        ?.contains(
          "hidden"
        ) ||
      current.getAttribute?.(
        "aria-hidden"
      ) === "true"
    ) {
      return true;
    }

    current =
      current.parentElement;
  }

  return false;
}


function cg129RevisionAnchor(
  detail
) {
  const revision =
    detail.querySelector(
      "#cgweb084RevisionSection"
    );

  if (!revision) {
    return null;
  }


  let anchor =
    revision;


  while (
    anchor.parentElement &&
    anchor.parentElement !==
      detail &&
    anchor.parentElement.id !==
      "cgweb111Fix3BottomStack"
  ) {
    anchor =
      anchor.parentElement;
  }


  if (
    !anchor.parentElement
  ) {
    return null;
  }


  return {
    parent:
      anchor.parentElement,

    anchor,

    mode:
      "before-revision"
  };
}


function cg129ResolveDetailAnchor(
  detail
) {
  /*
   * Première préférence :
   * juste après "Suivi des repères".
   */
  const sequence =
    detail.querySelector(
      "#cgweb126SequenceField"
    );

  if (
    sequence &&
    !sequence.hidden &&
    !cg129HasHiddenAncestor(
      sequence,
      detail
    ) &&
    sequence.parentElement
  ) {
    return {
      parent:
        sequence.parentElement,

      after:
        sequence,

      anchor:
        sequence
          .nextElementSibling,

      mode:
        "after-landmark-sequence"
    };
  }


  /*
   * Deuxième préférence :
   * avant Historique des modifications.
   */
  const revisionTarget =
    cg129RevisionAnchor(
      detail
    );

  if (
    revisionTarget
  ) {
    return revisionTarget;
  }


  /*
   * Fallback :
   * avant navigation inférieure.
   */
  const bottomNav =
    detail.querySelector(
      ".detail-bottom-nav"
    );

  if (
    bottomNav &&
    bottomNav.parentElement
  ) {
    return {
      parent:
        bottomNav.parentElement,

      anchor:
        bottomNav,

      mode:
        "before-bottom-nav"
    };
  }


  return {
    parent:
      detail,

    anchor:
      null,

    mode:
      "detail-end"
  };
}


function cg129PlaceDetailPanel(
  host,
  detail
) {
  const target =
    cg129ResolveDetailAnchor(
      detail
    );


  if (
    !target?.parent
  ) {
    return false;
  }


  const wasConnected =
    host.isConnected;


  let correct =
    false;


  if (
    target.mode ===
      "after-landmark-sequence" &&
    target.after
  ) {
    correct =
      host.parentElement ===
        target.parent &&
      host.previousElementSibling ===
        target.after;
  } else if (
    target.anchor
  ) {
    correct =
      host.parentElement ===
        target.parent &&
      host.nextElementSibling ===
        target.anchor;
  } else {
    correct =
      host.parentElement ===
        target.parent &&
      target.parent
        .lastElementChild ===
        host;
  }


  if (!correct) {
    if (
      target.mode ===
        "after-landmark-sequence" &&
      target.after
    ) {
      target.after
        .insertAdjacentElement(
          "afterend",
          host
        );
    } else if (
      target.anchor
    ) {
      target.parent
        .insertBefore(
          host,
          target.anchor
        );
    } else {
      target.parent
        .appendChild(
          host
        );
    }


    if (wasConnected) {
      cg129DetailMoveCount +=
        1;
    }
  }


  host.hidden =
    false;

  host.classList.remove(
    "hidden"
  );

  host.removeAttribute(
    "aria-hidden"
  );

  host.dataset.cgweb129Anchor =
    target.mode;


  return true;
}


function cg129EnsureDetailPanel() {
  cg129EnsureStyle();


  const detail =
    document.getElementById(
      "detailView"
    );


  if (
    !detail ||
    detail.classList.contains(
      "hidden"
    )
  ) {
    return null;
  }


  let host =
    document.getElementById(
      "cgweb129DailyDetailPanel"
    );


  if (!host) {
    host =
      document.createElement(
        "section"
      );

    host.id =
      "cgweb129DailyDetailPanel";

    host.className =
      "detail-section panel";


    host.innerHTML = `
      <div class="cg129-detail-head">
        <strong>Jalons quotidiens</strong>

        <span
          id="cgweb129DayMeta"
          class="muted cg129-day-meta"
        ></span>
      </div>

      <div class="cg129-groups">
        <div
          id="cgweb129DistanceGroup"
          class="cg129-group"
        >
          <div class="cg129-group-title">
            Distance
          </div>

          <div
            id="cgweb129DistanceLines"
            class="cg129-lines"
          ></div>
        </div>

        <div
          id="cgweb129AscentGroup"
          class="cg129-group"
        >
          <div class="cg129-group-title">
            D+
          </div>

          <div
            id="cgweb129AscentLines"
            class="cg129-lines"
          ></div>
        </div>
      </div>
    `;


    cg129DetailMountCount +=
      1;
  }


  if (
    !cg129PlaceDetailPanel(
      host,
      detail
    )
  ) {
    return null;
  }


  return host;
}


function cg129EffectiveActivity(
  activity
) {
  const key =
    cg129ActivityKey(
      activity
    );

  const cached =
    cg129ActivityCache.get(
      key
    ) || {};


  return {
    ...activity,
    ...cached
  };
}


function cg129RenderLineList(
  host,
  lines
) {
  if (!host) {
    return;
  }


  host.replaceChildren();


  for (
    const line of
    lines
  ) {
    const row =
      document.createElement(
        "div"
      );

    row.className =
      "cg129-line";

    row.textContent =
      String(
        line?.label || ""
      );

    host.appendChild(
      row
    );
  }
}


function cg129RenderDetail(
  activity
) {
  /*
   * CGWEB130 · LANDMARK_MILESTONE_MERGE001
   *
   * Le détail CGWEB129 autonome est retiré.
   * CGWEB126 affiche désormais :
   * - les passages de repères ;
   * - le seuil distance maximal ;
   * - le seuil D+ maximal.
   */
  cg129CurrentActivity =
    activity || null;

  const existing =
    document.getElementById(
      "cgweb129DailyDetailPanel"
    );

  if (existing) {
    existing.remove();
  }

  window
    .__cgweb130MilestonePanelMerged =
    true;
}


function cg129ScheduleDetailRender(
  activity
) {
  const ticket =
    ++cg129DetailTicket;


  if (cg129DetailRaf1) {
    cancelAnimationFrame(
      cg129DetailRaf1
    );
  }


  if (cg129DetailRaf2) {
    cancelAnimationFrame(
      cg129DetailRaf2
    );
  }


  /*
   * Deux RAF :
   * CGWEB126 a le temps de placer
   * "Suivi des repères" avant que
   * CGWEB129 choisisse son ancre.
   */
  cg129DetailRaf1 =
    requestAnimationFrame(
      () => {
        cg129DetailRaf1 =
          0;

        if (
          ticket !==
          cg129DetailTicket
        ) {
          return;
        }


        cg129DetailRaf2 =
          requestAnimationFrame(
            () => {
              cg129DetailRaf2 =
                0;

              if (
                ticket !==
                cg129DetailTicket
              ) {
                return;
              }

              cg129RenderDetail(
                activity
              );
            }
          );
      }
    );
}


function cg129RenderCurrentDetail() {
  if (
    !cg129CurrentActivity
  ) {
    return;
  }

  cg129ScheduleDetailRender(
    cg129CurrentActivity
  );
}


/* ==========================================================================
   ÉVÉNEMENTS
   ========================================================================== */

window.addEventListener(
  "sport-activity-detail-render",
  event => {
    cg129ScheduleDetailRender(
      event.detail
        ?.activity ||
      null
    );
  }
);


/* ==========================================================================
   AUTH
   ========================================================================== */

onAuthStateChanged(
  auth,
  user => {
    cg129User =
      user || null;

    cg129Plan =
      null;

    cg129ActivityCache =
      new Map();


    if (!cg129User) {
      cg129SetStatus(
        "Connexion SPORT requise."
      );

      return;
    }


    cg129WatchAdminPanel();

    cg129RenderAdminPlan();


    const state =
      cg129ReadState();


    if (
      state?.status ===
      "COMPLETE"
    ) {
      cg129SetStatus(
        "Jalons quotidiens historiques disponibles."
      );
    } else if (
      state?.status ===
      "PAUSED"
    ) {
      cg129SetStatus(
        "Reconstruction interrompue · utilise Reprendre."
      );
    }
  }
);


/* ==========================================================================
   INITIALISATION
   ========================================================================== */

cg129EnsureStyle();

cg129WatchAdminPanel();


/* ==========================================================================
   STATUS
   ========================================================================== */

window.CGWEB129_STATUS =
  () => ({
    build:
      CGWEB129_BUILD,

    daily_distance_threshold_rank:
      "DAILY_DISTANCE_THRESHOLD_RANK001",

    daily_ascent_threshold_rank:
      "DAILY_ASCENT_THRESHOLD_RANK001",

    multi_threshold_cascade:
      "MULTI_THRESHOLD_CASCADE001",

    yearly_daily_rank:
      "YEARLY_DAILY_RANK001",

    daily_aggregate:
      "DAILY_AGGREGATE001",

    daily_milestone_max_only:
      "DAILY_MILESTONE_MAX_ONLY001",

    detail_display:
      "MERGED_INTO_CGWEB126",

    running_sport:
      1,

    timezone:
      CGWEB129_TIMEZONE,

    threshold_operator:
      "STRICT_GT",

    distance_thresholds_km:
      [
        ...CGWEB129_DISTANCE_THRESHOLDS_KM
      ],

    ascent_thresholds_m:
      [
        ...CGWEB129_ASCENT_THRESHOLDS_M
      ],

    running:
      cg129Running,

    planned_mutations:
      cg129Plan
        ?.mutation_count ||
      0,

    planned_running_days:
      cg129Plan
        ?.running_day_count ||
      0,

    planned_qualifying_days:
      cg129Plan
        ?.qualifying_day_count ||
      0,

    detail_panel_present:
      Boolean(
        document.getElementById(
          "cgweb129DailyDetailPanel"
        )
      ),

    detail_panel_mount_count:
      cg129DetailMountCount,

    detail_panel_move_count:
      cg129DetailMoveCount,

    detail_render_count:
      cg129DetailRenderCount,

    detail_mutation_observer:
      false,

    admin_observer_root:
      window
        .__cgweb129AdminObserverRoot ||
      null,

    last_rendered_activity_id:
      window
        .__cgweb129LastRenderedActivity ||
      null,

    state:
      cg129ReadState()
  });


console.info(
  "CGWEB129 actif · " +
  "DAILY_DISTANCE_THRESHOLD_RANK001 / " +
  "DAILY_ASCENT_THRESHOLD_RANK001 / " +
  "MULTI_THRESHOLD_CASCADE001 / " +
  "YEARLY_DAILY_RANK001 / " +
  "DAILY_AGGREGATE001"
);
