import { describe, it, expect } from 'vitest';
import { isDocumentPipSupported } from '../js/floating-widget.js';

describe('isDocumentPipSupported', () => {
  it('returns true when the API is present on the given window object', () => {
    expect(isDocumentPipSupported({ documentPictureInPicture: {} })).toBe(true);
  });
  it('returns false when the API is missing', () => {
    expect(isDocumentPipSupported({})).toBe(false);
  });
  it('returns false for undefined', () => {
    expect(isDocumentPipSupported(undefined)).toBe(false);
  });
});
