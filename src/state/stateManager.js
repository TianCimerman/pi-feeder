import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createDefaultState } from "./defaultState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', 'storage', 'state.json');

function ensureStateFile() {
  if (!fs.existsSync(STATE_FILE)) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(createDefaultState(), null, 2));
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
