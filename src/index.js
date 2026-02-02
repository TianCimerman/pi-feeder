import express from "express";
import { runScheduler } from "./automation/scheduler.js";
import { getStatus } from "./api/status.js";
import { manualFeed } from "./api/feed.js";
import { listSchedules, addSchedule, updateSchedule, updateSchedules, deleteSchedule } from "./api/schedules.js";
import { disableFeedingFor24Hours, enableFeeding } from "./api/disable.js";
import { log } from "./utils/logger.js";
import { health } from "./api/health.js";
const app = express();
app.use(express.json());

app.get("/status", getStatus);
app.post("/feed", manualFeed);

// Schedule management endpoints
app.get("/schedules", listSchedules);
app.post("/schedules", updateSchedules); // ✅ Backward compatible - accepts array of schedules
app.post("/schedules/add", addSchedule);
app.post("/schedules/update", updateSchedule);
app.post("/schedules/delete", deleteSchedule);

app.post("/disable", disableFeedingFor24Hours);
app.post("/enable", enableFeeding);

app.get("/health", health);

// Handle JSON parsing errors (must be after routes)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ ok: false, error: "Invalid JSON", detail: err.message });
  }
  next(err);
});


runScheduler();


process.on("uncaughtException", (err) => {
  log.error(`Uncaught exception: ${err.stack}`);
});

process.on("unhandledRejection", (err) => {
  log.error(`Unhandled rejection: ${err}`);
});


app.listen(8080, () => {
  console.log("Pi feeder running on port 8080");
});
