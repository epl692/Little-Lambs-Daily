import { describe, expect, it } from 'vitest';
import { createDaycareAuthz, type AuthzBody, type AuthzMember } from '../../modules/daycare/authz';

const SPACE = 's1';
const members: AuthzMember[] = [
  { user: 'bri', role: 'owner', devices: [{ id: 'bri-phone' }] },
  { user: 'mom', role: 'editor', devices: [{ id: 'mom-phone' }] },
  { user: 'gran', role: 'viewer', devices: [{ id: 'gran-tablet' }] },
];
const listeners: Array<(s: string) => void> = [];
const authz = createDaycareAuthz({
  members: async () => members,
  onMemberChange: (cb) => (listeners.push(cb), () => undefined),
});

const stored = (fields: Record<string, unknown>) => ({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, clock: 'c' }])) });
const run = (device: string, body: AuthzBody, existing?: unknown, phase: 'send' | 'apply' = 'apply') =>
  authz.validate(phase, { author: device, space: SPACE }, body, { existing });
const entry = (kind: string, extra: Record<string, unknown> = {}, by = 'mom', role = 'parent'): AuthzBody => ({
  obj: 'o1', op: 'create', type: 'daycare.entry', fields: { kind, createdBy: by, createdByRole: role, ...extra },
});

describe('daycare-authz', () => {
  it('lets providers do anything in the daycare namespace', async () => {
    expect((await run('bri-phone', entry('nap', {}, 'bri', 'provider'))).verdict).toBe('accept');
    expect((await run('bri-phone', { obj: 'c', op: 'delete', type: 'daycare.child', fields: {} })).verdict).toBe('accept');
    // moderation: a provider may edit or delete a parent's item
    const theirs = stored({ createdBy: 'mom' });
    expect((await run('bri-phone', { obj: 'o1', op: 'delete', type: 'daycare.entry', fields: {} }, theirs)).verdict).toBe('accept');
  });

  it('lets parents create only parent kinds', async () => {
    for (const k of ['checkin', 'checkout', 'home', 'familyNote']) expect((await run('mom-phone', entry(k))).verdict).toBe('accept');
    for (const k of ['nap', 'bottle', 'snack', 'meal', 'diaper', 'photo', 'providerNote']) {
      const r = await run('mom-phone', entry(k));
      expect(r).toMatchObject({ verdict: 'reject' });
      expect((r as { reason: string }).reason).toMatch(/^daycare-role/);
    }
  });

  it('lets parents reply and react, and nothing else new', async () => {
    const c: AuthzBody = { obj: 'c1', op: 'create', type: 'daycare.comment', fields: { createdBy: 'mom', createdByRole: 'parent' } };
    const r: AuthzBody = { obj: 'r1', op: 'create', type: 'daycare.reaction', fields: { createdBy: 'mom' } };
    expect((await run('mom-phone', c)).verdict).toBe('accept');
    expect((await run('mom-phone', r)).verdict).toBe('accept');
    for (const type of ['daycare.child', 'daycare.settings', 'daycare.familyIndex', 'daycare.staffInvite', 'other.thing']) {
      expect((await run('mom-phone', { obj: 'x', op: 'create', type, fields: {} })).verdict).toBe('reject');
    }
  });

  it('refuses forged authorship, from anyone', async () => {
    expect((await run('mom-phone', entry('familyNote', {}, 'bri', 'parent'))).verdict).toBe('reject'); // posting as the provider
    expect((await run('mom-phone', entry('familyNote', {}, 'mom', 'provider'))).verdict).toBe('reject'); // claiming provider role
    expect((await run('bri-phone', entry('nap', {}, 'mom', 'provider'))).verdict).toBe('reject'); // provider posting as a parent
    expect((await run('bri-phone', entry('nap', {}, 'bri', 'parent'))).verdict).toBe('reject'); // wrong role label
  });

  it('lets parents change or delete only their own items', async () => {
    const mine = stored({ createdBy: 'mom', kind: 'familyNote' });
    const providers = stored({ createdBy: 'bri', kind: 'nap' });
    const del: AuthzBody = { obj: 'o1', op: 'delete', type: 'daycare.entry', fields: {} };
    expect((await run('mom-phone', del, mine)).verdict).toBe('accept');
    expect((await run('mom-phone', del, providers)).verdict).toBe('reject');
    const edit: AuthzBody = { obj: 'o1', op: 'update', type: 'daycare.entry', fields: { text: 'fixed typo' } };
    expect((await run('mom-phone', edit, mine)).verdict).toBe('accept');
    expect((await run('mom-phone', edit, providers)).verdict).toBe('reject');
  });

  it('stops a parent from turning their item into something else', async () => {
    const mine = stored({ createdBy: 'mom', kind: 'familyNote' });
    for (const f of [{ kind: 'nap' }, { createdBy: 'bri' }, { createdByRole: 'provider' }, { child: 'other-kid' }]) {
      expect((await run('mom-phone', { obj: 'o1', op: 'update', type: 'daycare.entry', fields: f }, mine)).verdict).toBe('reject');
    }
  });

  it('lets parents edit only familyNotes on a child', async () => {
    const upd = (fields: Record<string, unknown>): AuthzBody => ({ obj: 'c', op: 'update', type: 'daycare.child', fields: fields as never });
    expect((await run('mom-phone', upd({ familyNotes: 'allergic to cats' }))).verdict).toBe('accept');
    expect((await run('mom-phone', upd({ familyNotes: 'x', allergies: '' }))).verdict).toBe('reject');
    expect((await run('mom-phone', upd({ active: false }))).verdict).toBe('reject');
  });

  it('rejects viewers, defers unknown devices and objects not seen yet', async () => {
    expect((await run('gran-tablet', entry('familyNote'))).verdict).toBe('reject');
    expect(await run('stranger', entry('familyNote'))).toMatchObject({ verdict: 'defer' });
    const del: AuthzBody = { obj: 'o9', op: 'delete', type: 'daycare.entry', fields: {} };
    expect(await run('mom-phone', del, undefined)).toMatchObject({ verdict: 'defer' });
  });

  it('ignores control events and refreshes roles after a membership change', async () => {
    expect((await run('stranger', { obj: 'x', op: 'create', type: '$sys.member', fields: {} })).verdict).toBe('accept');
    const before = await run('mom-phone', entry('nap'));
    expect(before.verdict).toBe('reject');
    members[1]!.role = 'owner'; // promoted
    expect((await run('mom-phone', entry('nap'))).verdict).toBe('reject'); // still cached
    listeners.forEach((l) => l(SPACE));
    expect((await run('mom-phone', entry('nap', {}, 'mom', 'provider'))).verdict).toBe('accept');
  });
});
