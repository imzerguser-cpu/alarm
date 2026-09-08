import { describe, it, expect } from 'vitest';
import { formatCountdown, computeRemaining, clampMinutesToSeconds } from '../js/timer.js';

describe('formatCountdown', () => {
  it('formats 65 seconds as 01:05', () => {
    expect(formatCountdown(65)).toBe('01:05');
  });
  it('formats 0 as 00:00', () => {
    expect(formatCountdown(0)).toBe('00:00');
  });
  it('clamps negative values to 00:00', () => {
    expect(formatCountdown(-5)).toBe('00:00');
  });
});

describe('computeRemaining', () => {
  it('subtracts elapsed seconds from total', () => {
    const start = 1_000_000;
    expect(computeRemaining(180, start, start + 65_000)).toBe(115);
  });
  it('never goes below 0', () => {
    const start = 1_000_000;
    expect(computeRemaining(60, start, start + 65_000)).toBe(0);
  });
});

describe('clampMinutesToSeconds', () => {
  it('converts minutes to seconds', () => {
    expect(clampMinutesToSeconds(3)).toBe(180);
  });
  it('returns null for zero or negative input', () => {
    expect(clampMinutesToSeconds(0)).toBeNull();
    expect(clampMinutesToSeconds(-1)).toBeNull();
  });
  it('returns null for non-numeric input', () => {
    expect(clampMinutesToSeconds('abc')).toBeNull();
  });
  it('clamps to a 60-minute ceiling', () => {
    expect(clampMinutesToSeconds(120)).toBe(3600);
  });
});
