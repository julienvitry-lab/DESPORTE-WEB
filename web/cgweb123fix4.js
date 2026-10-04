"use strict";

/* CGWEB123_FIX4_CLIENT_START
   SERVER_BATCH_ORCHESTRATOR001
   FIRESTORE_QUEUE001
   SERVER_AUTORESUME001
   CRASH_SAFE_CURSOR001
   CLIENT_PROGRESS_ONLY001
*/

const CGWEB123_FIX4_CLIENT_VERSION =
  "CGWEB123_FIX4";

const CGWEB123_FIX4_POLL_MS =
  5000;

let cgweb123Fix4PollTimer =
  null;

let cgweb123Fix4Busy =
  false;

let cgweb123Fix4ServerBatchId =
  "";

function cgweb123Fix4StateKeys() {
  const rows = [];

  for (
    let i = 0;
    i < localStorage.length;
    i += 1
  ) {
    const key =
      localStorage.key(i);

    if (
      key &&
      key.startsWith(
        "SPORT_CGWEB123_FIX3_FIX1_"
      ) &&
      key.endsWith("_STATE")
    ) {
      rows.push(key);
    }
  }

  return rows;
}

function cgweb123Fix4ReadJson(
  key,
  fallback = null
) {
  try {
    const raw =
      localStorage.getItem(key);

    return raw
      ? JSON.parse(raw)
      : fallback;
  } catch {
    return fallback;
  }
}

function cgweb123Fix4WriteJson(
  key,
  value
) {
  localStorage.setItem(
    key,
    JSON.stringify(value)
  );
}

function cgweb123Fix4LocalBundle() {
  const audit =
    typeof window
      .CGWEB123_FIX3_AUDIT ===
      "function"
      ? window
          .CGWEB123_FIX3_AUDIT()
      : null;

  const batchId =
    String(
      audit?.state?.batch_id ||
      ""
    );

  for (
    const key
    of cgweb123Fix4StateKeys()
  ) {
    const state =
      cgweb123Fix4ReadJson(key);

    if (
      state &&
      (
        !batchId ||
        String(
          state.batch_id ||
          ""
        ) === batchId
      )
    ) {
      return {
        key,
        state
      };
    }
  }

  const first =
    cgweb123Fix4StateKeys()[0];

  return first
    ? {
        key: first,
        state:
          cgweb123Fix4ReadJson(
            first
          )
      }
    : null;
}

function cgweb123Fix4LinkKey(
  stateKey
) {
  return String(stateKey || "")
    .replace(
      /_STATE$/,
      "_SERVER_FIX4"
    );
}

function cgweb123Fix4PauseKey(
  stateKey
) {
  return String(stateKey || "")
    .replace(
      /_STATE$/,
      "_USER_PAUSE"
    );
}

function cgweb123Fix4LoadLink(
  bundle =
    cgweb123Fix4LocalBundle()
) {
  if (!bundle?.key) {
    return null;
  }

  return cgweb123Fix4ReadJson(
    cgweb123Fix4LinkKey(
      bundle.key
    )
  );
}

function cgweb123Fix4SaveLink(
  bundle,
  row
) {
  if (!bundle?.key) return;

  cgweb123Fix4WriteJson(
    cgweb123Fix4LinkKey(
      bundle.key
    ),
    row
  );
}

function cgweb123Fix4FenceBrowserRunner() {
  const bundle =
    cgweb123Fix4LocalBundle();

  if (
    !bundle?.state ||
    !bundle.key
  ) {
    return;
  }

  const state = {
    ...bundle.state
  };

  if (
    state.status !== "COMPLETE" &&
    state.status !== "CANCELLED" &&
    state.status !== "SERVER_HANDOFF"
  ) {
    state.fix4_source_status ||=
      String(state.status || "");

    state.status =
      "SERVER_HANDOFF_PENDING";

    state.fix4_fenced_at_ms =
      Date.now();

    cgweb123Fix4WriteJson(
      bundle.key,
      state
    );
  }

  cgweb123Fix4WriteJson(
    cgweb123Fix4PauseKey(
      bundle.key
    ),
    {
      requested: true,
      batch_id:
        String(state.batch_id || ""),
      requested_at_ms:
        Date.now(),
      source:
        CGWEB123_FIX4_CLIENT_VERSION
    }
  );
}

function cgweb123Fix4SourceState(
  bundle
) {
  const state =
    bundle?.state
      ? {...bundle.state}
      : null;

  if (!state) return null;

  if (
    state.status ===
      "SERVER_HANDOFF_PENDING" &&
    state.fix4_source_status
  ) {
    state.status =
      state.fix4_source_status;
  }

  return state;
}

