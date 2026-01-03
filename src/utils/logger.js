import fs from "fs";
import path from "path";

const LOG_FILE = path.resolve("logs/feeder.log");

function write(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, line);
  console.log(line.trim());
}

export const log = {
  info: (msg) => write("INFO", msg),
  warn: (msg) => write("WARN", msg),
  error: (msg) => write("ERROR", msg)
};
