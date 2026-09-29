// tests/schedule-times.test.js
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PERIODS, getDayKey, getCurrentPeriodId, isMorningActive, formatTime12, formatTimeRange12,
} from '../js/schedule-times.js';

function at(h, m) {
  const d = new Date(2026, 8, 8); // 2026-09-08 (화요일)
  d.setHours(h, m, 0, 0);
  return d;
}

describe('DEFAULT_PERIODS', () => {
  it('has 11 defined slots from 아침활동 to 8교시', () => {
    expect(DEFAULT_PERIODS).toHaveLength(11);
    expect(DEFAULT_PERIODS[0].id).toBe('morning');
    expect(DEFAULT_PERIODS.at(-1).id).toBe('p8');
  });
});

describe('getDayKey', () => {
  it('maps 2026-09-08 (Tue) to "tue"', () => {
    expect(getDayKey(new Date(2026, 8, 8))).toBe('tue');
  });
  it('maps 2026-09-07 (Mon) to "mon"', () => {
    expect(getDayKey(new Date(2026, 8, 7))).toBe('mon');
  });
});

describe('getCurrentPeriodId', () => {
  it('returns "p1" during 1교시 (09:15)', () => {
    expect(getCurrentPeriodId(at(9, 15))).toBe('p1');
  });
  it('returns null during a break (09:45)', () => {
    expect(getCurrentPeriodId(at(9, 45))).toBeNull();
  });
  it('returns "p6" at 14:15', () => {
    expect(getCurrentPeriodId(at(14, 15))).toBe('p6');
  });
  it('returns null before school (08:00)', () => {
    expect(getCurrentPeriodId(at(8, 0))).toBeNull();
  });
  it('excludes the end boundary (09:40 is break, not p1)', () => {
    expect(getCurrentPeriodId(at(9, 40))).toBeNull();
  });

  it('uses a custom periods array when one is passed (관리자가 교시 시간을 바꾼 경우)', () => {
    // Admin pushed p1 back by 10 minutes: 09:00~09:40 -> 09:10~09:50.
    const customPeriods = DEFAULT_PERIODS.map((p) => (
      p.id === 'p1' ? { ...p, start: '09:10', end: '09:50' } : p
    ));
    // 09:05 is inside the DEFAULT p1 (09:00~09:40)...
    expect(getCurrentPeriodId(at(9, 5))).toBe('p1');
    // ...but falls BEFORE the customized (later-starting) p1 -> no period yet.
    expect(getCurrentPeriodId(at(9, 5), customPeriods)).toBeNull();
    // 09:45 is a break under the DEFAULT schedule (p1 already ended at 09:40)...
    expect(getCurrentPeriodId(at(9, 45))).toBeNull();
    // ...but still counts as p1 under the customized (later-ending) schedule.
    expect(getCurrentPeriodId(at(9, 45), customPeriods)).toBe('p1');
  });
});

describe('formatTime12', () => {
  it('shows 오전 for hours before noon, no leading zero on the hour', () => {
    expect(formatTime12(9, 5)).toBe('오전 9:05');
  });
  it('shows 오후 for hours from noon on, converting 13 to 1', () => {
    expect(formatTime12(13, 20)).toBe('오후 1:20');
  });
  it('shows 오후 12 at exactly noon', () => {
    expect(formatTime12(12, 0)).toBe('오후 12:00');
  });
  it('shows 오전 12 at midnight', () => {
    expect(formatTime12(0, 30)).toBe('오전 12:30');
  });
});

describe('formatTimeRange12', () => {
  it('marks 오전/오후 once at the start, plain hour:minute at the end', () => {
    expect(formatTimeRange12('09:00', '09:40')).toBe('오전 9:00~9:40');
  });
  it('still converts the end hour to 12-hour form even without its own marker', () => {
    expect(formatTimeRange12('13:20', '14:00')).toBe('오후 1:20~2:00');
  });
});

describe('isMorningActive', () => {
  it('is true at 08:50', () => {
    expect(isMorningActive(at(8, 50))).toBe(true);
  });
  it('is false at exactly 09:00 (end excluded)', () => {
    expect(isMorningActive(at(9, 0))).toBe(false);
  });
  it('is false at 08:39', () => {
    expect(isMorningActive(at(8, 39))).toBe(false);
  });

  it('uses periods[0]\'s custom time when a custom periods array is passed', () => {
    const customPeriods = DEFAULT_PERIODS.map((p) => (
      p.id === 'morning' ? { ...p, start: '08:20', end: '08:50' } : p
    ));
    expect(isMorningActive(at(8, 30), customPeriods)).toBe(true);
    // 08:30 is within the DEFAULT morning window (08:40~09:00)? No — 08:30 is before it starts.
    expect(isMorningActive(at(8, 30))).toBe(false);
  });
});
