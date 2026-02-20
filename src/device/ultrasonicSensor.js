import { log } from "../utils/logger.js";

const SENSOR_MODE = (process.env.SENSOR_MODE || "uart").toLowerCase();
const SENSOR_MIN_CM = 3;
const SENSOR_MAX_CM = 450;
const UART_BAUD_RATE = Number(process.env.SENSOR_UART_BAUD || 9600);
const UART_PORT_PATH = process.env.SENSOR_UART_PATH || "/dev/ttyS0";

let initialized = false;
let serialPort = null;
let serialParser = null;
let serialBuffer = [];
let activeMode = "unavailable";

let lastDistanceCm = null;
let lastReadAt = null;
let lastError = null;

function clampDistance(distanceCm) {
  return Math.max(SENSOR_MIN_CM, Math.min(SENSOR_MAX_CM, distanceCm));
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

    lastDistanceCm = distanceCm;
    lastReadAt = new Date().toISOString();
    lastError = null;
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
}
