import { describe, it, expect } from 'vitest';
import { normalizeRoomId, generateRoomId } from '../js/room.js';

describe('normalizeRoomId', () => {
  it('uppercases and trims', () => {
    expect(normalizeRoomId(' ab12cd ')).toBe('AB12CD');
  });
  it('strips non-alphanumeric characters (e.g. pasted with dashes/spaces)', () => {
    expect(normalizeRoomId('ab-12 cd')).toBe('AB12CD');
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
