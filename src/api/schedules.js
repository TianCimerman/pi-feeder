import { getSchedules, saveSchedules } from "../automation/scheduleManager.js";

export function listSchedules(req, res) {
  res.json(getSchedules());
}

export function updateSchedules(req, res) {
  saveSchedules(req.body);
  res.json({ ok: true });
}
