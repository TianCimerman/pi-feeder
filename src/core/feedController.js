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
    return { ok: false, reason: "FEEDING_DISABLED" };
  }

  if (state.isFeeding) {
    return { ok: false, reason: "ALREADY_FEEDING" };
  }

  if (now - state.lastFeed < state.minIntervalMs) {
    return { ok: false, reason: "MIN_INTERVAL_NOT_REACHED" };
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
