/**
 * SPEC 4 on real encrypted nodes: provider setup, add family, parent invite with SAS approval, single-use invites,
 * second provider (automatic access to every family), device linking. The service under test is the one the UI uses.
 */
import { createInviteProvider } from '@sync/identity-invite';
import { createSecureGroup, waitFor, type SecureGroup, type SecureNode } from '@sync/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDaycareAuthz } from '../../modules/daycare/authz';
import { createService, joinErrorMessage, type Service } from '../../ui/src/lib/service';
import type { Admin, Data } from '../../ui/src/lib/types';

let g: SecureGroup;
const joins: Array<{ role: string; sas: string; space: string }> = [];
const links: string[] = [];
let denyNext = false;
const svc: Record<string, Service> = {};
const node: Record<string, SecureNode> = {};

const mk = (n: SecureNode): Service => {
  const data: Data = {
    create: (s, t, f, o) => n.core.create(s, t, f, o) as never,
    update: (id, f) => n.core.update(id, f) as never,
    remove: (id) => n.core.remove(id),
    undo: (id) => n.core.undo(id),
    get: (id) => n.core.get(id) as never,
    query: (spec) => n.core.query(spec) as never,
  };
  return createService({ admin: n.spaces as unknown as Admin, data, now: g.clock.now, storage: undefined });
};

beforeAll(async () => {
  g = await createSecureGroup(['bri', 'eric', 'mom', 'tablet', 'dad'], {
    signUp: false,
    provider: () => createInviteProvider({ baseUrl: 'https://lambs.test/' }),
    rotationGraceMs: 20,
    approveJoin: (req) => {
      joins.push({ role: req.role, sas: req.sas, space: req.space });
      const ok = !denyNext;
      denyNext = false;
      return ok;
    },
    approveLink: (_d, sas) => (links.push(sas), true),
  });
  for (const name of Object.keys(g.nodes)) {
    node[name] = g.node(name);
    node[name]!.core.registerValidator(
      createDaycareAuthz({
        members: (s) => node[name]!.spaces.members(s),
        onMemberChange: (cb) => node[name]!.spaces.on((e) => e.kind === 'member:changed' && cb(e.space)),
      }),
    );
    svc[name] = mk(node[name]!);
  }
  // everyone can reach the provider's first device (like a shared relay); a parent's two devices also reach each other
  for (const n of ['eric', 'mom', 'tablet', 'dad']) g.link('bri', n);
  g.link('mom', 'tablet');
  g.link('eric', 'mom');
}, 60_000);

afterAll(async () => g?.close());

let family: string;
let parentInvite: string;

describe('provider setup', () => {
  it('signs up, creates the Staff Space with default settings', async () => {
    const st = await svc.bri!.setupProvider('Miss Bri', "Bri's Little Lambs", 'Little Lambs Daily');
    expect(st.mode).toBe('provider');
    expect(st.staff?.name).toBe("Bri's Little Lambs Staff");
    expect(await svc.bri!.settings()).toMatchObject({ daycareName: "Bri's Little Lambs", requireApproval: true, defaultInviteHours: 24 });
  });
  it('is safe to run twice', async () => {
    await svc.bri!.setupProvider('Miss Bri', "Bri's Little Lambs", 'Little Lambs Daily');
    expect((await node.bri!.spaces.list()).filter((s) => s.name?.endsWith(' Staff'))).toHaveLength(1);
  });
  it('rejects blank names', async () => {
    await expect(svc.dad!.setupProvider(' ', 'X', 'A')).rejects.toThrow(/name/i);
  });
});

