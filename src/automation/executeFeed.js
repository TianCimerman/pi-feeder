import { feed } from "../device/feeder.js";
import { readState, writeState } from "../state/state.js";
import { resetIfNewDay } from "../state/dailyReset.js";
import { checkSafety } from "./safety.js";
import { log } from "../utils/logger.js";

export async function executeFeed({ duration, source }) {
  resetIfNewDay();

  const state = await readState();
  checkSafety(state, duration);


  log.info(`Feeding (${source}) for ${duration}ms`);
  

  await feed(duration);
  log.info("Feed complete");
  state.lastFeedTime = new Date().toISOString();
  state.feedsToday += 1;

  await writeState(state);

  console.log("Feed complete");
}
