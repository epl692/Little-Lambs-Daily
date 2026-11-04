/**
 * Reactions and thread replies on real encrypted nodes: deterministic reaction ids converge, toggling off and on works,
 * parents are limited to their own items, providers can moderate.
 */
import { SchemaRegistry, validateBody } from '@sync/modules';
import { createSecureGroup, waitFor, type SecureGroup, type SecureNode } from '@sync/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import daycare from '../../modules/daycare/index';
import { createDaycareAuthz } from '../../modules/daycare/authz';
import type { Actor } from '../../ui/src/lib/log';
import { createThreads, groupReactions, groupReplies, reactionId, type Threads } from '../../ui/src/lib/threads';
import type { Data } from '../../ui/src/lib/types';

const registry = new SchemaRegistry();
for (const t of daycare.provides.types) registry.register('daycare', t);

let g: SecureGroup;
let provider: SecureNode, parent: SecureNode, other: SecureNode;
let space: string;
let tp: Threads, tm: Threads;
let entry: { id: string; space: string };

const dataFor = (n: SecureNode): Data => ({
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
const rows = (n: SecureNode, type: string) => n.core.query({ type, space }).once();

beforeAll(async () => {
  g = await createSecureGroup(['provider', 'parent', 'other'], { rotationGraceMs: 20 });
  provider = g.node('provider');
  parent = g.node('parent');
  other = g.node('other');
  g.link('provider', 'parent');
  g.link('provider', 'other');
  g.link('parent', 'other');
  space = (await provider.spaces.create('Lee Family')).id;
  for (const n of [parent, other]) {
    const art = await provider.spaces.invite(space, { role: 'editor', expiresAt: g.clock.now() + 3_600_000, maxUses: 1, approval: 'auto' });
    await n.spaces.accept(art.url);
    await waitFor(async () => (await n.spaces.list()).length === 1, 10_000, 'joined');
  }
  for (const n of [provider, parent, other]) {
    for (const t of ['daycare.entry', 'daycare.reaction', 'daycare.comment']) n.core.registerType(t, { resurrects: true }); // as the host does from `merge`
    n.core.registerValidator(
      createDaycareAuthz({ members: (s) => n.spaces.members(s), onMemberChange: (cb) => n.spaces.on((e) => e.kind === 'member:changed' && cb(e.space)) }),
    );
  }
  tp = createThreads({ data: dataFor(provider), actor: actor(provider, 'provider', 'Miss Bri'), now: g.clock.now });
  tm = createThreads({ data: dataFor(parent), actor: actor(parent, 'parent', 'Erin (Mom)'), now: g.clock.now });
  const e = await provider.core.create(space, 'daycare.entry', {
    child: 'child-ada',
    kind: 'providerNote',
    at: 1_700_000_000_000,
    text: 'Painted today',
    createdBy: provider.spaces.session()!.user,
    createdByName: 'Miss Bri',
    createdByRole: 'provider',
  } as never);
  entry = { id: e.id, space };
  await waitFor(async () => !!(await parent.core.get(e.id)), 10_000, 'parent has the entry');
}, 60_000);

afterAll(async () => g?.close());

describe('reactions', () => {
  it('toggles on, off and on again under the same id', async () => {
    const me = parent.spaces.session()!.user;
    expect(await tm.toggleReaction(entry, 'love')).toBe(true);
    expect((await rows(parent, 'daycare.reaction')).map((r) => r.id)).toEqual([reactionId(entry.id, me, 'love')]);
    expect(await tm.toggleReaction(entry, 'love')).toBe(false);
    expect(await rows(parent, 'daycare.reaction')).toHaveLength(0);
    expect(await tm.toggleReaction(entry, 'love')).toBe(true); // re-created after a delete
    expect(await rows(parent, 'daycare.reaction')).toHaveLength(1);
    await tm.toggleReaction(entry, 'love');
  });

  it('a double tap on two devices of one person converges on one reaction', async () => {
    // the same user on two offline devices would use the same id; model it as the same id created twice on one node
    const me = parent.spaces.session()!.user;
    const id = reactionId(entry.id, me, 'party');
    const data = dataFor(parent);
    const make = () => data.create(space, 'daycare.reaction', { target: entry.id, emoji: 'party', createdBy: me }, { id }).catch(() => undefined);
    await Promise.all([make(), make()]);
    expect((await rows(parent, 'daycare.reaction')).filter((r) => r.id === id)).toHaveLength(1);
    await tm.toggleReaction(entry, 'party');
  });

  it('different people react independently and sync to everyone', async () => {
    await tm.toggleReaction(entry, 'thumbsUp');
    await tp.toggleReaction(entry, 'thumbsUp');
    await tp.toggleReaction(entry, 'party');
    await waitFor(async () => (await rows(other, 'daycare.reaction')).length === 3, 10_000, 'a third device sees all three');
    const mine = parent.spaces.session()!.user;
    const pills = groupReactions(await rows(other, 'daycare.reaction'), mine).get(entry.id)!;
    expect(pills.map((p) => [p.emoji, p.count, p.mine])).toEqual([
      ['thumbsUp', 2, true],
      ['party', 1, false],
    ]);
    await tm.toggleReaction(entry, 'thumbsUp');
    await tp.toggleReaction(entry, 'thumbsUp');
    await tp.toggleReaction(entry, 'party');
  });

  it('nobody can remove somebody else’s reaction, except a provider', async () => {
    await tm.toggleReaction(entry, 'wow');
    const id = reactionId(entry.id, parent.spaces.session()!.user, 'wow');
    await waitFor(async () => !!(await other.core.get(id)), 10_000, 'synced');
    await expect(dataFor(other).remove(id)).rejects.toThrow();
    await dataFor(provider).remove(id);
  });
});

describe('replies', () => {
  it('a parent and a provider reply; both appear oldest first for everyone', async () => {
    await tm.reply(entry, '  Thank you!  ');
    g.clock.advance?.(1000);
    await tp.reply(entry, 'Anytime 🌈');
    await waitFor(async () => (await rows(other, 'daycare.comment')).length === 2, 10_000, 'synced');
    const list = groupReplies(await rows(other, 'daycare.comment')).get(entry.id)!;
    expect(list.map((r) => [r.text, r.createdByRole])).toEqual([
      ['Thank you!', 'parent'],
      ['Anytime 🌈', 'provider'],
    ]);
  });

  it('blank replies are refused', async () => {
    await expect(tm.reply(entry, '   ')).rejects.toThrow(/something/);
  });

  it('a parent can edit and delete (and undo deleting) their own reply', async () => {
    const id = await tm.reply(entry, 'first');
    await tm.editReply(id, 'second');
    const r = await dataFor(parent).get(id);
    expect(r?.fields.text).toBe('second');
    expect(typeof r?.fields.editedAt).toBe('number');
    await tm.removeReply(id);
    expect(await dataFor(parent).get(id)).toBeUndefined();
    await tm.undo(id);
    expect((await dataFor(parent).get(id))?.fields.text).toBe('second');
  });

  it('a parent cannot change or delete the provider’s reply; the provider can moderate the parent’s', async () => {
    const pid = await tp.reply(entry, 'From Miss Bri');
    await waitFor(async () => !!(await parent.core.get(pid)), 10_000, 'synced');
    await expect(tm.removeReply(pid)).rejects.toThrow();
    await expect(tm.editReply(pid, 'hacked')).rejects.toThrow();
    const mid = await tm.reply(entry, 'Mine');
    await waitFor(async () => !!(await provider.core.get(mid)), 10_000, 'synced');
    await tp.removeReply(mid);
    expect(await dataFor(provider).get(mid)).toBeUndefined();
  });

  it('a parent cannot post a reply as a provider', async () => {
    const me = parent.spaces.session()!.user;
    await expect(
      dataFor(parent).create(space, 'daycare.comment', { target: entry.id, text: 'x', at: 1, createdBy: me, createdByName: 'Miss Bri', createdByRole: 'provider' }),
    ).rejects.toThrow();
  });
});
