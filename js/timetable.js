import { PERIODS } from './schedule-times.js';

export function buildTodayRows(weeklySchedule, dayKey, currentPeriodId) {
  const daySubjects = (weeklySchedule && weeklySchedule[dayKey]) || {};
  const rows = [];
  for (const period of PERIODS) {
    let subject;
    if (period.kind === 'class') {
      const value = daySubjects[period.id];
      if (!value) continue;
      subject = value;
    } else {
      subject = period.label;
    }
    rows.push({
      id: period.id,
      time: `${period.start}~${period.end}`,
      label: period.label,
      subject,
      isCurrent: period.id === currentPeriodId,
    });
  }
  return rows;
}

export function renderTimetable(container, rows) {
  container.innerHTML = '';
  for (const row of rows) {
    const el = document.createElement('div');
    el.className = 'timetable-row' + (row.isCurrent ? ' current' : '');
    const time = document.createElement('span');
    time.className = 'tt-time';
    time.textContent = row.time;
    const label = document.createElement('span');
    label.className = 'tt-label';
    label.textContent = row.label;
    const subject = document.createElement('span');
    subject.className = 'tt-subject';
    subject.textContent = row.subject;
    el.append(time, label, subject);
    container.appendChild(el);
  }
}
