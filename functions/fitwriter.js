"use strict";

const {createHash} = require("node:crypto");

/*
 * CGWEB075 · FITWRITER001
 *
 * Génère un vrai fichier FIT Activity avec le SDK JavaScript officiel Garmin.
 * Le module est volontairement indépendant de Firebase.
 */

let sdkPromise = null;

async function fitSdk() {
  if (!sdkPromise) {
    sdkPromise = import("@garmin/fitsdk");
  }
  return sdkPromise;
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positive(value) {
  const n = finite(value);
  return n != null && n >= 0 ? n : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function firstFinite(...values) {
  for (const value of values) {
    const n = finite(value);
    if (n != null) return n;
  }
  return null;
}

function timestampMs(value) {
  if (value instanceof Date) {
    const n = value.getTime();
    return Number.isFinite(n) ? n : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  const n = finite(value);

  if (n == null) return null;

  /*
   * Un timestamp Unix en secondes est converti en millisecondes.
   * Les temps relatifs doivent utiliser elapsed_s/time_s.
   */
  if (n > 1000000000 && n < 100000000000) {
    return Math.round(n * 1000);
  }

  return Math.round(n);
}

function degreesToSemicircles(degrees) {
  const n = finite(degrees);
  if (n == null) return null;

  const normalized = clamp(n, -180, 180);
  return Math.round(normalized * (2147483648 / 180));
}

function haversineMeters(a, b) {
  if (
    a?.lat == null ||
    a?.lon == null ||
    b?.lat == null ||
    b?.lon == null
  ) {
    return 0;
  }

  const r = 6371000;
  const rad = Math.PI / 180;

  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);

  const h =
    sinLat * sinLat +
    Math.cos(lat1) *
      Math.cos(lat2) *
      sinLon *
      sinLon;

  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function rawPoint(point, index, startMs) {
  const lat =
    firstFinite(
      point?.lat,
      point?.latitude
    );

  const lon =
    firstFinite(
      point?.lon,
      point?.lng,
      point?.longitude
    );

  let time =
    timestampMs(
      point?.timestamp_ms ??
      point?.time_ms ??
      point?.timestamp ??
      point?.date
    );

  if (time == null) {
    const relativeSeconds =
      firstFinite(
        point?.elapsed_s,
        point?.time_s,
        point?.seconds
      );

    if (relativeSeconds != null && startMs != null) {
      time =
        Math.round(
          startMs + relativeSeconds * 1000
        );
    }
  }

  if (time == null && startMs != null) {
    time = startMs + index * 1000;
  }

  return {
    timestampMs: time,
    lat,
    lon,
    altitude:
      firstFinite(
        point?.altitude_m,
        point?.altitude,
        point?.elevation_m,
        point?.elevation
      ),
    distance:
      positive(
        point?.distance_m ??
        point?.distance
      ),
    heartRate:
      positive(
        point?.heart_rate ??
        point?.heartRate ??
        point?.hr
      ),
    cadence:
      positive(point?.cadence),
    power:
      positive(
        point?.power ??
        point?.watts
      ),
    speed:
      positive(
        point?.speed_mps ??
        point?.speed
      )
  };
}

function normalizePoints(payload) {
  const supplied =
    Array.isArray(payload?.points)
      ? payload.points
      : [];

  let startMs =
    timestampMs(
      payload?.start_time_ms ??
      payload?.startTimeMs ??
      payload?.start_time ??
      payload?.startTime
    );

  const initial =
    supplied.map(
      (point, index) =>
        rawPoint(point, index, startMs)
    );

  if (startMs == null) {
    const firstTimestamp =
      initial
        .map((point) => point.timestampMs)
        .find((value) => value != null);

    if (firstTimestamp != null) {
      startMs = firstTimestamp;
    }
  }

  const points =
    supplied.map(
      (point, index) =>
        rawPoint(point, index, startMs)
    );

  if (!points.length) {
    throw new Error(
      "FITWRITER001 : au moins un point est requis."
    );
  }

  for (const point of points) {
    if (point.timestampMs == null) {
      throw new Error(
        "FITWRITER001 : timestamp manquant."
      );
    }
  }

  points.sort(
    (a, b) =>
      a.timestampMs - b.timestampMs
  );

  /*
   * Distance cumulative :
   * - conserve la distance fournie quand elle est croissante ;
   * - sinon la reconstruit à partir du GPS.
   */
  let cumulative = 0;
  let previous = null;

  for (const point of points) {
    if (
      point.distance != null &&
      point.distance >= cumulative
    ) {
      cumulative = point.distance;
    } else if (previous) {
      cumulative += haversineMeters(
        previous,
        point
      );

      point.distance = cumulative;
    } else {
      point.distance = 0;
    }

    previous = point;
  }

  /*
   * Vitesse ponctuelle si absente.
   */
  for (let i = 0; i < points.length; i += 1) {
    if (points[i].speed != null) continue;

    if (i === 0) {
      points[i].speed = null;
      continue;
    }

    const dt =
      (points[i].timestampMs -
        points[i - 1].timestampMs) /
      1000;

    const dd =
      Number(points[i].distance || 0) -
      Number(points[i - 1].distance || 0);

    if (dt > 0 && dd >= 0) {
      points[i].speed = dd / dt;
    }
  }

  return {
    startMs:
      startMs ??
      points[0].timestampMs,
    points
  };
}

function activityStats(payload, normalized) {
  const points = normalized.points;
  const startMs = normalized.startMs;
  const endMs =
    points[points.length - 1].timestampMs;

  const elapsedSeconds =
    Math.max(
      0,
      (endMs - startMs) / 1000
    );

  const timerSeconds =
    firstFinite(
      payload?.total_timer_time_s,
      payload?.timer_time_s,
      payload?.duration_s,
      elapsedSeconds
    );

  const lastDistance =
    Number(
      points[points.length - 1].distance || 0
    );

  const totalDistance =
    firstFinite(
      payload?.distance_m,
      payload?.total_distance_m,
      lastDistance
    ) || 0;

  let ascent = 0;
  let previousAltitude = null;

  const heartRates = [];

  for (const point of points) {
    if (point.altitude != null) {
      if (
        previousAltitude != null &&
        point.altitude > previousAltitude
      ) {
        ascent +=
          point.altitude -
          previousAltitude;
      }

      previousAltitude = point.altitude;
    }

    if (
      point.heartRate != null &&
      point.heartRate > 0
    ) {
      heartRates.push(point.heartRate);
    }
  }

  const avgHeartRate =
    heartRates.length
      ? Math.round(
          heartRates.reduce(
            (sum, value) => sum + value,
            0
          ) / heartRates.length
        )
      : null;

  const maxHeartRate =
    heartRates.length
      ? Math.round(Math.max(...heartRates))
      : null;

  /* CGWEB076_FITROUNDTRIP001_STATS_START */
  const suppliedAvgHeartRate =
    firstFinite(
      payload?.avg_hr,
      payload?.avg_heart_rate,
      payload?.average_heart_rate,
      payload?.average_heartrate
    );

  const suppliedMaxHeartRate =
    firstFinite(
      payload?.max_hr,
      payload?.max_heart_rate,
      payload?.maximum_heart_rate,
      payload?.max_heartrate
    );

  const effectiveAvgHeartRate =
    suppliedAvgHeartRate != null && suppliedAvgHeartRate > 0
      ? Math.round(clamp(suppliedAvgHeartRate, 0, 255))
      : avgHeartRate;

  const effectiveMaxHeartRate =
    suppliedMaxHeartRate != null && suppliedMaxHeartRate > 0
      ? Math.round(clamp(suppliedMaxHeartRate, 0, 255))
      : maxHeartRate;
  /* CGWEB076_FITROUNDTRIP001_STATS_END */

  const totalAscent =
    firstFinite(
      payload?.total_ascent_m,
      payload?.ascent_m,
      ascent
    );

  const avgSpeed =
    timerSeconds > 0
      ? totalDistance / timerSeconds
      : null;

  return {
    startMs,
    endMs,
    elapsedSeconds,
    timerSeconds:
      Math.max(0, timerSeconds || 0),
    totalDistance:
      Math.max(0, totalDistance),
    totalAscent:
      Math.max(0, totalAscent || 0),
    avgHeartRate: effectiveAvgHeartRate,
    maxHeartRate: effectiveMaxHeartRate,
    avgSpeed:
      avgSpeed != null &&
      Number.isFinite(avgSpeed)
        ? avgSpeed
        : null
  };
}

/* CGWEB113_FIT_LOCAL_TIME_CANONICAL_NAME001_START */

const CGWEB113_CANONICAL_TIME_ZONE =
  "Europe/Paris";

function cgweb113ParisDateTimeParts(
  startMs
) {
  const date =
    new Date(
      Number(startMs)
    );

  if (
    !Number.isFinite(
      date.getTime()
    )
  ) {
    throw new Error(
      "FITWRITER001 : date de départ invalide."
    );
  }

  /*
   * EUROPE_PARIS_TIMEZONE001
   *
   * Le nom d'un FIT canonique représente l'heure de départ telle qu'elle
   * est affichée dans SPORT Web en France. Le fuseau est explicite :
   * il ne dépend donc plus du timezone du runtime Cloud Functions.
   *
   * Intl applique automatiquement CET (UTC+1) / CEST (UTC+2).
   */
  const formatter =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone:
          CGWEB113_CANONICAL_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
      }
    );

  const values = {};

  for (
    const part
    of formatter.formatToParts(date)
  ) {
    if (
      part.type !== "literal"
    ) {
      values[part.type] =
        part.value;
    }
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second
  };
}

function canonicalFitFileName(
  startMs,
  code = "C"
) {
  const parts =
    cgweb113ParisDateTimeParts(
      startMs
    );

  const safeCode =
    String(code || "C")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4) || "C";

  return [
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  ].join("_") +
    `_${safeCode}.fit`;
}

