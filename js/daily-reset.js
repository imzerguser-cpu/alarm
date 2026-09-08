// js/daily-reset.js
export function shouldResetDaily(storedDateKey, todayDateKey) {
  return storedDateKey !== todayDateKey;
}
