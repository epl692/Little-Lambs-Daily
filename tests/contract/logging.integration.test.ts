/**
 * The add flow's engine on real encrypted nodes: the same logger the UI uses, a provider and a parent, the real authz
 * validator, schema validation like the module facade, and undo/delete semantics from the framework.
 */
import { SchemaRegistry, validateBody } from '@sync/modules';
import { createSecureGroup, waitFor, type SecureGroup, type SecureNode } from '@sync/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import daycare from '../../modules/daycare/index';
import { createDaycareAuthz } from '../../modules/daycare/authz';
import { clean, createLogger, guessMealPeriod, kindsFor, type Actor, type Logger } from '../../ui/src/lib/log';
import type { Data } from '../../ui/src/lib/types';

const registry = new SchemaRegistry();
for (const t of daycare.provides.types) registry.register('daycare', t);

let g: SecureGroup;
let provider: SecureNode, parent: SecureNode;
let space: string;
let log: { p: Logger; m: Logger };
const kids = ['ada', 'ben', 'cy', 'di'].map((n) => ({ id: `child-${n}`, space: '' }));

const dataFor = (n: SecureNode): Data => ({
  // like the module facade: validate against the schema first
  create: async (s, t, f, o) => {
    const reg = registry.get(t);
    if (reg) {
      const r = validateBody(reg, { op: 'create', schemaVersion: 1, fields: f as never });
      if (!r.ok) throw new Error(`${t}${r.field ? '.' + r.field : ''}: ${r.detail}`);
    }
    return n.core.create(s, t, f as never, o) as never;
  },
  update: (id, f) => n.core.update(id, f as never) as never,
  remove: (id) => n.core.remove(id),
  undo: (id) => n.core.undo(id),
  get: (id) => n.core.get(id) as never,
  query: (spec) => n.core.query(spec as never) as never,
});
const actor = (n: SecureNode, role: Actor['role'], name: string): (() => Actor) => () => ({ user: n.spaces.session()!.user, name, role });
const entries = (n: SecureNode) => n.core.query({ type: 'daycare.entry', space }).once();

beforeAll(async () => {
  g = await createSecureGroup(['provider', 'parent'], { rotationGraceMs: 20 });
  provider = g.node('provider');
  parent = g.node('parent');
  g.link('provider', 'parent');
  space = (await provider.spaces.create('Lee Family')).id;
  const art = await provider.spaces.invite(space, { role: 'editor', expiresAt: g.clock.now() + 3_600_000, maxUses: 1, approval: 'auto' });
  await parent.spaces.accept(art.url);
  await waitFor(async () => (await parent.spaces.list()).length === 1, 10_000, 'parent sees the space');
  for (const n of [provider, parent]) {
    n.core.registerType('daycare.entry', { resurrects: true }); // as the module host does from the schema's merge option
    n.core.registerValidator(
      createDaycareAuthz({ members: (s) => n.spaces.members(s), onMemberChange: (cb) => n.spaces.on((e) => e.kind === 'member:changed' && cb(e.space)) }),
    );
  }
  kids.forEach((k) => (k.space = space));
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  log = {
    p: createLogger({ data: dataFor(provider), actor: actor(provider, 'provider', 'Miss Bri'), now: g.clock.now, kv: mem() }),
    m: createLogger({ data: dataFor(parent), actor: actor(parent, 'parent', 'Erin (Mom)'), now: g.clock.now, kv: mem() }),
  };
}, 60_000);

afterAll(async () => g?.close());

const at = 1_700_000_000_000;