/* CGWEB113_FIT_LOCAL_TIME_CANONICAL_NAME001_END */

function sportFileCode(sport, subSport) {
  const s = Number(sport || 0);
  const sub = Number(subSport || 0);

  if (s === 1 && sub === 1) return "T";
  if (s === 1) return "C";
  if (s === 2 && [5, 6, 58].includes(sub)) return "H";
  if (s === 2) return "V";
  if (s === 11) return "M";

  return "C";
}

function cleanMessage(values) {
  const output = {};

  for (const [key, value] of Object.entries(values)) {
    if (
      value !== null &&
      value !== undefined &&
      !(typeof value === "number" && !Number.isFinite(value))
    ) {
      output[key] = value;
    }
  }

  return output;
}


/* CGWEB088_FIX1_FITSIGNATURE001_HELPERS_START */

/*
 * FITSIGNATURE001
 * ----------------
 * Une activité canonique SPORT possède une identité stable indépendante
 * de ses futures versions FIT.
 *
 * - source prioritaire : fit_signature_seed explicite ;
 * - sinon : activity_id ;
 * - sinon : comportement historique basé sur start_time_ms.
 *
 * La signature SHA-256 complète est conservée dans les métadonnées du coffre.
 * Les 32 premiers bits alimentent FILE_ID.serialNumber et DEVICE_INFO.serialNumber.
 * Cela rend deux activités distinctes binaires distinctes même si leurs mesures
 * sont par ailleurs identiques, sans modifier date, distance, durée, GPS, D+ ou FC.
 */
