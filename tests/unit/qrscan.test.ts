import { describe, expect, it } from 'vitest';
import { acceptable, cameraProblem } from '../../ui/src/lib/qrscan';

describe('which QR codes the scanner accepts', () => {
  it('an invite screen takes invite links and nothing else', () => {
    expect(acceptable('https://lambs.example.com/#/join/AbC123', 'invite')).toBe('https://lambs.example.com/#/join/AbC123');
    expect(acceptable('  https://lambs.example.com/#/join/AbC123 \n', 'invite')).toBe('https://lambs.example.com/#/join/AbC123');
    expect(acceptable('https://pizza.example.com/menu', 'invite')).toBeUndefined();
    expect(acceptable('sync-link:abc', 'invite')).toBeUndefined();
    expect(acceptable('', 'invite')).toBeUndefined();
  });
  it('a device screen takes device codes and nothing else', () => {
    expect(acceptable('sync-link:eyJ2IjoxfQ', 'link')).toBe('sync-link:eyJ2IjoxfQ');
    expect(acceptable('https://lambs.example.com/#/join/AbC123', 'link')).toBeUndefined();
  });
});

describe('camera trouble, in plain words', () => {
  it('says what to do, and always offers pasting', () => {
    for (const name of ['NotAllowedError', 'SecurityError', 'NotFoundError', 'OverconstrainedError', 'NotReadableError', 'Weird']) {
      expect(cameraProblem({ name })).toMatch(/paste the link/i);
    }
    expect(cameraProblem({ name: 'NotAllowedError' })).toMatch(/blocked/);
    expect(cameraProblem({ name: 'NotFoundError' })).toMatch(/No camera/);
    expect(cameraProblem({ name: 'NotReadableError' })).toMatch(/busy/);
    expect(cameraProblem(undefined)).toMatch(/could not be started/);
  });
});
