import { describe, it, expect } from 'vitest';
import { getInstallInstructions } from '../js/pwa-install.js';

const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
const DESKTOP_FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0';

describe('getInstallInstructions', () => {
  it('gives manual share-sheet instructions for iOS Safari', () => {
    const info = getInstallInstructions(IOS_SAFARI);
    expect(info.auto).toBe(false);
    expect(info.message).toMatch(/홈 화면에 추가/);
  });
  it('marks Android Chrome as auto-installable', () => {
    const info = getInstallInstructions(ANDROID_CHROME);
    expect(info.auto).toBe(true);
  });
  it('falls back to generic instructions elsewhere', () => {
    const info = getInstallInstructions(DESKTOP_FIREFOX);
    expect(info.auto).toBe(false);
    expect(info.message.length).toBeGreaterThan(0);
  });
});
