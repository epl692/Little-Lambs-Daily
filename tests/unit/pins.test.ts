import { describe, expect, it } from 'vitest';
import { DAY_MS, planPins } from '../../ui/src/lib/pins';
import type { BlobRef } from '../../ui/src/lib/types';

const ref = (id: string) => ({ $blob: 1, id, size: 1, type: 'image/jpeg' }) as BlobRef;
const NOW = 100 * DAY_MS;
const row = (at: number, ...ids: string[]) => ({ at, photos: ids.map(ref), thumbs: ids.map((i) => ref(`t-${i}`)) });

describe('pinning recent photos', () => {
  it('pins today’s and yesterday’s photos and their previews, once', () => {
    const p = planPins([row(NOW - 1000, 'a'), row(NOW - DAY_MS, 'b')], {}, NOW);
    expect(p.pin.map((r) => r.id).sort()).toEqual(['a', 'b', 't-a', 't-b']);
    expect(p.unpin).toEqual([]);
    const again = planPins([row(NOW - 1000, 'a'), row(NOW - DAY_MS, 'b')], p.next, NOW);
    expect(again.pin).toEqual([]); // nothing new to do
  });
  it('lets old photos go so the storage budget can evict them', () => {
    const first = planPins([row(NOW - DAY_MS, 'b')], {}, NOW);
    const later = planPins([row(NOW - DAY_MS, 'b')], first.next, NOW + 3 * DAY_MS);
    expect(later.unpin.map((r) => r.id).sort()).toEqual(['b', 't-b']);
    expect(later.pin).toEqual([]);
  });
  it('unpins photos whose entry was deleted or edited away', () => {
    const first = planPins([row(NOW, 'a', 'c')], {}, NOW);
    const edited = planPins([row(NOW, 'a')], first.next, NOW);
    expect(edited.unpin.map((r) => r.id).sort()).toEqual(['c', 't-c']);
    expect(Object.keys(edited.next).sort()).toEqual(['a', 't-a']);
  });
  it('ignores entries older than the window', () => {
    expect(planPins([row(NOW - 10 * DAY_MS, 'z')], {}, NOW).pin).toEqual([]);
  });
});
