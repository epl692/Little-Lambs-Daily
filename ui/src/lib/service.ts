/**
 * Onboarding and pairing (SPEC 4): provider setup, families, parent invites, second providers, device linking.
 * Plain TypeScript over the structural Admin / Data types, so it is tested against real encrypted nodes.
 */
import type { Admin, Data, InviteArtifact, MemberInfo, Obj, SpaceInfo } from './types';

export const STAFF_SUFFIX = ' Staff';
export const FAMILY_SUFFIX = ' Family';
const HOUR = 3_600_000;

export const isStaffSpace = (s: SpaceInfo) => !!s.name?.endsWith(STAFF_SUFFIX);
export const isFamilySpace = (s: SpaceInfo) => !!s.name?.endsWith(FAMILY_SUFFIX);
export const familyNameOf = (s: SpaceInfo) => (s.name ?? '').replace(new RegExp(`${FAMILY_SUFFIX}$`), '');

export interface MyDevice {
  id: string;
  name?: string;
  active: boolean;
  current: boolean;
}

export type Mode = 'welcome' | 'provider' | 'parent';
export interface AppState {
  mode: Mode;
  signedUp: boolean;
  staff?: SpaceInfo;
  families: SpaceInfo[];
}

export interface Settings {
  daycareName: string;
  appName: string;
  requireApproval: boolean;
  defaultInviteHours: number;
  sinceThresholdMinutes: number;
}
export const DEFAULT_SETTINGS: Settings = { daycareName: '', appName: '', requireApproval: true, defaultInviteHours: 24, sinceThresholdMinutes: 180 };

export interface LocalInvite {
  space: string;
  inviteId: string;
  expiresAt: number;
  url: string;
}
export type KV = Pick<Storage, 'getItem' | 'setItem'>;

/** Friendly text for the ways accepting an invite can fail (SPEC 11.1: reuse must say so clearly). */
export function joinErrorMessage(e: unknown): string {
  const reason = (e as { reason?: string } | undefined)?.reason;
  switch (reason) {
    case 'used-up':
    case 'replayed':
      return 'This invite has already been used. Ask for a new one.';
    case 'expired':
      return 'This invite has expired. Ask for a new one.';
    case 'revoked':
      return 'This invite was cancelled. Ask for a new one.';
    case 'declined':
      return 'The daycare did not approve this join. Check with them, then try again.';
    case 'timeout':
      return 'No answer yet. Make sure the daycare has the app open, then try again.';
    case 'unknown':
    case 'bad-proof':
      return 'This invite is not valid. Ask for a new one.';
    default:
      return e instanceof Error && e.message ? e.message : 'Something went wrong joining. Try again.';
  }
}

const memoryKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

