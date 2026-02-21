import { getSchedules, saveSchedules } from "../automation/scheduleManager.js";
import { log } from "../utils/logger.js";

export function listSchedules(req, res) {
  try {
    const schedules = getSchedules();
    return res.json({
      ok: true,
      schedules: schedules
    });
  } catch (err) {
    console.error("CRASH in GET /schedules:", err);
    return res.status(500).json({ 
      ok: false, 
      error: "Failed to get schedules",
      detail: err?.message || String(err) 
    });
  }
}

export function addSchedule(req, res) {
  try {
    const { id, time, duration, enabled } = req.body;

    // Validate input
    if (!id || !time || duration === undefined) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields: id, time, duration"
      });
    }

    // Validate time format (HH:MM)
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid time format. Use HH:MM (e.g., 07:30)"
      });
    }

    // Validate duration (1000-50000ms)
    if (duration < 1000 || duration > 50000) {
      return res.status(400).json({
        ok: false,
        error: "Duration must be between 1000 and 50000 ms"
      });
    }

    const schedules = getSchedules();
    
    // Check if ID already exists
    if (schedules.some(s => s.id === id)) {
      return res.status(409).json({
        ok: false,
        error: `Schedule with id "${id}" already exists`
      });
    }

    const newSchedule = {
      id,
      time,
      duration: Number(duration),
      enabled: enabled !== false // default to true
    };

    schedules.push(newSchedule);
    saveSchedules(schedules);

    const status = newSchedule.enabled ? "enabled" : "disabled";
    log.info(`Schedule added: "${id}" at ${time} for ${duration}ms (${status})`);

    return res.json({
      ok: true,
      message: `Schedule "${id}" added`,
      schedule: newSchedule
    });
  } catch (err) {
    console.error("CRASH in POST /schedules/add:", err);
    return res.status(500).json({ 
      ok: false, 
      error: "Failed to add schedule",
      detail: err?.message || String(err) 
    });
  }
}

export function updateSchedule(req, res) {
  try {
    const { id, time, duration, enabled } = req.body;

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "Schedule id is required"
      });
    }

    const schedules = getSchedules();
    const schedule = schedules.find(s => s.id === id);

    if (!schedule) {
      return res.status(404).json({
        ok: false,
        error: `Schedule with id "${id}" not found`
      });
    }

    // Track changes for logging
    const changes = [];
    const oldEnabled = schedule.enabled;

    // Update fields if provided
    if (time !== undefined) {
      if (!/^\d{2}:\d{2}$/.test(time)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid time format. Use HH:MM (e.g., 07:30)"
        });
      }
      if (schedule.time !== time) {
        changes.push(`time: ${schedule.time} → ${time}`);
        schedule.time = time;
      }
    }

    if (duration !== undefined) {
      if (duration < 1000 || duration > 50000) {
        return res.status(400).json({
          ok: false,
          error: "Duration must be between 1000 and 50000 ms"
        });
      }
      if (schedule.duration !== Number(duration)) {
        changes.push(`duration: ${schedule.duration}ms → ${duration}ms`);
        schedule.duration = Number(duration);
      }
    }

    if (enabled !== undefined) {
      const newEnabled = Boolean(enabled);
      if (schedule.enabled !== newEnabled) {
        const statusChange = newEnabled ? "disabled → enabled" : "enabled → disabled";
        changes.push(`status: ${statusChange}`);
        schedule.enabled = newEnabled;
      }
    }

    saveSchedules(schedules);

    if (changes.length > 0) {
      log.info(`Schedule updated: "${id}" (${changes.join(", ")})`);
    } else {
      log.info(`Schedule updated: "${id}" (no changes)`);
    }

    return res.json({
      ok: true,
      message: `Schedule "${id}" updated`,
      schedule: schedule
    });
  } catch (err) {
    console.error("CRASH in POST /schedules/update:", err);
    return res.status(500).json({ 
      ok: false, 
      error: "Failed to update schedule",
      detail: err?.message || String(err) 
    });
  }
}

