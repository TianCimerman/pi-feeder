import cron from "node-cron";
import { getSchedules } from "./scheduleManager.js";
import { executeFeed } from "./executeFeed.js";

export function runScheduler() {
  cron.schedule("* * * * *", async () => {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM

    const schedules = getSchedules();

    for (const s of schedules) {
      if (!s.enabled) continue;

      if (s.time === currentTime) {
        try {
          await executeFeed({
            duration: s.duration,
            source: `SCHEDULE:${s.id}`
          });
        } catch (err) {
          console.error("Scheduled feed blocked:", err.message);
        }
      }
    }
  });
}
