import { getDistanceSensorStatus, readDistance } from "../device/distanceSensor.js";

export async function getSensorDistance(req, res) {
  try {
    const result = await readDistance();
    if (!result.ok) {
      return res.status(409).json(result);
    }

    return res.json({ ok: true, result: result.result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Crash in /sensor/distance", detail: err?.message || String(err) });
  }
}

export function getSensorStatus(req, res) {
  try {
    return res.json({ ok: true, result: getDistanceSensorStatus() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Crash in /sensor/status", detail: err?.message || String(err) });
  }
}