export function deleteSchedule(req, res) {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "Schedule id is required"
      });
    }

    const schedules = getSchedules();
    const index = schedules.findIndex(s => s.id === id);

    if (index === -1) {
      return res.status(404).json({
        ok: false,
        error: `Schedule with id "${id}" not found`
      });
    }

    const deleted = schedules.splice(index, 1)[0];
    saveSchedules(schedules);

    const status = deleted.enabled ? "enabled" : "disabled";
    log.info(`Schedule removed: "${id}" (was at ${deleted.time} for ${deleted.duration}ms, ${status})`);

    return res.json({
      ok: true,
      message: `Schedule "${id}" deleted`,
      schedule: deleted
    });
  } catch (err) {
    console.error("CRASH in POST /schedules/delete:", err);
    return res.status(500).json({ 
      ok: false, 
      error: "Failed to delete schedule",
      detail: err?.message || String(err) 
    });
  }
}

export function updateSchedules(req, res) {
  try {
    // Handle both array and single object
    let schedules = [];
    
    if (Array.isArray(req.body)) {
      schedules = req.body;
    } else if (req.body && typeof req.body === 'object' && req.body.id) {
      // Single schedule object - check if it exists
      const scheduleList = getSchedules();
      const existing = scheduleList.find(s => s.id === req.body.id);
      
      if (existing) {
        // Schedule exists - update it
        return updateSchedule(req, res);
      } else {
        // New schedule - add it
        return addSchedule(req, res);
      }
    } else {
      return res.status(400).json({
        ok: false,
        error: "Request body must be an array of schedules or a single schedule object with 'id'"
      });
    }

    // If empty array, reject it to prevent data loss
    if (schedules.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Cannot save empty schedules array. Use /schedules/delete to remove individual schedules."
      });
    }

    // Validate all schedules
    for (const schedule of schedules) {
      if (!schedule.id || !schedule.time || schedule.duration === undefined) {
        return res.status(400).json({
          ok: false,
          error: "Each schedule must have: id, time, duration"
        });
      }

      // Validate time format (HH:MM)
      if (!/^\d{2}:\d{2}$/.test(schedule.time)) {
        return res.status(400).json({
          ok: false,
          error: `Invalid time format for "${schedule.id}". Use HH:MM (e.g., 07:30)`
        });
      }

      // Validate duration (1000-50000ms)
      if (schedule.duration < 1000 || schedule.duration > 50000) {
        return res.status(400).json({
          ok: false,
          error: `Duration for "${schedule.id}" must be between 1000 and 50000 ms`
        });
      }

      // Ensure enabled is boolean
      schedule.enabled = schedule.enabled !== false;
      schedule.duration = Number(schedule.duration);
    }

    // Compare with existing schedules to log changes
    const oldSchedules = getSchedules();
    const added = schedules.filter(s => !oldSchedules.some(old => old.id === s.id));
    const removed = oldSchedules.filter(old => !schedules.some(s => s.id === old.id));
    const modified = schedules.filter(s => {
      const old = oldSchedules.find(old => old.id === s.id);
      return old && (old.time !== s.time || old.duration !== s.duration || old.enabled !== s.enabled);
    });

    saveSchedules(schedules);

    const details = [];
    if (added.length > 0) details.push(`${added.length} added`);
    if (removed.length > 0) details.push(`${removed.length} removed`);
    if (modified.length > 0) details.push(`${modified.length} modified`);
    
    const summary = details.length > 0 ? ` (${details.join(", ")})` : "";
    log.info(`All schedules updated: ${schedules.length} total${summary}`);
    
    // Log individual changes
    added.forEach(s => {
      const status = s.enabled ? "enabled" : "disabled";
      log.info(`  + Added: "${s.id}" at ${s.time} for ${s.duration}ms (${status})`);
    });
    removed.forEach(s => {
      const status = s.enabled ? "enabled" : "disabled";
      log.info(`  - Removed: "${s.id}" (was at ${s.time} for ${s.duration}ms, ${status})`);
    });
    modified.forEach(s => {
      const old = oldSchedules.find(old => old.id === s.id);
      const changes = [];
      if (old.time !== s.time) changes.push(`time: ${old.time} → ${s.time}`);
      if (old.duration !== s.duration) changes.push(`duration: ${old.duration}ms → ${s.duration}ms`);
      if (old.enabled !== s.enabled) {
        const statusChange = s.enabled ? "disabled → enabled" : "enabled → disabled";
        changes.push(`status: ${statusChange}`);
      }
      log.info(`  * Modified: "${s.id}" (${changes.join(", ")})`);
    });

    return res.json({
      ok: true,
      message: "Schedules updated",
      schedules: schedules
    });
  } catch (err) {
    console.error("CRASH in POST /schedules:", err);
    return res.status(500).json({ 
      ok: false, 
      error: "Failed to update schedules",
      detail: err?.message || String(err) 
    });
  }
}

