import { attemptFeed } from "../core/feedController.js";

export async function manualFeed(req, res) {
  try {
    const duration = Number(req.body?.duration ?? 2000);


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
