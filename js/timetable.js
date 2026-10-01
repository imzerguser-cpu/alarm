import { DEFAULT_PERIODS, formatTimeRange12 } from './schedule-times.js';

// periodOverrides: 오늘 날짜에만 적용되는 1회성 변경(daily/current 문서의
// periodOverrides 필드). 요일 반복 시간표(weeklySchedule/weeklyNotes)보다
// 우선하고, daily 문서 자체가 자정에 통째로 초기화되므로 다음 날엔 자동으로
// 사라진다 — 별도의 만료 로직이 필요 없다.
export function buildTodayRows(
  weeklySchedule, dayKey, currentPeriodId, weeklyNotes, periodOverrides, periods = DEFAULT_PERIODS,
) {
  const daySubjects = (weeklySchedule && weeklySchedule[dayKey]) || {};
  const dayNotes = (weeklyNotes && weeklyNotes[dayKey]) || {};
  const overrides = periodOverrides || {};
  const rows = [];
  for (const period of periods) {
    // hiddenInTimetable이 붙은 항목(이름 없는 "쉬는 시간")은 시간표에는 한 줄씩
    // 안 보여준다 — 교시 수만큼만 보여도 충분하고, 전부 보이면 시간표가 너무
    // 길어진다. 알림 시각 계산(js/bell-schedule.js)은 이 배열을 그대로 쓰므로
    // 영향이 없다 — 여기(화면 표시)에서만 건너뛴다.
    if (period.hiddenInTimetable) continue;
    const override = overrides[period.id];
    let subject;
    let note;
    let overridden = false;
    if (override && override.subject) {
      subject = override.subject;
      note = override.note || '';
      overridden = true;
    } else if (period.kind === 'class') {
      const value = daySubjects[period.id];
      if (!value) continue;
      subject = value;
      note = dayNotes[period.id] || '';
    } else {
      subject = period.label;
      note = dayNotes[period.id] || '';
    }
    rows.push({
      id: period.id,
      time: formatTimeRange12(period.start, period.end),
      label: period.label,
      subject,
      note,
      isCurrent: period.id === currentPeriodId,
      overridden,
    });
  }
  return rows;
}

export function renderTimetable(container, rows) {
  container.innerHTML = '';
  for (const row of rows) {
    const el = document.createElement('div');
    el.className = 'timetable-row' + (row.isCurrent ? ' current' : '') + (row.overridden ? ' overridden' : '');
    el.dataset.periodId = row.id;

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
    if (row.overridden) {
      const badge = document.createElement('span');
      badge.className = 'tt-override-badge';
      badge.textContent = '오늘만';
      subject.appendChild(badge);
    }
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
