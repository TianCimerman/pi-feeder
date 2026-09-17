import { getState, saveState } from "../state/stateManager.js";
import { getDistanceSensorStatus, readDistance } from "../device/distanceSensor.js";

export async function getStatus(req, res) {
  const state = getState();
  const sensorDistance = await readDistance();
  const sensorStatus = getDistanceSensorStatus();

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
    lastManualFeedTime: state.lastManualFeedTime,
    sensor: {
      distance: sensorDistance.ok ? sensorDistance.result : null,
      status: sensorStatus,
      error: sensorDistance.ok ? null : {
        reason: sensorDistance.reason,
        message: sensorDistance.message,
      },
    },
  });
}
