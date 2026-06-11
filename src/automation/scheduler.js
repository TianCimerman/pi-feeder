import cron from "node-cron";
import { getSchedules } from "./scheduleManager.js";
import { attemptFeed } from "../core/feedController.js";
import { log } from "../utils/logger.js";

export function runScheduler() {
  cron.schedule("* * * * *", async () => {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM

    const schedules = getSchedules();

    for (const s of schedules) {
      if (!s.enabled) continue;

      if (s.time === currentTime) {
        const result = await attemptFeed({
          duration: s.duration,
          source: `SCHEDULE:${s.id}`,
        });

        if (!result?.ok) {
          log.warn(`Scheduled feed blocked (${s.id}): ${result.reason}`);
        }
      }
    }
  });
}
