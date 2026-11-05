import { unzipSync, strFromU8 } from 'fflate';
import * as fflate from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { useZip } from '../../ui/src/lib/zip';
import type { Entry } from '../../ui/src/lib/format';
import { attendanceCsv, attendanceRows, buildExport, byWeek, photoPaths, summarizeDay, summaryText, type ExportObject } from '../../ui/src/lib/reports';

const D = (h: number, m = 0, day = 4) => new Date(2026, 10, day, h, m).getTime(); // 4 Nov 2026, local
let n = 0;
const e = (child: string, f: Record<string, unknown>): Entry => ({ id: `e${String(++n).padStart(3, '0')}`, space: 's', fields: { child, ...f } });
const names = new Map([
  ['a', 'Ada'],
  ['b', 'Ben'],
]);

describe('daily summary', () => {
  const day = [
    e('a', { kind: 'checkin', at: D(8, 2), by: 'Mom' }),
    e('a', { kind: 'nap', at: D(12, 30), endAt: D(14, 5) }),
    e('a', { kind: 'nap', at: D(15, 0) }), // still asleep
    e('a', { kind: 'bottle', at: D(9), bottleContents: 'formula', ozOffered: 4, ozFinished: 3.5 }),
    e('a', { kind: 'bottle', at: D(11), bottleContents: 'formula', ozOffered: 4, ozFinished: 4 }),
    e('a', { kind: 'meal', at: D(12), mealPeriod: 'lunch', served: 'Mac', amount: 'most' }),
    e('a', { kind: 'diaper', at: D(10), diaper: 'wet' }),
    e('a', { kind: 'diaper', at: D(13), diaper: 'both' }),
    e('a', { kind: 'diaper', at: D(14), diaper: 'dry' }),
    e('a', { kind: 'providerNote', at: D(11, 30), text: 'Great day', createdByName: 'Miss Bri' }),
    e('a', { kind: 'photo', at: D(10, 30), photos: [{}, {}] }),
    e('a', { kind: 'home', at: D(7), homeKind: 'slept', text: '10 hours' }),
    e('a', { kind: 'checkout', at: D(16, 10), by: 'Dad' }),
    e('a', { kind: 'checkout', at: D(16, 5), by: 'Dad' }),
  ];
  const s = summarizeDay(day, D(15, 30));

  it('adds up the day', () => {
    expect(s.arrival).toEqual({ at: D(8, 2), by: 'Mom' });
    expect(s.departure).toEqual({ at: D(16, 10), by: 'Dad' }); // the last check-out wins
    expect(s.bottles).toEqual({ count: 2, oz: 7.5 });
    expect(s.diapers).toEqual({ wet: 2, soiled: 1, dry: 1 }); // "both" counts as wet and soiled
    expect(s.photos).toBe(2);
    expect(s.naps).toHaveLength(2);
    expect(s.napMs).toBe(95 * 60_000 + 30 * 60_000); // the open nap runs to "now"
    expect(s.naps[1]!.open).toBe(true);
    expect(s.meals[0]).toContain('Mac');
    expect(s.fromHome).toEqual(['Slept: 10 hours']);
    expect(s.empty).toBe(false);
  });
  it('writes plain text for sharing', () => {
    const t = summaryText('Ada', D(9), s);
    expect(t).toContain('Ada · Wednesday, November 4');
    expect(t).toContain('Arrived 8:02 AM (dropped off by Mom)');
    expect(t).toContain('Bottles: 2 bottles, 7.5 oz finished');
    expect(t).toContain('Diapers: 2 wet, 1 soiled, 1 dry');
  });
  it('an empty day is empty, and says no check-in', () => {
    const z = summarizeDay([], D(12));
    expect(z.empty).toBe(true);
    expect(summaryText('Ada', D(9), z)).toContain('No check-in recorded');
  });
});