describe('add a family and pair a parent', () => {
  it('creates a family Space, the child and the family index', async () => {
    const { space } = await svc.bri!.addFamily('Lee', 'Ada');
    family = space.id;
    expect(space.name).toBe('Lee Family');
    expect((await svc.bri!.children(family)).map((c) => c.fields.firstName)).toEqual(['Ada']);
    const st = await svc.bri!.state();
    const idx = await node.bri!.core.query({ type: 'daycare.familyIndex', space: st.staff!.id }).once();
    expect(idx.map((i) => i.fields.familyName)).toEqual(['Lee']);
  });

  it('parent joins by invite, both screens show the same words, provider approves', async () => {
    const art = await svc.bri!.inviteParent(family);
    parentInvite = art.url;
    expect(art.url.startsWith('https://lambs.test/#/join/')).toBe(true); // the secret travels in the fragment, never the path or query
    expect(art.expiresAt - g.clock.now()).toBeLessThanOrEqual(24 * 3_600_000 + 1000);
    expect(svc.bri!.pendingInvites(family).map((i) => i.inviteId)).toEqual([art.inviteId]);

    let seen = '';
    const r = await svc.mom!.acceptInvite(art.url, { name: 'Erin', relationship: 'Mom', onSas: (s) => (seen = s) });
    expect(r).toMatchObject({ space: family, role: 'editor' });
    expect(joins).toHaveLength(1);
    expect(joins[0]).toMatchObject({ role: 'editor', space: family });
    expect(seen.split(/[\s-]+/)).toHaveLength(5); // five words, hyphen-joined
    expect(joins[0]!.sas).toBe(seen);
  });

  it('the parent lands as a parent, sees only their family and their child', async () => {
    // membership becomes visible once the device has synced its own join event
    await waitFor(async () => (await svc.mom!.state()).mode === 'parent', 15_000, 'mom is a parent');
    await waitFor(async () => (await svc.mom!.children(family)).length === 1, 15_000, 'child syncs');
    const st = await svc.mom!.state();
    expect(st.mode).toBe('parent');
    expect(st.families.map((f) => f.name)).toEqual(['Lee Family']);
    expect(st.staff).toBeUndefined();
    const members = await svc.bri!.members(family);
    expect(members.find((m) => m.displayName === 'Erin (Mom)')?.role).toBe('editor');
  });

  it('a single-use invite cannot be used twice, and says so', async () => {
    const err = await svc.dad!.acceptInvite(parentInvite, { name: 'Dan', relationship: 'Dad' }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(joinErrorMessage(err)).toMatch(/already been used|expired|not valid/i);
  });

  it('an invite can be cancelled before use', async () => {
    const art = await node.bri!.spaces.invite(family, { role: 'editor', maxUses: 1, expiresAt: g.clock.now() + 3_600_000, approval: 'required' });
    await svc.bri!.revokeInvite(family, art.inviteId);
    const err = await svc.dad!.acceptInvite(art.url, { name: 'Dan', relationship: 'Dad' }).catch((e) => e);
    expect(joinErrorMessage(err)).toMatch(/cancelled|not valid|expired/i);
  });

  it('a declined join does not get in, and says so', async () => {
    const art = await svc.bri!.inviteParent(family);
    denyNext = true;
    const err = await svc.dad!.acceptInvite(art.url, { name: 'Dan', relationship: 'Dad' }).catch((e) => e);
    expect(joinErrorMessage(err)).toMatch(/did not approve|declined/i);
    expect((await svc.dad!.state()).mode).toBe('welcome');
  });
});

describe('second provider (SPEC 4.4)', () => {
  it('joins the Staff Space as an Owner after approval', async () => {
    const art = await svc.bri!.inviteProvider();
    const before = joins.length;
    await svc.eric!.acceptInvite(art.url, { name: 'Eric' });
    expect(joins.length).toBe(before + 1);
    expect(joins.at(-1)!.role).toBe('owner');
    await waitFor(async () => (await svc.eric!.state()).mode === 'provider', 10_000, 'Eric is a provider');
  });

  it('gets Owner access to every existing family automatically, with no extra approval', async () => {
    const stops = [svc.bri!.startStaffSync({ intervalMs: 100 }), svc.eric!.startStaffSync({ intervalMs: 100 })];
    const before = joins.length;
    await waitFor(async () => (await svc.eric!.state()).families.some((f) => f.id === family && f.myRole === 'owner'), 20_000, 'Eric owns Lee Family');
    await waitFor(async () => (await svc.eric!.children(family)).length === 1, 10_000, 'Eric sees Ada');
    expect(joins.length).toBe(before); // 'auto' invites need no human
    expect((await svc.bri!.members(family)).filter((m) => m.role === 'owner')).toHaveLength(2);
    stops.forEach((s) => s());
  });

  it('families created later include every provider', async () => {
    const stops = [svc.bri!.startStaffSync({ intervalMs: 100 }), svc.eric!.startStaffSync({ intervalMs: 100 })];
    const { space } = await svc.eric!.addFamily('Okafor', 'Zuri'); // created by the second provider this time
    await waitFor(async () => (await svc.bri!.state()).families.some((f) => f.id === space.id && f.myRole === 'owner'), 20_000, 'Bri owns Okafor Family');
    stops.forEach((s) => s());
  });

  it('a parent never gets a provider handoff', async () => {
    const st = await svc.mom!.state();
    expect(st.families.map((f) => f.name)).toEqual(['Lee Family']);
    expect(st.mode).toBe('parent');
  });
});

describe('linking another device (SPEC 4.5)', () => {
  it('a parent links a tablet: same user, both show the same words, then it sees the family', async () => {
    const { code, done } = await svc.mom!.linkAnotherDevice();
    let seen = '';
    const joined = await svc.tablet!.joinAsDevice(code, (s) => (seen = s));
    await done;
    expect(joined.user).toBe(node.mom!.spaces.session()!.user);
    expect(links).toHaveLength(1);
    expect(links[0]).toBe(seen);
    await waitFor(async () => (await svc.tablet!.state()).families.length === 1, 15_000, 'tablet sees the family');
    expect((await svc.tablet!.state()).mode).toBe('parent');
  });
});
