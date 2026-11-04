import { describe, expect, it } from 'vitest';
import { apply, getChoice, resolve } from '../../ui/src/lib/theme';

describe('theme', () => {
  it('defaults to system and ignores junk', () => {
    expect(getChoice({ getItem: () => null })).toBe('system');
    expect(getChoice({ getItem: () => 'purple' })).toBe('system');
    expect(getChoice({ getItem: () => 'dark' })).toBe('dark');
  });
  it('system follows the OS, explicit choice wins', () => {
    expect(resolve('system', true)).toBe('dark');
    expect(resolve('system', false)).toBe('light');
    expect(resolve('light', true)).toBe('light');
  });
  it('apply sets data-theme and theme-color', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000">';
    expect(apply('dark', document, false)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.querySelector('meta[name=theme-color]')!.getAttribute('content')).toBe('#0F1B1A');
  });
});
