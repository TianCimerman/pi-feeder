import fs from "fs";
import path from "path";

const STATE_FILE = path.resolve("src/storage/state.json");

const DEFAULT_STATE = {
  enabled: true,
  disabledUntil: null, // timestamp when feeding will be re-enabled (null = not disabled)
  isFeeding: false,
  lastFeed: 0,
  lastAttempt: 0,
  lastManualFeed: 0, // timestamp of last MANUAL feed
  minIntervalMs: 3600000, // 1 hour (applies to ALL feeds)
  manualFeedCooldownMs: 300000, // 5 minutes - cooldown ONLY between manual feeds
  feedsToday: 0, // increments with each feed (resets daily)
  lastResetDate: null,
  feedCount: 0,
};

function ensureStateFile() {
  if (!fs.existsSync(STATE_FILE)) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
  }
}

export async function readState() {
  ensureStateFile();
  try {
    const data = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading state file:", err);
    return DEFAULT_STATE;
  }
}

export async function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("Error writing state file:", err);
  }
}
