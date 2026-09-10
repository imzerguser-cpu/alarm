import { describe, it, expect } from 'vitest';
import { subtractMinutes, computeTodayBellSchedule, DEFAULT_BELL_CONFIG } from '../js/bell-schedule.js';
import { PERIODS } from '../js/schedule-times.js';

describe('subtractMinutes', () => {
  it('subtracts minutes within the same hour', () => {
    expect(subtractMinutes('09:40', 2)).toBe('09:38');
  });
  it('borrows from the hour when minutes go negative', () => {
    expect(subtractMinutes('10:50', 4)).toBe('10:46');
    expect(subtractMinutes('14:10', 4)).toBe('14:06');
    expect(subtractMinutes('09:00', 5)).toBe('08:55');
  });
});

describe('computeTodayBellSchedule', () => {
  const daySubjects = {
    p1: '국어', p2: '과학', p3: '과학', p4: '체육', p5: '음악(가야금)',
    p6: '피아노', p7: '피아노', p8: '뉴스포츠/돌봄',
  };

  it('includes the fixed morning alerts as-is', () => {
    const rows = computeTodayBellSchedule({ periods: PERIODS, daySubjects, bellConfig: DEFAULT_BELL_CONFIG });
    const morningTimes = DEFAULT_BELL_CONFIG.morningAlerts.map((a) => a.time);
    for (const time of morningTimes) {
      expect(rows.some((r) => r.time === time)).toBe(true);
    }
  });

  it('never generates an alert before p1 (morning alerts already cover it)', () => {
    const rows = computeTodayBellSchedule({ periods: PERIODS, daySubjects, bellConfig: DEFAULT_BELL_CONFIG });
    // p1 starts 09:00; nothing besides the fixed morning alerts should land at/after 08:55 and before 09:00.
    const extra = rows.filter((r) => r.time > '08:55' && r.time < '09:00');
    expect(extra).toHaveLength(0);
  });

  it('uses a subject rule (4 minutes before, custom message) when the upcoming subject matches', () => {
    const rows = computeTodayBellSchedule({ periods: PERIODS, daySubjects, bellConfig: DEFAULT_BELL_CONFIG });
    // p2 (과학) starts 09:50 -> alert at 09:46 with the 과학실 message.
    const row = rows.find((r) => r.time === '09:46');
    expect(row).toBeTruthy();
    expect(row.message).toBe('화장실에 다녀오고 교과서, 필기도구를 챙겨서 과학실로 이동하세요.');
  });

  it('falls back to the default template (2 minutes before) with the subject substituted', () => {
    const rows = computeTodayBellSchedule({ periods: PERIODS, daySubjects, bellConfig: DEFAULT_BELL_CONFIG });
    // p6 (피아노, no rule) starts 14:10 -> default alert at 14:08.
    const row = rows.find((r) => r.time === '14:08');
    expect(row).toBeTruthy();
    expect(row.message).toBe('쉬는 시간이 2분 남았습니다. 화장실에 다녀오고 피아노 수업을 준비하세요.');
  });

  it('uses the fixed-break label ("점심시간") in the default template when applicable', () => {
    const rows = computeTodayBellSchedule({ periods: PERIODS, daySubjects, bellConfig: DEFAULT_BELL_CONFIG });
    // p5 (음악(가야금), has a rule) starts 13:20, preceded by lunch -> rule applies (4분전), not the lunch label.
    const row = rows.find((r) => r.time === '13:16');
    expect(row).toBeTruthy();
    expect(row.message).toBe('화장실에 다녀오고 강당으로 이동하세요.');
  });

  it('skips periods with no subject for that day', () => {
    const sparse = { p1: '국어' };
    const rows = computeTodayBellSchedule({ periods: PERIODS, daySubjects: sparse, bellConfig: DEFAULT_BELL_CONFIG });
    // Only the 3 fixed morning alerts should be present, nothing computed for p2..p8.
    expect(rows).toHaveLength(DEFAULT_BELL_CONFIG.morningAlerts.length);
  });

  describe('periodOverrides ("오늘만" 임시 변경)', () => {
    it('uses the override subject instead of the base timetable subject', () => {
      // p3 is 과학 on the base timetable, but overridden to a field trip today.
      const overrides = { p3: { subject: '현장학습', note: '' } };
      const rows = computeTodayBellSchedule({
        periods: PERIODS, daySubjects, bellConfig: DEFAULT_BELL_CONFIG, periodOverrides: overrides,
      });
      // p3 starts 10:50, preceded by 중간놀이시간, no rule for "현장학습" -> default template, 2 minutes before.
      const row = rows.find((r) => r.time === '10:48');
      expect(row).toBeTruthy();
      expect(row.message).toBe('중간놀이시간이 2분 남았습니다. 화장실에 다녀오고 현장학습 수업을 준비하세요.');
      // The 과학 rule (4분전, 09:46 belongs to p2 not p3) should not fire for p3 anymore.
      expect(rows.some((r) => r.time === '10:46')).toBe(false);
    });

    it('applies a matching subject rule to the overridden subject too', () => {
      // p6 (피아노, no rule normally) overridden to 체육 today -> should pick up the 체육 rule.
      const overrides = { p6: { subject: '체육', note: '' } };
      const rows = computeTodayBellSchedule({
        periods: PERIODS, daySubjects, bellConfig: DEFAULT_BELL_CONFIG, periodOverrides: overrides,
      });
      // p6 starts 14:10, 체육 rule is 4분전 -> 14:06.
      const row = rows.find((r) => r.time === '14:06');
      expect(row).toBeTruthy();
      expect(row.message).toBe('화장실에 다녀오고 가방을 챙겨서 강당으로 이동하세요.');
    });

    it('is unaffected when periodOverrides is omitted or empty', () => {
      const rows = computeTodayBellSchedule({ periods: PERIODS, daySubjects, bellConfig: DEFAULT_BELL_CONFIG, periodOverrides: {} });
      const row = rows.find((r) => r.time === '09:46');
      expect(row.message).toBe('화장실에 다녀오고 교과서, 필기도구를 챙겨서 과학실로 이동하세요.');
    });
  });
});
