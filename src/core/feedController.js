import { readState, writeState } from "../state/state.js";
import { feed } from "../device/feeder.js";

// TEMP: simulate motor (replace later with real runMotor)
async function runMotor(duration) {
  console.log(`🧪 Simulating motor for executer ${duration}ms`);
  await new Promise((resolve) => setTimeout(resolve, duration));
  await feed(duration);
}

export async function attemptFeed({ source, duration }) {
  const state = await readState();
  const now = Date.now(); // <-- FIXED

  // Check if feeding is temporarily disabled (auto-enable if time passed)
  if (state.disabledUntil && now >= state.disabledUntil) {
    state.disabledUntil = null;
    await writeState(state);
  }

  // SAFETY RULES
  if (!state.enabled) {
    return { 
      ok: false, 
      reason: "FEEDING_DISABLED",
      message: "Feeding is currently disabled in system settings"
    };
  }

  // Check temporary 24-hour disable
  if (state.disabledUntil && now < state.disabledUntil) {
    const timeUntilEnabled = state.disabledUntil - now;
    const hoursUntil = Math.ceil(timeUntilEnabled / 3600000);
    return { 
      ok: false, 
      reason: "FEEDING_TEMPORARILY_DISABLED",
      message: `Feeding is disabled for the next ${hoursUntil} hour(s). Re-enabled at ${new Date(state.disabledUntil).toISOString()}`,
      disabledUntil: new Date(state.disabledUntil).toISOString(),
      hoursRemaining: hoursUntil
    };
  }

  if (state.isFeeding) {
    return { 
      ok: false, 
      reason: "ALREADY_FEEDING",
      message: "A feeding operation is already in progress"
    };
  }

  // MANUAL FEED BLOCKING: Check cooldown between manual feeds only
  if (source === "MANUAL" && state.lastManualFeed && now - state.lastManualFeed < state.manualFeedCooldownMs) {
    const timeSinceLastManualFeed = now - state.lastManualFeed;
    const timeUntilNextManualFeed = state.manualFeedCooldownMs - timeSinceLastManualFeed;
    const minutesUntil = Math.ceil(timeUntilNextManualFeed / 60000);
    return { 
      ok: false, 
      reason: "MANUAL_FEED_COOLDOWN",
      message: `Manual feeding is on cooldown. Last manual feed was ${Math.floor(timeSinceLastManualFeed / 60000)} minutes ago. Please wait ${minutesUntil} more minutes.`,
      minutesUntilNextManualFeed: minutesUntil,
      lastManualFeedTime: new Date(state.lastManualFeed).toISOString()
    };
  }

  // GENERAL INTERVAL: Applies to all feeds (scheduled feeds can override if needed)
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

    // MARK FEED SUCCESS - increment counters and timestamps
    const updateData = {
      isFeeding: false,
      lastFeed: now,
      lastFeedTime: new Date(now).toISOString(), // Human-readable timestamp
      lastSource: source,
      feedsToday: (state.feedsToday || 0) + 1,
      feedCount: (state.feedCount || 0) + 1,
    };

    // Track manual feeds separately for manual-only cooldown
    if (source === "MANUAL") {
      updateData.lastManualFeed = now;
      updateData.lastManualFeedTime = new Date(now).toISOString();
    }

    await writeState({
      ...state,
      ...updateData,
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
