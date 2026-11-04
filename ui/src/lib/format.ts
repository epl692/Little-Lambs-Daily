/** What each kind looks like and says (SPEC 6.1 icons and colors, 6.6 card contents). Pure. */
import { fmtDuration, fmtTime } from './time';

export type Kind = 'checkin' | 'checkout' | 'nap' | 'bottle' | 'snack' | 'meal' | 'diaper' | 'photo' | 'providerNote' | 'familyNote' | 'home';

export interface Entry {
  id: string;
  space: string;
  fields: Record<string, any>;
}

export const KIND_META: Record<Kind, { icon: string; label: string }> = {
  checkin: { icon: '🏠', label: 'Check-in' },
  checkout: { icon: '👋', label: 'Check-out' },
  nap: { icon: '😴', label: 'Nap' },
  bottle: { icon: '🍼', label: 'Bottle' },
  snack: { icon: '🍎', label: 'Snack' },
  meal: { icon: '🍽️', label: 'Meal' },
  diaper: { icon: '🧷', label: 'Diaper' },
  photo: { icon: '📸', label: 'Photo' },
  providerNote: { icon: '📝', label: 'Note' },
  familyNote: { icon: '💬', label: 'Family note' },
  home: { icon: '🏡', label: 'From home' },
};

const PERIODS: Record<string, string> = { breakfast: 'Breakfast', amSnack: 'AM snack', lunch: 'Lunch', pmSnack: 'PM snack', dinner: 'Dinner', other: 'Other' };
const CONTENTS: Record<string, string> = { breastMilk: 'breast milk', formula: 'formula', milk: 'milk', water: 'water', other: 'other' };
const AMOUNTS: Record<string, string> = { all: 'Ate all', most: 'Ate most', some: 'Ate some', none: 'Ate none' };
const DIAPERS: Record<string, string> = { wet: '💧 Wet', soiled: '💩 Soiled', both: '💧💩 Both', dry: '✨ Dry' };
const DIAPER_NOTES: Record<string, string> = { rash: 'rash', creamApplied: 'cream applied', potty: 'potty' };
const HOME_KINDS: Record<string, string> = { slept: 'Slept', ate: 'Ate', bottle: 'Bottle', diaper: 'Diaper', medicine: 'Medicine', mood: 'Mood', other: 'Other' };
const MOODS: Record<string, string> = { great: 'Great', ok: 'OK', fussy: 'Fussy', sick: 'Sick' };

export const kindOf = (e: Entry): Kind => (e.fields.kind in KIND_META ? (e.fields.kind as Kind) : 'providerNote');
const join = (parts: Array<string | undefined | false>) => parts.filter(Boolean).join(' · ');

/** The time part of a card header: "10:42 AM", or "12:30 PM – 2:05 PM · 1h 35m" for a nap, open naps end with "now". */
export function timeText(e: Entry, now: number): string {
  const at = Number(e.fields.at);
  if (kindOf(e) !== 'nap') return fmtTime(at);
  const end = typeof e.fields.endAt === 'number' ? e.fields.endAt : undefined;
  return end === undefined ? `${fmtTime(at)} – now · ${fmtDuration(now - at)}` : `${fmtTime(at)} – ${fmtTime(end)} · ${fmtDuration(end - at)}`;
}

/** One line under the header: "4 oz formula · finished 3.5 oz", "Lunch · Mac & cheese · Ate most", "💧 Wet · cream applied". */
export function summary(e: Entry): string {
  const f = e.fields;
  switch (kindOf(e)) {
    case 'checkin':
      return f.by ? `Dropped off by ${f.by}` : 'Checked in';
    case 'checkout':
      return f.by ? `Picked up by ${f.by}` : 'Checked out';
    case 'nap':
      return '';
    case 'bottle':
      return join([`${f.ozOffered ?? '?'} oz ${CONTENTS[f.bottleContents] ?? ''}`.trim(), f.ozFinished !== undefined && `finished ${f.ozFinished} oz`]);
    case 'snack':
    case 'meal':
      return join([PERIODS[f.mealPeriod], f.served, AMOUNTS[f.amount]]);
    case 'diaper':
      return join([DIAPERS[f.diaper], ...((f.diaperNote as string[] | undefined) ?? []).map((n) => DIAPER_NOTES[n] ?? n)]);
    case 'photo': {
      const n = Array.isArray(f.photos) ? f.photos.length : 0;
      return `${n} photo${n === 1 ? '' : 's'}`;
    }
    case 'home':
      return join([HOME_KINDS[f.homeKind], f.mood && `mood: ${MOODS[f.mood] ?? f.mood}`]);
    default:
      return '';
  }
}

/** "by Miss Bri" for providers; "by Mom 🏡" for a parent (the relationship in "Erin (Mom)"). */
export function authorLine(e: Entry): string {
  const name = String(e.fields.createdByName ?? '');
  if (e.fields.createdByRole === 'parent') {
    const rel = /\(([^)]+)\)\s*$/.exec(name)?.[1];
    return `by ${rel ?? name} 🏡`;
  }
  return name ? `by ${name}` : '';
}
