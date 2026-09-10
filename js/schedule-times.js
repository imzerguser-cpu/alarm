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
  // 시각을 따로 적어두지 않고 PERIODS의 아침활동 항목에서 그대로 가져온다.
  const morning = PERIODS[0];
  const nowMin = date.getHours() * 60 + date.getMinutes();
  return nowMin >= toMinutes(morning.start) && nowMin < toMinutes(morning.end);
}

// 학생들이 24시간 표기(예: 14:10)를 헷갈려해서, 화면에 보여줄 때는 12시간
// 표기(오전/오후)로 바꾼다. PERIODS/저장 데이터 자체는 계속 24시간 "HH:MM"을
// 쓴다 — 여기 두 함수는 오직 화면에 보여줄 문자열을 만드는 용도다.
export function formatTime12(hh, mm) {
  const period = hh < 12 ? '오전' : '오후';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${period} ${h12}:${String(mm).padStart(2, '0')}`;
}

// 시작~끝 범위는 시작 시각에만 오전/오후를 붙인다(끝까지 매번 반복하면
// 시간표 칸이 좁아서 글자가 넘친다 — 등하교 시간대 안에서는 끝 시각만 보고도
// 오전/오후를 헷갈릴 상황이 사실상 없다).
export function formatTimeRange12(startHHMM, endHHMM) {
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  const endH12 = eh % 12 === 0 ? 12 : eh % 12;
  return `${formatTime12(sh, sm)}~${endH12}:${String(em).padStart(2, '0')}`;
}
