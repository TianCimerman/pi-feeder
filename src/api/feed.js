import { executeFeed } from "../automation/executeFeed.js";

export async function manualFeed(req, res) {
  const { duration } = req.body;

  try {
    await executeFeed({
      duration: Number(duration) || 2000,
      source: "MANUAL"
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
}
