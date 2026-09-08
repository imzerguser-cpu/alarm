import { PERIODS } from './schedule-times.js';

export function buildTodayRows(weeklySchedule, dayKey, currentPeriodId, weeklyNotes) {
  const daySubjects = (weeklySchedule && weeklySchedule[dayKey]) || {};
  const dayNotes = (weeklyNotes && weeklyNotes[dayKey]) || {};
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
      note: dayNotes[period.id] || '',
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

    // 시간 위에 줄바꿔서 교시(예: "1교시")가 오는 왼쪽 묶음.
    const left = document.createElement('span');
    left.className = 'tt-left';
    const time = document.createElement('span');
    time.className = 'tt-time';
    time.textContent = row.time;
    const label = document.createElement('span');
    label.className = 'tt-label';
    label.textContent = row.label;
    left.append(time, label);

    const subject = document.createElement('span');
    subject.className = 'tt-subject';
    const subjectText = document.createElement('span');
    subjectText.className = 'tt-subject-text';
    subjectText.textContent = row.subject;
    subject.appendChild(subjectText);
    // 교사가 세부 내용을 적어둔 경우에만 과목 아래에 작은 글씨로 덧붙인다.
    // 아무것도 안 적었으면 과목명만 보이던 기존 모습 그대로다.
    if (row.note) {
      const note = document.createElement('span');
      note.className = 'tt-note';
      note.textContent = row.note;
      subject.appendChild(note);
    }

    el.append(left, subject);
    container.appendChild(el);
  }
}
