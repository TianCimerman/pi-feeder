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

    // Validate duration (1000-5000ms)
    if (duration < 1000 || duration > 5000) {
      return res.status(400).json({
        ok: false,
        error: "Duration must be between 1000 and 5000 ms"
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

    log.info(`Schedule added: ${id} at ${time} for ${duration}ms`);

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

    // Update fields if provided
    if (time !== undefined) {
      if (!/^\d{2}:\d{2}$/.test(time)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid time format. Use HH:MM (e.g., 07:30)"
        });
      }
      schedule.time = time;
    }

    if (duration !== undefined) {
      if (duration < 1000 || duration > 5000) {
        return res.status(400).json({
          ok: false,
          error: "Duration must be between 1000 and 5000 ms"
        });
      }
      schedule.duration = Number(duration);
    }

    if (enabled !== undefined) {
      schedule.enabled = Boolean(enabled);
    }

    saveSchedules(schedules);

    log.info(`Schedule updated: ${id}`);

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

    log.info(`Schedule deleted: ${id}`);

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

      // Validate duration (1000-5000ms)
      if (schedule.duration < 1000 || schedule.duration > 5000) {
        return res.status(400).json({
          ok: false,
          error: `Duration for "${schedule.id}" must be between 1000 and 5000 ms`
        });
      }

      // Ensure enabled is boolean
      schedule.enabled = schedule.enabled !== false;
      schedule.duration = Number(schedule.duration);
    }

    saveSchedules(schedules);

    log.info(`All schedules updated (${schedules.length} total)`);

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

