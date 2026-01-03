import fs from "fs";
import path from "path";

const FILE = path.resolve("src/storage/schedules.json");

export function getSchedules() {
  if (!fs.existsSync(FILE)) return [];
  return JSON.parse(fs.readFileSync(FILE));
}

export function saveSchedules(schedules) {
  fs.writeFileSync(FILE, JSON.stringify(schedules, null, 2));
}
