import { attemptFeed } from "../core/feedController.js";

// TEMP: simulated motor (route-level)
async function simulateMotor(duration) {
  console.log(`🧪 Simulating motor for ${duration}ms`);
  await new Promise((resolve) => setTimeout(resolve, duration));
}

export async function manualFeed(req, res) {
  try {
    const duration = Number(req.body?.duration ?? 2000);

    // simulate motor run
    await simulateMotor(duration);

    const result = await attemptFeed({
      source: "MANUAL",
      duration,
    });

    if (!result?.ok) {
      return res.status(409).json(result);
    }

    return res.json({ ok: true, result });
  } catch (err) {
    console.error("CRASH in /feed:", err);
    return res.status(500).json({ ok: false, error: "Crash in /feed", detail: err?.message || String(err) });
  }
}