function fitSignatureIdentity(payload, startMs) {
  const explicit =
    String(
      payload?.fit_signature_seed ??
      payload?.fitSignatureSeed ??
      ""
    ).trim();

  const activityId =
    String(
      payload?.activity_id ??
      payload?.activityId ??
      ""
    ).trim();

  const seed =
    explicit ||
    activityId;

  if (!seed) {
    return {
      signature: null,
      version: null,
      seedSource: "LEGACY_START_TIME",
      serialNumber:
        (
          Math.abs(
            Math.trunc(startMs)
          ) % 4294967294
        ) + 1
    };
  }

  const canonical =
    "FITSIGNATURE001|ACTIVITY|" +
    seed;

  const digest =
    createHash("sha256")
      .update(canonical, "utf8")
      .digest();

  let serialNumber =
    digest.readUInt32BE(0);

  if (
    serialNumber === 0 ||
    serialNumber === 4294967295
  ) {
    serialNumber =
      (
        digest.readUInt32BE(4) %
        4294967294
      ) + 1;
  }

  return {
    signature:
      digest.toString("hex"),
    version:
      "FITSIGNATURE001",
    seedSource:
      explicit
        ? "EXPLICIT_SEED"
        : "ACTIVITY_ID",
    serialNumber
  };
}

/* CGWEB088_FIX1_FITSIGNATURE001_HELPERS_END */

