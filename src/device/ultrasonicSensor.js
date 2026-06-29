import { log } from "../utils/logger.js";
import { InfluxDB, Point } from "@influxdata/influxdb-client";

const SENSOR_MODE = (process.env.SENSOR_MODE || "uart").toLowerCase();

const SENSOR_MIN_CM = 3;
const SENSOR_MAX_CM = 450;

const UART_BAUD_RATE = Number(process.env.SENSOR_UART_BAUD || 9600);
const UART_PORT_PATH = process.env.SENSOR_UART_PATH || "/dev/ttyS0";

// Filtering configuration
const MAX_JUMP_CM = 15;
const MAX_ALLOWED_OUTLIERS = 5;

const MEDIAN_WINDOW_SIZE = 5;
const FILTER_WINDOW_MS = 10_000; // 10 seconds

let initialized = false;
let serialPort = null;
let serialParser = null;
let serialBuffer = [];
let activeMode = "unavailable";

let lastDistanceCm = null;
let lastReadAt = null;
let lastError = null;

let recentMeasurements = []; // { value, time }
let medianBuffer = [];
let consecutiveOutliers = 0;

const client = new InfluxDB({
  url: "http://192.168.1.160:8086",
  token:
    "ZxiXrqG4D0hOoHOO67J7E1_wQ85v7-frrJy7AXHJkIhr7i8q4WOu4aqCPsxD844OPRLlJNq0JnBI0Z0gQH6QIw==",
});

const writeApi = client.getWriteApi("family", "data");

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

    // No valid header found
    if (headerIndex === -1) {
      serialBuffer = [];
      return;
    }

    // Discard bytes before header
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

    // Reject sudden unrealistic jumps unless they persist
    if (lastDistanceCm !== null) {
      const delta = Math.abs(distanceCm - lastDistanceCm);

      if (delta > MAX_JUMP_CM) {
        consecutiveOutliers++;

        if (consecutiveOutliers < MAX_ALLOWED_OUTLIERS) {
          continue;
        }

        log.warn(
          `Accepted large jump after ${MAX_ALLOWED_OUTLIERS} consecutive readings`
        );
      } else {
        consecutiveOutliers = 0;
      }
    }

    // --------------------------------------------------
    // Median filter (removes spikes)
    // --------------------------------------------------

    medianBuffer.push(distanceCm);

    if (medianBuffer.length > MEDIAN_WINDOW_SIZE) {
      medianBuffer.shift();
    }

    // Wait until median buffer fills
    if (medianBuffer.length < MEDIAN_WINDOW_SIZE) {
      continue;
    }

    const sortedMedian = [...medianBuffer].sort((a, b) => a - b);

    const medianDistance =
      sortedMedian[Math.floor(sortedMedian.length / 2)];

    // --------------------------------------------------
    // Rolling 10-second average
    // --------------------------------------------------

    const now = Date.now();

    recentMeasurements.push({
      value: medianDistance,
      time: now,
    });

    // Remove measurements older than 10 seconds
    recentMeasurements = recentMeasurements.filter(
      (m) => now - m.time <= FILTER_WINDOW_MS
    );

    // Need enough samples before reporting
    if (recentMeasurements.length < 10) {
      continue;
    }

    const averageDistance =
      recentMeasurements.reduce(
        (sum, m) => sum + m.value,
        0
      ) / recentMeasurements.length;

    const stableDistanceCm = Number(
      averageDistance.toFixed(1)
    );

    lastDistanceCm = stableDistanceCm;
    lastReadAt = new Date(now).toISOString();
    lastError = null;
    consecutiveOutliers = 0;

    // Save to InfluxDB
    const point = new Point("ultrasonic_distance")
      .floatField("distance_cm", stableDistanceCm)
      .timestamp(new Date(lastReadAt));

    writeApi.writePoint(point);

    writeApi.flush().catch((err) =>
      log.warn(`InfluxDB write error: ${err}`)
    );
  }
}

async function initUartMode() {
  try {
    const serialportModule = await import("serialport");
    const SerialPort = serialportModule.SerialPort;

    serialPort = new SerialPort({
      path: UART_PORT_PATH,
      baudRate: UART_BAUD_RATE,
      autoOpen: false,
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

    log.info(
      `Ultrasonic sensor started in UART mode on ${UART_PORT_PATH} @ ${UART_BAUD_RATE}bps`
    );
  } catch (err) {
    lastError = err?.message || String(err);
    activeMode = "unavailable";

    log.warn(
      `Ultrasonic UART mode unavailable: ${lastError}`
    );
  }
}

export async function initUltrasonicSensor() {
  if (initialized) {
    return;
  }

  initialized = true;

  if (SENSOR_MODE !== "uart") {
    lastError = `Unsupported SENSOR_MODE: ${SENSOR_MODE}. Only 'uart' is supported.`;
    activeMode = "unavailable";

    log.warn(lastError);
    return;
  }

  await initUartMode();
}

export async function readUltrasonicDistance() {
  if (!initialized) {
    await initUltrasonicSensor();
  }

  if (activeMode !== "uart" || !serialPort?.isOpen) {
    return {
      ok: false,
      reason: "UART_NOT_AVAILABLE",
      message: lastError || "UART sensor is not available",
    };
  }

  if (lastDistanceCm == null) {
    return {
      ok: false,
      reason: "NO_UART_READING_YET",
      message:
        "Waiting for first UART frame from ultrasonic sensor",
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
    uart: {
      path: UART_PORT_PATH,
      baudRate: UART_BAUD_RATE,
      connected: Boolean(serialPort?.isOpen),
    },
  };
}

export async function closeUltrasonicSensor() {
  if (!serialPort?.isOpen) {
    return;
  }

  await new Promise((resolve) => {
    serialPort.close(() => resolve());
  });

  if (serialParser) {
    serialPort.off("data", serialParser);
  }

  activeMode = "unavailable";

  recentMeasurements = [];
  medianBuffer = [];
  consecutiveOutliers = 0;
  serialBuffer = [];
}