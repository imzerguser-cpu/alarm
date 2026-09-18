import { describe, it, expect } from 'vitest';
import { normalizeRoomId, generateRoomId } from '../js/room.js';

describe('normalizeRoomId', () => {
  it('trims surrounding whitespace but preserves case', () => {
    expect(normalizeRoomId(' ab12CD ')).toBe('ab12CD');
  });
  it('preserves custom names, including Korean and internal spaces', () => {
    expect(normalizeRoomId('3학년 2반')).toBe('3학년 2반');
  });
  it('collapses runs of whitespace into a single space', () => {
    expect(normalizeRoomId('3학년   2반')).toBe('3학년 2반');
  });
  it('replaces "/" (illegal in a Firestore document id) with a hyphen', () => {
    expect(normalizeRoomId('3/2반')).toBe('3-2반');
  });
  it('rejects "." and ".." (reserved, invalid Firestore document ids)', () => {
    expect(normalizeRoomId('.')).toBe('');
    expect(normalizeRoomId('..')).toBe('');
  });
  it('returns an empty string for null/undefined/empty input', () => {
    expect(normalizeRoomId(null)).toBe('');
    expect(normalizeRoomId(undefined)).toBe('');
    expect(normalizeRoomId('')).toBe('');
  });
});

describe('generateRoomId', () => {
  it('generates a 6-character code using only the unambiguous charset', () => {
    for (let i = 0; i < 50; i += 1) {
      const id = generateRoomId();
      expect(id).toHaveLength(6);
      expect(id).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXY23456789]{6}$/);
    }
  });
  it('excludes easily-confused characters (0/O, 1/I/L)', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateRoomId()).not.toMatch(/[0O1IL]/);
    }
  });
});
