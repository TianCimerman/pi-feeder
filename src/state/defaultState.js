export function createDefaultState() {
  return {
    enabled: true,
    disabledUntil: null,
    isFeeding: false,
    lastFeed: 0,
    lastAttempt: 0,
    lastManualFeed: 0,
    minIntervalMs: 3_600_000,
    manualFeedCooldownMs: 300_000,
    feedsToday: 0,
    lastResetDate: null,
    feedCount: 0,
  };
}
