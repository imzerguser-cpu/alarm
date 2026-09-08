import { describe, it, expect } from 'vitest';
import { shouldResetDaily } from '../js/daily-reset.js';

describe('shouldResetDaily', () => {
  it('returns true when stored date differs from today', () => {
    expect(shouldResetDaily('2026-09-07', '2026-09-08')).toBe(true);
  });
  it('returns false when dates match', () => {
    expect(shouldResetDaily('2026-09-08', '2026-09-08')).toBe(false);
  });
  it('returns true when stored date is missing', () => {
    expect(shouldResetDaily(undefined, '2026-09-08')).toBe(true);
    expect(shouldResetDaily(null, '2026-09-08')).toBe(true);
  });
});