describe('attendance', () => {
  const entries = [
    e('a', { kind: 'checkin', at: D(8, 0), by: 'Mom' }),
    e('a', { kind: 'checkin', at: D(8, 30), by: 'Mom' }), // double tap: the first one counts
    e('a', { kind: 'checkout', at: D(17, 30), by: 'Dad' }),
    e('b', { kind: 'checkin', at: D(9, 15), by: '=cmd|x' }),
    e('a', { kind: 'checkin', at: D(8, 0, 5), by: 'Mom' }), // no check-out the next day
    e('b', { kind: 'checkout', at: D(15, 0, 6), by: 'Mom' }), // no check-in
    e('a', { kind: 'nap', at: D(10) }),
    e('z', { kind: 'checkin', at: D(8, 0), by: 'x' }), // not on this device's roster
  ];
  const rows = attendanceRows(entries, names, D(0, 0, 4), D(23, 0, 6));

  it('one row per child per day, with hours and flags', () => {
    expect(rows.map((r) => [r.date, r.child, r.hours, r.flag])).toEqual([
      ['2026-11-04', 'Ada', 9.5, ''],
      ['2026-11-04', 'Ben', undefined, 'No check-out'],
      ['2026-11-05', 'Ada', undefined, 'No check-out'],
      ['2026-11-06', 'Ben', undefined, 'No check-in'],
    ]);
  });
  it('honours the date range inclusively', () => {
    expect(attendanceRows(entries, names, D(0, 0, 5), D(0, 0, 5)).map((r) => r.date)).toEqual(['2026-11-05']);
  });
  it('csv has the spec columns, quotes properly and defuses formulas', () => {
    const csv = attendanceCsv(rows);
    expect(csv.split('\r\n')[0]).toBe('date,child,check_in,checked_in_by,check_out,picked_up_by,hours,flag');
    expect(csv).toContain('2026-11-04,Ada,08:00,Mom,17:30,Dad,9.5,');
    expect(csv).toContain("'=cmd|x"); // never starts with =
    expect(attendanceCsv([{ ...rows[0]!, child: 'Ada, "AJ"' }])).toContain('"Ada, ""AJ"""');
  });
  it('groups into weeks starting on Monday', () => {
    const w = byWeek(attendanceRows(entries, names, D(0, 0, 1), D(0, 0, 12)));
    expect(w).toHaveLength(1);
    expect(w[0]!.monday).toBe('2026-11-02');
    const two = byWeek([...rows, { ...rows[0]!, date: '2026-11-09' }]); // 9 Nov is the next Monday
    expect(two.map((x) => x.monday)).toEqual(['2026-11-02', '2026-11-09']);
  });
});

describe('full export', () => {
  beforeAll(() => useZip(fflate));
  const ref = (name: string) => ({ $blob: 1 as const, id: name, size: 3, type: 'image/jpeg', name });
  const objects: ExportObject[] = [
    { id: 'a', type: 'daycare.child', space: 's', fields: { firstName: 'Ada' } },
    { id: 'p1', type: 'daycare.entry', space: 's', fields: { child: 'a', kind: 'photo', at: D(10), photos: [ref('IMG 1.jpg'), ref('IMG 1.jpg')] } },
  ];
  it('names photos by child and time, never colliding', () => {
    const p = photoPaths(objects).map((x) => x.path);
    expect(p[0]).toBe('photos/Ada/2026-11-04_1000_1_IMG 1.jpg');
    expect(new Set(p).size).toBe(2);
    const evil = [{ ...objects[0]!, fields: { firstName: '../x' } }, objects[1]!];
    expect(photoPaths(evil).every((x) => !x.path.includes('..'))).toBe(true);
  });
  it('zips data.json (schema stamped) and, when asked, the photos; a failed photo is reported, not fatal', async () => {
    const seen: number[] = [];
    let calls = 0;
    const r = await buildExport({
      objects,
      spaces: [{ id: 's', name: 'Lee Family' }],
      now: D(12),
      fetchPhoto: async () => {
        if (++calls === 2) throw new Error('offline');
        return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Blob; // jsdom has no Blob.arrayBuffer
      },
      onProgress: (d) => seen.push(d),
    });
    const files = unzipSync(r.zip);
    const data = JSON.parse(strFromU8(files['data.json']!));
    expect(data.schemaVersion).toBe(1);
    expect(data.objects).toHaveLength(2);
    expect(r.photos).toBe(1);
    expect(r.missing).toHaveLength(1);
    expect(data.missingPhotos).toEqual(r.missing);
    expect(Object.keys(files).filter((k) => k.startsWith('photos/'))).toHaveLength(1);
    expect(seen).toEqual([0, 1, 2]);
  });
  it('without photos there is only data.json', async () => {
    const r = await buildExport({ objects, spaces: [], now: D(12) });
    expect(Object.keys(unzipSync(r.zip))).toEqual(['data.json']);
  });
});
