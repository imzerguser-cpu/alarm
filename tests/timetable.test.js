import { describe, it, expect } from 'vitest';
import { buildTodayRows } from '../js/timetable.js';

const SAMPLE_TUE = {
  tue: {
    p1: '국어', p2: '수학', p3: '사회', p4: '창(동)', p5: '미술',
    p6: '미술', p7: '신나는 실내 액티브 챌린지', p8: '신나는 실내 액티브 챌린지',
  },
};

describe('buildTodayRows', () => {
  it('includes fixed slots and subject slots with subjects, marks current period', () => {
    const rows = buildTodayRows(SAMPLE_TUE, 'tue', 'p2');
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual([
      'morning', 'p1', 'p2', 'playtime', 'p3', 'p4', 'lunch', 'p5', 'p6', 'p7', 'p8',
    ]);
    expect(rows.find((r) => r.id === 'p2').isCurrent).toBe(true);
    expect(rows.find((r) => r.id === 'p1').isCurrent).toBe(false);
    expect(rows.find((r) => r.id === 'p6').subject).toBe('미술');
  });

  it('skips class slots with no subject for that day (e.g. Wed has no p7 given)', () => {
    const rows = buildTodayRows({ wed: { p1: '국어' } }, 'wed', null);
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain('p7');
    expect(ids).not.toContain('p8');
    expect(ids).toContain('morning');
    expect(ids).toContain('lunch');
  });

  it('uses the period label as subject for fixed slots', () => {
    const rows = buildTodayRows({}, 'mon', null);
    expect(rows.find((r) => r.id === 'lunch').subject).toBe('점심시간');
    expect(rows.find((r) => r.id === 'morning').subject).toBe('아침활동');
  });
});