async function encodeCanonicalFit(payload = {}) {
  const {
    Encoder,
    Profile
  } = await fitSdk();

  const normalized =
    normalizePoints(payload);

  const stats =
    activityStats(
      payload,
      normalized
    );

  const sport =
    Math.max(
      0,
      Math.round(
        firstFinite(
          payload?.sport,
          1
        )
      )
    );

  const subSport =
    Math.max(
      0,
      Math.round(
        firstFinite(
          payload?.sub_sport,
          payload?.subSport,
          0
        )
      )
    );

  const startDate =
    new Date(stats.startMs);

  const endDate =
    new Date(stats.endMs);

  const fitSignature =
    fitSignatureIdentity(
      payload,
      stats.startMs
    );

  const serialNumber =
    fitSignature.serialNumber;

  const encoder =
    new Encoder();

  const write =
    (mesgNum, values) =>
      encoder.onMesg(
        mesgNum,
        cleanMessage(values)
      );

  /*
   * File ID DOIT être le premier message.
   */
  write(
    Profile.MesgNum.FILE_ID,
    {
      type: "activity",
      manufacturer: "development",
      product: 1,
      serialNumber,
      timeCreated: startDate
    }
  );

  /*
   * Device Info : bonne pratique Garmin.
   */
  write(
    Profile.MesgNum.DEVICE_INFO,
    {
      timestamp: startDate,
      deviceIndex: "creator",
      manufacturer: "development",
      product: 1,
      productName: "SPORT Web",
      serialNumber,
      softwareVersion: 0.75
    }
  );

  /*
   * Timer start.
   */
  write(
    Profile.MesgNum.EVENT,
    {
      timestamp: startDate,
      event: "timer",
      eventType: "start"
    }
  );

  /*
   * Records.
   */
  for (
    const point of
    normalized.points
  ) {
    write(
      Profile.MesgNum.RECORD,
      {
        timestamp:
          new Date(point.timestampMs),

        positionLat:
          point.lat != null
            ? degreesToSemicircles(point.lat)
            : null,

        positionLong:
          point.lon != null
            ? degreesToSemicircles(point.lon)
            : null,

        altitude: point.altitude,
        distance: point.distance,
        speed: point.speed,

        heartRate:
          point.heartRate != null
            ? Math.round(
                clamp(
                  point.heartRate,
                  0,
                  255
                )
              )
            : null,

        cadence:
          point.cadence != null
            ? Math.round(
                clamp(
                  point.cadence,
                  0,
                  255
                )
              )
            : null,

        power:
          point.power != null
            ? Math.round(
                clamp(
                  point.power,
                  0,
                  65535
                )
              )
            : null
      }
    );
  }

  /*
   * Timer stop.
   */
  write(
    Profile.MesgNum.EVENT,
    {
      timestamp: endDate,
      event: "timer",
      eventType: "stopAll"
    }
  );

  /*
   * Une Lap au minimum.
   */
  write(
    Profile.MesgNum.LAP,
    {
      messageIndex: 0,
      timestamp: endDate,
      startTime: startDate,
      totalElapsedTime:
        stats.elapsedSeconds,
      totalTimerTime:
        stats.timerSeconds,
      totalDistance:
        stats.totalDistance,
      totalAscent:
        Math.round(stats.totalAscent),
      avgHeartRate:
        stats.avgHeartRate,
      maxHeartRate:
        stats.maxHeartRate,
      avgSpeed:
        stats.avgSpeed,
      sport,
      subSport
    }
  );

  /*
   * Une Session au minimum.
   */
  write(
    Profile.MesgNum.SESSION,
    {
      messageIndex: 0,
      timestamp: endDate,
      startTime: startDate,
      totalElapsedTime:
        stats.elapsedSeconds,
      totalTimerTime:
        stats.timerSeconds,
      totalDistance:
        stats.totalDistance,
      totalAscent:
        Math.round(stats.totalAscent),
      avgHeartRate:
        stats.avgHeartRate,
      maxHeartRate:
        stats.maxHeartRate,
      avgSpeed:
        stats.avgSpeed,
      sport,
      subSport,
      firstLapIndex: 0,
      numLaps: 1
    }
  );

  /*
   * Un et un seul Activity message.
   */
  write(
    Profile.MesgNum.ACTIVITY,
    {
      timestamp: endDate,
      totalTimerTime:
        stats.timerSeconds,
      numSessions: 1,
      type: "manual"
    }
  );

  const bytes =
    encoder.close();

  const buffer =
    Buffer.from(bytes);

  const fileName =
    canonicalFitFileName(
      stats.startMs,
      sportFileCode(
        sport,
        subSport
      )
    );

  return {
    buffer,
    fileName,
    stats: {
      ...stats,
      sport,
      subSport,
      pointCount:
        normalized.points.length,
      serialNumber,
      fitSignature:
        fitSignature.signature,
      fitSignatureVersion:
        fitSignature.version,
      fitSignatureSeedSource:
        fitSignature.seedSource
    },
    writerVersion:
      "FITWRITER001"
  };
}


