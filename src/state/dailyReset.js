import { getState, saveState } from "./stateManager.js";

export function resetIfNewDay() {
  const state = getState();
  const today = new Date().toISOString().slice(0, 10);

  if (state.lastResetDate !== today) {
    state.feedsToday = 0;
    state.lastResetDate = today;
    saveState(state);
  }
}
