export function checkSafety(state, duration) {
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
    const now = Date.now();
    const minutesSince = (now - last) / 60000;

    if (minutesSince < 60) {
      throw new Error("Too soon since last feeding");
    }
  }
}
