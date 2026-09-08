import { describe, it, expect } from 'vitest';
import { formatHiClassText } from '../js/notice-format.js';

const students = [
  { no: 1, name: '김하늘', role: '칠판지우개' },
  { no: 2, name: '이도윤', role: '우유당번' },
];

describe('formatHiClassText', () => {
  it('includes the general notice followed by a blank line and per-student todos', () => {
    const text = formatHiClassText('내일 준비물: 색연필', students, { 1: '수학익힘 3쪽', 2: '' });
    expect(text).toBe(
      '내일 준비물: 색연필\n\n[오늘의 할 일]\n1. 김하늘 - 수학익힘 3쪽\n2. 이도윤 - (없음)'
    );
  });

  it('omits the notice block entirely when generalNotice is empty', () => {
    const text = formatHiClassText('', students, { 1: '', 2: '' });
    expect(text).toBe('[오늘의 할 일]\n1. 김하늘 - (없음)\n2. 이도윤 - (없음)');
  });

  it('trims whitespace from the general notice', () => {
    const text = formatHiClassText('  공지  ', [], {});
    expect(text.startsWith('공지\n\n')).toBe(true);
  });
});
