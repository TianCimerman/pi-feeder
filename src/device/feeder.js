import { log } from "../utils/logger.js";

const RELAY_GPIO = Number(process.env.FEEDER_RELAY_GPIO || 12);
const RELAY_ACTIVE_LOW = String(process.env.FEEDER_RELAY_ACTIVE_LOW || "true").toLowerCase() === "true";

const RELAY_ON_VALUE = RELAY_ACTIVE_LOW ? 0 : 1;
const RELAY_OFF_VALUE = RELAY_ACTIVE_LOW ? 1 : 0;

let relayPin = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureRelayReady() {
  if (relayPin) {
    return;
  }

  const onoffModule = await import("onoff");
  const Gpio = onoffModule.Gpio;

  relayPin = new Gpio(RELAY_GPIO, "out");
  relayPin.writeSync(RELAY_OFF_VALUE);

  log.info(`Feeder relay initialized on GPIO${RELAY_GPIO} (active ${RELAY_ACTIVE_LOW ? "LOW" : "HIGH"})`);
}

export async function feed(duration) {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid feed duration: ${duration}`);
  }

  await ensureRelayReady();

  try {
    relayPin.writeSync(RELAY_ON_VALUE);
    await sleep(duration);
  } finally {
    if (relayPin) {
      relayPin.writeSync(RELAY_OFF_VALUE);
    }
  }
}

export function closeFeederRelay() {
  if (!relayPin) {
    return;
  }

  relayPin.writeSync(RELAY_OFF_VALUE);
  relayPin.unexport();
  relayPin = null;
}