import { describe, expect, it } from 'vitest';
import { authorLine, summary, timeText, type Entry } from '../../ui/src/lib/format';
import { applyFilter, byChild, childStatus, sinceChip, sortEntries, withHourBreaks, FEEDING, DIAPERING } from '../../ui/src/lib/timeline';
import { age, dayLabel, dayRange, fmtClock, fmtDuration, fmtTime, fmtTimeShort, fromDateInput, shiftDay, toDateInput, HOUR, MIN } from '../../ui/src/lib/time';

const d = (y: number, mo: number, day: number, h = 0, mi = 0) => new Date(y, mo - 1, day, h, mi).getTime();
const e = (id: string, fields: Record<string, unknown>): Entry => ({ id, space: 's', fields: { child: 'c1', ...fields } });

describe('time', () => {
  it('day ranges follow the calendar, not 24 hours', () => {
    const [s, end] = dayRange(d(2026, 11, 4, 15, 30));
    expect(s).toBe(d(2026, 11, 4));
    expect(end).toBe(d(2026, 11, 5));
    // spring-forward and fall-back days in the US are 23 and 25 hours; whatever the machine's zone, the range is exactly one calendar day
    for (const day of [d(2026, 3, 8, 12), d(2026, 11, 1, 12)]) {
      const [a, b] = dayRange(day);
      expect(new Date(a).getHours()).toBe(0);
      expect(new Date(b).getHours()).toBe(0);
      expect(new Date(b).getDate()).toBe(new Date(shiftDay(a, 1)).getDate());
    }
  });
  it('shifts and labels days', () => {
    const now = d(2026, 11, 4, 9);
    expect(dayLabel(now, now)).toBe('Today');
    expect(dayLabel(shiftDay(now, -1), now)).toBe('Yesterday');
    expect(dayLabel(shiftDay(now, 1), now)).toBe('Tomorrow');
    expect(dayLabel(shiftDay(now, -5), now)).toMatch(/^Fri, Oct 30$/);
    expect(new Date(shiftDay(d(2026, 1, 31), 1)).getMonth()).toBe(1);
  });
  it('formats times for a US reader', () => {
    expect(fmtTime(d(2026, 11, 4, 10, 42))).toBe('10:42 AM');
    expect(fmtTime(d(2026, 11, 4, 0, 5))).toBe('12:05 AM');
    expect(fmtTimeShort(d(2026, 11, 4, 8, 2))).toBe('8:02a');
    expect(fmtTimeShort(d(2026, 11, 4, 16, 15))).toBe('4:15p');
  });
  it('formats durations and timers', () => {
    expect(fmtDuration(95 * MIN)).toBe('1h 35m');
    expect(fmtDuration(42 * MIN)).toBe('42m');
    expect(fmtDuration(-5)).toBe('0m');
    expect(fmtClock(42 * MIN)).toBe('0:42');
    expect(fmtClock(3 * HOUR + 5 * MIN)).toBe('3:05');
  });
  it('works out age', () => {
    const now = d(2026, 11, 4);
    expect(age('2026-04-04', now)).toBe('7 mo');
    expect(age('2026-04-05', now)).toBe('6 mo'); // not yet the 5th
    expect(age('2024-08-04', now)).toBe('2 y 3 mo');
    expect(age('2023-11-04', now)).toBe('3 y');
    expect(age('2027-01-01', now)).toBe('');
    expect(age('nonsense', now)).toBe('');
    expect(age(undefined, now)).toBe('');
  });
  it('round-trips the date input', () => {
    const noon = fromDateInput('2026-11-04')!;
    expect(toDateInput(noon)).toBe('2026-11-04');
    expect(fromDateInput('11/04/2026')).toBeUndefined();
  });
});

