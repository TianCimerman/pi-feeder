export function checkSafety(state, duration) {
  const now = Date.now();

  // Check if feeding is disabled globally
  if (!state.enabled) {
    throw new Error("Feeding is disabled in system settings");
  }

  // Check if feeding is temporarily disabled
  if (state.disabledUntil && now < state.disabledUntil) {
    throw new Error(`Feeding is temporarily disabled until ${new Date(state.disabledUntil).toISOString()}`);
  }

  // Note: Auto-enable of expired disabledUntil happens in attemptFeed, 
  // not here, since we don't have writeState access

  if (state.locked) {
    throw new Error("System is locked");
  }

  if (duration > 5000) {
    throw new Error("Feed duration too long");
  }

  if (state.feedsToday >= 5) {
    throw new Error("Daily feeding limit reached");
  }

  if (state.lastFeed) {
    const last = new Date(state.lastFeed).getTime();
    const minutesSince = (now - last) / 60000;

    if (minutesSince < 60) {
      throw new Error("Too soon since last feeding");
    }
  }
}
