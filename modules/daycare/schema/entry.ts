import type { ObjectTypeDef } from '@sync/modules';
import { AMOUNTS, BOTTLE_CONTENTS, DIAPERS, DIAPER_NOTES, ENTRY_KINDS, HOME_KINDS, MB, MEAL_PERIODS, MOODS, ROLES } from './enums';

type JSONValue = unknown;
const halfStep = (v: number) => (Number.isInteger(v * 2) ? undefined : 'must be a multiple of 0.5');
const has = (f: Record<string, any>, k: string) => f[k] !== undefined && f[k] !== null && f[k] !== '';
const blank = (v: JSONValue | undefined) => typeof v !== 'string' || !v.trim();

/** Create-only rule: the kind decides which other fields must be present (SPEC 5.2). */
function objectCheck(f: Record<string, any>): string | undefined {
  const need = (...keys: string[]) => keys.find((k) => !has(f, k));
  const missing = (...keys: string[]) => {
    const k = need(...keys);
    return k ? `${f.kind} entries require ${k}` : undefined;
  };
  switch (f.kind) {
    case 'nap':
      if (typeof f.endAt === 'number' && typeof f.at === 'number' && f.endAt < f.at) return 'endAt must not be before at';
      return undefined;
    case 'bottle':
      if (missing('bottleContents', 'ozOffered')) return missing('bottleContents', 'ozOffered');
      if (typeof f.ozFinished === 'number' && typeof f.ozOffered === 'number' && f.ozFinished > f.ozOffered) return 'ozFinished must not exceed ozOffered';
      return undefined;
    case 'snack':
    case 'meal':
      return missing('mealPeriod', 'amount');
    case 'diaper':
      return missing('diaper');
    case 'photo':
      return Array.isArray(f.photos) && f.photos.length > 0 ? undefined : 'photo entries require at least one photo';
    case 'providerNote':
    case 'familyNote':
      return blank(f.text) ? `${f.kind} entries require text` : undefined;
    case 'home':
      return missing('homeKind');
    default:
      return undefined; // checkin, checkout
  }
}

/** One type for every timeline item, so the timeline is a single live query. */
export const entry: ObjectTypeDef = {
  name: 'entry',
  label: 'Timeline entry',
  // "Delete, then Undo" must work (SPEC 9): the framework only undoes a delete for types where an edit may restore it.
  merge: { editResurrects: true },
  versions: [
    {
      version: 1,
      fields: {
        child: { type: 'ref', to: 'daycare.child', required: true },
        kind: { type: 'enum', values: ENTRY_KINDS, required: true },
        at: { type: 'timestamp', required: true },
        endAt: { type: 'timestamp' },
        batchId: { type: 'string', maxLength: 64 },
        mealPeriod: { type: 'enum', values: MEAL_PERIODS },
        served: { type: 'string', maxLength: 200 },
        amount: { type: 'enum', values: AMOUNTS },
        bottleContents: { type: 'enum', values: BOTTLE_CONTENTS },
        ozOffered: { type: 'number', min: 0, max: 16, check: halfStep },
        ozFinished: { type: 'number', min: 0, max: 16, check: halfStep },
        diaper: { type: 'enum', values: DIAPERS },
        diaperNote: { type: 'list', of: 'string', maxItems: DIAPER_NOTES.length, check: (v) => (v.every((x) => (DIAPER_NOTES as readonly unknown[]).includes(x)) ? undefined : 'unknown diaper note') },
        photos: { type: 'list', of: 'blob', maxItems: 12, accept: ['image/*'], maxBytes: 20 * MB },
        // Small previews, same order as `photos`: the grid loads these and the full image only on tap.
        thumbs: { type: 'list', of: 'blob', maxItems: 12, accept: ['image/*'], maxBytes: 2 * MB },
        text: { type: 'string', maxLength: 2000 },
        homeKind: { type: 'enum', values: HOME_KINDS },
        mood: { type: 'enum', values: MOODS },
        by: { type: 'string', maxLength: 40 },
        createdBy: { type: 'string', required: true },
        createdByName: { type: 'string', required: true, maxLength: 80 },
        createdByRole: { type: 'enum', values: ROLES, required: true },
        editedAt: { type: 'timestamp' },
      },
      objectCheck,
    },
  ],
};
