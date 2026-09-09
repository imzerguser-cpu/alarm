// 오늘 시간표(요일별 과목)와 알림 설정(bellConfig)을 조합해 "몇 시에 무슨
// 말을 할지"를 계산하는 순수 함수 모음. DOM/Firestore를 몰라서 테스트하기 쉽다.
// 실제 화면(main.js, tablet-display.js)은 이 결과를 window.classBell.setSchedule()
// 로 js/bell.js에 넘겨서 그대로 재생시킨다.

export const DEFAULT_BREAK_TEMPLATE = '{쉬는시간}이 {분}분 남았습니다. 화장실에 다녀오고 {다음과목} 수업을 준비하세요.';

export const DEFAULT_BELL_CONFIG = {
  morningAlerts: [
    { time: '08:45', message: '교실 청소, 자리 정리를 하고 가정통신문을 확인해서 제출하세요.' },
    { time: '08:50', message: '유창성 읽기를 시작합니다. 1분씩 세 번 반복하세요.' },
    { time: '08:55', message: '1교시 수업을 준비하세요.' },
  ],
  breakDefaultMinutes: 2,
  breakDefaultTemplate: DEFAULT_BREAK_TEMPLATE,
  subjectRules: [
    { subject: '과학', minutesBefore: 4, message: '화장실에 다녀오고 교과서, 필기도구를 챙겨서 과학실로 이동하세요.' },
    { subject: '영어', minutesBefore: 4, message: '화장실에 다녀오고 교과서, 필기도구를 챙겨서 영어체험실로 이동하세요.' },
    { subject: '음악(가야금)', minutesBefore: 4, message: '화장실에 다녀오고 강당으로 이동하세요.' },
    { subject: '음악(사물놀이)', minutesBefore: 4, message: '화장실에 다녀오고 강당으로 이동하세요.' },
    { subject: '창체(무용)', minutesBefore: 4, message: '화장실에 다녀오고 가방을 챙겨서 강당으로 이동하세요.' },
    { subject: '체육', minutesBefore: 4, message: '화장실에 다녀오고 가방을 챙겨서 강당으로 이동하세요.' },
  ],
};

export function subtractMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  let total = h * 60 + m - minutes;
  total = ((total % 1440) + 1440) % 1440; // 자정을 넘어가는 극단적인 입력값 방어용
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// periods 중 targetPeriod 바로 앞 항목이 이름 있는 고정 구간(쉬는시간 종류)이면
// 그 라벨("점심시간", "중간놀이시간")을 쓰고, 그냥 이름 없는 틈(예: 교시 사이
// 10분)이면 일반적인 "쉬는 시간"으로 부른다.
function findPrecedingBreakLabel(periods, targetPeriod) {
  const idx = periods.findIndex((p) => p.id === targetPeriod.id);
  const prev = idx > 0 ? periods[idx - 1] : null;
  if (prev && prev.kind === 'fixed') return prev.label;
  return '쉬는 시간';
}

// periods: schedule-times.js의 PERIODS. daySubjects: currentSchedule[dayKey]
// (교시id -> 과목명). bellConfig: DEFAULT_BELL_CONFIG와 같은 모양.
export function computeTodayBellSchedule({ periods, daySubjects, bellConfig }) {
  const config = bellConfig || DEFAULT_BELL_CONFIG;
  const items = (config.morningAlerts || []).map((a) => ({ ...a }));

  for (const period of periods) {
    // 1교시 앞은 "쉬는 시간"이 아니라 아침활동 시간이라 morningAlerts가 이미
    // 담당한다. 교시가 아닌 항목(아침활동/중간놀이/점심시간 자체)은 건너뛴다.
    if (period.kind !== 'class' || period.id === 'p1') continue;
    const subject = (daySubjects || {})[period.id];
    if (!subject) continue; // 오늘 그 교시가 비어 있으면 알림도 없다.

    const rule = (config.subjectRules || []).find((r) => r.subject === subject);
    const minutesBefore = rule ? rule.minutesBefore : (config.breakDefaultMinutes || 2);
    const time = subtractMinutes(period.start, minutesBefore);

    let message;
    if (rule) {
      message = rule.message;
    } else {
      const breakLabel = findPrecedingBreakLabel(periods, period);
      const template = config.breakDefaultTemplate || DEFAULT_BREAK_TEMPLATE;
      message = template
        .split('{쉬는시간}').join(breakLabel)
        .split('{분}').join(String(minutesBefore))
        .split('{다음과목}').join(subject);
    }

    items.push({ time, message });
  }

  return items;
}
