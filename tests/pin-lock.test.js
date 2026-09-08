import { describe, it, expect } from 'vitest';
import { checkPin } from '../js/pin-lock.js';

describe('checkPin', () => {
  it('returns true for exact match', () => {
    expect(checkPin('1234', '1234')).toBe(true);
  });
  it('trims surrounding whitespace from input', () => {
    expect(checkPin(' 1234 ', '1234')).toBe(true);
  });
  it('returns false for mismatch', () => {
    expect(checkPin('0000', '1234')).toBe(false);
  });
  it('returns false for non-string input', () => {
    expect(checkPin(1234, '1234')).toBe(false);
  });
});
