/**
 * Real encrypted nodes on an in-memory network (framework testkit): a provider (Owner), a parent (Editor) with the
 * validator, a "rogue" parent device WITHOUT it (what an attacker's modified client looks like), and an observer
 * that only hears from the provider. Proves SPEC 3.3: peers reject what a parent must not do, consistently.
 */
import { PacketRejectedError } from '@sync/core';
import { assertSecureCore } from '@sync/spaces';
import { createSecureGroup, waitFor, type SecureGroup, type SecureNode } from '@sync/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDaycareAuthz } from '../../modules/daycare/authz';

let g: SecureGroup;
let provider: SecureNode, parent: SecureNode, rogue: SecureNode, obs: SecureNode;
let space: string;
const user = (n: SecureNode) => n.spaces.session()!.user;

const withAuthz = (n: SecureNode) =>
  n.core.registerValidator(
    createDaycareAuthz({
      members: (s) => n.spaces.members(s),
      onMemberChange: (cb) => n.spaces.on((e) => e.kind === 'member:changed' && cb(e.space)),
    }),
  );

const fields = (n: SecureNode, kind: string, extra: Record<string, unknown> = {}, role = n === provider ? 'provider' : 'parent') =>
  ({ child: 'child-1', kind, at: 1_700_000_000_000, createdBy: user(n), createdByName: n.name, createdByRole: role, ...extra }) as never;

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    for (const n of Object.values(g.nodes)) await n.spaces.idle();
    await new Promise((r) => setTimeout(r, 30));
  }
};
const kinds = async (n: SecureNode, type = 'daycare.entry') => (await n.core.query({ type }).once()).map((o) => o.fields.kind as string).sort();

beforeAll(async () => {
  g = await createSecureGroup(['provider', 'parent', 'rogue', 'obs'], { rotationGraceMs: 20 });
  [provider, parent, rogue, obs] = ['provider', 'parent', 'rogue', 'obs'].map((n) => g.node(n)) as SecureNode[] as [SecureNode, SecureNode, SecureNode, SecureNode];
  for (const n of ['parent', 'rogue', 'obs']) g.link('provider', n);
  space = (await provider.spaces.create('Lee Family')).id;
  for (const [node, role] of [[parent, 'editor'], [rogue, 'editor'], [obs, 'viewer']] as const) {
    const art = await provider.spaces.invite(space, { role, expiresAt: g.clock.now() + 3_600_000, maxUses: 1, approval: 'auto' });
    await node.spaces.accept(art.url);
    await waitFor(async () => (await node.spaces.list()).length === 1, 10_000, `${node.name} sees the Space`);
  }
  for (const n of [provider, parent, obs]) withAuthz(n); // rogue deliberately has none
  await settle();
}, 60_000);

afterAll(async () => g?.close());

describe('production core', () => {
  it('uses the encrypting codec only', () => {
    for (const n of [provider, parent, rogue, obs]) expect(() => assertSecureCore(n.core)).not.toThrow();
  });
});

describe('daycare-authz on real devices', () => {
  it('a parent can check in, post a family note and a home event; the provider sees them', async () => {
    for (const k of ['checkin', 'familyNote', 'home']) await parent.core.create(space, 'daycare.entry', fields(parent, k, k === 'familyNote' ? { text: 'hi' } : k === 'home' ? { homeKind: 'slept' } : {}));
    await waitFor(async () => (await kinds(provider)).length === 3, 10_000, 'provider receives parent entries');
    expect(await kinds(provider)).toEqual(['checkin', 'familyNote', 'home']);
  });

  it('refuses a parent logging a nap locally (send phase)', async () => {
    await expect(parent.core.create(space, 'daycare.entry', fields(parent, 'nap'))).rejects.toBeInstanceOf(PacketRejectedError);
  });

  it('every peer rejects a forged nap, forged authorship and a forged provider note from a modified parent client', async () => {
    await rogue.core.create(space, 'daycare.entry', fields(rogue, 'nap')); // rogue has no local check
    await rogue.core.create(space, 'daycare.entry', fields(rogue, 'diaper', { diaper: 'wet' }));
    await rogue.core.create(space, 'daycare.entry', { ...(fields(rogue, 'familyNote', { text: 'impersonation' }) as object), createdBy: user(provider) } as never);
    await rogue.core.create(space, 'daycare.entry', fields(rogue, 'familyNote', { text: 'legit marker' })); // arrives after the bad ones
    await waitFor(async () => (await provider.core.query({ type: 'daycare.entry' }).once()).some((o) => o.fields.text === 'legit marker'), 10_000, 'marker arrives');
    await settle();
    for (const n of [provider, obs]) {
      const seen = await kinds(n);
      expect(seen).not.toContain('nap');
      expect(seen).not.toContain('diaper');
      expect((await n.core.query({ type: 'daycare.entry' }).once()).some((o) => o.fields.text === 'impersonation')).toBe(false);
      expect(seen.filter((k) => k === 'familyNote')).toHaveLength(2); // the honest note and the marker
    }
  });

  it('a parent cannot delete or rewrite a provider entry, on any peer', async () => {
    const napObj = await provider.core.create(space, 'daycare.entry', fields(provider, 'nap'));
    await waitFor(async () => !!(await rogue.core.get(napObj.id)), 10_000, 'rogue receives the nap');
    await expect(parent.core.remove(napObj.id)).rejects.toBeInstanceOf(PacketRejectedError);
    await rogue.core.update(napObj.id, { text: 'defaced' }); // no local check on the rogue
    await rogue.core.remove(napObj.id);
    await rogue.core.create(space, 'daycare.entry', fields(rogue, 'familyNote', { text: 'marker 2' }));
    await waitFor(async () => (await provider.core.query({ type: 'daycare.entry' }).once()).some((o) => o.fields.text === 'marker 2'), 10_000);
    await settle();
    for (const n of [provider, obs]) {
      const o = await n.core.get(napObj.id);
      expect(o).toBeDefined();
      expect(o!.fields.text).toBeUndefined();
    }
  });

  it('a parent can edit and delete their own note but cannot turn it into a nap', async () => {
    const note = await parent.core.create(space, 'daycare.entry', fields(parent, 'familyNote', { text: 'v1' }));
    await parent.core.update(note.id, { text: 'v2' });
    await expect(parent.core.update(note.id, { kind: 'nap' })).rejects.toBeInstanceOf(PacketRejectedError);
    await waitFor(async () => (await provider.core.get(note.id))?.fields.text === 'v2', 10_000, 'edit syncs');
    await parent.core.remove(note.id);
    await waitFor(async () => !(await provider.core.query({ type: 'daycare.entry' }).once()).some((o) => o.id === note.id), 10_000, 'delete syncs');
  });

  it('a parent can edit a child’s familyNotes only', async () => {
    const kid = await provider.core.create(space, 'daycare.child', { firstName: 'Ada', allergies: 'none' });
    await waitFor(async () => !!(await parent.core.get(kid.id)), 10_000, 'parent sees the child');
    await parent.core.update(kid.id, { familyNotes: 'early pickup Friday' });
    await expect(parent.core.update(kid.id, { allergies: 'none!' })).rejects.toBeInstanceOf(PacketRejectedError);
    await waitFor(async () => (await provider.core.get(kid.id))?.fields.familyNotes === 'early pickup Friday', 10_000, 'family note syncs');
    expect((await provider.core.get(kid.id))!.fields.allergies).toBe('none');
  });
});