async function cgweb123Fix4Api() {
  if (
    window.SPORT_SERVER_JOIN_BATCH
  ) {
    return window
      .SPORT_SERVER_JOIN_BATCH;
  }

  await new Promise(
    (resolve, reject) => {
      const timer =
        setTimeout(
          () =>
            reject(
              new Error(
                "API serveur FIX4 non chargée."
              )
            ),
          10000
        );

      window.addEventListener(
        "sport-server-join-batch-ready",
        () => {
          clearTimeout(timer);
          resolve();
        },
        {once: true}
      );
    }
  );

  return window
    .SPORT_SERVER_JOIN_BATCH;
}

function cgweb123Fix4Panel() {
  return document.getElementById(
    "cgweb123Fix3MassManager"
  );
}

function cgweb123Fix4Nodes() {
  const panel =
    cgweb123Fix4Panel();

  return {
    panel,

    start:
      panel?.querySelector(
        "#cgweb123Fix3Start"
      ) || null,

    resume:
      panel?.querySelector(
        "#cgweb123Fix3Resume"
      ) || null,

    pause:
      panel?.querySelector(
        "#cgweb123Fix3Pause"
      ) || null,

    exportAudit:
      panel?.querySelector(
        "#cgweb123Fix3Export"
      ) || null,

    status:
      panel?.querySelector(
        "#cgweb123Fix3Status"
      ) || null
  };
}

function cgweb123Fix4StatusText(
  row
) {
  if (!row?.found) {
    const bundle =
      cgweb123Fix4LocalBundle();

    const local =
      bundle?.state;

    if (local?.queue?.length) {
      return (
        "PRÊT POUR TRANSFERT SERVEUR · " +
        `${Number(local.cursor || 0)} / ${local.queue.length}` +
        " · le navigateur ne lancera plus de fusion."
      );
    }

    return "Aucun lot serveur.";
  }

  return (
    `SERVER ${row.status}` +
    ` · ${Number(row.cursor || 0)} / ${Number(row.total || 0)}` +
    ` · ${Number(row.success_count || 0)} réussie(s)` +
    ` · ${Number(row.failure_count || 0)} échec(s)` +
    ` · ${Number(row.review_count || 0)} à revoir` +
    ` · ${Number(row.recovered_count || 0)} récupérée(s)` +
    (
      row.current_group_key
        ? ` · ${row.current_phase} · ${row.current_group_key}`
        : ""
    ) +
    (
      row.last_error
        ? ` · dernier message : ${row.last_error}`
        : ""
    )
  );
}

function cgweb123Fix4Render(
  row = null
) {
  const {
    panel,
    start,
    resume,
    pause,
    exportAudit,
    status
  } =
    cgweb123Fix4Nodes();

  if (!panel) return;

  const title =
    panel.querySelector(
      "strong"
    );

  if (title) {
    title.textContent =
      "Fusion en masse · serveur · FIX4";
  }

  const description =
    title?.parentElement
      ?.querySelector(
        ".muted"
      );

  if (description) {
    description.textContent =
      "Cloud Tasks + file Firestore · progression indépendante du navigateur · état ambigu mis à revoir sans bloquer la suite.";
  }

  const found =
    Boolean(row?.found);

  const state =
    String(row?.status || "");

  if (start) {
    start.textContent =
      found
        ? "Lot serveur actif"
        : "Transférer le lot au serveur";

    start.disabled =
      cgweb123Fix4Busy ||
      found;
  }

  if (resume) {
    resume.textContent =
      "Reprendre côté serveur";

    resume.disabled =
      cgweb123Fix4Busy ||
      !found ||
      ![
        "PAUSED",
        "PAUSING",
        "RETRYING"
      ].includes(state);
  }

  if (pause) {
    pause.textContent =
      "Pause côté serveur";

    pause.disabled =
      cgweb123Fix4Busy ||
      !found ||
      ![
        "RUNNING",
        "RETRYING"
      ].includes(state);
  }

  if (exportAudit) {
    exportAudit.textContent =
      "Exporter l’audit local";
  }

  if (status) {
    status.textContent =
      cgweb123Fix4StatusText(
        row
      );
  }

  panel.dataset.cgweb123Fix4 =
    "SERVER";
}

function cgweb123Fix4CloneButton(
  id
) {
  const old =
    document.getElementById(id);

  if (
    !old ||
    old.dataset.cgweb123Fix4 === "1"
  ) {
    return old;
  }

  const fresh =
    old.cloneNode(true);

  fresh.dataset.cgweb123Fix4 =
    "1";

  old.replaceWith(fresh);

  return fresh;
}

