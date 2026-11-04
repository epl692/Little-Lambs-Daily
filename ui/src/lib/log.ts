/**
 * Writing to the timeline (SPEC 6.5): one entry per child, batches that share a batchId, per-kind defaults and
 * last-used memory, undo, waking naps, edits. Plain TypeScript over the structural Data type, tested on real nodes.
 */
import type { Entry, Kind } from './format';
import type { Data } from './types';
import { startOfDay } from './time';

export type Role = 'provider' | 'parent';
export interface Actor {
  user: string;
  name: string;
  role: Role;
}
export type KV = Pick<Storage, 'getItem' | 'setItem'>;

/** What each role may log. (Photo joins the provider list with attachments in a later phase.) */
export const PROVIDER_KINDS: readonly Kind[] = ['checkin', 'checkout', 'nap', 'bottle', 'snack', 'meal', 'diaper', 'providerNote'];
export const PARENT_KINDS: readonly Kind[] = ['checkin', 'checkout', 'home', 'familyNote'];
export const kindsFor = (role: Role): readonly Kind[] => (role === 'provider' ? PROVIDER_KINDS : PARENT_KINDS);
export const noteKindFor = (role: Role): Kind => (role === 'provider' ? 'providerNote' : 'familyNote');

export interface Target {
  id: string;
  space: string;
}
export interface LogInput {
  kind: Kind;
  targets: Target[];
  /** Event time (nap start). */
  at: number;
  /** Fields every entry gets. */
  fields?: Record<string, unknown>;
  /** Extra fields for one child (for example their own amount eaten). */
  perChild?: Record<string, Record<string, unknown>>;
}

/** Meal period from the time of day (SPEC 6.5: "auto-guessed"). */
export function guessMealPeriod(kind: 'snack' | 'meal', at: number): string {
  const h = new Date(at).getHours() + new Date(at).getMinutes() / 60;
  if (kind === 'snack') return h < 12 ? 'amSnack' : 'pmSnack';
  if (h < 10.5) return 'breakfast';
  if (h < 15) return 'lunch';
  return 'dinner';
}

/** Drops empty values so optional fields stay absent, and trims text. */
export function clean(fields: Record<string, unknown>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    // Plain copies of arrays/objects: values from UI state can be proxies, which IndexedDB cannot store.
    const val = typeof v === 'string' ? v.trim() : typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    if (val === '' || (Array.isArray(val) && val.length === 0)) continue;
    out[k] = val;
  }
  return out;
}

const memory = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

export function createLogger(d: { data: Data; actor: () => Actor; now?: () => number; kv?: KV; newId?: () => string }) {
  const { data } = d;
  const now = d.now ?? Date.now;
  const kv = d.kv ?? (typeof localStorage !== 'undefined' ? localStorage : memory());
  const newId = d.newId ?? (() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `b${now()}${Math.random().toString(36).slice(2, 8)}`));

  /** Creates one entry per child. More than one child shares a batchId so the UI can undo or edit them together. */
  async function log(input: LogInput): Promise<{ ids: string[]; batchId?: string }> {
    if (input.targets.length === 0) throw new Error('Pick at least one child');
    if (!kindsFor(d.actor().role).includes(input.kind)) throw new Error('You cannot log that');
    const a = d.actor();
    const batchId = input.targets.length > 1 ? newId() : undefined;
    const ids: string[] = [];
    try {
      for (const t of input.targets) {
        const fields = clean({
          child: t.id,
          kind: input.kind,
          at: input.at,
          batchId,
          createdBy: a.user,
          createdByName: a.name,
          createdByRole: a.role,
          ...input.fields,
          ...input.perChild?.[t.id],
        });
        ids.push((await data.create(t.space, 'daycare.entry', fields)).id);
      }
    } catch (e) {
      // all or nothing: a batch that stops half way should not leave some children logged
      await Promise.allSettled(ids.map((id) => data.undo(id)));
      throw e;
    }
    return { ids, batchId };
  }

  /** Reverse this device's last change to each (a create becomes a delete, a delete comes back, a wake is taken back). */
  const undo = async (ids: string[]) => void (await Promise.all(ids.map((id) => data.undo(id))));
  const remove = async (ids: string[]) => void (await Promise.all(ids.map((id) => data.remove(id))));

  const startNap = (targets: Target[], at: number) => log({ kind: 'nap', targets, at });

  /** End an open nap. Never before it started. */
  async function wake(entry: Pick<Entry, 'id' | 'fields'>, at: number = now()): Promise<void> {
    await data.update(entry.id, { endAt: Math.max(at, Number(entry.fields.at)) });
  }
  const wakeAll = async (entries: Array<Pick<Entry, 'id' | 'fields'>>, at: number = now()) => void (await Promise.all(entries.map((e) => wake(e, at))));

  /** Change an entry; marks it edited. `child`, `kind` and authorship never change. */
  async function edit(id: string, changes: Record<string, unknown>): Promise<void> {
    const { child: _c, kind: _k, createdBy: _b, createdByRole: _r, createdByName: _n, ...rest } = changes;
    const set: Record<string, unknown> = { ...rest, editedAt: now() };
    for (const k of Object.keys(set)) if (set[k] === undefined) delete set[k];
    // cleared optional fields become unset rather than empty strings
    for (const [k, v] of Object.entries(set)) if (v === '' || v === null) set[k] = { $unset: true };
    await data.update(id, set as Record<string, any>);
  }

  // ---------- last-used values and recent suggestions (device-local) ----------

  const readJson = <T>(key: string, fallback: T): T => {
    try {
      return JSON.parse(kv.getItem(key) ?? 'null') ?? fallback;
    } catch {
      return fallback;
    }
  };
  const last = (kind: Kind): Record<string, any> => readJson(`lld.last.${kind}`, {});
  const remember = (kind: Kind, values: Record<string, unknown>) => kv.setItem(`lld.last.${kind}`, JSON.stringify(clean(values)));
  const recent = (list: 'served' | 'by'): string[] => readJson(`lld.recent.${list}`, [] as string[]);
  function pushRecent(list: 'served' | 'by', value: string | undefined) {
    const v = value?.trim();
    if (!v) return;
    const next = [v, ...recent(list).filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 8);
    kv.setItem(`lld.recent.${list}`, JSON.stringify(next));
  }

  /** Midnight of the day an entry belongs to (for "log for a past day" guards). */
  const dayStart = (ms: number) => startOfDay(ms);

  return { log, undo, remove, startNap, wake, wakeAll, edit, last, remember, recent, pushRecent, dayStart };
}

export type Logger = ReturnType<typeof createLogger>;
