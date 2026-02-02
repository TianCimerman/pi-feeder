import { readState, writeState } from "../state/state.js";
import { log } from "../utils/logger.js";

export async function disableFeedingFor24Hours(req, res) {
  try {
    const state = await readState();
    const now = new Date();
    
    // Calculate midnight UTC of next day
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    
    const disabledUntil = tomorrow.getTime();
    
    state.disabledUntil = disabledUntil;
    await writeState(state);
    
    log.info(`Feeding disabled until ${new Date(disabledUntil).toISOString()} (next midnight UTC)`);
    
    return res.json({ 
      ok: true, 
      message: "Feeding disabled until next midnight (00:00 UTC)",
      disabledUntil: new Date(disabledUntil).toISOString(),
      disabledAtTime: now.toISOString()
    });
  } catch (err) {
    console.error("CRASH in /disable:", err);
    return res.status(500).json({ 
      ok: false, 
      error: "Crash in /disable", 
      detail: err?.message || String(err) 
    });
  }
}

export async function enableFeeding(req, res) {
  try {
    const state = await readState();
    
    state.disabledUntil = null;
    await writeState(state);
    
    log.info("Feeding re-enabled immediately");
    
    return res.json({ 
      ok: true, 
      message: "Feeding re-enabled",
      disabledUntil: null
    });
  } catch (err) {
    console.error("CRASH in /enable:", err);
    return res.status(500).json({ 
      ok: false, 
      error: "Crash in /enable", 
      detail: err?.message || String(err) 
    });
  }
}
