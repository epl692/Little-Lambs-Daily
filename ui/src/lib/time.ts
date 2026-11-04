/** Dates and durations for the UI (SPEC 2: US 12-hour time, en-US dates, device-local timezone). Pure and testable. */
export const MIN = 60_000;
export const HOUR = 3_600_000;

const clean = (s: string) => s.replace(/[  ]/g, ' '); // newer ICU uses a narrow no-break space before AM/PM

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** [start, end) of the local calendar day containing `ms`. Built from calendar fields, so DST days are 23 or 25 hours. */
export function dayRange(ms: number): [number, number] {
  const d = new Date(ms);
  return [new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()];
}

/** The same calendar day shifted by `n` days, at local noon (never lands on a DST gap). */
export function shiftDay(ms: number, n: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12).getTime();
}

export const isSameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b);

export function dayLabel(ms: number, now: number): string {
  if (isSameDay(ms, now)) return 'Today';
  if (isSameDay(ms, shiftDay(now, -1))) return 'Yesterday';
  if (isSameDay(ms, shiftDay(now, 1))) return 'Tomorrow';
  return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export const fmtDateLong = (ms: number) => new Date(ms).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** "10:42 AM" */
export const fmtTime = (ms: number) => clean(new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));

/** "8:02a" (compact, for status lines) */
export const fmtTimeShort = (ms: number) => fmtTime(ms).replace(/ ([AP])M$/, (_, c: string) => c.toLowerCase());

/** "10 AM" (hour separators) */
export const fmtHour = (ms: number) => clean(new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric' }));

/** "1h 35m", "42m", "0m" */
export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / MIN));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Running timer "0:42" (hours:minutes). */
export function fmtClock(ms: number): string {
  const m = Math.max(0, Math.floor(ms / MIN));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Age from a YYYY-MM-DD birth date: "7 mo", "2 y 3 mo", "3 y". Empty for a bad or future date. */
export function age(birthDate: string | undefined, now: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate ?? '');
  if (!m) return '';
  const b = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const n = new Date(now);
  let months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
  if (n.getDate() < b.getDate()) months--;
  if (months < 0 || Number.isNaN(months)) return '';
  if (months < 24) return `${months} mo`;
  const y = Math.floor(months / 12);
  const r = months % 12;
  return r ? `${y} y ${r} mo` : `${y} y`;
}

/** "2026-11-04" for an <input type="date">, and back to local noon. */
export function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fromDateInput(v: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime() : undefined;
}