export function createService(d: { admin: Admin; data: Data; now?: () => number; storage?: KV }) {
  const { admin, data } = d;
  const now = d.now ?? Date.now;
  const kv = d.storage ?? (typeof localStorage !== 'undefined' ? localStorage : memoryKV());

  // ---------- state ----------

  async function state(): Promise<AppState> {
    const spaces = await admin.list();
    const staff = spaces.find((s) => isStaffSpace(s) && s.myRole === 'owner');
    const families = spaces.filter(isFamilySpace);
    return { mode: staff ? 'provider' : families.length ? 'parent' : 'welcome', signedUp: !!admin.session(), staff, families };
  }

  const staffSpace = async () => (await state()).staff;

  async function settings(): Promise<Settings> {
    const staff = await staffSpace();
    if (!staff) return { ...DEFAULT_SETTINGS };
    const row = (await data.query({ type: 'daycare.settings', space: staff.id }).once())[0];
    return { ...DEFAULT_SETTINGS, ...(row?.fields as Partial<Settings> | undefined) };
  }

  async function updateSettings(patch: Partial<Settings>): Promise<void> {
    const staff = await staffSpace();
    if (!staff) throw new Error('Not a provider device');
    const row = (await data.query({ type: 'daycare.settings', space: staff.id }).once())[0];
    if (row) await data.update(row.id, patch);
    else await data.create(staff.id, 'daycare.settings', patch);
  }

  // ---------- provider setup (SPEC 4.2) ----------

  async function setupProvider(displayName: string, daycareName: string, appName: string): Promise<AppState> {
    const name = displayName.trim();
    const daycare = daycareName.trim();
    if (!name) throw new Error('Enter your name');
    if (!daycare) throw new Error('Enter the daycare name');
    await admin.signUp(name);
    const existing = await staffSpace();
    if (!existing) {
      const staff = await admin.create(`${daycare}${STAFF_SUFFIX}`);
      await data.create(staff.id, 'daycare.settings', { daycareName: daycare, appName, requireApproval: true, defaultInviteHours: 24 });
    }
    return state();
  }

  // ---------- families and children (SPEC 4.3) ----------

  async function addFamily(familyName: string, firstChildName: string): Promise<{ space: SpaceInfo }> {
    const staff = await staffSpace();
    if (!staff) throw new Error('Only a provider can add a family');
    const family = familyName.trim();
    const kid = firstChildName.trim();
    if (!family) throw new Error('Enter the family name');
    if (!kid) throw new Error('Enter the first child’s name');
    const space = await createFamilySpace(family);
    await data.create(space.id, 'daycare.child', { firstName: kid, active: true });
    return { space };
  }

  // ---------- my display name ----------

  const nameKey = 'lld.myName';
  /** The name I chose on this device, if any. */
  const chosenName = () => kv.getItem(nameKey) ?? undefined;

  /** Write my chosen name as a profile in every Space I am in (create or update). Safe to repeat; also covers Spaces joined later. */
  async function publishMyName(): Promise<void> {
    const name = chosenName();
    const me = admin.session();
    if (!name || !me) return;
    for (const sp of await admin.list()) {
      const id = `profile:${sp.id}:${me.user}`;
      const have = await data.get(id);
      if (!have) await data.create(sp.id, 'daycare.profile', { user: me.user, displayName: name, createdBy: me.user, createdByRole: sp.myRole === 'owner' ? 'provider' : 'parent' }, { id });
      else if (have.fields.displayName !== name) await data.update(id, { displayName: name });
    }
  }

  async function renameSelf(name: string): Promise<void> {
    const n = name.trim();
    if (!n) throw new Error('Enter your name');
    if (n.length > 80) throw new Error('That name is too long');
    kv.setItem(nameKey, n);
    await publishMyName();
  }

  /** Put the daycare's name in every family Space I own, so parents see it. Safe to repeat. */
  async function publishBrand(): Promise<void> {
    const st = await settings();
    if (!st.daycareName && !st.appName) return;
    const fields = { daycareName: st.daycareName, appName: st.appName };
    for (const sp of await admin.list()) {
      if (!isFamilySpace(sp) || sp.myRole !== 'owner') continue;
      const id = `brand:${sp.id}`;
      const have = await data.get(id);
      if (!have) await data.create(sp.id, 'daycare.brand', fields, { id });
      else if (have.fields.daycareName !== fields.daycareName || have.fields.appName !== fields.appName) await data.update(id, fields);
    }
  }

  /** Rename the daycare / app: saved in the Staff Space, then copied to every family. */
  async function setBrand(daycareName: string, appName: string): Promise<void> {
    await updateSettings({ daycareName: daycareName.trim(), appName: appName.trim() });
    await publishBrand();
  }

  /** A new, empty family Space, listed on the Families screen, with every other provider given access. */
  async function createFamilySpace(family: string): Promise<SpaceInfo> {
    const staff = await staffSpace();
    if (!staff) throw new Error('Only a provider can add a family');
    const space = await admin.create(`${family}${FAMILY_SUFFIX}`);
    await data.create(staff.id, 'daycare.familyIndex', { spaceId: space.id, familyName: family, archived: false });
    await reconcileStaff(); // other providers get access to the new family
    await publishBrand().catch(() => undefined); // parents of this family see the daycare name from day one
    return space;
  }

  async function addChild(space: string, firstName: string): Promise<Obj> {
    const n = firstName.trim();
    if (!n) throw new Error('Enter the child’s name');
    return data.create(space, 'daycare.child', { firstName: n, active: true });
  }

  async function children(space: string): Promise<Obj[]> {
    return (await data.query({ type: 'daycare.child', space }).once()).filter((c) => c.fields.active !== false);
  }

  // ---------- parent invites (SPEC 4.3) ----------

  const invitesKey = 'lld.invites';
  const readInvites = (): LocalInvite[] => {
    try {
      return (JSON.parse(kv.getItem(invitesKey) ?? '[]') as LocalInvite[]).filter((i) => i.expiresAt > now());
    } catch {
      return [];
    }
  };
  const writeInvites = (list: LocalInvite[]) => kv.setItem(invitesKey, JSON.stringify(list));

  async function inviteParent(space: string): Promise<InviteArtifact> {
    const s = await settings();
    const art = await admin.invite(space, {
      role: 'editor',
      maxUses: 1,
      expiresAt: now() + s.defaultInviteHours * HOUR,
      approval: s.requireApproval ? 'required' : 'auto',
    });
    writeInvites([...readInvites(), { space, inviteId: art.inviteId, expiresAt: art.expiresAt, url: art.url }]);
    return art;
  }

  /** Invites this device created that have not expired and have not been cancelled. */
  const pendingInvites = (space?: string): LocalInvite[] => readInvites().filter((i) => !space || i.space === space);

  async function revokeInvite(space: string, inviteId: string): Promise<void> {
    await admin.revokeInvite(space, inviteId);
    writeInvites(readInvites().filter((i) => i.inviteId !== inviteId));
  }

  // ---------- joining (parent or second provider) ----------

  async function acceptInvite(
    text: string,
    who: { name: string; relationship?: string; onSas?: (sas: string) => void },
  ): Promise<{ space: string; role: string }> {
    const name = who.name.trim();
    if (!name) throw new Error('Enter your name');
    const rel = who.relationship?.trim();
    await admin.signUp(rel ? `${name} (${rel})` : name);
    if (rel) kv.setItem('lld.relationship', rel);
    return admin.accept(text, { onSas: who.onSas });
  }

  // ---------- members, devices ----------

  const members = (space: string): Promise<MemberInfo[]> => admin.members(space);
  /** A parent leaves their family: this device stops syncing that Space. */
  const leaveFamily = (space: string) => admin.leave(space);
  const removeMember = (space: string, user: string) => admin.remove(space, user);
  const revokeDevice = (device: string) => admin.revokeDevice(device);

  /** The devices signed in as me (the framework only lets a person revoke their own), this one marked. */
  async function myDevices(): Promise<MyDevice[]> {
    const me = admin.session();
    if (!me) return [];
    const space = (await admin.list())[0];
    const rec = space ? (await admin.members(space.id)).find((m) => m.user === me.user) : undefined;
    const list = rec?.devices ?? [{ id: me.device.deviceId, name: me.device.name, active: true }];
    return list.map((d) => ({ id: d.id, name: d.name, active: d.active, current: d.id === me.device.deviceId }));
  }

  /** Sign one of my other devices out: it stops receiving data and the Spaces rotate their keys. */
  async function revokeMyDevice(id: string): Promise<void> {
    if (id === admin.session()?.device.deviceId) throw new Error('Use Leave to sign this device out');
    await admin.revokeDevice(id);
  }

  /** Remove another provider: out of the Staff Space and every family Space. */
  async function removeProvider(user: string): Promise<void> {
    if (user === admin.session()?.user) throw new Error('You cannot remove yourself');
    for (const sp of await admin.list()) {
      if (sp.myRole !== 'owner') continue;
      if ((await admin.members(sp.id)).some((m) => m.user === user)) await admin.remove(sp.id, user);
    }
  }

  async function linkAnotherDevice() {
    return admin.linkDevice();
  }
  async function joinAsDevice(code: string, onSas?: (sas: string) => void) {
    return admin.joinAsDevice(code.trim(), { onSas });
  }

  // ---------- second provider (SPEC 4.4) ----------

  /** Invite another provider to the Staff Space as an Owner. Always needs a person's approval. */
  async function inviteProvider(): Promise<InviteArtifact> {
    const staff = await staffSpace();
    if (!staff) throw new Error('Only a provider can invite staff');
    const s = await settings();
    return admin.invite(staff.id, { role: 'owner', maxUses: 1, expiresAt: now() + s.defaultInviteHours * HOUR, approval: 'required' });
  }

  /**
   * Make sure every other provider is an Owner of every family Space I own. A Space can only be entered by invite, so
   * for each missing (provider, family) pair I issue a single-use invite and leave it in the Staff Space (encrypted
   * to providers only) for that provider's device to pick up. One object per pair, so two of my devices converge.
   */
  async function reconcileStaff(): Promise<number> {
    const spaces = await admin.list();
    const staff = spaces.find((s) => isStaffSpace(s) && s.myRole === 'owner');
    const me = admin.session()?.user;
    if (!staff || !me) return 0;
    const colleagues = (await admin.members(staff.id)).filter((m) => m.role === 'owner' && m.user !== me);
    if (!colleagues.length) return 0;
    const handoffs = await data.query({ type: 'daycare.staffInvite', space: staff.id }).once();
    let issued = 0;
    for (const fam of spaces.filter((s) => isFamilySpace(s) && s.myRole === 'owner')) {
      const there = new Set((await admin.members(fam.id)).map((m) => m.user));
      for (const c of colleagues) {
        if (there.has(c.user)) continue;
        const id = `staffinvite:${c.user}:${fam.id}`;
        const old = handoffs.find((h) => h.id === id);
        const live = old && !old.fields.consumed && typeof old.fields.expiresAt === 'number' && old.fields.expiresAt > now();
        if (live) continue;
        const art = await admin.invite(fam.id, { role: 'owner', maxUses: 1, expiresAt: now() + 24 * HOUR, approval: 'auto' });
        const fields = { forUser: c.user, spaceId: fam.id, artifact: art.url, expiresAt: art.expiresAt, consumed: false };
        if (old) await data.update(id, fields);
        else await data.create(staff.id, 'daycare.staffInvite', fields, { id });
        issued++;
      }
    }
    return issued;
  }

  /** Provider B's side: accept any family invites left for me, then mark them done. */
  async function acceptHandoffs(): Promise<number> {
    const staff = await staffSpace();
    const me = admin.session()?.user;
    if (!staff || !me) return 0;
    const joined = new Set((await admin.list()).map((s) => s.id));
    const mine = (await data.query({ type: 'daycare.staffInvite', space: staff.id }).once()).filter((h) => h.fields.forUser === me && !h.fields.consumed);
    let done = 0;
    for (const h of mine) {
      const target = String(h.fields.spaceId);
      try {
        if (!joined.has(target)) await admin.accept(String(h.fields.artifact), { timeoutMs: 20_000 });
        await data.update(h.id, { consumed: true });
        done++;
      } catch {
        /* the inviting device may be offline; the next round retries */
      }
    }
    return done;
  }

  /** Keeps provider access in step. Safe to call any time; returns the function that stops it. */
  function startStaffSync(opts: { intervalMs?: number } = {}): () => void {
    let busy = false;
    let again = false;
    const run = async () => {
      if (busy) return void (again = true);
      busy = true;
      try {
        do {
          again = false;
          await reconcileStaff();
          await acceptHandoffs();
        } while (again);
      } catch {
        /* retried on the next event or tick */
      } finally {
        busy = false;
      }
    };
    const off = admin.on((e) => {
      if (e.kind === 'member:changed') void run();
    });
    const timer = setInterval(() => void run(), opts.intervalMs ?? 30_000);
    void run();
    return () => {
      off();
      clearInterval(timer);
    };
  }

  return {
    state, settings, updateSettings, setupProvider, addFamily, addChild, children,
    createFamilySpace, publishBrand, setBrand, renameSelf, publishMyName, chosenName, inviteParent, pendingInvites, revokeInvite, acceptInvite, members, leaveFamily, removeMember, myDevices, revokeMyDevice, removeProvider, revokeDevice,
    linkAnotherDevice, joinAsDevice, inviteProvider, reconcileStaff, acceptHandoffs, startStaffSync,
  };
}

export type Service = ReturnType<typeof createService>;
