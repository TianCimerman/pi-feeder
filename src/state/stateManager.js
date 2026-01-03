import fs from "fs";
import path from "path";

const STATE_FILE = path.resolve("src/storage/state.json");

const DEFAULT_STATE = {
  lastFeed: null,
  feedsToday: 0,
  lastResetDate: null,
  locked: false
};

function ensureStateFile() {
  if (!fs.existsSync(STATE_FILE)) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
  }
}

export function getState() {
  ensureStateFile();
  return JSON.parse(fs.readFileSync(STATE_FILE));
}

export function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function updateState(patch) {
  const state = getState();
  const updated = { ...state, ...patch };
  saveState(updated);
  return updated;
}
