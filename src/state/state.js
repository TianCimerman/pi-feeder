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

export async function readState() {
  ensureStateFile();
  try {
    const data = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading state file:", err);
    return createDefaultState();
  }
}

export async function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("Error writing state file:", err);
  }
}
