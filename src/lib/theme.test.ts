import { describe, it, expect, vi, afterEach } from 'vitest';
import { storedTheme, THEME_INIT_SCRIPT } from './theme';
afterEach(() => vi.unstubAllGlobals());
describe('default appearance', () => {
  it('defaults to light even on a dark device', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null }, matchMedia: () => ({ matches: true }) });
    expect(storedTheme()).toBe('light');
    const toggle = vi.fn(); vi.stubGlobal('localStorage', window.localStorage);
    vi.stubGlobal('document', { documentElement: { classList: { toggle } } });
    new Function(THEME_INIT_SCRIPT)(); expect(toggle).toHaveBeenCalledWith('dark', false);
  });
  it.each(['dark', 'light', 'system'] as const)('preserves an explicit %s choice', choice => {
    vi.stubGlobal('window', { localStorage: { getItem: () => choice } });
    expect(storedTheme()).toBe(choice);
  });
});