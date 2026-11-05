import * as fflate from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildExport, type ExportObject } from '../../ui/src/lib/reports';
import { BackupError, parseBackup, planRestore, runRestore, type RestoreDeps } from '../../ui/src/lib/restore';
import { useZip } from '../../ui/src/lib/zip';

const ref = (name: string) => ({ $blob: 1 as const, id: name, size: 3, type: 'image/jpeg', name });
const T = new Date(2026, 10, 4, 10, 0).getTime();
const objects: ExportObject[] = [
  { id: 'c1', type: 'daycare.child', space: 's1', fields: { firstName: 'Ada', active: true, avatar: ref('a.png') } },
  { id: 'e1', type: 'daycare.entry', space: 's1', fields: { child: 'c1', kind: 'diaper', diaper: 'wet', at: T, createdBy: 'bri', createdByName: 'Miss Bri', createdByRole: 'provider' } },
  { id: 'e2', type: 'daycare.entry', space: 's1', fields: { child: 'c1', kind: 'home', homeKind: 'slept', at: T, createdBy: 'erin', createdByName: 'Erin (Mom)', createdByRole: 'parent' } },
  { id: 'e3', type: 'daycare.entry', space: 's1', fields: { child: 'c1', kind: 'photo', at: T, photos: [ref('p.jpg')], thumbs: [ref('t.jpg')], createdBy: 'bri', createdByName: 'Miss Bri', createdByRole: 'provider' } },
  { id: 'e4', type: 'daycare.entry', space: 's1', fields: { child: 'gone', kind: 'diaper', diaper: 'dry', at: T, createdBy: 'bri', createdByName: 'Miss Bri', createdByRole: 'provider' } },
  { id: 'm1', type: 'daycare.comment', space: 's1', fields: { target: 'e1', text: 'Thanks!', at: T, createdBy: 'erin', createdByName: 'Erin (Mom)', createdByRole: 'parent' } },
  { id: 'r1', type: 'daycare.reaction', space: 's1', fields: { target: 'e1', emoji: 'love', createdBy: 'erin' } },
];

async function backupFiles(withPhotos: boolean) {
  const r = await buildExport({ objects, spaces: [{ id: 's1', name: 'Lee Family' }], now: T, fetchPhoto: withPhotos ? async () => ({ arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 1]).buffer }) as Blob : undefined });
  return fflate.unzipSync(r.zip);
}
const decode = fflate.strFromU8;

function deps(over: Partial<RestoreDeps> = {}) {
  const made: Array<{ space: string; type: string; fields: Record<string, any>; id?: string }> = [];
  const d: RestoreDeps = {
    data: {
      get: async (id) => (made.find((m) => m.id === id) ? ({ id } as never) : undefined),
      create: async (space, type, fields, o) => {
        made.push({ space, type, fields, id: o?.id });
        return { id: o?.id ?? '', type, space, fields };
      },
    },
    createFamily: async (name) => `new-${name}`,
    attach: async (_f, o) => ref(`${o.obj}-${o.name}`),
    thumb: async (f) => f,
    me: { user: 'bri2' },
    ...over,
  };
  return { d, made };
}

describe('reading a backup', () => {
  beforeAll(() => useZip(fflate));
  it('accepts what export wrote', async () => {
    const b = parseBackup(await backupFiles(false), decode);
    expect(b.objects).toHaveLength(objects.length);
  });
  it('says plainly what is wrong with other files', () => {
    expect(() => parseBackup({}, decode)).toThrow(BackupError);
    expect(() => parseBackup({ 'data.json': new TextEncoder().encode('{oops') }, decode)).toThrow(/damaged/);
    expect(() => parseBackup({ 'data.json': new TextEncoder().encode('{"app":"other"}') }, decode)).toThrow(/not a Little Lambs/);
    const newer = JSON.stringify({ app: 'little-lambs-daily', schemaVersion: 99, spaces: [], objects: [] });
    expect(() => parseBackup({ 'data.json': new TextEncoder().encode(newer) }, decode)).toThrow(/newer version/);
  });
});

