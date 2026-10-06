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
   CGWEB126
   LANDMARK_SEQUENCE_RANK001 / SPORT_SCOPED_RANK001
   YEARLY_LANDMARK_RANK001 / MULTIPASS_SEQUENCE_LABEL001
   EDITABLE_SEQUENCE_OVERRIDE001 / HISTORICAL_SEQUENCE_REBUILD001
   INCREMENTAL_SEQUENCE_REFRESH001
   ========================================================================== */

const CGWEB126_BUILD = "CGWEB126";
const CGWEB126_ROOT = "sport_users";
const CGWEB126_CHUNK = 80;
const CGWEB126_TIMEZONE = "Europe/Paris";
const CGWEB126_SEQUENCE_VERSION = 1;

const firebaseConfig = {
  apiKey: "AIzaSyDALtXWRoNHiD9oc4SqxH4tn7HY_08NI1A",
  authDomain: "sport-505813.firebaseapp.com",
  projectId: "sport-505813",
  storageBucket: "sport-505813.firebasestorage.app",
  messagingSenderId: "161388578171"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let cg126User = null;
let cg126Plan = null;
let cg126Running = false;
let cg126CurrentActivity = null;
let cg126PanelObserver = null;
let cg126IncrementalTimer = null;
let cg126SequenceCache = new Map();

/* CGWEB128 · détail asynchrone / idempotent */
let cg126DetailRenderRaf = null;
let cg126PendingDetailActivity = null;
let cg126DetailRenderCount = 0;
let cg126DetailPanelMountCount = 0;
let cg126DetailPanelMoveCount = 0;

function cg126UserCollection(name) {
  if (!cg126User) throw new Error("Connexion SPORT requise.");
  return collection(db, CGWEB126_ROOT, cg126User.uid, name);
}

function cg126UserDoc(collectionName, id) {
  if (!cg126User) throw new Error("Connexion SPORT requise.");
  return doc(db, CGWEB126_ROOT, cg126User.uid, collectionName, String(id));
}

function cg126DeviceId() {
  const key = "sport_cgweb126_device_id";
  try {
    let value = localStorage.getItem(key);
    if (!value) {
      value = "web-cg126-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
      localStorage.setItem(key, value);
    }
    return value;
  } catch (_) {
    return "web-cg126-session";
  }
}

function cg126NextSeq() {
  const key = "sport_cgweb126_seq";
  try {
    const next = (Number(localStorage.getItem(key)) || 0) + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch (_) {
    return Date.now();
  }
}

function cg126StateKey() {
  return `SPORT_CGWEB126_${cg126User?.uid || "anonymous"}_STATE`;
}

function cg126ReadState() {
  try {
    const raw = localStorage.getItem(cg126StateKey());
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function cg126WriteState(state) {
  try {
    localStorage.setItem(cg126StateKey(), JSON.stringify(state));
  } catch (_) {}
}

function cg126FormatNumber(value) {
  return (Number(value) || 0).toLocaleString("fr-FR");
}

function cg126StableHash(text) {
  let h = 2166136261;
  const value = String(text ?? "");
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function cg126SportBucket(sport) {
  const value = Number(sport || 0);
  if (value === 1) return "RUN";
  if (value === 2) return "BIKE";
  return "OTHER";
}

function cg126LandmarkAllowedForSport(sport, code) {
  const value = Number(sport || 0);
  const marker = String(code || "").trim().toUpperCase();

  if (marker === "B") return value === 1;
  if (marker === "V") return value === 2;

  return true;
}

function cg126FilterStoredSequenceForSport(activity) {
  if (!activity) return activity;

  const sport =
    Number(activity.sport || 0);

  const hasStructuredLines =
    Array.isArray(
      activity.landmark_sequence_lines
    );

  const filteredLines =
    hasStructuredLines
      ? activity
          .landmark_sequence_lines
          .filter(
            (row) =>
              cg126LandmarkAllowedForSport(
                sport,
                row?.landmark_code
              )
          )
      : [];

  let generated = null;

  if (hasStructuredLines) {
    const labels =
      filteredLines
        .map(
          (row) =>
            String(
              row?.label || ""
            ).trim()
        )
        .filter(Boolean);

    generated =
      labels.length
        ? labels.join("\n")
        : null;
  } else {
    /*
     * Repli pour une ancienne donnée qui ne posséderait
     * que landmark_sequence_generated.
     */
    const labels =
      String(
        activity
          .landmark_sequence_generated ||
        ""
      )
        .split(/\r?\n/)
        .filter(
          (line) => {
            const match =
              /^\s*([A-Z0-9_-]+)\s+#/i
                .exec(line);

            return (
              !match ||
              cg126LandmarkAllowedForSport(
                sport,
                match[1]
              )
            );
          }
        )
        .map(
          (line) =>
            line.trim()
        )
        .filter(Boolean);

    generated =
      labels.length
        ? labels.join("\n")
        : null;
  }

  return {
    ...activity,
    landmark_sequence_lines:
      filteredLines,
    landmark_sequence_generated:
      generated
  };
}

function cg126Year(startMs) {
  const ms = Number(startMs);
  if (!Number.isFinite(ms) || ms <= 0) return null;

  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: CGWEB126_TIMEZONE,
    year: "numeric"
  }).formatToParts(new Date(ms));

  const value = Number(parts.find((part) => part.type === "year")?.value);

  return Number.isFinite(value) && value >= 1900 && value <= 2200
    ? value
    : null;
}

function cg126ActivityKeys(row) {
  return [row?.__docId, row?.id, row?.activity_id]
    .filter((value) => value !== null && value !== undefined && String(value).trim())
    .map((value) => String(value).trim());
}

function cg126CanonicalLines(value) {
  return Array.isArray(value)
    ? value.map((row) => ({
        landmark_code: String(row?.landmark_code || ""),
        sport_bucket: String(row?.sport_bucket || ""),
        global_rank: Number(row?.global_rank || 0),
        year: Number(row?.year || 0),
        year_rank: Number(row?.year_rank || 0),
        occurrence_index: Number(row?.occurrence_index || 0),
        occurrence_total: Number(row?.occurrence_total || 0),
        label: String(row?.label || "")
      }))
    : [];
}

function cg126SameLines(a, b) {
  return JSON.stringify(cg126CanonicalLines(a)) === JSON.stringify(cg126CanonicalLines(b));
}

/* LANDMARK_SEQUENCE_RANK001 / SPORT_SCOPED_RANK001 / YEARLY_LANDMARK_RANK001 */
async function cg126BuildPlan({reason = "manual"} = {}) {
  if (!cg126User) throw new Error("Connexion SPORT requise.");

  cg126SetStatus("Lecture des activités et des repères…");

  const [activitySnap, linkSnap, landmarkSnap] = await Promise.all([
    getDocs(cg126UserCollection("activities")),
    getDocs(cg126UserCollection("activity_landmarks")),
    getDocs(cg126UserCollection("landmarks"))
  ]);

  const activities = [];
  const activityByKey = new Map();

  for (const item of activitySnap.docs) {
    const row = {__docId: item.id, ...item.data()};
    if (row.deleted_at_ms != null) continue;

    activities.push(row);

    for (const key of cg126ActivityKeys(row)) {
      if (!activityByKey.has(key)) activityByKey.set(key, row);
    }
  }

  const landmarkOrder = new Map();

  for (const item of landmarkSnap.docs) {
    const row = item.data() || {};
    const code = String(row.code ?? row.__sportKey ?? item.id).trim();
    if (!code) continue;
    landmarkOrder.set(code, Number(row.sort_order) || 9999);
  }

  /*
   * Une éventuelle duplication historique activity_id + code est aplatie.
   * Le compteur officiel reste le maximum des occurrences observées.
   */
  const canonicalLinks = new Map();
  let invalidLinks = 0;

  for (const item of linkSnap.docs) {
    const row = item.data() || {};
    const activityId = String(row.activity_id ?? "").trim();
    const code = String(row.landmark_code ?? "").trim();
    const count = Math.max(0, Math.min(99, Number(row.occurrences) || 0));

    if (!activityId || !code || count <= 0) continue;

    const activity = activityByKey.get(activityId);

    if (!activity) {
      invalidLinks += 1;
      continue;
    }

    /*
     * CGWEB130 FIX2 · SPORT_SCOPED_BV001
     *
     * Les anciens liens incompatibles peuvent subsister en stockage,
     * mais ils ne participent jamais aux séries chronologiques.
     */
    if (
      !cg126LandmarkAllowedForSport(
        activity.sport,
        code
      )
    ) {
      invalidLinks += 1;
      continue;
    }

    const startMs =
      Number(
        activity.start_time_ms
      );
    const year = cg126Year(startMs);

    if (!Number.isFinite(startMs) || startMs <= 0 || !year) {
      invalidLinks += 1;
      continue;
    }

    const key = `${activity.__docId}::${code}`;
    const current = canonicalLinks.get(key);

    if (!current || count > current.count) {
      canonicalLinks.set(key, {
        activity,
        activityDocId: String(activity.__docId),
        activityId,
        code,
        count,
        startMs,
        year,
        sportBucket: cg126SportBucket(activity.sport)
      });
    }
  }

  const scopes = new Map();

  for (const link of canonicalLinks.values()) {
    const scopeKey = `${link.sportBucket}::${link.code}`;
    const rows = scopes.get(scopeKey) || [];
    rows.push(link);
    scopes.set(scopeKey, rows);
  }

  const byActivity = new Map();
  let passageLineCount = 0;

  for (const [scopeKey, rows] of scopes) {
    rows.sort(
      (a, b) =>
        a.startMs - b.startMs ||
        a.activityDocId.localeCompare(b.activityDocId, "fr")
    );

    let globalRank = 0;
    const yearly = new Map();

    for (const row of rows) {
      for (let occurrenceIndex = 1; occurrenceIndex <= row.count; occurrenceIndex++) {
        globalRank += 1;

        const yearRank = (yearly.get(row.year) || 0) + 1;
        yearly.set(row.year, yearRank);

        const line = {
          landmark_code: row.code,
          sport_bucket: row.sportBucket,
          scope_key: scopeKey,
          global_rank: globalRank,
          year: row.year,
          year_rank: yearRank,
          occurrence_index: occurrenceIndex,
          occurrence_total: row.count,
          label: `${row.code} #${globalRank} (${row.year} #${yearRank})`
        };

        const list = byActivity.get(row.activityDocId) || [];
        list.push(line);
        byActivity.set(row.activityDocId, list);
        passageLineCount += 1;
      }
    }
  }

  const operations = [];
  let unchanged = 0;
  let activityWithSequenceCount = 0;
  const expectedSignatureRows = [];

  for (const activity of activities) {
    const docId = String(activity.__docId);

    const lines = (byActivity.get(docId) || [])
      .slice()
      .sort(
        (a, b) =>
          (landmarkOrder.get(a.landmark_code) || 9999) -
            (landmarkOrder.get(b.landmark_code) || 9999) ||
          a.landmark_code.localeCompare(b.landmark_code, "fr") ||
          a.global_rank - b.global_rank
      );

    const generated = lines.length
      ? lines.map((line) => line.label).join("\n")
      : null;

    if (lines.length) activityWithSequenceCount += 1;

    expectedSignatureRows.push(`${docId}|${String(generated || "")}`);

    const hadSequenceFields =
      activity.landmark_sequence_generated != null ||
      Array.isArray(activity.landmark_sequence_lines) ||
      Number(activity.landmark_sequence_version || 0) > 0;

    /*
     * Ne pas écrire les milliers d'activités sans repère lors du premier rebuild.
     * Si une ancienne séquence existe et devient vide, elle est bien nettoyée.
     */
    if (!lines.length && !hadSequenceFields) continue;

    const sourceHash = cg126StableHash([
      String(activity.start_time_ms || ""),
      String(activity.sport || ""),
      generated || ""
    ].join("|"));

    const same =
      String(activity.landmark_sequence_generated ?? "") === String(generated ?? "") &&
      cg126SameLines(activity.landmark_sequence_lines, lines) &&
      Number(activity.landmark_sequence_version || 0) === CGWEB126_SEQUENCE_VERSION &&
      String(activity.landmark_sequence_source_hash || "") === sourceHash;

    if (same) {
      unchanged += 1;

      cg126SequenceCache.set(docId, {
        landmark_sequence_generated: generated,
        landmark_sequence_lines: lines,
        landmark_sequence_version: CGWEB126_SEQUENCE_VERSION,
        landmark_sequence_source_hash: sourceHash
      });

      continue;
    }

    const patch = {
      landmark_sequence_generated: generated,
      landmark_sequence_lines: lines,
      landmark_sequence_version: CGWEB126_SEQUENCE_VERSION,
      landmark_sequence_sport_bucket: cg126SportBucket(activity.sport),
      landmark_sequence_source_hash: sourceHash,
      landmark_sequence_updated_at_ms: Date.now()
    };

    operations.push({
      activityDocId: docId,
      activityId: String(activity.id ?? docId),
      patch
    });
  }

  expectedSignatureRows.sort();

  return {
    reason,
    built_at_ms: Date.now(),
    activity_count: activities.length,
    activity_with_sequence_count: activityWithSequenceCount,
    landmark_link_count: canonicalLinks.size,
    passage_line_count: passageLineCount,
    scope_count: scopes.size,
    invalid_link_count: invalidLinks,
    mutation_count: operations.length,
    unchanged_count: unchanged,
    sequence_signature: cg126StableHash(expectedSignatureRows.join("||")),
    operations
  };
}

/* HISTORICAL_SEQUENCE_REBUILD001 */
async function cg126CommitChunk(operations) {
  if (!Array.isArray(operations) || !operations.length) return;

  const batch = writeBatch(db);
  const now = Date.now();

  for (const op of operations) {
    const seq = cg126NextSeq();
    const eventId =
      `cgweb126_${now}_${seq}_${Math.random().toString(36).slice(2, 7)}`;

    batch.set(
      cg126UserDoc("activities", op.activityDocId),
      {
        ...op.patch,
        __updatedAtMs: now
      },
      {merge: true}
    );

    batch.set(
      cg126UserDoc("changes", eventId),
      {
        eventId,
        deviceId: cg126DeviceId(),
        firebaseSeq: seq,
        sourceChangeSeq: 0,
        table: "activities",
        rowKey: String(op.activityDocId),
        operation: "UPSERT",
        row: op.patch,
        changedAtMs: now,
        publishedAt: serverTimestamp(),
        androidVersion: 0,
        webVersion: CGWEB126_BUILD
      }
    );
  }

  batch.set(
    cg126UserDoc("meta", "state"),
    {
      updatedAtMs: now,
      sourceDeviceId: cg126DeviceId(),
      webVersion: CGWEB126_BUILD
    },
    {merge: true}
  );

  await batch.commit();

  for (const op of operations) {
    cg126SequenceCache.set(String(op.activityDocId), op.patch);
  }
}

async function cg126ApplyPlan(
  plan,
  {confirm = true, incremental = false} = {}
) {
  if (!plan || cg126Running) return;

  if (!plan.operations.length) {
    cg126SetStatus(
      incremental
        ? "INCREMENTAL_SEQUENCE_REFRESH001 · aucun rang à modifier."
        : "Toutes les séquences sont déjà conformes."
    );

    cg126WriteState({
      status: "COMPLETE",
      completed_at_ms: Date.now(),
      sequence_signature: plan.sequence_signature,
      passage_line_count: plan.passage_line_count,
      activity_with_sequence_count: plan.activity_with_sequence_count,
      mutation_count: 0
    });

    cg126RenderPlan(plan);
    return;
  }

  if (confirm) {
    const ok = window.confirm(
      "Reconstruire les rangs chronologiques des repères ?\n\n" +
      `${plan.passage_line_count.toLocaleString("fr-FR")} ligne(s) de passage\n` +
      `${plan.activity_with_sequence_count.toLocaleString("fr-FR")} activité(s) avec séquence\n` +
      `${plan.mutation_count.toLocaleString("fr-FR")} activité(s) à mettre à jour\n\n` +
      "Course et vélo utilisent des séries indépendantes.\n" +
      "Chaque passage multiple consomme son propre rang.\n" +
      "Les overrides personnalisés ne sont jamais écrasés."
    );

    if (!ok) return;
  }

  cg126Running = true;
  cg126RenderPlan(plan);

  const state = {
    status: "RUNNING",
    incremental: Boolean(incremental),
    total: plan.operations.length,
    cursor: 0,
    sequence_signature: plan.sequence_signature,
    passage_line_count: plan.passage_line_count,
    started_at_ms: Date.now(),
    updated_at_ms: Date.now()
  };

  cg126WriteState(state);

  try {
    let cursor = 0;

    while (cursor < plan.operations.length) {
      const chunk = plan.operations.slice(cursor, cursor + CGWEB126_CHUNK);

      cg126SetStatus(
        `${incremental ? "INCREMENTAL_SEQUENCE_REFRESH001" : "HISTORICAL_SEQUENCE_REBUILD001"} · ` +
        `${cg126FormatNumber(cursor + 1)} à ` +
        `${cg126FormatNumber(Math.min(cursor + chunk.length, plan.operations.length))} / ` +
        `${cg126FormatNumber(plan.operations.length)}`
      );

      await cg126CommitChunk(chunk);
      cursor += chunk.length;

      state.cursor = cursor;
      state.updated_at_ms = Date.now();
      cg126WriteState(state);

      await new Promise((resolve) => setTimeout(resolve, 55));
    }

    cg126Plan = await cg126BuildPlan({
      reason: incremental ? "incremental-verify" : "historical-verify"
    });

    state.status = cg126Plan.operations.length ? "PAUSED" : "COMPLETE";
    state.cursor = plan.operations.length;
    state.completed_at_ms = Date.now();
    state.updated_at_ms = Date.now();
    state.remaining_mutations = cg126Plan.operations.length;

    cg126WriteState(state);
    cg126RenderPlan(cg126Plan);

    cg126SetStatus(
      cg126Plan.operations.length
        ? `${cg126FormatNumber(cg126Plan.operations.length)} mutation(s) restent à appliquer · utilise Reprendre.`
        : (
            incremental
              ? "INCREMENTAL_SEQUENCE_REFRESH001 · rangs actualisés."
              : "Reconstruction terminée · état idempotent confirmé · 0 mutation restante."
          ),
      cg126Plan.operations.length > 0
    );

    cg126RenderCurrentDetail();
  } catch (error) {
    console.error("CGWEB126 rebuild", error);

    state.status = "PAUSED";
    state.last_error = error?.message || String(error);
    state.updated_at_ms = Date.now();
    cg126WriteState(state);

    cg126SetStatus(
      "Reconstruction interrompue : " +
      state.last_error +
      " · Reprendre recalculera uniquement ce qui reste.",
      true
    );

    cg126Plan = null;
  } finally {
    cg126Running = false;
    cg126RenderPlan(cg126Plan);
  }
}

async function cg126Preview() {
  if (cg126Running) return;

  cg126Running = true;
  cg126RenderPlan();

  try {
    cg126Plan = await cg126BuildPlan({reason: "preview"});
    cg126RenderPlan(cg126Plan);

    cg126SetStatus(
      `Prévisualisation prête · ${cg126FormatNumber(cg126Plan.mutation_count)} activité(s) à mettre à jour.`
    );
  } catch (error) {
    console.error("CGWEB126 preview", error);
    cg126Plan = null;
    cg126SetStatus(error?.message || String(error), true);
  } finally {
    cg126Running = false;
    cg126RenderPlan(cg126Plan);
  }
}

async function cg126Rebuild() {
  if (cg126Running) return;

  if (!cg126Plan) await cg126Preview();
  if (!cg126Plan) return;

  await cg126ApplyPlan(
    cg126Plan,
    {
      confirm: true,
      incremental: false
    }
  );
}

async function cg126Resume() {
  if (cg126Running) return;

  try {
    cg126SetStatus("Recalcul de l’état courant avant reprise…");

    const plan = await cg126BuildPlan({reason: "resume"});
    cg126Plan = plan;
    cg126RenderPlan(plan);

    await cg126ApplyPlan(
      plan,
      {
        confirm: false,
        incremental: false
      }
    );
  } catch (error) {
    cg126SetStatus(error?.message || String(error), true);
  }
}

/* INCREMENTAL_SEQUENCE_REFRESH001 */
function cg126ScheduleIncremental(reason) {
  const state = cg126ReadState();

  if (!cg126User || state?.status !== "COMPLETE") return;

  if (cg126IncrementalTimer) {
    clearTimeout(cg126IncrementalTimer);
  }

  cg126IncrementalTimer = setTimeout(
    () => {
      cg126IncrementalTimer = null;
      void cg126RunIncremental(reason);
    },
    1200
  );
}

async function cg126RunIncremental(reason) {
  if (cg126Running || !cg126User) return;

  try {
    cg126SetStatus(
      "INCREMENTAL_SEQUENCE_REFRESH001 · recalcul déterministe des rangs…"
    );

    const plan = await cg126BuildPlan({
      reason: "incremental:" + String(reason || "change")
    });

    cg126Plan = plan;
    cg126RenderPlan(plan);

    await cg126ApplyPlan(
      plan,
      {
        confirm: false,
        incremental: true
      }
    );
  } catch (error) {
    console.error("CGWEB126 incremental", error);

    cg126SetStatus(
      "Actualisation incrémentale impossible : " +
      (error?.message || error),
      true
    );
  }
}

/* EDITABLE_SEQUENCE_OVERRIDE001 */
function cg126EffectiveActivity(activity) {
  if (!activity) return null;

  const docId =
    String(
      activity.__docId ??
      activity.id ??
      ""
    );

  const cached =
    cg126SequenceCache.get(docId) ||
    {};

  /*
   * Une séquence historique calculée avant FIX2
   * est corrigée immédiatement à l'affichage,
   * sans attendre une réécriture Firestore.
   */
  return cg126FilterStoredSequenceForSport({
    ...activity,
    ...cached
  });
}


/* ==========================================================
   CGWEB130
   DAILY_MILESTONE_MAX_ONLY001
   LANDMARK_MILESTONE_MERGE001
   ========================================================== */

function cg126Cgweb130MaxMilestone(
  activity,
  kind
) {
  const lines =
    Array.isArray(
      activity
        ?.daily_milestone_lines
    )
      ? activity
          .daily_milestone_lines
      : [];

  return (
    lines
      .filter(
        row =>
          String(
            row?.kind || ""
          ) === kind
      )
      .sort(
        (a, b) =>
          Number(
            b?.threshold || 0
          ) -
          Number(
            a?.threshold || 0
          )
      )[0] ||
    null
  );
}


function cg126Cgweb130MilestoneLabel(
  row
) {
  if (!row) {
    return "";
  }

  const threshold =
    Number(
      row.threshold || 0
    );

  const globalRank =
    Number(
      row.global_rank || 0
    );

  const year =
    Number(
      row.year || 0
    );

  const yearRank =
    Number(
      row.year_rank || 0
    );

  if (
    !threshold ||
    !globalRank ||
    !year ||
    !yearRank
  ) {
    return "";
  }

  const formatted =
    threshold.toLocaleString(
      "fr-FR"
    );

  if (
    row.kind === "distance"
  ) {
    return (
      "Jours à plus de " +
      formatted +
      " km #" +
      globalRank +
      " (" +
      year +
      " #" +
      yearRank +
      ")"
    );
  }

  if (
    row.kind === "ascent"
  ) {
    return (
      "Jours à plus de " +
      formatted +
      " m D+ #" +
      globalRank +
      " (" +
      year +
      " #" +
      yearRank +
      ")"
    );
  }

  return "";
}


function cg126Cgweb130MilestoneText(
  activity
) {
  const distance =
    cg126Cgweb130MilestoneLabel(
      cg126Cgweb130MaxMilestone(
        activity,
        "distance"
      )
    );

  const ascent =
    cg126Cgweb130MilestoneLabel(
      cg126Cgweb130MaxMilestone(
        activity,
        "ascent"
      )
    );

  return [
    distance,
    ascent
  ]
    .filter(Boolean)
    .join("\n\n");
}


function cg126Cgweb130MergeText(
  landmarkText,
  activity
) {
  const milestoneText =
    cg126Cgweb130MilestoneText(
      activity
    );

  return [
    String(
      landmarkText || ""
    ).trim(),

    milestoneText
  ]
    .filter(Boolean)
    .join("\n\n");
}


function cg126Cgweb130EditableLandmarkText(
  value
) {
  return String(
    value || ""
  )
    .split(/\r?\n/)
    .filter(
      line =>
        !/^Jours à plus de /u
          .test(
            line.trim()
          )
    )
    .join("\n")
    .replace(
      /\n{3,}/g,
      "\n\n"
    )
    .trim();
}

/* ==========================================================
   CGWEB128 FIX1
   VISIBLE_SEQUENCE_SECTION001
   HIDDEN_PARENT_ESCAPE001
   DETAIL_PANEL_STABLE_ANCHOR001
   ========================================================== */

function cg126HasHiddenAncestor(
  node,
  stopNode
) {
  let current =
    node?.parentElement || null;

  while (
    current &&
    current !== stopNode
  ) {
    if (
      current.hidden ||
      current.classList?.contains(
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


function cg126ResolveDetailAnchor(
  detail
) {
  /*
   * Ancre prioritaire :
   * Historique des modifications.
   *
   * CGWEB111 peut avoir enveloppé cette section dans un <details>
   * et déplacé le tout dans sa pile inférieure.
   *
   * On remonte donc jusqu'au premier enfant du conteneur visible
   * concerné, au lieu de s'insérer à l'intérieur du wrapper.
   */
  const revision =
    detail.querySelector(
      "#cgweb084RevisionSection"
    );

  if (revision) {
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

    const parent =
      anchor.parentElement;

    if (
      parent &&
      detail.contains(parent)
    ) {
      return {
        parent,
        anchor,
        mode:
          "before-revision"
      };
    }
  }

  /*
   * Fallback stable :
   * juste avant la navigation inférieure.
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

  /*
   * Dernier recours :
   * fin de #detailView.
   */
  return {
    parent:
      detail,

    anchor:
      null,

    mode:
      "detail-end"
  };
}


function cg126PlaceDetailPanel(
  host,
  detail
) {
  if (
    !host ||
    !detail
  ) {
    return false;
  }

  const target =
    cg126ResolveDetailAnchor(
      detail
    );

  if (!target?.parent) {
    return false;
  }

  const wasConnected =
    host.isConnected;

  const correctlyPlaced =
    target.anchor
      ? (
          host.parentElement ===
            target.parent &&
          host.nextElementSibling ===
            target.anchor
        )
      : (
          host.parentElement ===
            target.parent &&
          target.parent
            .lastElementChild ===
            host
        );

  if (!correctlyPlaced) {
    if (target.anchor) {
      target.parent.insertBefore(
        host,
        target.anchor
      );
    } else {
      target.parent.appendChild(
        host
      );
    }

    if (wasConnected) {
      cg126DetailPanelMoveCount += 1;
    }
  }

  /*
   * Le panneau lui-même ne doit jamais conserver
   * une ancienne marque d'invisibilité.
   */
  host.hidden = false;

  host.classList.remove(
    "hidden"
  );

  host.removeAttribute(
    "aria-hidden"
  );

  host.dataset.cgweb128Fix1Visible =
    "1";

  host.dataset.cgweb128Fix1Anchor =
    target.mode;

  /*
   * Sécurité HIDDEN_PARENT_ESCAPE001 :
   * si une transformation historique a malgré tout placé notre
   * ancre sous un ancêtre caché, on sort immédiatement le panneau
   * de ce conteneur.
   */
  if (
    cg126HasHiddenAncestor(
      host,
      detail
    )
  ) {
    const bottomNav =
      detail.querySelector(
        ".detail-bottom-nav"
      );

    if (
      bottomNav &&
      bottomNav.parentElement ===
        detail
    ) {
      detail.insertBefore(
        host,
        bottomNav
      );

      host.dataset
        .cgweb128Fix1Anchor =
        "detail-visible-fallback";
    } else {
      detail.appendChild(
        host
      );

      host.dataset
        .cgweb128Fix1Anchor =
        "detail-end-fallback";
    }

    if (wasConnected) {
      cg126DetailPanelMoveCount += 1;
    }
  }

  window
    .__cgweb128Fix1LastAnchor =
    host.dataset
      .cgweb128Fix1Anchor ||
    null;

  return true;
}


function cg126EnsureDetailUi() {
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
      "cgweb126SequenceField"
    );

  if (host) {
    /*
     * Un ancien rendu CGWEB128 peut avoir créé le panneau
     * sous .detail-edit-panel.hidden.
     *
     * On le réutilise : aucune duplication.
     */
    host.classList.add(
      "detail-section",
      "panel",
      "cg126-sequence-field"
    );

    host.dataset
      .cgweb128Idempotent =
      "1";

    if (
      !cg126PlaceDetailPanel(
        host,
        detail
      )
    ) {
      return null;
    }

    return host;
  }

  host =
    document.createElement(
      "section"
    );

  host.id =
    "cgweb126SequenceField";

  host.className =
    "detail-section panel cg126-sequence-field";

  host.dataset
    .cgweb128Idempotent =
    "1";

  host.dataset
    .cgweb128Fix1Visible =
    "1";

  host.innerHTML = `
    <div class="cg126-sequence-head">
      <strong>Suivi des repères</strong>
      <span id="cgweb126SequenceMode" class="pill neutral">Automatique</span>
    </div>

    <textarea
      id="cgweb126SequenceInput"
      rows="3"
      maxlength="4000"
      spellcheck="false"
      placeholder="Les rangs chronologiques apparaîtront ici après reconstruction."
    ></textarea>

    <div class="cg126-sequence-actions">
      <button
        id="cgweb126SequenceSave"
        class="primary compact"
        type="button"
      >Enregistrer</button>

      <button
        id="cgweb126SequenceReset"
        class="secondary compact"
        type="button"
      >Revenir au calcul automatique</button>

      <span
        id="cgweb126SequenceStatus"
        class="muted"
      >
        Valeur automatique tant qu’aucune personnalisation n’est enregistrée.
      </span>
    </div>
  `;

  if (
    !cg126PlaceDetailPanel(
      host,
      detail
    )
  ) {
    return null;
  }

  cg126DetailPanelMountCount += 1;

  host
    .querySelector(
      "#cgweb126SequenceInput"
    )
    ?.addEventListener(
      "input",
      () => {
        const status =
          document.getElementById(
            "cgweb126SequenceStatus"
          );

        if (
          status &&
          status.textContent !==
            "Modification non enregistrée."
        ) {
          status.textContent =
            "Modification non enregistrée.";
        }
      }
    );

  host
    .querySelector(
      "#cgweb126SequenceSave"
    )
    ?.addEventListener(
      "click",
      () =>
        void cg126SaveOverride()
    );

  host
    .querySelector(
      "#cgweb126SequenceReset"
    )
    ?.addEventListener(
      "click",
      () =>
        void cg126ResetOverride()
    );

  return host;
}


function cg126RenderDetail(activity) {
  if (!activity) {
    cg126CurrentActivity = null;
    return;
  }

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
    return;
  }

  cg126CurrentActivity =
    activity;

  const host =
    cg126EnsureDetailUi();

  if (!host) return;

  const effective =
    cg126EffectiveActivity(
      activity
    );

  const hasOverride =
    effective
      .landmark_sequence_override !==
        null &&
    effective
      .landmark_sequence_override !==
        undefined;

  const generated =
    String(
      effective
        .landmark_sequence_generated ??
      ""
    );

  const landmarkValue =
    hasOverride
      ? String(
          effective
            .landmark_sequence_override
        )
      : generated;

  const value =
    cg126Cgweb130MergeText(
      landmarkValue,
      effective
    );

  const input =
    document.getElementById(
      "cgweb126SequenceInput"
    );

  const mode =
    document.getElementById(
      "cgweb126SequenceMode"
    );

  const reset =
    document.getElementById(
      "cgweb126SequenceReset"
    );

  const status =
    document.getElementById(
      "cgweb126SequenceStatus"
    );

  /*
   * SEQUENCE_PANEL_IDEMPOTENT001 :
   * ne modifier le DOM que lorsque la valeur diffère.
   */
  if (
    input &&
    input.value !== value
  ) {
    input.value = value;
  }

  if (input) {
    const lineCount =
      Math.max(
        1,
        value.split("\n").length
      );

    const wantedRows =
      Math.max(
        3,
        Math.min(
          14,
          lineCount
        )
      );

    if (
      Number(input.rows) !==
      wantedRows
    ) {
      input.rows =
        wantedRows;
    }
  }

  if (mode) {
    const wantedText =
      hasOverride
        ? "Personnalisé"
        : "Automatique";

    const wantedClass =
      hasOverride
        ? "pill pending"
        : "pill neutral";

    if (
      mode.textContent !==
      wantedText
    ) {
      mode.textContent =
        wantedText;
    }

    if (
      mode.className !==
      wantedClass
    ) {
      mode.className =
        wantedClass;
    }
  }

  if (
    reset &&
    reset.disabled ===
      hasOverride
  ) {
    reset.disabled =
      !hasOverride;
  }

  if (status) {
    let wantedStatus = "";

    if (hasOverride) {
      const generatedLines =
        generated
          ? generated
              .split("\n")
              .length
          : 0;

      wantedStatus =
        "Texte personnalisé · " +
        "calcul automatique conservé " +
        "en arrière-plan (" +
        generatedLines +
        " ligne(s)).";
    } else if (generated) {
      wantedStatus =
        "Valeur calculée automatiquement · " +
        "modifiable librement.";
    } else {
      wantedStatus =
        "Aucune séquence calculée " +
        "pour cette activité.";
    }

    if (
      status.textContent !==
      wantedStatus
    ) {
      status.textContent =
        wantedStatus;
    }
  }

  cg126DetailRenderCount += 1;

  window.__cgweb128LastRenderedActivity =
    String(
      activity.__docId ??
      activity.id ??
      ""
    );
}


function cg126ScheduleDetailRender(
  activity
) {
  cg126PendingDetailActivity =
    activity || null;

  if (
    cg126DetailRenderRaf !== null
  ) {
    return;
  }

  cg126DetailRenderRaf =
    requestAnimationFrame(() => {
      cg126DetailRenderRaf = null;

      const pending =
        cg126PendingDetailActivity;

      cg126PendingDetailActivity =
        null;

      cg126RenderDetail(
        pending
      );
    });
}


function cg126RenderCurrentDetail() {
  if (!cg126CurrentActivity) {
    return;
  }

  cg126ScheduleDetailRender(
    cg126CurrentActivity
  );
}


async function cg126SaveOverride() {
  const activity = cg126CurrentActivity;
  const input = document.getElementById("cgweb126SequenceInput");

  if (!activity || !input) return;

  const key = String(activity.__docId ?? activity.id ?? "").trim();
  const bridge = window.CGWEB126_APP_BRIDGE;

  if (!key || typeof bridge?.saveSequenceOverride !== "function") {
    cg126SetDetailStatus("Bridge d’enregistrement indisponible.", true);
    return;
  }

  try {
    cg126SetDetailStatus("Enregistrement…");

    const editableLandmarkText =
      cg126Cgweb130EditableLandmarkText(
        input.value
      );

    const patch =
      await bridge.saveSequenceOverride(
        key,
        editableLandmarkText
      );

    Object.assign(activity, patch);
    cg126ScheduleDetailRender(activity);
    cg126SetDetailStatus("Texte personnalisé enregistré.");
  } catch (error) {
    cg126SetDetailStatus(error?.message || String(error), true);
  }
}

async function cg126ResetOverride() {
  const activity = cg126CurrentActivity;
  if (!activity) return;

  const key = String(activity.__docId ?? activity.id ?? "").trim();
  const bridge = window.CGWEB126_APP_BRIDGE;

  if (!key || typeof bridge?.saveSequenceOverride !== "function") {
    cg126SetDetailStatus("Bridge d’enregistrement indisponible.", true);
    return;
  }

  try {
    cg126SetDetailStatus("Retour au calcul automatique…");

    const patch = await bridge.saveSequenceOverride(key, null);

    Object.assign(activity, patch);
    cg126ScheduleDetailRender(activity);
    cg126SetDetailStatus("Valeur automatique restaurée.");
  } catch (error) {
    cg126SetDetailStatus(error?.message || String(error), true);
  }
}

function cg126SetDetailStatus(text, error = false) {
  const node = document.getElementById("cgweb126SequenceStatus");
  if (!node) return;

  node.textContent = String(text || "");
  node.classList.toggle("cg126-error", Boolean(error));
}

/* UI Analyse > Repères */
function cg126EnsureStyle() {
  if (document.getElementById("cgweb126Style")) return;

  const style = document.createElement("style");
  style.id = "cgweb126Style";

  style.textContent = `
    .cg126-sequence-field{
      display:grid;
      gap:8px;
      margin:10px 0 12px;
      padding:12px;
      border:1px solid rgba(190,255,55,.16);
      border-radius:12px;
      background:rgba(156,255,34,.02);
    }
    .cg126-sequence-head{
      display:flex;
      justify-content:space-between;
      gap:10px;
      align-items:center;
    }
    .cg126-sequence-field textarea{
      width:100%;
      box-sizing:border-box;
      resize:vertical;
      min-height:84px;
      font-family:inherit;
      line-height:1.45;
    }
    .cg126-sequence-actions{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
      align-items:center;
    }
    .cg126-error{color:#ff8d8d!important}
  `;

  document.head.appendChild(style);
}

function cg126EnsurePanel() {
  cg126EnsureStyle();

  const gpsPanel = document.getElementById("cgweb124GpsMarkerSection");
  if (!gpsPanel) return null;

  let host = document.getElementById("cgweb126SequenceRebuildPanel");
  if (host) return host;

  host = document.createElement("div");
  host.id = "cgweb126SequenceRebuildPanel";
  host.className = "cg124-index";

  host.innerHTML = `
    <div class="cg124-head">
      <div>
        <strong>Classement chronologique des repères</strong>
        <div id="cgweb126Meta" class="muted">
          Une ligne par passage · rang global + rang annuel · séries course/vélo indépendantes.
        </div>
      </div>

      <div class="cg124-actions">
        <button id="cgweb126Preview" class="secondary" type="button">Prévisualiser</button>
        <button id="cgweb126Rebuild" class="primary" type="button" disabled>Reconstruire les séquences</button>
        <button id="cgweb126Resume" class="secondary" type="button" disabled>Reprendre</button>
      </div>
    </div>

    <div id="cgweb126Status" class="muted">
      Exemple multipassage : Y #428 (2019 #37) puis Y #429 (2019 #38), chacun sur sa propre ligne.
    </div>
  `;

  const anchor =
    document.getElementById("cg124ReinjectPanel") ||
    gpsPanel.querySelector(".cg124-index:last-of-type");

  if (anchor) anchor.insertAdjacentElement("afterend", host);
  else gpsPanel.appendChild(host);

  host.querySelector("#cgweb126Preview")?.addEventListener(
    "click",
    () => void cg126Preview()
  );

  host.querySelector("#cgweb126Rebuild")?.addEventListener(
    "click",
    () => void cg126Rebuild()
  );

  host.querySelector("#cgweb126Resume")?.addEventListener(
    "click",
    () => void cg126Resume()
  );

  cg126RenderPlan(cg126Plan);
  return host;
}

function cg126SetStatus(text, error = false) {
  const node = document.getElementById("cgweb126Status");
  if (!node) return;

  node.textContent = String(text || "");
  node.classList.toggle("cg126-error", Boolean(error));
}

function cg126RenderPlan(plan = cg126Plan) {
  cg126EnsurePanel();

  const meta = document.getElementById("cgweb126Meta");
  const preview = document.getElementById("cgweb126Preview");
  const rebuild = document.getElementById("cgweb126Rebuild");
  const resume = document.getElementById("cgweb126Resume");

  if (preview) preview.disabled = cg126Running;
  if (rebuild) rebuild.disabled = cg126Running || !plan;

  const state = cg126ReadState();

  if (resume) {
    resume.disabled =
      cg126Running ||
      !state ||
      state.status !== "PAUSED";
  }

  if (meta && plan) {
    meta.textContent =
      `${cg126FormatNumber(plan.passage_line_count)} ligne(s) de passage · ` +
      `${cg126FormatNumber(plan.activity_with_sequence_count)} activité(s) renseignée(s) · ` +
      `${cg126FormatNumber(plan.scope_count)} série(s) repère/sport · ` +
      `${cg126FormatNumber(plan.mutation_count)} activité(s) à écrire · ` +
      `${cg126FormatNumber(plan.unchanged_count)} déjà conforme(s).`;
  }
}

function cg126WatchForPanel() {
  const scope =
    document.getElementById(
      "advancedLandmarksSection"
    );

  window.__cgweb128PanelObserverRoot =
    scope?.id || null;

  if (cg126EnsurePanel()) {
    if (cg126PanelObserver) {
      cg126PanelObserver
        .disconnect();

      cg126PanelObserver =
        null;
    }

    return;
  }

  if (
    cg126PanelObserver ||
    !scope
  ) {
    return;
  }

  cg126PanelObserver =
    new MutationObserver(() => {
      if (cg126EnsurePanel()) {
        cg126PanelObserver
          ?.disconnect();

        cg126PanelObserver =
          null;
      }
    });

  cg126PanelObserver.observe(
    scope,
    {
      childList: true,
      subtree: true
    }
  );
}


window.addEventListener(
  "sport-activity-detail-render",
  (event) => {
    cg126ScheduleDetailRender(
      event.detail?.activity || null
    );
  }
);

window.addEventListener(
  "sport-landmark-links-changed",
  () => {
    cg126ScheduleIncremental("manual-landmark");
  }
);

window.addEventListener(
  "sport-gps-backfill-applied",
  () => {
    cg126ScheduleIncremental("gps-backfill");
  }
);

window.addEventListener(
  "sport-landmark-sequence-override-saved",
  () => {
    cg126RenderCurrentDetail();
  }
);

onAuthStateChanged(auth, (user) => {
  cg126User = user || null;
  cg126Plan = null;
  cg126SequenceCache = new Map();

  if (!cg126User) {
    cg126SetStatus("Connexion SPORT requise.");
    return;
  }

  cg126WatchForPanel();
  cg126RenderPlan();

  const state = cg126ReadState();

  if (state?.status === "COMPLETE") {
    cg126SetStatus(
      "Séquences historiques disponibles · actualisation incrémentale active."
    );
  } else if (state?.status === "PAUSED") {
    cg126SetStatus(
      "Reconstruction interrompue · Reprendre recalculera ce qui reste."
    );
  }
});

cg126EnsureStyle();
cg126WatchForPanel();

window.CGWEB126_STATUS = () => ({
  build: CGWEB126_BUILD,
  landmark_sequence_rank: "LANDMARK_SEQUENCE_RANK001",
  sport_scoped_rank: "SPORT_SCOPED_RANK001",
  yearly_landmark_rank: "YEARLY_LANDMARK_RANK001",
  multipass_sequence_label: "MULTIPASS_SEQUENCE_LABEL001",
  editable_sequence_override: "EDITABLE_SEQUENCE_OVERRIDE001",
  historical_sequence_rebuild: "HISTORICAL_SEQUENCE_REBUILD001",
  incremental_sequence_refresh: "INCREMENTAL_SEQUENCE_REFRESH001",
  sport_scoped_bv: "SPORT_SCOPED_BV001",
  basketaf_velotaf_exclusion: "BASKETAF_VELOTAF_EXCLUSION001",
  stored_sequence_bv_filter: "STORED_SEQUENCE_BV_FILTER001",
  running: cg126Running,
  planned_mutations: cg126Plan?.mutation_count || 0,
  state: cg126ReadState()
});


window.CGWEB128_STATUS = () => ({
  build:
    "CGWEB128",

  detail_sequence_async:
    "DETAIL_SEQUENCE_ASYNC001",

  sequence_panel_idempotent:
    "SEQUENCE_PANEL_IDEMPOTENT001",

  observer_safe_integration:
    "OBSERVER_SAFE_INTEGRATION001",

  daily_milestone_max_only:
    "DAILY_MILESTONE_MAX_ONLY001",

  landmark_milestone_merge:
    "LANDMARK_MILESTONE_MERGE001",

  visible_sequence_section:
    "VISIBLE_SEQUENCE_SECTION001",

  hidden_parent_escape:
    "HIDDEN_PARENT_ESCAPE001",

  detail_panel_stable_anchor:
    "DETAIL_PANEL_STABLE_ANCHOR001",

  detail_event:
    "sport-activity-detail-render",

  detail_event_dispatch_count:
    Number(
      window
        .__cgweb128DetailSequenceDispatchCount ||
      0
    ),

  detail_render_count:
    cg126DetailRenderCount,

  detail_render_pending:
    cg126DetailRenderRaf !== null,

  detail_panel_present:
    Boolean(
      document.getElementById(
        "cgweb126SequenceField"
      )
    ),

  detail_panel_mount_count:
    cg126DetailPanelMountCount,

  detail_panel_move_count:
    cg126DetailPanelMoveCount,

  detail_panel_idempotent:
    document
      .getElementById(
        "cgweb126SequenceField"
      )
      ?.dataset
      ?.cgweb128Idempotent === "1",

  detail_panel_visible:
    document
      .getElementById(
        "cgweb126SequenceField"
      )
      ?.dataset
      ?.cgweb128Fix1Visible === "1",

  detail_panel_anchor:
    document
      .getElementById(
        "cgweb126SequenceField"
      )
      ?.dataset
      ?.cgweb128Fix1Anchor ||
    null,

  detail_panel_hidden_ancestor:
    (() => {
      const detail =
        document.getElementById(
          "detailView"
        );

      const panel =
        document.getElementById(
          "cgweb126SequenceField"
        );

      if (
        !detail ||
        !panel
      ) {
        return null;
      }

      return cg126HasHiddenAncestor(
        panel,
        detail
      );
    })(),

  current_activity_id:
    String(
      cg126CurrentActivity?.__docId ??
      cg126CurrentActivity?.id ??
      ""
    ) || null,

  last_rendered_activity_id:
    window
      .__cgweb128LastRenderedActivity ||
    null,

  detail_mutation_observer:
    false,

  admin_panel_observer_root:
    window
      .__cgweb128PanelObserverRoot ||
    null,

  cgweb127_fix2_present:
    typeof window.CGWEB127_FIX2_STATUS ===
      "function"
});

console.info(
  "CGWEB128 FIX1 actif · " +
  "DETAIL_SEQUENCE_ASYNC001 / " +
  "SEQUENCE_PANEL_IDEMPOTENT001 / " +
  "OBSERVER_SAFE_INTEGRATION001 / " +
  "VISIBLE_SEQUENCE_SECTION001 / " +
  "HIDDEN_PARENT_ESCAPE001 / " +
  "DETAIL_PANEL_STABLE_ANCHOR001"
);

console.info(
  "CGWEB126 actif · LANDMARK_SEQUENCE_RANK001 / SPORT_SCOPED_RANK001 / YEARLY_LANDMARK_RANK001 / MULTIPASS_SEQUENCE_LABEL001 / EDITABLE_SEQUENCE_OVERRIDE001 / HISTORICAL_SEQUENCE_REBUILD001 / INCREMENTAL_SEQUENCE_REFRESH001"
);
