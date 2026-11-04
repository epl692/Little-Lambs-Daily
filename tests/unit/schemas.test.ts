import { SchemaRegistry, validateBody } from '@sync/modules';
import { describe, expect, it } from 'vitest';
import daycare from '../../modules/daycare/index';

const registry = new SchemaRegistry();
for (const t of daycare.provides.types) registry.register('daycare', t);

const by = { createdBy: 'u1', createdByName: 'Bri', createdByRole: 'provider' };
const base = { child: 'c1', at: 1_700_000_000_000, ...by };
const create = (type: string, fields: Record<string, unknown>) =>
  validateBody(registry.get(`daycare.${type}`)!, { op: 'create', schemaVersion: 1, fields: fields as never });

const bad = (type: string, fields: Record<string, unknown>, detail?: RegExp) => {
  const r = create(type, fields);
  expect(r.ok).toBe(false);
  if (detail && !r.ok) expect(r.detail).toMatch(detail);
};

describe('daycare.entry rules', () => {
  it('requires the fields each kind needs', () => {
    bad('entry', { ...base, kind: 'bottle' }, /bottleContents/);
    bad('entry', { ...base, kind: 'bottle', bottleContents: 'milk' }, /ozOffered/);
    bad('entry', { ...base, kind: 'meal', mealPeriod: 'lunch' }, /amount/);
    bad('entry', { ...base, kind: 'snack', amount: 'all' }, /mealPeriod/);
    bad('entry', { ...base, kind: 'diaper' }, /diaper/);
    bad('entry', { ...base, kind: 'home' }, /homeKind/);
    bad('entry', { ...base, kind: 'providerNote', text: '   ' }, /text/);
    bad('entry', { ...base, kind: 'photo', photos: [] }, /photo/);
  });
  it('rejects inconsistent values', () => {
    bad('entry', { ...base, kind: 'nap', endAt: base.at - 1 }, /endAt/);
    bad('entry', { ...base, kind: 'bottle', bottleContents: 'milk', ozOffered: 3, ozFinished: 4 }, /ozFinished/);
    bad('entry', { ...base, kind: 'bottle', bottleContents: 'milk', ozOffered: 3.3 }, /0\.5/);
    bad('entry', { ...base, kind: 'bottle', bottleContents: 'milk', ozOffered: 17 });
    bad('entry', { ...base, kind: 'diaper', diaper: 'wet', diaperNote: ['glitter'] }, /diaper note/);
    bad('entry', { ...base, kind: 'teleport' });
    bad('entry', { ...base, kind: 'nap', text: 'x'.repeat(2001) });
  });
  it('requires authorship fields on everything', () => {
    bad('entry', { child: 'c1', kind: 'nap', at: 1 });
    bad('comment', { target: 'e1', text: 'hi' });
    bad('comment', { target: 'e1', text: '  ', at: 1, ...by });
    bad('comment', { target: 'e1', text: 'hi', ...by }); // needs a time
    bad('reaction', { target: 'e1', emoji: 'angry-face', createdBy: 'u1' });
  });
});

describe('daycare.child rules', () => {
  it('needs a real first name and a well-formed birth date', () => {
    bad('child', { firstName: '  ' });
    bad('child', { firstName: 'Ada', birthDate: '03/09/2025' });
    bad('child', { firstName: 'Ada', color: 'chartreuse' });
    expect(create('child', { firstName: 'Ada', birthDate: '2025-03-09' }).ok).toBe(true);
  });
});

describe('staff types', () => {
  it('bound the settings', () => {
    bad('settings', { defaultInviteHours: 0 });
    bad('settings', { sinceThresholdMinutes: 5 });
    bad('familyIndex', { familyName: 'Lee' });
  });
});
