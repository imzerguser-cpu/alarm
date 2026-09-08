import { describe, it, expect } from 'vitest';
import { parseRosterRows } from '../js/excel-import.js';

describe('parseRosterRows', () => {
  it('parses rows and skips a header row like ["번호","이름"]', () => {
    const aoa = [['번호', '이름'], [1, '김하늘'], [2, '이도윤']];
    expect(parseRosterRows(aoa)).toEqual([
      { no: 1, name: '김하늘', role: '' },
      { no: 2, name: '이도윤', role: '' },
    ]);
  });

  it('parses rows with no header (first row already numeric)', () => {
    const aoa = [[1, '김하늘'], [2, '이도윤']];
    expect(parseRosterRows(aoa)).toEqual([
      { no: 1, name: '김하늘', role: '' },
      { no: 2, name: '이도윤', role: '' },
    ]);
  });

  it('throws with the offending row number when name is missing', () => {
    const aoa = [['번호', '이름'], [1, '김하늘'], [2, '']];
    expect(() => parseRosterRows(aoa)).toThrow(/3행/);
  });

  it('throws when the number column is not numeric', () => {
    const aoa = [['번호', '이름'], ['가', '김하늘']];
    expect(() => parseRosterRows(aoa)).toThrow(/2행/);
  });
});
