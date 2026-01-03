import { feed } from "../device/feeder.js";
import { getState, saveState } from "../state/stateManager.js";
import { resetIfNewDay } from "../state/dailyReset.js";
import { checkSafety } from "./safety.js";
import { log } from "../utils/logger.js";

export async function executeFeed({ duration, source }) {
  resetIfNewDay();

  const state = getState();
  checkSafety(state, duration);


  log.info(`Feeding (${source}) for ${duration}ms`);
  

  await feed(duration);
  log.info("Feed complete");
  state.lastFeed = new Date().toISOString();
  state.feedsToday += 1;

  saveState(state);

  console.log("Feed complete");
}
