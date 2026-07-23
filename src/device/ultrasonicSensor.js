import { log } from "../utils/logger.js";
import { InfluxDB, Point } from '@influxdata/influxdb-client';

const SENSOR_MODE = (process.env.SENSOR_MODE || "uart").toLowerCase();
const SENSOR_MIN_CM = 3;
const SENSOR_MAX_CM = 450;
const MAX_DELTA_CM = 5;
const WINDOW_SIZE = 9;
const MAX_JUMP_CM = 3;
const MAX_ALLOWED_OUTLIERS = 15;
const ONE_MINUTE_MS = 60_000;
const UART_BAUD_RATE = Number(process.env.SENSOR_UART_BAUD || 9600);
const UART_PORT_PATH = process.env.SENSOR_UART_PATH || "/dev/ttyS0";

let initialized = false;
let sensor = null;
let pollTimer = null;
let stopped = true;

let activeMode = "unavailable";
let lastDistanceCm = null;
let lastReadAt = null;
let lastError = null;
let recentMeasurements = [];
let consecutiveOutliers = 0;

const client = new InfluxDB({
  url: "http://192.168.1.160:8086",
  token:
    "ZxiXrqG4D0hOoHOO67J7E1_wQ85v7-frrJy7AXHJkIhr7i8q4WOu4aqCPsxD844OPRLlJNq0JnBI0Z0gQH6QIw==",
});


const writeApi = client.getWriteApi('family', 'data');



function clampDistance(distanceCm) {
  return Math.max(
    SENSOR_MIN_CM,
    Math.min(SENSOR_MAX_CM, distanceCm)
  );
}

function parseA02Frame(frame) {
  if (!Array.isArray(frame) || frame.length !== 4) {
    return null;
  }

  const [header, highByte, lowByte, checksum] = frame;
  if (header !== 0xff) {
    return null;
  }

  const expectedChecksum = (header + highByte + lowByte) & 0xff;
  if (checksum !== expectedChecksum) {
    return null;
  }

  const rawDistanceMm = (highByte << 8) + lowByte;
  const distanceCm = rawDistanceMm / 10;
  return clampDistance(Number(distanceCm.toFixed(1)));
}

function handleSerialData(chunk) {
  for (const byte of chunk) {
    serialBuffer.push(byte);
  }

  while (serialBuffer.length >= 4) {
    const headerIndex = serialBuffer.indexOf(0xff);
    if (headerIndex === -1) {
      serialBuffer = [];
      return;
    }

    if (headerIndex > 0) {
      serialBuffer = serialBuffer.slice(headerIndex);
    }

    if (serialBuffer.length < 4) {
      return;
    }

    const frame = serialBuffer.slice(0, 4);
    serialBuffer = serialBuffer.slice(4);

    const distanceCm = parseA02Frame(frame);
    if (distanceCm == null) {
      continue;
    }

    if (lastDistanceCm !== null) {
      const absoluteChange = Math.abs(distanceCm - lastDistanceCm);
      if (absoluteChange > MAX_JUMP_CM) {
        consecutiveOutliers += 1;
        if (consecutiveOutliers < MAX_ALLOWED_OUTLIERS) {
          continue;
        }
      } else {
        consecutiveOutliers = 0;
      }
    }

    recentMeasurements.push(distanceCm);
    if (recentMeasurements.length > WINDOW_SIZE) {
      recentMeasurements.shift();
    }

    if (recentMeasurements.length < WINDOW_SIZE) {
      continue;
    }

    const sorted = [...recentMeasurements].sort((a, b) => a - b);
    const medianDistanceCm = sorted[Math.floor(WINDOW_SIZE / 2)];
    const isStable = recentMeasurements.every(
      (value) => Math.abs(value - medianDistanceCm) <= MAX_DELTA_CM
    );

    if (!isStable) {
      continue;
    }

    const now = Date.now();
    if (lastReadAt && now - new Date(lastReadAt).getTime() < ONE_MINUTE_MS) {
      continue;
    }

    const stableDistanceCm = Number(medianDistanceCm.toFixed(1));

  lastDistanceCm = stableDistanceCm;
  lastReadAt = new Date(now).toISOString();
  lastError = null;
  consecutiveOutliers = 0;

    const point = new Point('ultrasonic_distance')
      .floatField('distance_cm', stableDistanceCm)
      .timestamp(new Date(lastReadAt));
    writeApi.writePoint(point);
    writeApi.flush().catch(err => log.warn(`InfluxDB write error: ${err}`));
  }
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

    await new Promise((resolve, reject) => {
      serialPort.open((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    serialParser = (data) => handleSerialData([...data]);
    serialPort.on("data", serialParser);
    activeMode = "uart";

    log.info(`Ultrasonic sensor started in UART mode on ${UART_PORT_PATH} @ ${UART_BAUD_RATE}bps`);
  } catch (err) {
    lastError = err?.message || String(err);
    activeMode = "unavailable";
    log.warn(`Ultrasonic UART mode unavailable: ${lastError}`);
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
      reason: "NO_UART_READING_YET",
      message: "Waiting for first UART frame from ultrasonic sensor",
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
  medianBuffer = [];
  consecutiveOutliers = 0;
  serialBuffer = [];
}