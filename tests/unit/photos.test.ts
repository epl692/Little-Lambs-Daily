import { describe, expect, it, vi } from 'vitest';
import { createPhotoLogger, familyCount, fitWithin, preparePhoto, type Prepared } from '../../ui/src/lib/photos';
import type { Actor } from '../../ui/src/lib/log';
import type { Data } from '../../ui/src/lib/types';

describe('fitWithin', () => {
  it('shrinks the long edge to the limit and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
  });
  it('never enlarges', () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });
  it('never returns zero', () => {
    expect(fitWithin(10000, 1, 2048).height).toBe(1);
  });
});

describe('preparePhoto', () => {
  it('makes a full image at 2048/0.82 and a thumbnail at 480/0.7, named .jpg', async () => {
    const calls: Array<[number, number]> = [];
    const re = vi.fn(async (_f: Blob, max: number, q: number) => (calls.push([max, q]), new Blob([String(max)], { type: 'image/jpeg' })));
    const p = await preparePhoto(new File(['x'], 'IMG_0001.HEIC', { type: 'image/heic' }), re);
    expect(calls.sort()).toEqual([[2048, 0.82], [480, 0.7]].sort());
    expect(p.name).toBe('IMG_0001.jpg');
    expect(p.full.type).toBe('image/jpeg');
  });
  it('refuses a file that is not an image', async () => {
    await expect(preparePhoto(new File(['x'], 'a.pdf', { type: 'application/pdf' }), async (f) => f)).rejects.toThrow(/not a photo/);
  });
});