describe('card text', () => {
  const at = d(2026, 11, 4, 10, 42);
  it('summarizes each kind', () => {
    expect(summary(e('1', { kind: 'bottle', at, bottleContents: 'formula', ozOffered: 4, ozFinished: 3.5 }))).toBe('4 oz formula · finished 3.5 oz');
    expect(summary(e('2', { kind: 'meal', at, mealPeriod: 'lunch', served: 'Mac & cheese, peas', amount: 'most' }))).toBe('Lunch · Mac & cheese, peas · Ate most');
    expect(summary(e('3', { kind: 'snack', at, mealPeriod: 'amSnack', amount: 'all' }))).toBe('AM snack · Ate all');
    expect(summary(e('4', { kind: 'diaper', at, diaper: 'wet', diaperNote: ['creamApplied'] }))).toBe('💧 Wet · cream applied');
    expect(summary(e('5', { kind: 'diaper', at, diaper: 'both' }))).toBe('💧💩 Both');
    expect(summary(e('6', { kind: 'checkin', at, by: 'Mom' }))).toBe('Dropped off by Mom');
    expect(summary(e('7', { kind: 'checkout', at }))).toBe('Checked out');
    expect(summary(e('8', { kind: 'home', at, homeKind: 'slept', mood: 'ok' }))).toBe('Slept · mood: OK');
    expect(summary(e('9', { kind: 'photo', at, photos: [{}] }))).toBe('1 photo');
    expect(summary(e('10', { kind: 'photo', at, photos: [{}, {}] }))).toBe('2 photos');
    expect(summary(e('11', { kind: 'providerNote', at, text: 'hi' }))).toBe('');
  });
  it('shows nap ranges and live timers', () => {
    const s = d(2026, 11, 4, 12, 30);
    expect(timeText(e('n', { kind: 'nap', at: s, endAt: d(2026, 11, 4, 14, 5) }), s)).toBe('12:30 PM – 2:05 PM · 1h 35m');
    expect(timeText(e('n', { kind: 'nap', at: s }), s + 12 * MIN)).toBe('12:30 PM – now · 12m');
    expect(timeText(e('b', { kind: 'bottle', at }), at)).toBe('10:42 AM');
  });
  it('names authors', () => {
    expect(authorLine(e('a', { createdByRole: 'provider', createdByName: 'Miss Bri' }))).toBe('by Miss Bri');
    expect(authorLine(e('b', { createdByRole: 'parent', createdByName: 'Erin (Mom)' }))).toBe('by Mom 🏡');
    // a name the person chose later wins over the one written with the entry
    expect(authorLine(e('a', { createdByRole: 'provider', createdByName: 'Miss Bri' }), 'Miss Brianna')).toBe('by Miss Brianna');
    expect(authorLine(e('b', { createdByRole: 'parent', createdByName: 'Erin (Mom)' }), 'Erin (Mama)')).toBe('by Mama 🏡');
    expect(authorLine(e('c', { createdByRole: 'parent', createdByName: 'Erin' }))).toBe('by Erin 🏡');
  });
});

describe('filters and order', () => {
  const rows = [
    e('1', { kind: 'nap', at: 3 }), e('2', { kind: 'bottle', at: 1 }), e('3', { kind: 'meal', at: 2 }), e('4', { kind: 'diaper', at: 4 }),
    e('5', { kind: 'familyNote', at: 5 }), e('6', { kind: 'providerNote', at: 6 }), e('7', { kind: 'photo', at: 7 }),
    e('8', { kind: 'checkin', at: 8 }), e('9', { kind: 'home', at: 9 }),
  ];
  const ids = (xs: Entry[]) => xs.map((x) => x.id);
  it('keeps the right kinds', () => {
    expect(ids(applyFilter(rows, 'all'))).toHaveLength(9);
    expect(ids(applyFilter(rows, 'naps'))).toEqual(['1']);
    expect(ids(applyFilter(rows, 'food'))).toEqual(['2', '3']);
    expect(ids(applyFilter(rows, 'diapers'))).toEqual(['4']);
    expect(ids(applyFilter(rows, 'notes'))).toEqual(['5', '6']);
    expect(ids(applyFilter(rows, 'photos'))).toEqual(['7']);
    expect(ids(applyFilter(rows, 'checks'))).toEqual(['8']);
    expect(ids(applyFilter(rows, 'home'))).toEqual(['9']);
  });
  it('orders newest or oldest first, ties by id', () => {
    expect(ids(sortEntries(rows, 'newest'))[0]).toBe('9');
    expect(ids(sortEntries(rows, 'oldest'))[0]).toBe('2');
    const tie = [e('b', { at: 1 }), e('a', { at: 1 })];
    expect(ids(sortEntries(tie, 'oldest'))).toEqual(['a', 'b']);
    expect(ids(sortEntries(tie, 'newest'))).toEqual(['b', 'a']); // reversed
  });
  it('adds an hour separator when the hour changes', () => {
    const list = sortEntries([e('a', { kind: 'nap', at: d(2026, 11, 4, 9, 5) }), e('b', { kind: 'nap', at: d(2026, 11, 4, 9, 50) }), e('c', { kind: 'nap', at: d(2026, 11, 4, 11, 0) })], 'oldest');
    const out = withHourBreaks(list);
    expect(out.map((r) => (r.type === 'hour' ? r.label : r.entry.id))).toEqual(['9 AM', 'a', 'b', '11 AM', 'c']);
    expect(new Set(out.map((r) => r.key)).size).toBe(out.length);
  });
});

