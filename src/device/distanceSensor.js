import { InfluxDB, Point } from "@influxdata/influxdb-client";
import { SEN0590 } from "./sen0590.js";

const SENSOR_MIN_CM = Number(process.env.SENSOR_MIN_CM || 2);
const SENSOR_MAX_CM = Number(process.env.SENSOR_MAX_CM || 400);
const I2C_BUS = Number(process.env.SENSOR_I2C_BUS || 1);
const I2C_ADDRESS = Number(process.env.SENSOR_I2C_ADDRESS || "0x74");
const POLL_INTERVAL_MS = Number(process.env.SENSOR_POLL_INTERVAL_MS || 60_000);
const SAMPLES_PER_POLL = Number(process.env.SENSOR_SAMPLES_PER_POLL || 3);
const FILTER_WINDOW_MS = 6 * 60 * 60 * 1000;

let initialized = false;
let sensor = null;
let pollTimer = null;
let stopped = true;
let lastDistanceCm = null;
let lastReadAt = null;
let lastError = null;
let recentMeasurements = [];

const client = new InfluxDB({
  url: "http://192.168.1.160:8086",
  token:
    "ZxiXrqG4D0hOoHOO67J7E1_wQ85v7-frrJy7AXHJkIhr7i8q4WOu4aqCPsxD844OPRLlJNq0JnBI0Z0gQH6QIw==",
});
const writeApi = client.getWriteApi("family", "data");

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function handleNewSample(rawDistanceCm) {
  const distanceCm = Number(rawDistanceCm.toFixed(1));
  const now = Date.now();
  recentMeasurements.push({ value: distanceCm, time: now });
  recentMeasurements = recentMeasurements.filter(
    (measurement) => now - measurement.time <= FILTER_WINDOW_MS
  );

  lastDistanceCm = Number(
    median(recentMeasurements.map((measurement) => measurement.value)).toFixed(1)
  );
  lastReadAt = new Date(now).toISOString();
  lastError = null;

  const point = new Point("laser_distance")
    .floatField("distance_cm", lastDistanceCm)
    .timestamp(new Date(lastReadAt));
  writeApi.writePoint(point);
  writeApi.flush().catch(() => {});
}

async function pollLoop() {
  if (stopped) return;
  try {
    const distanceCm = await sensor.getDistance({ samples: SAMPLES_PER_POLL });
    if (distanceCm == null) {
      lastError = "No valid SEN0590 distance reading in this poll cycle";
    } else {
      handleNewSample(distanceCm);
    }
  } catch (error) {
    lastError = error?.message || String(error);
  }

  if (!stopped) pollTimer = setTimeout(pollLoop, POLL_INTERVAL_MS);
}

export async function initDistanceSensor() {
  if (initialized) return;
  initialized = true;

  try {
    sensor = new SEN0590({
      busNumber: I2C_BUS,
      address: I2C_ADDRESS,
      minCm: SENSOR_MIN_CM,
      maxCm: SENSOR_MAX_CM,
    });
    await sensor.open();
    stopped = false;
    void pollLoop();
  } catch (error) {
    lastError = error?.message || String(error);
    sensor = null;
  }
}

export async function readDistance() {
  if (!initialized) await initDistanceSensor();

  if (!sensor) {
    return {
      ok: false,
      reason: "I2C_NOT_AVAILABLE",
      message: lastError || "SEN0590 I2C sensor is not available",
    };
  }
  if (lastDistanceCm == null) {
    return {
      ok: false,
      reason: "NO_READING_YET",
      message: "Waiting for the first stable SEN0590 reading",
    };
  }
  return {
    ok: true,
    result: { distanceCm: lastDistanceCm, mode: "i2c", measuredAt: lastReadAt },
  };
}

export function getDistanceSensorStatus() {
  return {
    sensor: "SEN0590",
    activeMode: sensor ? "i2c" : "unavailable",
    lastDistanceCm,
    lastReadAt,
    lastError,
    i2c: {
      bus: I2C_BUS,
      address: `0x${I2C_ADDRESS.toString(16)}`,
      connected: Boolean(sensor),
    },
  };
}

export async function closeDistanceSensor() {
  stopped = true;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  if (sensor) await sensor.close();
  sensor = null;
  initialized = false;
  recentMeasurements = [];
}
