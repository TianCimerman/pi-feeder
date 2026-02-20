import { getUltrasonicSensorStatus, readUltrasonicDistance } from "../device/ultrasonicSensor.js";

export async function getSensorDistance(req, res) {
  try {
    const result = await readUltrasonicDistance();
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
    return res.json({ ok: true, result: getUltrasonicSensorStatus() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Crash in /sensor/status", detail: err?.message || String(err) });
  }
}