describe('planning', () => {
  beforeAll(() => useZip(fflate));
  it('matches a family by id, then by name, else it will be created', async () => {
    const files = await backupFiles(true);
    const b = parseBackup(files, decode);
    expect(planRestore(b, [], new Set(), files).families[0]!.to).toBeUndefined();
    expect(planRestore(b, [{ id: 'other', name: ' lee family ' }], new Set(), files).families[0]!.to).toBe('other');
    expect(planRestore(b, [{ id: 's1', name: 'Renamed Family' }, { id: 'x', name: 'Lee Family' }], new Set(), files).families[0]!.to).toBe('s1');
  });
  it('counts only what is missing, and flags photo entries without photos', async () => {
    const files = await backupFiles(false); // no photos folder
    const b = parseBackup(files, decode);
    const p = planRestore(b, [], new Set(['e1']), files);
    expect(p.families[0]).toMatchObject({ children: { total: 1, add: 1 }, entries: { total: 4, add: 3 }, replies: { total: 1, add: 1 }, skippedNoPhotos: 1 });
    expect(p.reactionsSkipped).toBe(1);
  });
});

describe('restoring', () => {
  beforeAll(() => useZip(fflate));
  it('re-creates everything with its original id, under the restorer, in a created family', async () => {
    const files = await backupFiles(true);
    const b = parseBackup(files, decode);
    const { d, made } = deps();
    const r = await runRestore(b, files, planRestore(b, [], new Set(), files), d);
    expect(r.createdFamilies).toEqual(['Lee']);
    expect(r).toMatchObject({ children: 1, entries: 3, replies: 1, photos: 1, skipped: 0, reactionsSkipped: 1 });
    expect(r.failed).toEqual([{ id: 'e4', why: 'its child is not in the backup' }]);
    expect(made.map((m) => m.id)).toEqual(['c1', 'e1', 'e2', 'e3', 'm1']); // children first; never the reaction
    expect(made.every((m) => m.space === 'new-Lee')).toBe(true);
    expect(made[0]!.fields.avatar).toBeUndefined();
    const parentEntry = made.find((m) => m.id === 'e2')!.fields;
    expect(parentEntry).toMatchObject({ createdBy: 'bri2', createdByRole: 'provider', createdByName: 'Erin (Mom)' }); // passes the validator; the name is kept
    const photo = made.find((m) => m.id === 'e3')!.fields;
    expect(photo.photos).toHaveLength(1);
    expect(photo.thumbs).toHaveLength(1);
    expect(photo.photos[0].id).toBe('e3-p.jpg'); // re-attached to the new entry, not the old reference
  });
  it('a second run adds nothing', async () => {
    const files = await backupFiles(true);
    const b = parseBackup(files, decode);
    const { d, made } = deps();
    await runRestore(b, files, planRestore(b, [], new Set(), files), d);
    const before = made.length;
    const again = await runRestore(b, files, planRestore(b, [{ id: 'new-Lee', name: 'Lee Family' }], new Set(made.map((m) => m.id!)), files), d);
    expect(made.length).toBe(before);
    expect(again.skipped).toBe(5);
    expect(again.createdFamilies).toEqual([]);
  });
  it('a photo entry with no photo files is reported, and the rest still restores', async () => {
    const files = await backupFiles(false);
    const b = parseBackup(files, decode);
    const { d, made } = deps();
    const r = await runRestore(b, files, planRestore(b, [], new Set(), files), d);
    expect(r.failed.map((f) => f.id).sort()).toEqual(['e3', 'e4']);
    expect(made.some((m) => m.id === 'e3')).toBe(false);
    expect(r.entries).toBe(2);
  });
  it('one bad object does not stop the others', async () => {
    const files = await backupFiles(true);
    const b = parseBackup(files, decode);
    const { d, made } = deps();
    const create = d.data.create;
    d.data.create = async (s, t, f, o) => {
      if (o?.id === 'e1') throw new Error('schema says no');
      return create(s, t, f, o);
    };
    const r = await runRestore(b, files, planRestore(b, [], new Set(), files), d);
    expect(r.failed.map((f) => f.why)).toContain('schema says no');
    expect(made.some((m) => m.id === 'm1')).toBe(true);
  });
});
