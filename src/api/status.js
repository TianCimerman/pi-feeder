import { getState, saveState } from "../state/stateManager.js";

export function getStatus(req, res) {
  const state = getState();

  // 🔑 Update heartbeat only when Pi actually responds
  state.heartbeat = new Date().toISOString();
  saveState(state);

  res.json({
    status: "OK",
    lastFeed: state.lastFeed,
    feedsToday: state.feedsToday,
    locked: state.locked,
    heartbeat: state.heartbeat, // ✅ IMPORTANT
    feedCount: state.feedCount,
    lastFeedTime: state.lastFeedTime,
    lastSource: state.lastSource,
    lastManualFeedTime: state.lastManualFeedTime
  });
}