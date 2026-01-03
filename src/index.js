import express from "express";
import { runScheduler } from "./automation/scheduler.js";
import { getStatus } from "./api/status.js";
import { manualFeed } from "./api/feed.js";
import { listSchedules, updateSchedules } from "./api/schedules.js";
import { log } from "./utils/logger.js";

const app = express();
app.use(express.json());

app.get("/status", getStatus);
app.post("/feed", manualFeed);

// ✅ THESE TWO MUST EXIST
app.get("/schedules", listSchedules);
app.post("/schedules", updateSchedules);

app.get("/health", health);


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