describe('photo logger', () => {
  const provider: Actor = { user: 'bri', name: 'Miss Bri', role: 'provider' };
  const prepared = (n: number): Prepared[] => Array.from({ length: n }, (_, i) => ({ full: new Blob([`f${i}`]), thumb: new Blob([`t${i}`]), name: `p${i}.jpg` }));

  function setup(actor: Actor = provider, failCreateAt = -1) {
    const attached: Array<{ space: string; obj: string; name?: string }> = [];
    const created: Array<{ space: string; id?: string; fields: any }> = [];
    const undone: string[] = [];
    let ids = 0;
    const data = {
      create: async (space: string, _t: string, fields: any, o?: { id?: string }) => {
        if (created.length === failCreateAt) throw new Error('boom');
        created.push({ space, id: o?.id, fields });
        return { id: o?.id ?? 'x', type: 't', space, fields };
      },
      undo: async (id: string) => void undone.push(id),
    } as unknown as Data;
    const blobs = { attach: async (_b: Blob, o: { space: string; obj: string; name?: string }) => (attached.push(o), { $blob: 1, id: `b${attached.length}`, size: 1, type: 'image/jpeg' }) };
    const log = createPhotoLogger({ data, blobs: () => blobs, actor: () => actor, newId: () => `id${++ids}` });
    return { log, attached, created, undone };
  }

  it('one entry per child, each with its own copy of every photo in that child’s Space, attached to that entry', async () => {
    const { log, attached, created } = setup();
    const targets = [{ id: 'ada', space: 'S1' }, { id: 'ben', space: 'S2' }];
    const r = await log.post({ targets, photos: prepared(2), text: ' Painting ', at: 5 });
    expect(created.map((c) => [c.space, c.fields.child])).toEqual([['S1', 'ada'], ['S2', 'ben']]);
    expect(created.every((c) => c.fields.kind === 'photo' && c.fields.text === 'Painting' && c.fields.photos.length === 2 && c.fields.thumbs.length === 2)).toBe(true);
    expect(created[0]!.fields.batchId).toBe(r.batchId);
    expect(created[1]!.fields.batchId).toBe(r.batchId);
    // 2 children x 2 photos x (full + thumb); each attached to its own entry in its own Space
    expect(attached).toHaveLength(8);
    expect(attached.filter((a) => a.space === 'S1').every((a) => a.obj === created[0]!.id)).toBe(true);
    expect(attached.filter((a) => a.space === 'S2').every((a) => a.obj === created[1]!.id)).toBe(true);
    expect(created[0]!.fields.createdByRole).toBe('provider');
  });

  it('a single child has no batch id', async () => {
    const { log, created } = setup();
    await log.post({ targets: [{ id: 'ada', space: 'S1' }], photos: prepared(1), at: 1 });
    expect(created[0]!.fields.batchId).toBeUndefined();
    expect(created[0]!.fields.text).toBeUndefined();
  });

  it('is all or nothing', async () => {
    const { log, undone } = setup(provider, 1);
    await expect(log.post({ targets: [{ id: 'a', space: 'S' }, { id: 'b', space: 'S' }], photos: prepared(1), at: 1 })).rejects.toThrow('boom');
    expect(undone).toEqual(['id2']); // the first child's entry (id1 was the batch id)
  });

  it('refuses parents, nothing picked, nobody picked, and more than 12', async () => {
    const t = [{ id: 'a', space: 'S' }];
    await expect(setup({ ...provider, role: 'parent' }).log.post({ targets: t, photos: prepared(1), at: 1 })).rejects.toThrow(/providers/);
    await expect(setup().log.post({ targets: t, photos: [], at: 1 })).rejects.toThrow(/photo/);
    await expect(setup().log.post({ targets: [], photos: prepared(1), at: 1 })).rejects.toThrow(/child/);
    await expect(setup().log.post({ targets: t, photos: prepared(13), at: 1 })).rejects.toThrow(/12/);
  });

  it('counts the families a photo will be visible to', () => {
    expect(familyCount([{ id: 'a', space: 'S1' }, { id: 'b', space: 'S1' }, { id: 'c', space: 'S2' }])).toBe(2);
  });

  describe('changing the photos of a posted entry', () => {
    const entry = (n: number, thumbs = true) => ({
      id: 'e1',
      space: 'S1',
      fields: { photos: Array.from({ length: n }, (_, i) => ({ id: `p${i}` })), ...(thumbs ? { thumbs: Array.from({ length: n }, (_, i) => ({ id: `t${i}` })) } : {}) },
    });
    it('keeps the chosen ones in order, adds new ones in the entry’s own Space, and keeps previews lined up', async () => {
      const { log, attached } = setup();
      const r = await log.change({ entry: entry(3), keep: [2, 0], add: prepared(1) });
      expect((r.photos as Array<{ id: string }>).slice(0, 2).map((p) => p.id)).toEqual(['p0', 'p2']);
      expect(r.photos).toHaveLength(3);
      expect((r.thumbs as Array<{ id: string }>).slice(0, 2).map((p) => p.id)).toEqual(['t0', 't2']);
      expect(r.thumbs).toHaveLength(3);
      expect(attached).toHaveLength(2); // the new photo and its preview
      expect(attached.every((a) => a.space === 'S1' && a.obj === 'e1')).toBe(true);
    });
    it('drops previews that no longer line up rather than showing the wrong ones', async () => {
      const { log } = setup();
      expect((await log.change({ entry: entry(2, false), keep: [0, 1], add: [] })).thumbs).toBeNull();
      expect((await log.change({ entry: entry(2, false), keep: [0], add: prepared(1) })).thumbs).toBeNull();
    });
    it('needs at least one photo and at most twelve; only providers', async () => {
      const { log } = setup();
      await expect(log.change({ entry: entry(2), keep: [], add: [] })).rejects.toThrow(/at least one photo/);
      await expect(log.change({ entry: entry(10), keep: [...Array(10).keys()], add: prepared(3) })).rejects.toThrow(/At most 12/);
      const parent = setup({ user: 'mom', name: 'Mom', role: 'parent' });
      await expect(parent.log.change({ entry: entry(2), keep: [0], add: [] })).rejects.toThrow(/Only providers/);
    });
    it('ignores positions that are not there', async () => {
      const { log } = setup();
      const r = await log.change({ entry: entry(2), keep: [0, 9, -1], add: [] });
      expect(r.photos).toHaveLength(1);
    });
  });
});
