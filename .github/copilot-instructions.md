# Pi-Feeder AI Coding Agent Instructions

## Project Overview
Pi-Feeder is a Node.js Express application that automates pet feeding on Raspberry Pi hardware. It combines:
- **Express API** for manual feeding and configuration
- **Cron-based scheduling** (node-cron) for automated feeds
- **File-based state persistence** (JSON) for durability without a database
- **Safety layer** that enforces multiple constraints before executing feeds

## Architecture

### Layered Design (bottom-up)
1. **Device Layer** (`device/feeder.js`): Hardware abstraction - currently simulated motor control
2. **State Layer** (`state/`): Persistent JSON-based state management
3. **Core Layer** (`core/feedController.js`): Safety checks and business logic
4. **Automation Layer** (`automation/`): Cron scheduler orchestration
5. **API Layer** (`api/`): HTTP endpoint handlers
6. **Entry Point** (`index.js`): Express app initialization and scheduler startup

### Data Flow for Feeds
Both manual (HTTP POST) and scheduled feeds follow this path:
```
manualFeed/executeFeed 
  → attemptFeed (core/feedController.js)
    → Safety checks (enabled, already_feeding, min_interval, daily_limit, duration)
    → runMotor (device abstraction)
    → State updates (lastFeed, feedsToday, etc.)
```

### Key Design Decisions
- **No database**: Persistent state stored in `src/storage/state.json` and `src/storage/schedules.json`
- **Immutable state updates**: Always read, spread-merge, then write to avoid race conditions
- **Separation of concerns**: Feed execution (`executeFeed.js`) uses old API; new API is `attemptFeed` in core
- **Fail-safe defaults**: Feeding disabled on startup unless explicitly enabled
- **Daily reset**: `dailyReset.js` resets `feedsToday` counter at midnight (UTC date boundary)

## File Patterns & Conventions

### State Management
- Always use spread-merge pattern: `{ ...state, updatedField: value }` before writing
- State files are in `src/storage/` and must be valid JSON
- Example pattern from `stateManager.js`:
  ```javascript
  export function updateState(patch) {
    const state = getState();
    const updated = { ...state, ...patch };
    saveState(updated);
    return updated;
  }
  ```

### API Handlers
- Location: `src/api/`
- Always wrap in try-catch and return `{ ok: false, error, detail }` on errors
- Success responses use `{ ok: true, result: ... }`
- HTTP status codes: `409` for business logic failures, `500` for crashes, `200` for success

### Logger Usage
- Use `log.info()`, `log.warn()`, `log.error()` from `src/utils/logger.js`
- Logs append to `logs/feeder.log` and also print to console
- Format: `[ISO_TIMESTAMP] [LEVEL] message`

### Safety Constraints (immutable - defined in feedController.js)
- Feeding must be enabled (`state.enabled === true`)
- Cannot run concurrent feeds (`state.isFeeding === false`)
- Minimum interval: respects `state.minIntervalMs` between feeds
- Daily limit: max 5 feeds per day (`feedsToday < 5`)
- Duration limit: max 50000ms per feed
- All constraints return failure objects with `reason` codes (e.g., "MIN_INTERVAL_NOT_REACHED")

## Critical Workflows

### Running the Application
- `npm run dev`: Starts Express server on port 8080 and activates cron scheduler
- No tests configured (noted in package.json)

### Manual Feed API
- **Endpoint**: `POST /feed`
- **Request body**: `{ duration?: number }` (defaults to 2000ms)
- **Response**: `{ ok: true/false, reason, message, minutesUntilNextFeed?, ... }`

### Schedule Management
- **Get schedules**: `GET /schedules` → returns array from `src/storage/schedules.json`
- **Update schedules**: `POST /schedules` → updates JSON file
- **Schedule format**: `{ id, time: "HH:MM", duration, enabled }`
- **Cron execution**: Runs every minute, checks all enabled schedules, triggers matching ones

### State Inspection
- **Endpoint**: `GET /status` → returns current state object
- **Health check**: `GET /health` → basic system health

## Common Pitfalls to Avoid

1. **Race conditions**: Always read state, then write atomically. Never do partial state updates
2. **Daily reset timing**: Uses UTC date boundary (`toISOString().slice(0,10)`), not local time
3. **Motor abstraction**: `runMotor()` is simulated in feedController and feeder.js - replace BOTH when integrating real hardware
4. **Cron precision**: Scheduler runs every minute; never specify seconds in cron patterns
5. **State lock confusion**: `state.locked` field exists but isn't used - `isFeeding` is the actual lock

## Key Files Reference

| File | Purpose |
|------|---------|
| [src/index.js](src/index.js) | Express app + error handlers |
| [src/core/feedController.js](src/core/feedController.js) | Safety checks + feed execution logic |
| [src/automation/scheduler.js](src/automation/scheduler.js) | Cron loop for scheduled feeds |
| [src/state/stateManager.js](src/state/stateManager.js) | State read/write primitives |
| [src/api/feed.js](src/api/feed.js) | Manual feed HTTP handler |
| [src/automation/scheduleManager.js](src/automation/scheduleManager.js) | Schedule persistence |

## ES Module Notes
- Project uses `"type": "module"` in package.json
- All imports must be explicit: `import X from "./file.js"` (`.js` extension required)
- No CommonJS (`require()`) - convert if encountered
