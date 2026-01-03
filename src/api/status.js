import { getState } from "../state/stateManager.js";

export function getStatus(req, res) {
  const state = getState();

  res.json({
    status: "OK",
    lastFeed: state.lastFeed,
    feedsToday: state.feedsToday,
    locked: state.locked
  });
}