/* CGWEB113_FIT_TIMESTAMP_PARITY_AUDIT001_HELPER_START */

async function fitStartTimeMsFromBuffer(
  buffer
) {
  const {
    Decoder,
    Stream
  } = await fitSdk();

  const source =
    Buffer.isBuffer(buffer)
      ? buffer
      : Buffer.from(buffer);

  const firstStream =
    Stream.fromBuffer(source);

  if (
    !Decoder.isFIT(
      firstStream
    )
  ) {
    return null;
  }

  const decoder =
    new Decoder(
      Stream.fromBuffer(source)
    );

  const result =
    decoder.read({
      applyScaleAndOffset: true,
      expandSubFields: true,
      expandComponents: true,
      convertTypesToStrings: true,
      convertDateTimesToDates: true,
      includeUnknownData: false,
      mergeHeartRates: true,
      decodeMemoGlobs: false,
      skipHeader: false,
      dataOnly: false,
      legacyArrayMode: false
    });

  const messages =
    result?.messages || {};

  const first =
    (value) =>
      Array.isArray(value) &&
      value.length
        ? value[0]
        : null;

  const session =
    first(
      messages.sessionMesgs
    );

  const lap =
    first(
      messages.lapMesgs
    );

  const record =
    first(
      messages.recordMesgs
    );

  const fileId =
    first(
      messages.fileIdMesgs
    );

  const candidates = [
    session?.startTime,
    lap?.startTime,
    record?.timestamp,
    fileId?.timeCreated
  ];

  for (
    const candidate
    of candidates
  ) {
    const ms =
      timestampMs(candidate);

    if (
      ms != null &&
      Number.isFinite(ms)
    ) {
      return ms;
    }
  }

  return null;
}

/* CGWEB113_FIT_TIMESTAMP_PARITY_AUDIT001_HELPER_END */

async function inspectFitBuffer(buffer) {
  const {
    Decoder,
    Stream
  } = await fitSdk();

  const source =
    Buffer.isBuffer(buffer)
      ? buffer
      : Buffer.from(buffer);

  const stream =
    Stream.fromBuffer(source);

  const isFit =
    Decoder.isFIT(stream);

  if (!isFit) {
    return {
      ok: false,
      isFit: false,
      integrity: false,
      errors: [
        "Signature FIT invalide."
      ]
    };
  }

  const decoder =
    new Decoder(
      Stream.fromBuffer(source)
    );

  const integrity =
    decoder.checkIntegrity();

  const result =
    decoder.read({
      applyScaleAndOffset: true,
      expandSubFields: true,
      expandComponents: true,
      convertTypesToStrings: true,
      convertDateTimesToDates: true,
      includeUnknownData: false,
      mergeHeartRates: true,
      decodeMemoGlobs: false,
      skipHeader: false,
      dataOnly: false,
      legacyArrayMode: false
    });

  const messages =
    result?.messages || {};

  const errors =
    Array.isArray(result?.errors)
      ? result.errors.map(
          (error) =>
            error?.message ||
            String(error)
        )
      : [];

  const recordCount =
    Array.isArray(messages.recordMesgs)
      ? messages.recordMesgs.length
      : 0;

  const sessionCount =
    Array.isArray(messages.sessionMesgs)
      ? messages.sessionMesgs.length
      : 0;

  const lapCount =
    Array.isArray(messages.lapMesgs)
      ? messages.lapMesgs.length
      : 0;

  const activityCount =
    Array.isArray(messages.activityMesgs)
      ? messages.activityMesgs.length
      : 0;

  return {
    ok:
      Boolean(
        isFit &&
        integrity &&
        !errors.length &&
        recordCount >= 1 &&
        sessionCount >= 1 &&
        lapCount >= 1 &&
        activityCount === 1
      ),

    isFit,
    integrity,
    errors,
    recordCount,
    sessionCount,
    lapCount,
    activityCount
  };
}

