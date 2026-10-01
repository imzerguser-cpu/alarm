// 관리자 모드에서 각 교시 시작/종료 시각을 직접 바꿀 수 있다(js/store.js의
// schedule/periods 문서). 이 배열은 그 값이 서버에 아직 없을 때(첫 실행)
// 쓰는 기본값이자, periods를 안 넘긴 호출부의 기본 동작이다 — id/kind/label
// 구성 자체(교시 개수, 순서, 무엇이 '아침활동'/'중간놀이'/'점심시간'인지)는
// 바뀌지 않고, start/end 시각만 커스터마이즈 대상이다.
//
// 교시 사이 쉬는 시간(중간놀이시간·점심시간처럼 이름이 있는 것도, 그냥
// "쉬는 시간"인 것도)도 전부 자기 자신의 start/end를 가진 한 항목이다 —
// 그래야 관리자 모드에서 교시 시간뿐 아니라 쉬는 시간 길이도 각각 따로
// 조정할 수 있고(예: 쉬는 시간을 10분→5분으로), 시간표에도 그대로 보인다.
export const DEFAULT_PERIODS = [
  { id: 'morning', label: '아침활동', start: '08:40', end: '09:00', kind: 'fixed' },
  { id: 'p1', label: '1교시', start: '09:00', end: '09:40', kind: 'class' },
  { id: 'break1', label: '쉬는 시간', start: '09:40', end: '09:50', kind: 'fixed' },
  { id: 'p2', label: '2교시', start: '09:50', end: '10:30', kind: 'class' },
  { id: 'playtime', label: '중간놀이시간', start: '10:30', end: '10:50', kind: 'fixed' },
  { id: 'p3', label: '3교시', start: '10:50', end: '11:30', kind: 'class' },
  { id: 'break2', label: '쉬는 시간', start: '11:30', end: '11:40', kind: 'fixed' },
  { id: 'p4', label: '4교시', start: '11:40', end: '12:20', kind: 'class' },
  { id: 'lunch', label: '점심시간', start: '12:20', end: '13:20', kind: 'fixed' },
  { id: 'p5', label: '5교시', start: '13:20', end: '14:00', kind: 'class' },
  { id: 'break3', label: '쉬는 시간', start: '14:00', end: '14:10', kind: 'fixed' },
  { id: 'p6', label: '6교시', start: '14:10', end: '14:50', kind: 'class' },
  { id: 'break4', label: '쉬는 시간', start: '14:50', end: '15:00', kind: 'fixed' },
  { id: 'p7', label: '7교시', start: '15:00', end: '15:40', kind: 'class' },
  { id: 'break5', label: '쉬는 시간', start: '15:40', end: '15:50', kind: 'fixed' },
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

export function getCurrentPeriodId(date, periods = DEFAULT_PERIODS) {
  const nowMin = date.getHours() * 60 + date.getMinutes();
  for (const period of periods) {
    if (nowMin >= toMinutes(period.start) && nowMin < toMinutes(period.end)) {
      return period.id;
    }
  }
  return null;
}

export function isMorningActive(date, periods = DEFAULT_PERIODS) {
  // 시각을 따로 적어두지 않고 periods의 아침활동 항목(항상 0번째)에서 그대로 가져온다.
  const morning = periods[0];
  const nowMin = date.getHours() * 60 + date.getMinutes();
  return nowMin >= toMinutes(morning.start) && nowMin < toMinutes(morning.end);
}

// 서버에 저장된 periods가 예전 구조(예: 쉬는 시간이 각자 항목으로 분리되기
// 전)일 수 있다 — 이미 교시 시간 설정을 한 번이라도 저장한 교실은 그 뒤로
// DEFAULT_PERIODS가 바뀌어도 서버에 저장된 값을 그대로 계속 쓰기 때문이다.
// id 기준으로 맞춰서, 저장된 항목은 그 start/end를 그대로 쓰고 새로 추가된
// 항목(예: break1~break5)은 기본값으로 채워 넣는다 — 그래야 새 기능이 기존
// 교실에도 자연스럽게 나타난다.
export function mergePeriodsWithDefaults(stored, defaults = DEFAULT_PERIODS) {
  const byId = new Map((stored || []).map((p) => [p.id, p]));
  return defaults.map((def) => {
    const existing = byId.get(def.id);
    if (!existing) return { ...def };
    return { ...def, start: existing.start, end: existing.end };
  });
}

// 오늘 하루만 특정 교시의 시작/종료 시각을 바꾸고 싶을 때(daily/current 문서의
// periodOverrides.start/end) 쓴다. 관리자 모드의 "교시 시간 설정"(모든 날짜에
// 영구 적용)과 달리 이건 daily 문서에 저장되어 자정에 자동으로 사라진다.
// subject/note 오버라이드는 buildTodayRows/computeTodayBellSchedule이 따로
// 처리하므로, 여기서는 시간만 본다.
export function applyPeriodOverrides(periods, periodOverrides) {
  const overrides = periodOverrides || {};
  return periods.map((period) => {
    const override = overrides[period.id];
    if (!override || (!override.start && !override.end)) return period;
    return {
      ...period,
      start: override.start || period.start,
      end: override.end || period.end,
    };
  });
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