describe('child status', () => {
  const now = d(2026, 11, 4, 13, 0);
  it('not here by default', () => {
    expect(childStatus([], now)).toEqual({ state: 'notHere', label: 'Not here' });
  });
  it('checked in, then picked up', () => {
    const inn = e('1', { kind: 'checkin', at: d(2026, 11, 4, 8, 2), by: 'Mom' });
    expect(childStatus([inn], now)).toMatchObject({ state: 'here', label: 'Checked in 8:02a', by: 'Mom' });
    const out = e('2', { kind: 'checkout', at: d(2026, 11, 4, 16, 15), by: 'Dad' });
    expect(childStatus([inn, out], d(2026, 11, 4, 17))).toMatchObject({ state: 'gone', label: 'Picked up 4:15p' });
    // checked back in after leaving
    const again = e('3', { kind: 'checkin', at: d(2026, 11, 4, 18, 0) });
    expect(childStatus([inn, out, again], d(2026, 11, 4, 18, 5)).state).toBe('here');
  });
  it('napping beats everything while a nap is open, with a live timer', () => {
    const inn = e('1', { kind: 'checkin', at: d(2026, 11, 4, 8, 2) });
    const nap = e('2', { kind: 'nap', at: d(2026, 11, 4, 12, 18) });
    expect(childStatus([inn, nap], now)).toMatchObject({ state: 'napping', label: 'Napping 0:42' });
    const woke = e('2', { kind: 'nap', at: d(2026, 11, 4, 12, 18), endAt: d(2026, 11, 4, 12, 50) });
    expect(childStatus([inn, woke], now).state).toBe('here');
  });
  it('care without a check-in still means here', () => {
    expect(childStatus([e('1', { kind: 'diaper', at: d(2026, 11, 4, 9) })], now)).toMatchObject({ state: 'here', label: 'Here today' });
    expect(childStatus([e('1', { kind: 'home', at: d(2026, 11, 4, 9) })], now).state).toBe('notHere'); // a parent's home note is not care
  });
  it('since chips count from the latest entry and go amber at the threshold', () => {
    const es = [e('1', { kind: 'bottle', at: d(2026, 11, 4, 9, 0) }), e('2', { kind: 'meal', at: d(2026, 11, 4, 10, 50) }), e('3', { kind: 'diaper', at: d(2026, 11, 4, 11, 55) })];
    expect(sinceChip(es, FEEDING, now, 3 * HOUR)).toEqual({ text: '2h 10m', amber: false });
    expect(sinceChip(es, DIAPERING, now, 3 * HOUR)).toEqual({ text: '1h 5m', amber: false });
    expect(sinceChip(es, FEEDING, d(2026, 11, 4, 13, 50), 3 * HOUR)).toEqual({ text: '3h 0m', amber: true });
    expect(sinceChip([], FEEDING, now, 3 * HOUR)).toBeUndefined();
    expect(sinceChip([e('f', { kind: 'bottle', at: now + HOUR })], FEEDING, now, HOUR)).toBeUndefined(); // not in the future
  });
  it('groups by child', () => {
    const g = byChild([e('1', { child: 'a' }), e('2', { child: 'b' }), e('3', { child: 'a' })]);
    expect([...g.keys()]).toEqual(['a', 'b']);
    expect(g.get('a')).toHaveLength(2);
  });
});