async function fitWriterSelfTest() {
  const start =
    Date.UTC(
      2026,
      8,
      16,
      6,
      0,
      0
    );

  const points = [];

  for (let i = 0; i <= 12; i += 1) {
    points.push({
      timestamp_ms:
        start + i * 1000,
      lat:
        46.25 + i * 0.00001,
      lon:
        6.10 + i * 0.00001,
      altitude_m:
        450 + i * 0.2,
      distance_m:
        i * 3,
      heart_rate:
        120 + i,
      cadence:
        82,
      power:
        i % 2 ? 175 : 185
    });
  }

  const generated =
    await encodeCanonicalFit({
      start_time_ms: start,
      sport: 1,
      sub_sport: 0,
      points
    });

  const check =
    await inspectFitBuffer(
      generated.buffer
    );

  if (!check.ok) {
    const error =
      new Error(
        "FITWRITER001 self-test invalide : " +
        JSON.stringify(check)
      );

    error.check = check;
    throw error;
  }

  return {
    ok: true,
    bytes:
      generated.buffer.length,
    fileName:
      generated.fileName,
    stats:
      generated.stats,
    check
  };
}


/* CGWEB076_FITROUNDTRIP001_DECODE_START */
async function decodeCanonicalFitSummary(buffer) {
  const {Decoder, Stream} = await fitSdk();

  const source = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(buffer);

  const stream = Stream.fromBuffer(source);
  if (!Decoder.isFIT(stream)) {
    throw new Error("FITROUNDTRIP001 : signature FIT invalide.");
  }

  const decoder = new Decoder(Stream.fromBuffer(source));
  const integrity = decoder.checkIntegrity();

  const result = decoder.read({
    applyScaleAndOffset: true,
    expandSubFields: true,
    expandComponents: true,
    convertTypesToStrings: false,
    convertDateTimesToDates: true,
    includeUnknownData: false,
    mergeHeartRates: true,
    decodeMemoGlobs: false,
    skipHeader: false,
    dataOnly: false,
    legacyArrayMode: false
  });

  const messages = result?.messages || {};
  const records = Array.isArray(messages.recordMesgs) ? messages.recordMesgs : [];
  const sessions = Array.isArray(messages.sessionMesgs) ? messages.sessionMesgs : [];
  const laps = Array.isArray(messages.lapMesgs) ? messages.lapMesgs : [];
  const activities = Array.isArray(messages.activityMesgs) ? messages.activityMesgs : [];
  const session = sessions[0] || {};

  const dateMs = (value) => {
    if (value instanceof Date) {
      const n = value.getTime();
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n > 100000000000 ? Math.round(n) : Math.round(n * 1000);
  };

  const number = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const firstRecord = records[0] || {};
  const lastRecord = records[records.length - 1] || {};

  return {
    integrity: Boolean(integrity),
    errors: Array.isArray(result?.errors)
      ? result.errors.map((error) => error?.message || String(error))
      : [],
    startMs: dateMs(session.startTime) ?? dateMs(firstRecord.timestamp),
    endMs: dateMs(session.timestamp) ?? dateMs(lastRecord.timestamp),
    elapsedSeconds: number(session.totalElapsedTime),
    timerSeconds: number(session.totalTimerTime),
    totalDistance: number(session.totalDistance),
    totalAscent: number(session.totalAscent),
    avgHeartRate: number(session.avgHeartRate),
    maxHeartRate: number(session.maxHeartRate),
    sport: number(session.sport),
    subSport: number(session.subSport),
    recordCount: records.length,
    lapCount: laps.length,
    sessionCount: sessions.length,
    activityCount: activities.length
  };
}
/* CGWEB076_FITROUNDTRIP001_DECODE_END */

module.exports = {
  encodeCanonicalFit,
  inspectFitBuffer,
  fitWriterSelfTest,
  canonicalFitFileName,
  fitStartTimeMsFromBuffer,
  sportFileCode,
  decodeCanonicalFitSummary
};