function cgweb123Fix4WirePanel() {
  const panel =
    cgweb123Fix4Panel();

  if (!panel) {
    return false;
  }

  const start =
    cgweb123Fix4CloneButton(
      "cgweb123Fix3Start"
    );

  const resume =
    cgweb123Fix4CloneButton(
      "cgweb123Fix3Resume"
    );

  const pause =
    cgweb123Fix4CloneButton(
      "cgweb123Fix3Pause"
    );

  if (
    start &&
    start.dataset
      .cgweb123Fix4Wired !== "1"
  ) {
    start.dataset
      .cgweb123Fix4Wired =
        "1";

    start.addEventListener(
      "click",
      () => {
        void cgweb123Fix4Transfer();
      }
    );
  }

  if (
    resume &&
    resume.dataset
      .cgweb123Fix4Wired !== "1"
  ) {
    resume.dataset
      .cgweb123Fix4Wired =
        "1";

    resume.addEventListener(
      "click",
      () => {
        void cgweb123Fix4Resume();
      }
    );
  }

  if (
    pause &&
    pause.dataset
      .cgweb123Fix4Wired !== "1"
  ) {
    pause.dataset
      .cgweb123Fix4Wired =
        "1";

    pause.addEventListener(
      "click",
      () => {
        void cgweb123Fix4Pause();
      }
    );
  }

  return true;
}

async function cgweb123Fix4Discover() {
  const api =
    await cgweb123Fix4Api();

  const bundle =
    cgweb123Fix4LocalBundle();

  const link =
    cgweb123Fix4LoadLink(
      bundle
    );

  let row = null;

  try {
    row = await api.status(
      String(
        link?.batch_id ||
        ""
      )
    );
  } catch (error) {
    if (link?.batch_id) {
      throw error;
    }

    row =
      await api.status("");
  }

  if (row?.found) {
    cgweb123Fix4ServerBatchId =
      String(
        row.batch_id || ""
      );

    if (bundle) {
      cgweb123Fix4SaveLink(
        bundle,
        {
          batch_id:
            cgweb123Fix4ServerBatchId,
          source_batch_id:
            row.source_batch_id ||
            "",
          linked_at_ms:
            Number(
              link?.linked_at_ms ||
              Date.now()
            )
        }
      );

      const local = {
        ...bundle.state,
        status:
          "SERVER_HANDOFF",
        server_batch_id:
          cgweb123Fix4ServerBatchId,
        server_handoff_at_ms:
          Number(
            bundle.state
              ?.server_handoff_at_ms ||
            Date.now()
          )
      };

      cgweb123Fix4WriteJson(
        bundle.key,
        local
      );
    }
  }

  return row;
}

async function cgweb123Fix4Transfer() {
  if (cgweb123Fix4Busy) {
    return;
  }

  const bundle =
    cgweb123Fix4LocalBundle();

  const source =
    cgweb123Fix4SourceState(
      bundle
    );

  if (
    !source?.batch_id ||
    !Array.isArray(source.queue) ||
    !source.queue.length
  ) {
    window.alert(
      "Aucun lot local FIX3 exploitable à transférer."
    );
    return;
  }

  const ok =
    window.confirm(
      "Transférer le lot existant côté serveur ?\n\n" +
      `${Number(source.cursor || 0)} fusion(s) déjà validée(s) sur ${source.queue.length}.\n` +
      "Le serveur reprendra au curseur conservé.\n" +
      "Les états partiels/ambigus seront placés « à revoir » puis la file continuera.\n\n" +
      "Après transfert, fermer Chrome n'interrompra plus le lot."
    );

  if (!ok) return;

  cgweb123Fix4Busy = true;
  cgweb123Fix4Render();

  try {
    const api =
      await cgweb123Fix4Api();

    const row =
      await api.importBatch(
        source
      );

    cgweb123Fix4ServerBatchId =
      String(
        row.batch_id || ""
      );

    cgweb123Fix4SaveLink(
      bundle,
      {
        batch_id:
          cgweb123Fix4ServerBatchId,
        source_batch_id:
          source.batch_id,
        linked_at_ms:
          Date.now()
      }
    );

    const local = {
      ...bundle.state,
      status:
        "SERVER_HANDOFF",
      server_batch_id:
        cgweb123Fix4ServerBatchId,
      server_handoff_at_ms:
        Date.now()
    };

    cgweb123Fix4WriteJson(
      bundle.key,
      local
    );

    cgweb123Fix4Render(
      row
    );
  } catch (error) {
    window.alert(
      "Transfert serveur impossible : " +
      (
        error?.message ||
        error
      )
    );
  } finally {
    cgweb123Fix4Busy =
      false;

    await cgweb123Fix4PollOnce();
  }
}

