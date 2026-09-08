// tests/schedule-times.test.js
import { describe, it, expect } from 'vitest';
import { PERIODS, getDayKey, getCurrentPeriodId, isMorningActive } from '../js/schedule-times.js';

function at(h, m) {
  const d = new Date(2026, 8, 8); // 2026-09-08 (화요일)
  d.setHours(h, m, 0, 0);
  return d;
}

describe('PERIODS', () => {
  it('has 11 defined slots from 아침활동 to 8교시', () => {
    expect(PERIODS).toHaveLength(11);
    expect(PERIODS[0].id).toBe('morning');
    expect(PERIODS.at(-1).id).toBe('p8');
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
});
