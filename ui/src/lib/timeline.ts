/** Filtering, ordering and per-child status for the timeline and roster (SPEC 6.3, 6.6). Pure. */
import { kindOf, type Entry, type Kind } from './format';
import { fmtClock, fmtDuration, fmtHour, fmtTimeShort } from './time';

export const FILTERS: Array<{ id: string; label: string; kinds: readonly Kind[] | null }> = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'naps', label: 'Naps', kinds: ['nap'] },
  { id: 'food', label: 'Food', kinds: ['bottle', 'snack', 'meal'] },
  { id: 'diapers', label: 'Diapers', kinds: ['diaper'] },
  { id: 'notes', label: 'Notes', kinds: ['providerNote', 'familyNote'] },
  { id: 'photos', label: 'Photos', kinds: ['photo'] },
  { id: 'checks', label: 'Check-in/out', kinds: ['checkin', 'checkout'] },
  { id: 'home', label: 'From Home', kinds: ['home'] },
];

export function applyFilter<T extends Entry>(entries: T[], filterId: string): T[] {
  const kinds = FILTERS.find((f) => f.id === filterId)?.kinds;
  return kinds ? entries.filter((e) => kinds.includes(kindOf(e))) : entries;
}

export type Order = 'newest' | 'oldest';

/** Stable: equal times fall back to id so every device shows the same order. */
export function sortEntries<T extends Entry>(entries: T[], order: Order): T[] {
  const dir = order === 'newest' ? -1 : 1;
  return [...entries].sort((a, b) => dir * (Number(a.fields.at) - Number(b.fields.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

export type Row<T extends Entry> = { type: 'hour'; key: string; label: string } | { type: 'entry'; key: string; entry: T };

/** Entries with a light separator whenever the local hour changes. */
export function withHourBreaks<T extends Entry>(sorted: T[]): Array<Row<T>> {
  const rows: Array<Row<T>> = [];
  let last = -1;
  for (const entry of sorted) {
    const at = Number(entry.fields.at);
    const d = new Date(at);
    const hourKey = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
    if (hourKey !== last) {
      rows.push({ type: 'hour', key: `h${hourKey}`, label: fmtHour(at) });
      last = hourKey;
    }
    rows.push({ type: 'entry', key: entry.id, entry });
  }
  return rows;
}

// ---------- per-child status ----------

export type StatusState = 'notHere' | 'here' | 'napping' | 'gone';
export interface Status {
  state: StatusState;
  /** "Checked in 8:02a", "Napping 0:42", "Not here", "Picked up 4:15p" */
  label: string;
  /** Who dropped off (from the latest check-in). */
  by?: string;
  /** When the current state began. */
  since?: number;
}

const CARE_KINDS: readonly Kind[] = ['nap', 'bottle', 'snack', 'meal', 'diaper', 'photo', 'providerNote'];
const at = (e: Entry) => Number(e.fields.at);
const latest = (es: Entry[]) => es.reduce<Entry | undefined>((m, e) => (!m || at(e) >= at(m) ? e : m), undefined);

/** Status from ONE child's entries for the day. A provider logging care implies the child is here. */
export function childStatus(entries: Entry[], now: number): Status {
  const open = latest(entries.filter((e) => kindOf(e) === 'nap' && typeof e.fields.endAt !== 'number'));
  if (open) return { state: 'napping', label: `Napping ${fmtClock(now - at(open))}`, since: at(open) };
  const inn = latest(entries.filter((e) => kindOf(e) === 'checkin'));
  const out = latest(entries.filter((e) => kindOf(e) === 'checkout'));
  if (out && (!inn || at(out) >= at(inn))) return { state: 'gone', label: `Picked up ${fmtTimeShort(at(out))}`, by: out.fields.by, since: at(out) };
  if (inn) return { state: 'here', label: `Checked in ${fmtTimeShort(at(inn))}`, by: inn.fields.by, since: at(inn) };
  const care = latest(entries.filter((e) => CARE_KINDS.includes(kindOf(e))));
  if (care) return { state: 'here', label: 'Here today', since: at(care) };
  return { state: 'notHere', label: 'Not here' };
}

export interface SinceChip {
  text: string;
  /** Turns amber past the threshold: a gentle nudge, not an alert. */
  amber: boolean;
}

/** Time since the latest entry of these kinds (not in the future). Undefined if there is none. */
export function sinceChip(entries: Entry[], kinds: readonly Kind[], now: number, thresholdMs: number): SinceChip | undefined {
  const e = latest(entries.filter((x) => kinds.includes(kindOf(x)) && at(x) <= now));
  if (!e) return undefined;
  const ms = now - at(e);
  return { text: fmtDuration(ms), amber: ms >= thresholdMs };
}

export const FEEDING: readonly Kind[] = ['bottle', 'snack', 'meal'];
export const DIAPERING: readonly Kind[] = ['diaper'];

/** Group entries by their child. */
export function byChild<T extends Entry>(entries: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const e of entries) {
    const k = String(e.fields.child);
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  return m;
}
