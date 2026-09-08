export const PERIODS = [
  { id: 'morning', label: '아침활동', start: '08:40', end: '09:00', kind: 'fixed' },
  { id: 'p1', label: '1교시', start: '09:00', end: '09:40', kind: 'class' },
  { id: 'p2', label: '2교시', start: '09:50', end: '10:30', kind: 'class' },
  { id: 'playtime', label: '중간놀이시간', start: '10:30', end: '10:50', kind: 'fixed' },
  { id: 'p3', label: '3교시', start: '10:50', end: '11:30', kind: 'class' },
  { id: 'p4', label: '4교시', start: '11:40', end: '12:20', kind: 'class' },
  { id: 'lunch', label: '점심시간', start: '12:20', end: '13:20', kind: 'fixed' },
  { id: 'p5', label: '5교시', start: '13:20', end: '14:00', kind: 'class' },
  { id: 'p6', label: '6교시', start: '14:10', end: '14:50', kind: 'class' },
  { id: 'p7', label: '7교시', start: '15:00', end: '15:40', kind: 'class' },
  { id: 'p8', label: '8교시', start: '15:50', end: '16:30', kind: 'class' },
];

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function getDayKey(date) {
  return DAY_KEYS[date.getDay()];
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function getCurrentPeriodId(date) {
  const nowMin = date.getHours() * 60 + date.getMinutes();
  for (const period of PERIODS) {
    if (nowMin >= toMinutes(period.start) && nowMin < toMinutes(period.end)) {
      return period.id;
    }
  }
  return null;
}

export function isMorningActive(date) {
  const nowMin = date.getHours() * 60 + date.getMinutes();
  return nowMin >= toMinutes('08:40') && nowMin < toMinutes('09:00');
}
