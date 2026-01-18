import { readState, writeState } from "../state/state.js";

// TEMP: simulate motor (replace later with real runMotor)
async function runMotor(duration) {
  console.log(`🧪 Simulating motor for ${duration}ms`);
  await new Promise((resolve) => setTimeout(resolve, duration));
}

export async function attemptFeed({ source, duration }) {
  const state = await readState();
  const now = Date.now(); // <-- FIXED

  // SAFETY RULES
  if (!state.enabled) {
    return { 
      ok: false, 
      reason: "FEEDING_DISABLED",
      message: "Feeding is currently disabled in system settings"
    };
  }

  if (state.isFeeding) {
    return { 
      ok: false, 
      reason: "ALREADY_FEEDING",
      message: "A feeding operation is already in progress"
    };
  }

  if (state.lastFeed && now - state.lastFeed < state.minIntervalMs) {
    const timeSinceLastFeed = now - state.lastFeed;
    const timeUntilNextFeed = state.minIntervalMs - timeSinceLastFeed;
    const minutesUntil = Math.ceil(timeUntilNextFeed / 60000);
    return { 
      ok: false, 
      reason: "MIN_INTERVAL_NOT_REACHED",
      message: `Minimum interval not reached. Last feed was ${Math.floor(timeSinceLastFeed / 60000)} minutes ago. Please wait ${minutesUntil} more minutes.`,
      minutesUntilNextFeed: minutesUntil,
      lastFeedTime: new Date(state.lastFeed).toISOString()
    };
  }

  // Check daily feeding limit
  if (state.feedsToday >= 5) {
    return { 
      ok: false, 
      reason: "DAILY_LIMIT_REACHED",
      message: `Daily feeding limit reached (5 feedings per day). Already fed ${state.feedsToday} times today.`,
      feedsToday: state.feedsToday
    };
  }

  // Check feed duration
  if (duration > 5000) {
    return { 
      ok: false, 
      reason: "DURATION_TOO_LONG",
      message: `Feed duration too long. Requested ${duration}ms but max is 5000ms.`,
      requestedDuration: duration,
      maxDuration: 5000
    };
  }

  // MARK FEED START
  await writeState({
    ...state,
    isFeeding: true,
    lastAttempt: now,
  });

  try {
    await runMotor(duration);

    // MARK FEED SUCCESS
    await writeState({
      ...state,
      isFeeding: false,
      lastFeed: now,
      lastSource: source,
    });

    return { ok: true };
  } catch (err) {
    await writeState({
      ...state,
      isFeeding: false,
      lastError: err?.message || String(err),
    });

    return { ok: false, reason: "MOTOR_ERROR" };
  }
}
