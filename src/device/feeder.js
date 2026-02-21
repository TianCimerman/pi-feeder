import { log } from "../utils/logger.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const RELAY_GPIO = Number(process.env.FEEDER_RELAY_GPIO || 12);
const RELAY_ACTIVE_LOW = String(process.env.FEEDER_RELAY_ACTIVE_LOW || "true").toLowerCase() === "true";

const RELAY_ON_VALUE = RELAY_ACTIVE_LOW ? 0 : 1;
const RELAY_OFF_VALUE = RELAY_ACTIVE_LOW ? 1 : 0;

const execFileAsync = promisify(execFile);
let initialized = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setRelay(value) {
  const pinLevel = value === 1 ? "dh" : "dl";
  await execFileAsync("pinctrl", ["set", String(RELAY_GPIO), "op", pinLevel]);
}

async function ensureRelayReady() {
  if (initialized) {
    return;
  }

  await setRelay(RELAY_OFF_VALUE);
  initialized = true;

  log.info(`Feeder relay initialized on GPIO${RELAY_GPIO} (active ${RELAY_ACTIVE_LOW ? "LOW" : "HIGH"})`);
}

export async function feed(duration) {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid feed duration: ${duration}`);
  }

  await ensureRelayReady();

  try {
    await setRelay(RELAY_ON_VALUE);
    await sleep(duration);
    console.log(`Feed complete after ${duration}ms`);
  } finally {
    await setRelay(RELAY_OFF_VALUE);
  }
}

export function closeFeederRelay() {
  if (!initialized) {
    return;
  }

  execFile("pinctrl", ["set", String(RELAY_GPIO), "op", RELAY_OFF_VALUE === 1 ? "dh" : "dl"], () => {});
  initialized = false;
}