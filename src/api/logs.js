import fs from "fs";
import path from "path";

const LOG_FILE = path.resolve("logs/feeder.log");

export function getLogs(req, res) {
  try {
    // Default to last 100 lines if not specified
    const lines = parseInt(req.query.lines) || 100;
    
    if (!fs.existsSync(LOG_FILE)) {
      return res.json({
        ok: true,
        logs: [],
        message: "No logs available yet"
      });
    }

    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const allLines = content.split("\n").filter(line => line.trim() !== "");
    
    // Get the last N lines
    const recentLogs = allLines.slice(-lines);

    res.json({
      ok: true,
      logs: recentLogs,
      totalLines: allLines.length,
      returnedLines: recentLogs.length
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "Failed to read logs",
      detail: error.message
    });
  }
}