async function cgweb123Fix4Pause() {
  if (
    cgweb123Fix4Busy ||
    !cgweb123Fix4ServerBatchId
  ) {
    return;
  }

  cgweb123Fix4Busy = true;

  try {
    const api =
      await cgweb123Fix4Api();

    const row =
      await api.pause(
        cgweb123Fix4ServerBatchId
      );

    cgweb123Fix4Render(
      row
    );
  } catch (error) {
    window.alert(
      "Pause serveur impossible : " +
      (
        error?.message ||
        error
      )
    );
  } finally {
    cgweb123Fix4Busy = false;
  }
}

async function cgweb123Fix4Resume() {
  if (
    cgweb123Fix4Busy ||
    !cgweb123Fix4ServerBatchId
  ) {
    return;
  }

  cgweb123Fix4Busy = true;

  try {
    const api =
      await cgweb123Fix4Api();

    const row =
      await api.resume(
        cgweb123Fix4ServerBatchId
      );

    cgweb123Fix4Render(
      row
    );
  } catch (error) {
    window.alert(
      "Reprise serveur impossible : " +
      (
        error?.message ||
        error
      )
    );
  } finally {
    cgweb123Fix4Busy = false;
  }
}

async function cgweb123Fix4PollOnce() {
  if (cgweb123Fix4Busy) {
    return;
  }

  try {
    const row =
      await cgweb123Fix4Discover();

    cgweb123Fix4Render(
      row
    );
  } catch (error) {
    const {status} =
      cgweb123Fix4Nodes();

    if (status) {
      status.textContent =
        "FIX4 · lecture serveur impossible : " +
        (
          error?.message ||
          error
        );
    }
  }
}

function cgweb123Fix4StartPolling() {
  if (
    cgweb123Fix4PollTimer
  ) {
    clearInterval(
      cgweb123Fix4PollTimer
    );
  }

  cgweb123Fix4PollTimer =
    setInterval(
      () => {
        if (!document.hidden) {
          void cgweb123Fix4PollOnce();
        }
      },
      CGWEB123_FIX4_POLL_MS
    );
}

function cgweb123Fix4Install() {
  /*
   * CLIENT_PROGRESS_ONLY001 :
   * le lot local est placé dans un état que FIX3 FIX2
   * ne considère pas comme auto-reprenable.
   */
  cgweb123Fix4FenceBrowserRunner();

  const attempt = () => {
    if (
      !cgweb123Fix4WirePanel()
    ) {
      setTimeout(
        attempt,
        250
      );
      return;
    }

    void cgweb123Fix4PollOnce();

    cgweb123Fix4StartPolling();
  };

  attempt();
}

document.addEventListener(
  "visibilitychange",
  () => {
    if (!document.hidden) {
      void cgweb123Fix4PollOnce();
    }
  }
);

window.addEventListener(
  "online",
  () => {
    void cgweb123Fix4PollOnce();
  }
);

queueMicrotask(
  cgweb123Fix4Install
);

window.CGWEB123_FIX4_STATUS =
  () => ({
    build:
      CGWEB123_FIX4_CLIENT_VERSION,

    server_batch_orchestrator:
      "SERVER_BATCH_ORCHESTRATOR001",

    firestore_queue:
      "FIRESTORE_QUEUE001",

    server_autoresume:
      "SERVER_AUTORESUME001",

    crash_safe_cursor:
      "CRASH_SAFE_CURSOR001",

    client_progress_only:
      "CLIENT_PROGRESS_ONLY001",

    server_batch_id:
      cgweb123Fix4ServerBatchId ||
      null
  });

console.info(
  "CGWEB123 FIX4 actif · SERVER_BATCH_ORCHESTRATOR001 / FIRESTORE_QUEUE001 / SERVER_AUTORESUME001 / CRASH_SAFE_CURSOR001 / CLIENT_PROGRESS_ONLY001"
);

/* CGWEB123_FIX4_CLIENT_END */
/* CGWEB125_FIX1_COMPLETED_BATCH_FREEZE_START
   COMPLETED_BATCH_FREEZE001
*/

let cgweb125Fix1BatchFrozen = false;
let cgweb125Fix1BatchSnapshot = null;