describe('logging', () => {
  it('writes one entry with authorship, and leaves optional fields absent', async () => {
    const { ids, batchId } = await log.p.log({ kind: 'bottle', targets: [kids[0]!], at, fields: { bottleContents: 'formula', ozOffered: 4, ozFinished: 3.5, text: '  ', served: '' } });
    expect(batchId).toBeUndefined(); // one child: no batch
    const e = await provider.core.get(ids[0]!);
    expect(e!.fields).toMatchObject({ child: 'child-ada', kind: 'bottle', at, bottleContents: 'formula', ozOffered: 4, ozFinished: 3.5, createdByName: 'Miss Bri', createdByRole: 'provider' });
    expect(e!.fields.createdBy).toBe(provider.spaces.session()!.user);
    expect('text' in e!.fields).toBe(false);
    expect('served' in e!.fields).toBe(false);
  });

  it('a batch makes one entry per child with a shared batchId; one undo removes them all', async () => {
    const before = (await entries(provider)).length;
    const { ids, batchId } = await log.p.log({
      kind: 'meal',
      targets: kids,
      at,
      fields: { mealPeriod: 'lunch', served: 'Mac & cheese' },
      perChild: { 'child-ada': { amount: 'all' }, 'child-ben': { amount: 'most' }, 'child-cy': { amount: 'some' }, 'child-di': { amount: 'none' } },
    });
    expect(ids).toHaveLength(4);
    expect(batchId).toBeTruthy();
    const mine = (await entries(provider)).filter((e) => e.fields.batchId === batchId);
    expect(mine).toHaveLength(4);
    expect(mine.map((e) => e.fields.amount).sort()).toEqual(['all', 'most', 'none', 'some']);
    expect(new Set(mine.map((e) => e.fields.child)).size).toBe(4);
    await waitFor(async () => (await entries(parent)).filter((e) => e.fields.batchId === batchId).length === 4, 10_000, 'parent sees the batch');

    await log.p.undo(ids);
    expect((await entries(provider)).length).toBe(before);
    await waitFor(async () => (await entries(parent)).filter((e) => e.fields.batchId === batchId).length === 0, 10_000, 'undo syncs');
  });

  it('is all or nothing: a bad batch leaves nothing behind', async () => {
    const before = (await entries(provider)).length;
    await expect(log.p.log({ kind: 'bottle', targets: kids, at, fields: { bottleContents: 'formula' } })).rejects.toThrow(/ozOffered/); // required for a bottle
    expect((await entries(provider)).length).toBe(before);
    await expect(log.p.log({ kind: 'nap', targets: [], at })).rejects.toThrow(/at least one child/);
  });

  it('naps: start for two children, wake all, never ends before the start, wake can be taken back', async () => {
    const { ids } = await log.p.startNap([kids[0]!, kids[1]!], at);
    const open = async () => (await provider.core.query({ type: 'daycare.entry', space }).once()).filter((e) => ids.includes(e.id));
    expect((await open()).every((e) => e.fields.endAt === undefined)).toBe(true);

    await log.p.wakeAll(await open(), at + 90 * 60_000);
    expect((await open()).map((e) => e.fields.endAt)).toEqual([at + 5_400_000, at + 5_400_000]);

    // taking a wake back reopens the nap
    await log.p.undo([ids[0]!]);
    expect((await provider.core.get(ids[0]!))!.fields.endAt).toBeUndefined();

    // a clock set earlier than the start still ends at the start, never before it
    await log.p.wake(await provider.core.get(ids[0]!) as never, at - 1000);
    expect((await provider.core.get(ids[0]!))!.fields.endAt).toBe(at);
  });

  it('edits mark the entry edited and clear optional fields', async () => {
    const { ids } = await log.p.log({ kind: 'providerNote', targets: [kids[0]!], at, fields: { text: 'first', by: 'Mom' } });
    await log.p.edit(ids[0]!, { text: 'second', by: '', kind: 'nap', child: 'other', createdBy: 'x' });
    const e = (await provider.core.get(ids[0]!))!;
    expect(e.fields.text).toBe('second');
    expect(e.fields.by).toBeUndefined();
    expect(typeof e.fields.editedAt).toBe('number');
    expect(e.fields.kind).toBe('providerNote'); // identity fields are not editable
    expect(e.fields.child).toBe('child-ada');
  });
});

