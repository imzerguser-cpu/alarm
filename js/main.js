import { getDayKey, getCurrentPeriodId } from './schedule-times.js';
import { buildTodayRows, renderTimetable } from './timetable.js';
import { INITIAL_SCHEDULE } from './seed-data.js';

function renderTimetableNow() {
  const now = new Date();
  const dayKey = getDayKey(now);
  const currentPeriodId = getCurrentPeriodId(now);
  const rows = buildTodayRows(INITIAL_SCHEDULE, dayKey, currentPeriodId);
  renderTimetable(document.getElementById('timetablePanel'), rows);
}

renderTimetableNow();
setInterval(renderTimetableNow, 30000);