function cgweb125Fix1PublishServerBatch(row) {
  if (row?.found) {
    window.CGWEB123_FIX4_LAST_BATCH = {...row};
  } else if (!cgweb125Fix1BatchSnapshot) {
    window.CGWEB123_FIX4_LAST_BATCH = null;
  }

  window.dispatchEvent(
    new CustomEvent(
      "sport-server-join-batch-status",
      {detail: window.CGWEB123_FIX4_LAST_BATCH}
    )
  );
}

function cgweb125Fix1BatchIsComplete(row) {
  return Boolean(
    row?.found &&
    String(row.status || "").toUpperCase() === "COMPLETE" &&
    Number(row.cursor || 0) >= Number(row.total || 0)
  );
}

function cgweb125Fix1FreezeCompletedBatch(row) {
  if (!cgweb125Fix1BatchIsComplete(row)) return false;

  cgweb125Fix1BatchFrozen = true;
  cgweb125Fix1BatchSnapshot = {...row};
  window.CGWEB123_FIX4_LAST_BATCH = {...row};

  if (cgweb123Fix4PollTimer) {
    clearInterval(cgweb123Fix4PollTimer);
    cgweb123Fix4PollTimer = null;
  }

  const {panel, start, resume, pause} = cgweb123Fix4Nodes();

  if (panel) {
    panel.dataset.cgweb123Fix4Completed = "true";

    const title = panel.querySelector("strong");
    if (title) {
      title.textContent = "Fusion en masse · serveur · TERMINÉE";
    }

    const description = title?.parentElement?.querySelector(".muted");
    if (description) {
      description.textContent =
        "Lot serveur terminé et figé · aucun polling périodique supplémentaire.";
    }
  }

  if (start) {
    start.textContent = "Lot serveur terminé";
    start.disabled = true;
  }

  if (resume) resume.disabled = true;
  if (pause) pause.disabled = true;

  cgweb125Fix1PublishServerBatch(row);
  return true;
}

const cgweb125Fix1BaseRender = cgweb123Fix4Render;

cgweb123Fix4Render = function(row = null) {
  const effective =
    cgweb125Fix1BatchFrozen && cgweb125Fix1BatchSnapshot
      ? cgweb125Fix1BatchSnapshot
      : row;

  cgweb125Fix1BaseRender(effective);
  cgweb125Fix1PublishServerBatch(effective);
  cgweb125Fix1FreezeCompletedBatch(effective);
};

const cgweb125Fix1BasePollOnce = cgweb123Fix4PollOnce;

cgweb123Fix4PollOnce = async function() {
  if (cgweb125Fix1BatchFrozen && cgweb125Fix1BatchSnapshot) {
    cgweb123Fix4Render(cgweb125Fix1BatchSnapshot);
    return cgweb125Fix1BatchSnapshot;
  }

  return cgweb125Fix1BasePollOnce();
};

const cgweb125Fix1BaseStartPolling = cgweb123Fix4StartPolling;

cgweb123Fix4StartPolling = function() {
  if (cgweb125Fix1BatchFrozen) return;
  return cgweb125Fix1BaseStartPolling();
};

window.CGWEB123_FIX4_STATUS = function() {
  const row =
    cgweb125Fix1BatchSnapshot ||
    window.CGWEB123_FIX4_LAST_BATCH ||
    null;

  return {
    build: "CGWEB123_FIX4_CGWEB125_FIX1",
    server_batch_orchestrator: "SERVER_BATCH_ORCHESTRATOR001",
    firestore_queue: "FIRESTORE_QUEUE001",
    server_autoresume: "SERVER_AUTORESUME001",
    crash_safe_cursor: "CRASH_SAFE_CURSOR001",
    client_progress_only: "CLIENT_PROGRESS_ONLY001",
    completed_batch_freeze: "COMPLETED_BATCH_FREEZE001",
    server_batch_id:
      String(row?.batch_id || cgweb123Fix4ServerBatchId || "") || null,
    found: Boolean(row?.found),
    batch_status: row?.status || null,
    cursor: Number(row?.cursor || 0),
    total: Number(row?.total || 0),
    success_count: Number(row?.success_count || 0),
    failure_count: Number(row?.failure_count || 0),
    review_count: Number(row?.review_count || 0),
    recovered_count: Number(row?.recovered_count || 0),
    completed: cgweb125Fix1BatchIsComplete(row),
    frozen: cgweb125Fix1BatchFrozen
  };
};

window.CGWEB123_FIX4_COMPLETED = () =>
  Boolean(window.CGWEB123_FIX4_STATUS?.()?.completed);

console.info(
  "CGWEB125 FIX1 · COMPLETED_BATCH_FREEZE001 actif"
);

/* CGWEB125_FIX1_COMPLETED_BATCH_FREEZE_END */