describe('what a parent can log', () => {
  it('lists the right kinds per role', () => {
    expect(kindsFor('parent')).toEqual(['checkin', 'checkout', 'home', 'familyNote']);
    expect(kindsFor('provider')).toContain('nap');
    expect(kindsFor('provider')).not.toContain('home');
  });

  it('a parent can log from home, check in, and cannot log a nap', async () => {
    const note = await log.m.log({ kind: 'home', targets: [kids[0]!], at, fields: { homeKind: 'slept', text: '10 hours' } });
    const checkin = await log.m.log({ kind: 'checkin', targets: [kids[0]!], at, fields: { by: 'Mom' } });
    await waitFor(async () => !!(await provider.core.get(note.ids[0]!)) && !!(await provider.core.get(checkin.ids[0]!)), 10_000, 'provider sees them');
    expect((await provider.core.get(note.ids[0]!))!.fields).toMatchObject({ createdByRole: 'parent', createdByName: 'Erin (Mom)' });
    await expect(log.m.log({ kind: 'nap', targets: [kids[0]!], at })).rejects.toThrow(/cannot log/);
  });

  it('a parent can delete their own entry and bring it back with undo (the authz must allow the re-assert)', async () => {
    const { ids } = await log.m.log({ kind: 'familyNote', targets: [kids[0]!], at, fields: { text: 'oops' } });
    await waitFor(async () => !!(await provider.core.get(ids[0]!)), 10_000, 'synced');
    await log.m.remove(ids);
    expect((await entries(parent)).some((e) => e.id === ids[0])).toBe(false);
    await log.m.undo(ids);
    expect((await entries(parent)).some((e) => e.id === ids[0])).toBe(true);
    await waitFor(async () => (await entries(provider)).some((e) => e.id === ids[0]), 10_000, 'restored on the provider too');
  });

  it('a provider can moderate (delete) a parent’s note and undo that', async () => {
    const { ids } = await log.m.log({ kind: 'familyNote', targets: [kids[0]!], at, fields: { text: 'moderate me' } });
    await waitFor(async () => !!(await provider.core.get(ids[0]!)), 10_000, 'synced');
    await log.p.remove(ids);
    await waitFor(async () => !(await entries(parent)).some((e) => e.id === ids[0]), 10_000, 'delete syncs');
    await log.p.undo(ids);
    await waitFor(async () => (await entries(parent)).some((e) => e.id === ids[0]), 10_000, 'restore syncs');
  });
});

describe('defaults and memory', () => {
  it('guesses the meal period from the time of day', () => {
    const t = (h: number, m = 0) => new Date(2026, 10, 4, h, m).getTime();
    expect(guessMealPeriod('snack', t(9, 30))).toBe('amSnack');
    expect(guessMealPeriod('snack', t(14))).toBe('pmSnack');
    expect(guessMealPeriod('meal', t(8))).toBe('breakfast');
    expect(guessMealPeriod('meal', t(12))).toBe('lunch');
    expect(guessMealPeriod('meal', t(17))).toBe('dinner');
  });
  it('remembers last-used values per kind and recent suggestions without duplicates', () => {
    log.p.remember('bottle', { bottleContents: 'milk', ozOffered: 5, junk: '' });
    expect(log.p.last('bottle')).toEqual({ bottleContents: 'milk', ozOffered: 5 });
    expect(log.p.last('nap')).toEqual({});
    for (const s of ['Pears', 'Rice', 'pears', ' ', undefined, 'Peas']) log.p.pushRecent('served', s);
    expect(log.p.recent('served')).toEqual(['Peas', 'pears', 'Rice']);
  });
  it('hands storage plain copies, never proxies (IndexedDB cannot clone a Proxy)', () => {
    const proxied = new Proxy(['rash'], {});
    expect(() => structuredClone(proxied)).toThrow(); // the failure mode in a browser
    const out = clean({ diaperNote: proxied });
    expect(() => structuredClone(out)).not.toThrow();
    expect(out.diaperNote).toEqual(['rash']);
    expect(out.diaperNote).not.toBe(proxied);
  });
  it('cleans empty values', () => {
    expect(clean({ a: '', b: ' x ', c: [], d: [1], e: 0, f: false, g: null, h: undefined })).toEqual({ b: 'x', d: [1], e: 0, f: false });
  });
});
