import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../ui/src/lib/format';
import { createNotifier, entryUpdate, fresh, replyUpdates, type ReplyLike, type Update } from '../../ui/src/lib/notify';

const name = (_u: string, f: string) => f;
const reply = (id: string, by: string, target = 'e1', at = 1000): ReplyLike => ({ id, target, text: `text ${id}`, createdBy: by, createdByName: by.toUpperCase(), at });
const entry = (id: string, f: Record<string, unknown>): Entry => ({ id, space: 's', fields: { createdBy: 'bri', createdByRole: 'provider', kind: 'diaper', diaper: 'wet', at: 1, ...f } });

describe('what counts as news', () => {
  it('the first look is a baseline; later arrivals are news only if recent', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(fresh(rows, undefined, () => 0, 0)).toEqual([]);
    expect(fresh(rows, new Set(['a']), () => 1000, 2000)).toEqual([{ id: 'b' }]);
    expect(fresh(rows, new Set(['a']), () => 0, 11 * 60_000)).toEqual([]); // old history that just finished syncing
  });
  it('replies: from someone else, on my card or in my thread; never my own', () => {
    const entries = new Map([
      ['e1', entry('e1', { createdBy: 'me' })],
      ['e2', entry('e2', { createdBy: 'bri' })],
    ]);
    const all = [reply('r1', 'erin', 'e1'), reply('r2', 'me', 'e2'), reply('r3', 'erin', 'e2'), reply('r4', 'bri', 'e3')];
    const out = replyUpdates(all, 'me', all, entries, name);
    expect(out.map((u) => u.key)).toEqual(['reply:r1', 'reply:r3']); // r2 is mine, r4 is on a card I have nothing to do with
    expect(out[0]).toMatchObject({ title: 'ERIN replied', body: 'text r1' });
  });
  it('a parent hears about the daycare’s entries, not their own, and not bare arrivals', () => {
    expect(entryUpdate(entry('x', {}), 'Ada', 'erin', name)?.title).toBe('Ada: Diaper');
    expect(entryUpdate(entry('x', { createdBy: 'erin', createdByRole: 'parent' }), 'Ada', 'erin', name)).toBeUndefined();
    expect(entryUpdate(entry('x', { kind: 'checkin' }), 'Ada', 'erin', name)).toBeUndefined();
    expect(entryUpdate(entry('x', { kind: 'nap' }), 'Ada', 'erin', name)).toBeUndefined();
    expect(entryUpdate(entry('x', { kind: 'checkin', text: 'Great drop-off' }), 'Ada', 'erin', name)?.body).toContain('Great drop-off');
    expect(entryUpdate(entry('x', { kind: 'photo', photos: [{}, {}] }), 'Ada', 'erin', name)?.body).toContain('2 photos');
  });
});

describe('delivery', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const u = (k: string): Update => ({ key: k, title: `t${k}`, body: `b${k}` });

  it('delivers a quiet moment as it is, and never announces the same thing twice', () => {
    const n = createNotifier();
    const got: Update[][] = [];
    n.register((x) => got.push(x));
    n.notify(u('1'));
    n.notify(u('1'));
    n.notify(u('2'));
    vi.advanceTimersByTime(1000);
    expect(got).toEqual([[u('1'), u('2')]]);
    n.notify(u('1'));
    vi.advanceTimersByTime(1000);
    expect(got).toHaveLength(1);
  });
  it('a burst becomes one summary', () => {
    const n = createNotifier();
    const got: Update[][] = [];
    n.register((x) => got.push(x));
    for (const k of ['1', '2', '3', '4', '5']) n.notify(u(k));
    vi.advanceTimersByTime(1000);
    expect(got).toHaveLength(1);
    expect(got[0]).toHaveLength(1);
    expect(got[0]![0]!.title).toBe('5 new updates');
  });
  it('every delivery gets it; one that throws does not stop the rest; a removed one stops', () => {
    const n = createNotifier();
    const a = vi.fn(() => {
      throw new Error('boom');
    });
    const b = vi.fn();
    n.register(a);
    const off = n.register(b);
    n.notify(u('1'));
    vi.advanceTimersByTime(1000);
    expect(b).toHaveBeenCalledTimes(1);
    off();
    n.notify(u('2'));
    vi.advanceTimersByTime(1000);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
