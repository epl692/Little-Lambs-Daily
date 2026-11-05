/**
 * Reports and exports (SPEC 7). Pure: entries in, summaries / CSV / a ZIP out. Everything is built on the device from local data.
 */
import { zipSync, strToU8, type Zippable } from 'fflate';
import { summary, timeText, type Entry } from './format';
import type { BlobRef } from './types';
import { dayRange, fmtDuration, fmtTime, shiftDay, startOfDay, toDateInput } from './time';

const at = (e: Entry) => Number(e.fields.at);
const byTime = (a: Entry, b: Entry) => at(a) - at(b) || a.id.localeCompare(b.id);

// ---------- 7.1 daily summary ----------

export interface DaySummary {
  arrival?: { at: number; by: string };
  departure?: { at: number; by: string };
  naps: Array<{ text: string; ms: number; open: boolean }>;
  napMs: number;
  bottles: { count: number; oz: number };
  meals: string[];
  diapers: { wet: number; soiled: number; dry: number };
  notes: Array<{ at: number; text: string; by: string }>;
  fromHome: string[];
  photos: number;
  empty: boolean;
}

/** One child's day from that day's entries (any order). Open naps count up to `now`. */
export function summarizeDay(entries: Entry[], now: number): DaySummary {
  const list = [...entries].sort(byTime);
  const kind = (k: string) => list.filter((e) => e.fields.kind === k);
  const checkins = kind('checkin');
  const checkouts = kind('checkout');
  const first = checkins[0];
  const last = checkouts[checkouts.length - 1];
  const naps = kind('nap').map((e) => {
    const end = typeof e.fields.endAt === 'number' ? e.fields.endAt : undefined;
    const ms = Math.max(0, (end ?? now) - at(e));
    return { text: timeText(e, now), ms, open: end === undefined };
  });
  const bottles = kind('bottle');
  const diapers = kind('diaper');
  const d = (kinds: string[]) => diapers.filter((e) => kinds.includes(e.fields.diaper)).length;
  const photoCount = kind('photo').reduce((n, e) => n + (Array.isArray(e.fields.photos) ? e.fields.photos.length : 0), 0);
  return {
    arrival: first && { at: at(first), by: String(first.fields.by ?? '') },
    departure: last && { at: at(last), by: String(last.fields.by ?? '') },
    naps,
    napMs: naps.reduce((n, x) => n + x.ms, 0),
    bottles: { count: bottles.length, oz: bottles.reduce((n, e) => n + Number(e.fields.ozFinished ?? 0), 0) },
    meals: [...kind('meal'), ...kind('snack')].sort(byTime).map((e) => `${fmtTime(at(e))} ${summary(e)}`),
    diapers: { wet: d(['wet', 'both']), soiled: d(['soiled', 'both']), dry: d(['dry']) },
    notes: list
      .filter((e) => (e.fields.kind === 'providerNote' || e.fields.kind === 'familyNote') && e.fields.text)
      .map((e) => ({ at: at(e), text: String(e.fields.text), by: String(e.fields.createdByName ?? '') })),
    fromHome: kind('home').map((e) => [summary(e), e.fields.text].filter(Boolean).join(': ')),
    photos: photoCount,
    empty: list.length === 0,
  };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The summary as plain text lines, for sharing. */
export function summaryLines(s: DaySummary): string[] {
  const out: string[] = [];
  out.push(s.arrival ? `Arrived ${fmtTime(s.arrival.at)}${s.arrival.by ? ` (dropped off by ${s.arrival.by})` : ''}` : 'No check-in recorded');
  if (s.departure) out.push(`Left ${fmtTime(s.departure.at)}${s.departure.by ? ` (picked up by ${s.departure.by})` : ''}`);
  if (s.naps.length) out.push(`Naps: ${fmtDuration(s.napMs)} total`, ...s.naps.map((n) => `  ${n.text}`));
  if (s.bottles.count) out.push(`Bottles: ${plural(s.bottles.count, 'bottle')}, ${s.bottles.oz} oz finished`);
  if (s.meals.length) out.push('Food:', ...s.meals.map((m) => `  ${m}`));
  const { wet, soiled, dry } = s.diapers;
  if (wet + soiled + dry) out.push(`Diapers: ${wet} wet, ${soiled} soiled${dry ? `, ${dry} dry` : ''}`);
  if (s.photos) out.push(`Photos: ${s.photos}`);
  if (s.fromHome.length) out.push('From home:', ...s.fromHome.map((h) => `  ${h}`));
  if (s.notes.length) out.push('Notes:', ...s.notes.map((n) => `  ${fmtTime(n.at)} ${n.text}${n.by ? ` (${n.by})` : ''}`));
  return out;
}

export const summaryText = (name: string, day: number, s: DaySummary) =>
  [`${name} · ${new Date(day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`, ...summaryLines(s)].join('\n');

// ---------- 7.2 attendance ----------

export interface AttendanceRow {
  date: string; // YYYY-MM-DD, device-local
  child: string;
  checkIn?: number;
  checkedInBy: string;
  checkOut?: number;
  pickedUpBy: string;
  hours?: number;
  flag: string;
}

const hhmm = (ms?: number) => (ms === undefined ? '' : `${String(new Date(ms).getHours()).padStart(2, '0')}:${String(new Date(ms).getMinutes()).padStart(2, '0')}`);

/**
 * One row per child per day that has a check-in or check-out in [from, to] (inclusive local days): the first check-in and the
 * last check-out after it. A check-in with no check-out is flagged; so is a check-out with no check-in.
 */
export function attendanceRows(entries: Entry[], names: Map<string, string>, from: number, to: number): AttendanceRow[] {
  const lo = startOfDay(from);
  const hi = dayRange(to)[1];
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.fields.kind !== 'checkin' && e.fields.kind !== 'checkout') continue;
    const t = at(e);
    if (!(t >= lo && t < hi) || !names.has(String(e.fields.child))) continue;
    const key = `${toDateInput(t)}|${e.fields.child}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
  }
  const rows: AttendanceRow[] = [];
  for (const [key, list] of groups) {
    const [date, child] = [key.slice(0, 10), key.slice(11)];
    list.sort(byTime);
    const cin = list.find((e) => e.fields.kind === 'checkin');
    const cout = [...list].reverse().find((e) => e.fields.kind === 'checkout' && (!cin || at(e) >= at(cin)));
    rows.push({
      date,
      child: names.get(child) ?? '',
      checkIn: cin && at(cin),
      checkedInBy: String(cin?.fields.by ?? ''),
      checkOut: cout && at(cout),
      pickedUpBy: String(cout?.fields.by ?? ''),
      hours: cin && cout ? Math.round(((at(cout) - at(cin)) / 3_600_000) * 100) / 100 : undefined,
      flag: !cin ? 'No check-in' : !cout ? 'No check-out' : '',
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.child.localeCompare(b.child));
}

/** A spreadsheet treats a cell starting with = + - @ as a formula; names are typed by users, so defuse them. */
function cell(v: string | number | undefined): string {
  let s = v === undefined ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const ATTENDANCE_HEADER = ['date', 'child', 'check_in', 'checked_in_by', 'check_out', 'picked_up_by', 'hours', 'flag'];

export function attendanceCsv(rows: AttendanceRow[]): string {
  const lines = [ATTENDANCE_HEADER.join(',')];
  for (const r of rows) lines.push([r.date, r.child, hhmm(r.checkIn), r.checkedInBy, hhmm(r.checkOut), r.pickedUpBy, r.hours, r.flag].map(cell).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** Rows grouped by the Monday of their week (one printed page per week). */
export function byWeek(rows: AttendanceRow[]): Array<{ monday: string; rows: AttendanceRow[] }> {
  const weeks = new Map<string, AttendanceRow[]>();
  for (const r of rows) {
    const [y, m, d] = r.date.split('-').map(Number) as [number, number, number];
    const day = new Date(y, m - 1, d, 12);
    const monday = toDateInput(shiftDay(day.getTime(), -((day.getDay() + 6) % 7)));
    (weeks.get(monday) ?? weeks.set(monday, []).get(monday)!).push(r);
  }
  return [...weeks].map(([monday, rows]) => ({ monday, rows }));
}

export const fmtHhmm = hhmm;

// ---------- 7.3 full export ----------

export const EXPORT_TYPES = ['daycare.child', 'daycare.entry', 'daycare.comment', 'daycare.reaction'] as const;
export const EXPORT_SCHEMA = 1;

export interface ExportObject {
  id: string;
  type: string;
  space: string;
  fields: Record<string, unknown>;
}

/** One safe path segment: no separators, no "..", no leading dots (a child named ".." must not climb out of its folder). */
const safe = (s: string) =>
  s
    .replace(/[^\p{L}\p{N}._ -]+/gu, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 60) || 'file';

/** Photo paths inside the ZIP: photos/<child>/<date>_<time>_<n>_<name>. */
export function photoPaths(objects: ExportObject[]): Array<{ path: string; ref: BlobRef; space: string }> {
  const kids = new Map(objects.filter((o) => o.type === 'daycare.child').map((o) => [o.id, String(o.fields.nickname || o.fields.firstName || 'child')]));
  const out: Array<{ path: string; ref: BlobRef; space: string }> = [];
  const used = new Set<string>();
  for (const o of objects) {
    if (o.type !== 'daycare.entry' || !Array.isArray(o.fields.photos)) continue;
    const t = Number(o.fields.at);
    (o.fields.photos as BlobRef[]).forEach((ref, i) => {
      const stamp = `${toDateInput(t)}_${hhmm(t).replace(':', '')}`;
      let path = `photos/${safe(kids.get(String(o.fields.child)) ?? 'child')}/${stamp}_${i + 1}_${safe(ref.name ?? 'photo.jpg')}`;
      for (let n = 2; used.has(path); n++) path = path.replace(/(\.\w+)?$/, `_${n}$1`);
      used.add(path);
      out.push({ path, ref, space: o.space });
    });
  }
  return out;
}

export interface ExportInput {
  objects: ExportObject[];
  spaces: Array<{ id: string; name?: string }>;
  now: number;
  /** When given, photos are fetched (downloading them first if needed) and added under photos/. */
  fetchPhoto?: (ref: BlobRef) => Promise<Blob>;
  onProgress?: (done: number, total: number) => void;
}

export interface ExportResult {
  zip: Uint8Array;
  photos: number;
  missing: string[];
}

export async function buildExport(i: ExportInput): Promise<ExportResult> {
  const files: Zippable = {};
  const missing: string[] = [];
  let photos = 0;
  if (i.fetchPhoto) {
    const list = photoPaths(i.objects);
    let done = 0;
    i.onProgress?.(0, list.length);
    for (const p of list) {
      try {
        files[p.path] = [new Uint8Array(await (await i.fetchPhoto(p.ref)).arrayBuffer()), { level: 0 }]; // jpegs: store, do not recompress
        photos++;
      } catch {
        missing.push(p.path);
      }
      i.onProgress?.(++done, list.length);
    }
  }
  const data = {
    app: 'little-lambs-daily',
    schemaVersion: EXPORT_SCHEMA,
    exportedAt: new Date(i.now).toISOString(),
    spaces: i.spaces,
    objects: i.objects,
    ...(missing.length ? { missingPhotos: missing } : {}),
  };
  files['data.json'] = strToU8(JSON.stringify(data, null, 2));
  return { zip: zipSync(files), photos, missing };
}
