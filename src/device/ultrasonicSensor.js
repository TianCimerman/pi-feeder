import { log } from "../utils/logger.js";
import { InfluxDB, Point } from "@influxdata/influxdb-client";
import { HCSR04 } from "./hcsr04.js";

// This sensor was previously UART-based (A02YYUW-style, streaming framed
// data over /dev/ttyS0). It's now an HC-SR04 wired to GPIO (TRIG/ECHO),
// driven by pigpio for microsecond-accurate edge timing — see hcsr04.js.
// The exported interface below is unchanged so the rest of the app
// doesn't need to know the sensor changed.

const SENSOR_MODE = (process.env.SENSOR_MODE || "gpio").toLowerCase();

const SENSOR_MIN_CM = 3;
const SENSOR_MAX_CM = 450;

const TRIGGER_PIN = Number(process.env.SENSOR_TRIGGER_PIN || 22); // BCM
const ECHO_PIN = Number(process.env.SENSOR_ECHO_PIN || 27); // BCM
const ECHO_TIMEOUT_MS = Number(process.env.SENSOR_ECHO_TIMEOUT_MS || 60);

const POLL_INTERVAL_MS = Number(process.env.SENSOR_POLL_INTERVAL_MS || 300);
const SAMPLES_PER_POLL = 5;

// Filtering configuration (same constants/behavior as the old UART pipeline)
const MAX_JUMP_CM = 15;
const MAX_ALLOWED_OUTLIERS = 5;
const FILTER_WINDOW_MS = 10_000; // 10 seconds

let initialized = false;
let sensor = null;
let pollTimer = null;
let stopped = true;

let activeMode = "unavailable";
let lastDistanceCm = null;
let lastReadAt = null;
let lastError = null;

let recentMeasurements = []; // { value, time }
let consecutiveOutliers = 0;

const client = new InfluxDB({
  url: "http://192.168.1.160:8086",
  token:
    "ZxiXrqG4D0hOoHOO67J7E1_wQ85v7-frrJy7AXHJkIhr7i8q4WOu4aqCPsxD844OPRLlJNq0JnBI0Z0gQH6QIw==",
});
const writeApi = client.getWriteApi("family", "data");

function clampDistance(distanceCm) {
  return Math.max(SENSOR_MIN_CM, Math.min(SENSOR_MAX_CM, distanceCm));
}

function handleNewSample(rawDistanceCm) {
  const distanceCm = clampDistance(Number(rawDistanceCm.toFixed(1)));

  // Reject sudden unrealistic jumps unless they persist
  if (lastDistanceCm !== null) {
    const delta = Math.abs(distanceCm - lastDistanceCm);
    if (delta > MAX_JUMP_CM) {
      consecutiveOutliers++;
      if (consecutiveOutliers < MAX_ALLOWED_OUTLIERS) {
        return;
      }
      log.warn(
        `Accepted large jump after ${MAX_ALLOWED_OUTLIERS} consecutive readings`
      );
    } else {
      consecutiveOutliers = 0;
    }
  }

  // Rolling 10-second average
  const now = Date.now();
  recentMeasurements.push({ value: distanceCm, time: now });
  recentMeasurements = recentMeasurements.filter(
    (m) => now - m.time <= FILTER_WINDOW_MS
  );

  const averageDistance =
    recentMeasurements.reduce((sum, m) => sum + m.value, 0) /
    recentMeasurements.length;
  const stableDistanceCm = Number(averageDistance.toFixed(1));

  lastDistanceCm = stableDistanceCm;
  lastReadAt = new Date(now).toISOString();
  lastError = null;
  consecutiveOutliers = 0;

  const point = new Point("ultrasonic_distance")
    .floatField("distance_cm", stableDistanceCm)
    .timestamp(new Date(lastReadAt));
  writeApi.writePoint(point);
  writeApi.flush().catch((err) => log.warn(`InfluxDB write error: ${err}`));
}

async function pollLoop() {
  if (stopped) return;

  try {
    // HCSR04.getDistance() takes several raw pings and returns their
    // median, discarding timeouts/out-of-range readings — the GPIO
    // equivalent of the old per-frame median filter.
    const distanceCm = await sensor.getDistance({
      samples: SAMPLES_PER_POLL,
      delayMs: 65,
    });

    if (distanceCm == null) {
      lastError = "No valid echo received in this poll cycle";
    } else {
      handleNewSample(distanceCm);
    }
  } catch (err) {
    lastError = err?.message || String(err);
    log.warn(`Ultrasonic GPIO read error: ${lastError}`);
  }

  if (!stopped) {
    pollTimer = setTimeout(pollLoop, POLL_INTERVAL_MS);
  }
}

export async function initUltrasonicSensor() {
  if (initialized) {
    return;
  }
  initialized = true;

  if (SENSOR_MODE !== "gpio") {
    lastError = `Unsupported SENSOR_MODE: ${SENSOR_MODE}. Only 'gpio' is supported.`;
    activeMode = "unavailable";
    log.warn(lastError);
    return;
  }

  try {
    sensor = new HCSR04({
      triggerPin: TRIGGER_PIN,
      echoPin: ECHO_PIN,
      minCm: SENSOR_MIN_CM,
      maxCm: SENSOR_MAX_CM,
      timeoutMs: ECHO_TIMEOUT_MS,
    });

    activeMode = "gpio";
    stopped = false;
    log.info(
      `Ultrasonic sensor started in GPIO mode (TRIG=${TRIGGER_PIN}, ECHO=${ECHO_PIN})`
    );
    pollLoop();
  } catch (err) {
    lastError = err?.message || String(err);
    activeMode = "unavailable";
    log.warn(`Ultrasonic GPIO mode unavailable: ${lastError}`);
  }
}

export async function readUltrasonicDistance() {
  if (!initialized) {
    await initUltrasonicSensor();
  }

  if (activeMode !== "gpio" || !sensor) {
    return {
      ok: false,
      reason: "GPIO_NOT_AVAILABLE",
      message: lastError || "GPIO sensor is not available",
    };
  }

  if (lastDistanceCm == null) {
    return {
      ok: false,
      reason: "NO_READING_YET",
      message: "Waiting for first stable reading from ultrasonic sensor",
    };
  }

  return {
    ok: true,
    result: {
      distanceCm: lastDistanceCm,
      mode: activeMode,
      measuredAt: lastReadAt,
    },
  };
}

export function getUltrasonicSensorStatus() {
  return {
    configuredMode: SENSOR_MODE,
    activeMode,
    lastDistanceCm,
    lastReadAt,
    lastError,
    gpio: {
      triggerPin: TRIGGER_PIN,
      echoPin: ECHO_PIN,
      connected: activeMode === "gpio",
    },
  };
}

export async function closeUltrasonicSensor() {
  stopped = true;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (sensor) {
    sensor.close();
  }
  activeMode = "unavailable";
  recentMeasurements = [];
  consecutiveOutliers = 0;
}